// Referral Validation — Complete handler
//
// Accepts per-referral results from the `check-referrals` GitHub Action
// workflow and updates the DB. Called once per workflow run via
// `aws lambda invoke`. NOT exposed via API Gateway.
//
// For each result:
//   - `valid`        → reset consecutive failures to 0, mark valid, bump last_validated_at
//   - `expired`      → increment consecutive failures, mark expired,
//                      bump last_validated_at. Auto-archive once the
//                      counter reaches ARCHIVE_THRESHOLD.
//   - `unreachable`  → same as expired (network failures are treated as
//                      soft signal; auto-archive only after the same N
//                      consecutive misses).
//
// After the DB writes, each user who had a link auto-archived in this run is
// emailed once (via Brevo transactional) with their full list of currently
// stale, unreplaced, undismissed links — see lib/referral-expiry-email.js.
//
// Invocation contract:
//   Input  : { results: [{ referral_id, status, reason? }] }
//   Output : { processed: number, archived: [referral_id, ...], skipped: [...], emailed: number }
//
// Audit log: every consequential outcome is recorded in `audit_log` under the
// actor `system:referral-validation` so the admin Activity tab can monitor the
// automation — `VALIDATION_FAIL` for each expired/unreachable hit (with the
// running consecutive-failure count) and `AUTO_ARCHIVE` when a link is killed.
// `valid` results are intentionally not logged to keep the audit trail signal.

const mysql = require("../db");
const { logAuditAction } = require("../lib/audit-log");
const expiryEmail = require("../lib/referral-expiry-email");

const ARCHIVE_THRESHOLD = 2; // consecutive failures before auto-archive
const VALID_STATUSES = new Set(["valid", "expired", "unreachable"]);

// Actor recorded in audit_log for entries written by this automation, so the
// admin Activity tab can tell the validator's actions apart from a human admin.
const AUDIT_ACTOR = "system:referral-validation";

exports.ReferralValidationCompleteHandler = async (event) => {
  console.info("ReferralValidationComplete received:", {
    count: (event && event.results && event.results.length) || 0,
  });

  const results = (event && Array.isArray(event.results)) ? event.results : [];
  if (results.length === 0) {
    return { processed: 0, archived: [], skipped: [] };
  }

  const archived = [];
  const skipped = [];
  let processed = 0;
  // submitter uid -> referral ids auto-archived in THIS run. Drives the
  // expiry notification: one email per affected user per run.
  const newlyArchivedBySubmitter = new Map();

  try {
    for (const r of results) {
      const referralId = Number(r.referral_id);
      const status = String(r.status || "").toLowerCase();

      if (!Number.isFinite(referralId) || referralId <= 0 || !VALID_STATUSES.has(status)) {
        skipped.push({ referral_id: r.referral_id, reason: "invalid input" });
        continue;
      }

      // Look up the current row so we can decide whether to archive in
      // the same statement (vs. relying on a second SELECT). Skip rows
      // that were archived between list and complete — those are someone
      // else's concern now.
      const rows = await mysql.query(
        "SELECT validation_consecutive_failures, archived_at, submitter_id FROM referrals WHERE referral_id = ?",
        [referralId],
      );

      if (rows.length === 0) {
        skipped.push({ referral_id: referralId, reason: "not found" });
        continue;
      }
      if (rows[0].archived_at) {
        skipped.push({ referral_id: referralId, reason: "already archived" });
        continue;
      }

      if (status === "valid") {
        await mysql.query(
          `
          UPDATE referrals
          SET validation_status = 'valid',
              validation_consecutive_failures = 0,
              last_validated_at = NOW()
          WHERE referral_id = ?
          `,
          [referralId],
        );
        processed += 1;
        continue;
      }

      // expired or unreachable
      const nextFailures = (rows[0].validation_consecutive_failures || 0) + 1;
      const shouldArchive = nextFailures >= ARCHIVE_THRESHOLD;

      if (shouldArchive) {
        // Single UPDATE handles the archive + status bump together.
        // archived_reason carries the prefix `auto:` so the user UI can
        // distinguish "I archived this" from "the validator did".
        await mysql.query(
          `
          UPDATE referrals
          SET validation_status = ?,
              validation_consecutive_failures = ?,
              last_validated_at = NOW(),
              archived_at = NOW(),
              archived_reason = ?
          WHERE referral_id = ?
          `,
          [status, nextFailures, `auto: ${status}`, referralId],
        );
        archived.push(referralId);
        if (rows[0].submitter_id) {
          const ids = newlyArchivedBySubmitter.get(rows[0].submitter_id) || [];
          ids.push(referralId);
          newlyArchivedBySubmitter.set(rows[0].submitter_id, ids);
        }
        await logAuditAction(AUDIT_ACTOR, "AUTO_ARCHIVE", "referral", referralId, {
          status,
          consecutive_failures: nextFailures,
          reason: r.reason || null,
          archived_reason: `auto: ${status}`,
        });
      } else {
        await mysql.query(
          `
          UPDATE referrals
          SET validation_status = ?,
              validation_consecutive_failures = ?,
              last_validated_at = NOW()
          WHERE referral_id = ?
          `,
          [status, nextFailures, referralId],
        );
        await logAuditAction(AUDIT_ACTOR, "VALIDATION_FAIL", "referral", referralId, {
          status,
          consecutive_failures: nextFailures,
          reason: r.reason || null,
        });
      }
      processed += 1;
    }

    // Email each user whose link(s) died this run. Best-effort: a failed or
    // unconfigured send never fails the run, and the DB updates above are
    // already committed. The email lists every currently stale card for the
    // user, so two links dying in the same run produce one combined email.
    let emailed = 0;
    if (newlyArchivedBySubmitter.size > 0) {
      if (!expiryEmail.isEnabled()) {
        console.info(
          "ReferralValidationComplete: expiry email not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL / FIREBASE_SERVICE_ACCOUNT_B64), skipping notifications",
        );
      } else {
        for (const [submitterId, referralIds] of newlyArchivedBySubmitter) {
          const result = await expiryEmail.sendExpiryNotification(submitterId);
          if (result.sent) {
            emailed += 1;
            await logAuditAction(AUDIT_ACTOR, "EXPIRY_EMAIL", "referral", referralIds[0], {
              submitter_id: submitterId,
              newly_archived_referral_ids: referralIds,
              emailed_cards: result.cardNames,
            });
          } else {
            console.info(
              `ReferralValidationComplete: no expiry email for uid ${submitterId} (${result.reason})`,
            );
          }
        }
      }
    }

    await mysql.end();

    console.info(
      `ReferralValidationComplete: processed=${processed} archived=${archived.length} skipped=${skipped.length} emailed=${emailed}`,
    );
    return { processed, archived, skipped, emailed };
  } catch (error) {
    console.error("ReferralValidationComplete error:", error);
    await mysql.end();
    throw error;
  }
};
