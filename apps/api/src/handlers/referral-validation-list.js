// Referral Validation — List handler
//
// Returns the next batch of referrals due for validation. Called by the
// `check-referrals` GitHub Action once per week via `aws lambda invoke`.
//
// Eligible rows: admin-approved, not archived, and either never validated
// or last validated > 7 days ago. Ordered oldest-first (NULLs first) so
// the cap is fair across batches when the active set grows beyond it.
//
// Invocation contract:
//   Input  : { limit?: number }                        (optional, default 200, max 500)
//   Output : { referrals: [{ referral_id, card_id, card_name, referral_link }] }

const mysql = require("../db");

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const STALE_DAYS = 7;

exports.ReferralValidationListHandler = async (event) => {
  console.info("ReferralValidationList received:", event);

  let limit = Number((event && event.limit) || DEFAULT_LIMIT);
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  try {
    // ORDER BY (last_validated_at IS NULL) DESC puts NULLs first (the
    // never-checked) which is the correct fairness behaviour. After NULLs,
    // oldest-validated wins, then referral_id as a stable tiebreaker.
    const rows = await mysql.query(
      `
      SELECT r.referral_id, r.card_id, r.referral_link, c.card_name
      FROM referrals r
      JOIN cards c ON c.card_id = r.card_id
      WHERE r.admin_approved = 1
        AND r.archived_at IS NULL
        AND (
          r.last_validated_at IS NULL
          OR r.last_validated_at < (NOW() - INTERVAL ? DAY)
        )
      ORDER BY (r.last_validated_at IS NULL) DESC, r.last_validated_at ASC, r.referral_id ASC
      LIMIT ?
      `,
      [STALE_DAYS, limit],
    );

    await mysql.end();

    console.info(`ReferralValidationList returning ${rows.length} referral(s)`);
    return { referrals: rows };
  } catch (error) {
    console.error("ReferralValidationList error:", error);
    await mysql.end();
    throw error;
  }
};
