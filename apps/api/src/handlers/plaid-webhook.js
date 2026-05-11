// POST /plaid/webhook — Plaid pushes events here when data is ready or an Item
// needs attention. This endpoint is UNAUTHENTICATED (Plaid's servers hit it, not
// the user) — protection comes from JWT verification of the X-Plaid-Verification
// header. That verification is a TODO; for now we log everything and ack 200
// so Plaid doesn't retry-storm us while the integration is being built out.
//
// Event types we'll care about (handled in later phases):
//   - TRANSACTIONS.SYNC_UPDATES_AVAILABLE → call /transactions/sync, persist diff
//   - ITEM.ERROR / ITEM.LOGIN_REQUIRED   → mark the Item as needing re-auth
//   - ITEM.PENDING_EXPIRATION            → notify the user
//   - TRANSACTIONS.RECURRING_TRANSACTIONS_UPDATE → ignore for v1

const mysql = require('../db');

exports.PlaidWebhookHandler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    console.warn('plaid webhook: invalid JSON body');
    return { statusCode: 200, body: '' };
  }

  const { webhook_type: webhookType, webhook_code: webhookCode, item_id: plaidItemId } = body;
  console.info('plaid webhook received:', { webhookType, webhookCode, plaidItemId });

  try {
    if (webhookType === 'ITEM') {
      let status = null;
      if (webhookCode === 'LOGIN_REQUIRED' || webhookCode === 'ERROR') status = 'login_required';
      else if (webhookCode === 'PENDING_EXPIRATION') status = 'pending_expiration';
      else if (webhookCode === 'USER_PERMISSION_REVOKED') status = 'revoked';

      if (status && plaidItemId) {
        await mysql.query(
          'UPDATE user_plaid_items SET status = ? WHERE plaid_item_id = ?',
          [status, plaidItemId]
        );
        await mysql.end();
      }
    }
    // TRANSACTIONS.* handlers wired in Phase 2.
  } catch (error) {
    console.error('plaid webhook handler error (returning 200 so Plaid does not retry-storm):', error);
    try { await mysql.end(); } catch {}
  }

  return { statusCode: 200, body: '' };
};
