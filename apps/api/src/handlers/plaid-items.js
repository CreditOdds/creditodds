// GET /plaid/items — list every Plaid Item the user has connected, with the
// accounts under each. Used by the Wallet UI to render the "Connected banks"
// section. Access tokens are NEVER returned.

const mysql = require('../db');
const { isPlaidBetaEnabled } = require('../lib/plaid-gate');

const responseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS',
};

exports.PlaidItemsHandler = async (event) => {
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
      return { statusCode: 403, headers: responseHeaders, body: JSON.stringify({ error: 'Plaid beta not enabled for this account' }) };
    }

    if (event.httpMethod === 'GET') {
      const items = await mysql.query(
        `SELECT id, plaid_item_id, institution_id, institution_name, status, last_synced_at, created_at
         FROM user_plaid_items
         WHERE user_id = ?
         ORDER BY created_at ASC`,
        [userId]
      );

      const itemIds = items.map((i) => i.id);
      let accountsByItem = new Map();
      let txnCountByItem = new Map();
      if (itemIds.length > 0) {
        const accounts = await mysql.query(
          `SELECT a.id, a.plaid_item_row_id, a.plaid_account_id, a.user_card_id, a.account_name,
                  a.account_official_name, a.mask, a.account_type, a.account_subtype,
                  l.last_statement_issue_date, l.last_statement_balance,
                  l.next_payment_due_date, l.minimum_payment_amount,
                  l.last_payment_date, l.last_payment_amount, l.is_overdue,
                  l.last_synced_at AS liabilities_synced_at
             FROM user_plaid_accounts a
             LEFT JOIN user_plaid_liabilities l ON l.plaid_account_row_id = a.id
            WHERE a.plaid_item_row_id IN (?)`,
          [itemIds]
        );
        for (const a of accounts) {
          const list = accountsByItem.get(a.plaid_item_row_id) || [];
          list.push(a);
          accountsByItem.set(a.plaid_item_row_id, list);
        }

        // Per-item transaction count for the "X transactions" UI line.
        // Excludes removed transactions so the count matches what /plaid/transactions returns.
        const counts = await mysql.query(
          `SELECT a.plaid_item_row_id AS item_id, COUNT(*) AS txn_count
             FROM plaid_transactions t
             JOIN user_plaid_accounts a ON a.id = t.plaid_account_row_id
            WHERE a.plaid_item_row_id IN (?)
              AND t.removed = FALSE
            GROUP BY a.plaid_item_row_id`,
          [itemIds]
        );
        for (const c of counts) {
          txnCountByItem.set(c.item_id, Number(c.txn_count));
        }
      }

      const enriched = items.map((i) => ({
        id: i.id,
        plaid_item_id: i.plaid_item_id,
        institution_id: i.institution_id,
        institution_name: i.institution_name,
        status: i.status,
        last_synced_at: i.last_synced_at,
        transaction_count: txnCountByItem.get(i.id) || 0,
        created_at: i.created_at,
        accounts: accountsByItem.get(i.id) || [],
      }));

      await mysql.end();
      return { statusCode: 200, headers: responseHeaders, body: JSON.stringify(enriched) };
    }

    if (event.httpMethod === 'DELETE') {
      const itemRowId = Number(event.pathParameters?.id);
      if (!Number.isFinite(itemRowId) || itemRowId <= 0) {
        await mysql.end();
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'item id is required in path' }) };
      }
      // ON DELETE CASCADE on user_plaid_accounts will remove children.
      // (Plaid /item/remove is best practice but we can wire that in a follow-up
      // — for now this just stops syncing on our side.)
      const result = await mysql.query(
        'DELETE FROM user_plaid_items WHERE id = ? AND user_id = ?',
        [itemRowId, userId]
      );
      await mysql.end();
      if (result.affectedRows === 0) {
        return { statusCode: 404, headers: responseHeaders, body: JSON.stringify({ error: 'Plaid item not found' }) };
      }
      return { statusCode: 200, headers: responseHeaders, body: JSON.stringify({ message: 'Plaid item disconnected' }) };
    }

    return { statusCode: 405, headers: responseHeaders, body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed` }) };
  } catch (error) {
    console.error('plaid items error:', error);
    await mysql.end();
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: 'Internal server error', details: error.message }) };
  }
};
