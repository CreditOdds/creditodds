// POST /plaid/webhook — Plaid pushes events here when data is ready or an Item
// needs attention. This endpoint is UNAUTHENTICATED (Plaid's servers hit it, not
// the user) — protection comes from JWT verification of the X-Plaid-Verification
// header. That verification is a TODO; for now we always ack 200 so Plaid doesn't
// retry-storm us if a single sync fails (we'll catch up on the next webhook fire).
//
// Handled events:
//   - TRANSACTIONS.SYNC_UPDATES_AVAILABLE  → call /transactions/sync via lib/plaid-sync
//   - TRANSACTIONS.INITIAL_UPDATE / HISTORICAL_UPDATE / DEFAULT_UPDATE → same
//     (legacy events; the sync endpoint is idempotent so handling them too is fine)
//   - ITEM.ERROR / LOGIN_REQUIRED          → mark Item as needing re-auth
//   - ITEM.PENDING_EXPIRATION              → mark for renewal
//   - ITEM.USER_PERMISSION_REVOKED         → mark as revoked

const mysql = require('../db');
const { syncByPlaidItemId, syncLiabilitiesForItem } = require('../lib/plaid-sync');

const TRANSACTIONS_SYNC_CODES = new Set([
  'SYNC_UPDATES_AVAILABLE',
  'INITIAL_UPDATE',
  'HISTORICAL_UPDATE',
  'DEFAULT_UPDATE',
]);

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
      }
    } else if (webhookType === 'TRANSACTIONS' && TRANSACTIONS_SYNC_CODES.has(webhookCode) && plaidItemId) {
      const result = await syncByPlaidItemId(plaidItemId);
      console.info('plaid sync result:', { plaidItemId, ...result });
    } else if (webhookType === 'LIABILITIES' && webhookCode === 'DEFAULT_UPDATE' && plaidItemId) {
      const rows = await mysql.query(
        'SELECT id FROM user_plaid_items WHERE plaid_item_id = ? LIMIT 1',
        [plaidItemId]
      );
      if (rows.length > 0) {
        const result = await syncLiabilitiesForItem(rows[0].id);
        console.info('plaid liabilities sync result:', { plaidItemId, ...result });
      }
    }
    await mysql.end();
  } catch (error) {
    console.error('plaid webhook handler error (returning 200 so Plaid does not retry-storm):', error);
    try { await mysql.end(); } catch {}
  }

  return { statusCode: 200, body: '' };
};
