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
// Invocation contract:
//   Input  : { results: [{ referral_id, status, reason? }] }
//   Output : { processed: number, archived: [referral_id, ...], skipped: [...] }
//
// Audit log: every consequential outcome is recorded in `audit_log` under the
// actor `system:referral-validation` so the admin Activity tab can monitor the
// automation — `VALIDATION_FAIL` for each expired/unreachable hit (with the
// running consecutive-failure count) and `AUTO_ARCHIVE` when a link is killed.
// `valid` results are intentionally not logged to keep the audit trail signal.

const mysql = require("../db");
const { logAuditAction } = require("../lib/audit-log");

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
        "SELECT validation_consecutive_failures, archived_at FROM referrals WHERE referral_id = ?",
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

    await mysql.end();

    console.info(
      `ReferralValidationComplete: processed=${processed} archived=${archived.length} skipped=${skipped.length}`,
    );
    return { processed, archived, skipped };
  } catch (error) {
    console.error("ReferralValidationComplete error:", error);
    await mysql.end();
    throw error;
  }
};
