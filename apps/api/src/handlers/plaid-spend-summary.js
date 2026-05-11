// GET /plaid/spend-summary — per-card per-PFC-category cycle spend rollup.
//
// Phase 5 foundation: aggregates the user's *mapped* Plaid accounts (the ones
// linked to a wallet card via /plaid/accounts/{id}/card) into spend buckets
// the frontend can match against the card's reward categories.
//
// Response shape:
//   {
//     summaries: [
//       {
//         user_card_id: 12,
//         account_id: 4,
//         cycle_start: "2026-04-15",   // YYYY-MM-DD (UTC)
//         cycle_end:   "2026-05-15",
//         cycle_source: "liabilities" | "calendar_month",
//         buckets: [
//           { pfc_primary: "FOOD_AND_DRINK", pfc_detailed: "FOOD_AND_DRINK_RESTAURANT",
//             spend: "127.34", txn_count: 8 },
//           ...
//         ]
//       },
//       ...
//     ]
//   }
//
// Spend = SUM of positive amounts (Plaid reports outflows as positive). Refunds
// (negative amounts) and pending transactions are excluded so the bucket numbers
// match what an issuer's reward engine would actually count.

const mysql = require('../db');
const { isPlaidBetaEnabled } = require('../lib/plaid-gate');
const { currentCycle } = require('../lib/plaid-cycle');

const responseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

exports.PlaidSpendSummaryHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: responseHeaders, body: '' };
  }

  const userId = event.requestContext?.authorizer?.principalId;
  if (!userId) {
    return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    if (!(await isPlaidBetaEnabled(userId))) {
      await mysql.end();
      return { statusCode: 403, headers: responseHeaders, body: JSON.stringify({ error: 'Plaid beta not enabled' }) };
    }

    // Pull every mapped account for this user, joined with its liability so we
    // can compute the cycle window. Unmapped accounts are skipped — without a
    // wallet card they're not actionable.
    const mappedAccounts = await mysql.query(
      `SELECT a.id AS account_id, a.user_card_id,
              l.last_statement_issue_date, l.next_payment_due_date
         FROM user_plaid_accounts a
         JOIN user_plaid_items i ON i.id = a.plaid_item_row_id
         LEFT JOIN user_plaid_liabilities l ON l.plaid_account_row_id = a.id
        WHERE i.user_id = ?
          AND a.user_card_id IS NOT NULL`,
      [userId]
    );

    const summaries = [];
    for (const acct of mappedAccounts) {
      const cycle = currentCycle(
        acct.last_statement_issue_date,
        acct.next_payment_due_date
      );
      const buckets = await mysql.query(
        `SELECT
           pfc_primary,
           pfc_detailed,
           SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS spend,
           COUNT(*) AS txn_count
         FROM plaid_transactions
         WHERE plaid_account_row_id = ?
           AND removed = FALSE
           AND pending = FALSE
           AND amount > 0
           AND date >= ?
           AND date < ?
         GROUP BY pfc_primary, pfc_detailed
         ORDER BY spend DESC`,
        [acct.account_id, cycle.start, cycle.end]
      );

      summaries.push({
        user_card_id: acct.user_card_id,
        account_id: acct.account_id,
        cycle_start: cycle.start,
        cycle_end: cycle.end,
        cycle_source: cycle.source,
        buckets: buckets.map((b) => ({
          pfc_primary: b.pfc_primary,
          pfc_detailed: b.pfc_detailed,
          spend: String(b.spend ?? '0'),
          txn_count: Number(b.txn_count),
        })),
      });
    }

    await mysql.end();
    return { statusCode: 200, headers: responseHeaders, body: JSON.stringify({ summaries }) };
  } catch (error) {
    console.error('plaid spend-summary error:', error);
    await mysql.end();
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: 'Internal server error', details: error.message }) };
  }
};
