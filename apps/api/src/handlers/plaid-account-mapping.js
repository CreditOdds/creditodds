// PUT /plaid/accounts/{id}/card — map (or unmap) a Plaid account to one of
// the caller's wallet cards. The mapping is what lets later phases attribute
// transactions to the right card's reward categories.
//
// Body: { user_card_id: number | null }
//   number → set the mapping
//   null   → clear the mapping
//
// Validates two ownership chains:
//   - the Plaid account belongs to a Plaid item owned by the caller
//   - the user_card (if provided) belongs to the caller
// Either failure → 404 (don't leak which one).

const mysql = require('../db');
const { isPlaidBetaEnabled } = require('../lib/plaid-gate');

const responseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'PUT,OPTIONS',
};

exports.PlaidAccountMappingHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: responseHeaders, body: '' };
  }

  const userId = event.requestContext?.authorizer?.principalId;
  if (!userId) {
    return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const accountRowId = Number(event.pathParameters?.id);
  if (!Number.isFinite(accountRowId) || accountRowId <= 0) {
    return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'account id is required in path' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }
  // Accept null/undefined to clear the mapping; otherwise must be positive int.
  let userCardId = body.user_card_id;
  if (userCardId === undefined) userCardId = null;
  if (userCardId !== null) {
    userCardId = Number(userCardId);
    if (!Number.isFinite(userCardId) || userCardId <= 0) {
      return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'user_card_id must be a positive integer or null' }) };
    }
  }

  try {
    if (!(await isPlaidBetaEnabled(userId))) {
      await mysql.end();
      return { statusCode: 403, headers: responseHeaders, body: JSON.stringify({ error: 'Plaid beta not enabled' }) };
    }

    // Confirm the Plaid account is reachable through an Item owned by this user.
    const ownsAccount = await mysql.query(
      `SELECT a.id
         FROM user_plaid_accounts a
         JOIN user_plaid_items i ON i.id = a.plaid_item_row_id
        WHERE a.id = ? AND i.user_id = ?
        LIMIT 1`,
      [accountRowId, userId]
    );
    if (ownsAccount.length === 0) {
      await mysql.end();
      return { statusCode: 404, headers: responseHeaders, body: JSON.stringify({ error: 'Plaid account not found' }) };
    }

    // Confirm the wallet card belongs to this user (when setting).
    if (userCardId !== null) {
      const ownsCard = await mysql.query(
        'SELECT id FROM user_cards WHERE id = ? AND user_id = ? LIMIT 1',
        [userCardId, userId]
      );
      if (ownsCard.length === 0) {
        await mysql.end();
        return { statusCode: 404, headers: responseHeaders, body: JSON.stringify({ error: 'Wallet card not found' }) };
      }
    }

    await mysql.query(
      'UPDATE user_plaid_accounts SET user_card_id = ? WHERE id = ?',
      [userCardId, accountRowId]
    );
    await mysql.end();

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        message: userCardId === null ? 'Mapping cleared' : 'Mapping updated',
        plaid_account_row_id: accountRowId,
        user_card_id: userCardId,
      }),
    };
  } catch (error) {
    console.error('plaid account-mapping error:', error);
    await mysql.end();
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: 'Internal server error', details: error.message }) };
  }
};
