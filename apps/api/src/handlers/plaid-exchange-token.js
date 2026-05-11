// POST /plaid/exchange-token — swaps a Plaid Link public_token for a long-lived
// access_token, persists the Item + every Account it returned. Idempotent on
// plaid_item_id (re-running with the same Item updates rather than duplicates).
//
// Body: { public_token: string, institution?: { id, name } }

const mysql = require('../db');
const { getPlaidClient, encryptToken } = require('../lib/plaid');
const { isPlaidBetaEnabled } = require('../lib/plaid-gate');
const { syncItemTransactions } = require('../lib/plaid-sync');

const responseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

exports.PlaidExchangeTokenHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: responseHeaders, body: '' };
  }

  const userId = event.requestContext?.authorizer?.principalId;
  if (!userId) {
    return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }
  const publicToken = body.public_token;
  if (!publicToken) {
    return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'public_token is required' }) };
  }
  const institution = body.institution || {};

  try {
    if (!(await isPlaidBetaEnabled(userId))) {
      await mysql.end();
      return { statusCode: 403, headers: responseHeaders, body: JSON.stringify({ error: 'Plaid beta not enabled for this account' }) };
    }

    const plaid = getPlaidClient();
    const exchange = await plaid.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const plaidItemId = exchange.data.item_id;

    const encrypted = encryptToken(accessToken);

    // Upsert the Item — if a user re-connects the same institution we update the
    // access token rather than create a duplicate row. The unique key is
    // plaid_item_id; user_id is enforced via the WHERE in subsequent updates.
    await mysql.query(
      `INSERT INTO user_plaid_items
         (user_id, plaid_item_id, access_token_encrypted, institution_id, institution_name, status)
       VALUES (?, ?, ?, ?, ?, 'healthy')
       ON DUPLICATE KEY UPDATE
         access_token_encrypted = VALUES(access_token_encrypted),
         institution_id = VALUES(institution_id),
         institution_name = VALUES(institution_name),
         status = 'healthy'`,
      [userId, plaidItemId, encrypted, institution.id || null, institution.name || null]
    );

    const itemRow = await mysql.query(
      'SELECT id FROM user_plaid_items WHERE plaid_item_id = ? AND user_id = ? LIMIT 1',
      [plaidItemId, userId]
    );
    if (itemRow.length === 0) {
      throw new Error('Failed to persist Plaid item');
    }
    const plaidItemRowId = itemRow[0].id;

    // Pull the accounts under this Item and persist them. We store mask + name +
    // type so the frontend can show "Chase ··· 4242" without another Plaid call.
    const accountsRes = await plaid.accountsGet({ access_token: accessToken });
    const accounts = accountsRes.data.accounts || [];

    for (const a of accounts) {
      await mysql.query(
        `INSERT INTO user_plaid_accounts
           (plaid_item_row_id, plaid_account_id, account_name, account_official_name, mask, account_type, account_subtype)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           account_name = VALUES(account_name),
           account_official_name = VALUES(account_official_name),
           mask = VALUES(mask),
           account_type = VALUES(account_type),
           account_subtype = VALUES(account_subtype)`,
        [
          plaidItemRowId,
          a.account_id,
          a.name || null,
          a.official_name || null,
          a.mask || null,
          a.type || null,
          a.subtype || null,
        ]
      );
    }

    // Best-effort initial sync. Plaid may not have prepared transactions yet
    // (typical lag is 30s–5min for new Items), in which case the sync returns
    // empty and the SYNC_UPDATES_AVAILABLE webhook will fire when ready.
    let initialSync = null;
    try {
      initialSync = await syncItemTransactions(plaidItemRowId);
    } catch (syncErr) {
      console.error('initial sync failed (non-fatal — webhook will retry):', syncErr.message);
    }

    await mysql.end();

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        message: 'Plaid item connected',
        plaid_item_id: plaidItemId,
        institution_name: institution.name || null,
        accounts: accounts.map((a) => ({
          plaid_account_id: a.account_id,
          name: a.name,
          official_name: a.official_name,
          mask: a.mask,
          type: a.type,
          subtype: a.subtype,
        })),
        initial_sync: initialSync,
      }),
    };
  } catch (error) {
    console.error('plaid exchange-token error:', error?.response?.data || error);
    await mysql.end();
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({
        error: 'Failed to exchange Plaid token',
        details: error?.response?.data?.error_message || error.message,
      }),
    };
  }
};
