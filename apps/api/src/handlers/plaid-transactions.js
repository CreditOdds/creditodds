// GET /plaid/transactions — paginated list of the authenticated user's
// recent Plaid transactions across all their connected items.
//
// Query params:
//   limit  (1..200, default 50)
//   offset (default 0)
//   account_id  optional — filter to one user_plaid_accounts.id
//
// Returns merchant + amount + date + the Plaid PFC category (we'll use the
// PFC + merchant to drive the category-matching engine in Phase 5).

const mysql = require('../db');
const { isPlaidBetaEnabled } = require('../lib/plaid-gate');

const responseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

exports.PlaidTransactionsHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: responseHeaders, body: '' };
  }

  const userId = event.requestContext?.authorizer?.principalId;
  if (!userId) {
    return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const qs = event.queryStringParameters || {};
  const limit = Math.min(Math.max(Number(qs.limit) || 50, 1), 200);
  const offset = Math.max(Number(qs.offset) || 0, 0);
  const accountIdFilter = qs.account_id ? Number(qs.account_id) : null;

  try {
    if (!(await isPlaidBetaEnabled(userId))) {
      await mysql.end();
      return { statusCode: 403, headers: responseHeaders, body: JSON.stringify({ error: 'Plaid beta not enabled' }) };
    }

    const filterSql = accountIdFilter ? 'AND a.id = ?' : '';
    const params = [userId];
    if (accountIdFilter) params.push(accountIdFilter);
    params.push(limit, offset);

    // We join through accounts → items to scope to user_id. Removed transactions
    // are excluded by default — we keep them in the table for reconciliation but
    // don't surface them in spend totals.
    const rows = await mysql.query(
      `SELECT t.id, t.plaid_transaction_id, t.plaid_account_row_id,
              t.amount, t.iso_currency_code, t.date, t.datetime,
              t.name, t.merchant_name, t.payment_channel, t.pending,
              t.pfc_primary, t.pfc_detailed,
              a.account_name, a.mask
         FROM plaid_transactions t
         JOIN user_plaid_accounts a ON a.id = t.plaid_account_row_id
         JOIN user_plaid_items i    ON i.id = a.plaid_item_row_id
        WHERE i.user_id = ?
          AND t.removed = FALSE
          ${filterSql}
        ORDER BY t.date DESC, t.id DESC
        LIMIT ? OFFSET ?`,
      params
    );

    const totalRows = await mysql.query(
      `SELECT COUNT(*) AS total
         FROM plaid_transactions t
         JOIN user_plaid_accounts a ON a.id = t.plaid_account_row_id
         JOIN user_plaid_items i    ON i.id = a.plaid_item_row_id
        WHERE i.user_id = ? AND t.removed = FALSE
          ${filterSql}`,
      accountIdFilter ? [userId, accountIdFilter] : [userId]
    );
    await mysql.end();

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        transactions: rows,
        total: Number(totalRows[0]?.total ?? 0),
        limit,
        offset,
      }),
    };
  } catch (error) {
    console.error('plaid transactions error:', error);
    await mysql.end();
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: 'Internal server error', details: error.message }) };
  }
};
