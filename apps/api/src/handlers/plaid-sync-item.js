// POST /plaid/items/{id}/sync — manual user-triggered transaction sync.
// Beta-gated. Validates the Item belongs to the caller before calling sync.
// Useful for: testing, "Sync now" buttons, recovering after webhook drops.

const mysql = require('../db');
const { isPlaidBetaEnabled } = require('../lib/plaid-gate');
const { syncItemTransactions, syncLiabilitiesForItem } = require('../lib/plaid-sync');

const responseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

exports.PlaidSyncItemHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: responseHeaders, body: '' };
  }

  const userId = event.requestContext?.authorizer?.principalId;
  if (!userId) {
    return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const itemRowId = Number(event.pathParameters?.id);
  if (!Number.isFinite(itemRowId) || itemRowId <= 0) {
    return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'item id is required in path' }) };
  }

  try {
    if (!(await isPlaidBetaEnabled(userId))) {
      await mysql.end();
      return { statusCode: 403, headers: responseHeaders, body: JSON.stringify({ error: 'Plaid beta not enabled' }) };
    }

    // Make sure the item belongs to this user — guards against one user
    // triggering a sync against another user's Plaid Item.
    const owns = await mysql.query(
      'SELECT id FROM user_plaid_items WHERE id = ? AND user_id = ? LIMIT 1',
      [itemRowId, userId]
    );
    if (owns.length === 0) {
      await mysql.end();
      return { statusCode: 404, headers: responseHeaders, body: JSON.stringify({ error: 'Plaid item not found' }) };
    }

    const result = await syncItemTransactions(itemRowId);
    // Liabilities is best-effort; success counts even if it fails.
    let liabilities = null;
    try {
      liabilities = await syncLiabilitiesForItem(itemRowId);
    } catch (libErr) {
      console.error('liabilities sync failed during manual refresh:', libErr.message);
    }
    await mysql.end();

    if (!result.ok) {
      return {
        statusCode: 502,
        headers: responseHeaders,
        body: JSON.stringify({ error: 'Sync failed', reason: result.reason }),
      };
    }
    return { statusCode: 200, headers: responseHeaders, body: JSON.stringify({ ...result, liabilities }) };
  } catch (error) {
    console.error('plaid sync-item error:', error);
    await mysql.end();
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: 'Internal server error', details: error.message }) };
  }
};
