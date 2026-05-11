// Per-Item transaction sync. Uses Plaid's cursor-based /transactions/sync —
// idempotent + delivers a clean diff (added/modified/removed) keyed off the
// last cursor we stored.
//
// Called from:
//   - plaid-webhook.js          on TRANSACTIONS.SYNC_UPDATES_AVAILABLE
//   - plaid-exchange-token.js   immediately after a new bank is connected
//                               (best-effort; webhooks will catch up if Plaid
//                               isn't ready yet)
//   - plaid-sync-item.js        manual user-triggered refresh

const mysql = require('../db');
const { getPlaidClient, decryptToken } = require('./plaid');

async function fetchAllChanges(plaidClient, accessToken, startCursor) {
  const added = [];
  const modified = [];
  const removed = [];
  let cursor = startCursor || null;
  let hasMore = true;
  while (hasMore) {
    const res = await plaidClient.transactionsSync({
      access_token: accessToken,
      ...(cursor ? { cursor } : {}),
      count: 500,
    });
    added.push(...(res.data.added || []));
    modified.push(...(res.data.modified || []));
    removed.push(...(res.data.removed || []));
    cursor = res.data.next_cursor;
    hasMore = Boolean(res.data.has_more);
  }
  return { added, modified, removed, cursor };
}

function pickPfc(txn) {
  const pfc = txn.personal_finance_category || {};
  return {
    primary: pfc.primary || null,
    detailed: pfc.detailed || null,
    confidence: pfc.confidence_level || null,
  };
}

async function upsertTransaction(accountRowId, txn) {
  const pfc = pickPfc(txn);
  await mysql.query(
    `INSERT INTO plaid_transactions
       (plaid_account_row_id, plaid_transaction_id, amount, iso_currency_code,
        unofficial_currency_code, date, datetime, authorized_date, authorized_datetime,
        name, merchant_name, payment_channel, pending, pending_transaction_id,
        account_owner, pfc_primary, pfc_detailed, pfc_confidence, transaction_code,
        raw, removed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)
     ON DUPLICATE KEY UPDATE
       amount = VALUES(amount),
       iso_currency_code = VALUES(iso_currency_code),
       unofficial_currency_code = VALUES(unofficial_currency_code),
       date = VALUES(date),
       datetime = VALUES(datetime),
       authorized_date = VALUES(authorized_date),
       authorized_datetime = VALUES(authorized_datetime),
       name = VALUES(name),
       merchant_name = VALUES(merchant_name),
       payment_channel = VALUES(payment_channel),
       pending = VALUES(pending),
       pending_transaction_id = VALUES(pending_transaction_id),
       account_owner = VALUES(account_owner),
       pfc_primary = VALUES(pfc_primary),
       pfc_detailed = VALUES(pfc_detailed),
       pfc_confidence = VALUES(pfc_confidence),
       transaction_code = VALUES(transaction_code),
       raw = VALUES(raw),
       removed = FALSE`,
    [
      accountRowId,
      txn.transaction_id,
      txn.amount,
      txn.iso_currency_code || null,
      txn.unofficial_currency_code || null,
      txn.date,
      txn.datetime || null,
      txn.authorized_date || null,
      txn.authorized_datetime || null,
      txn.name || null,
      txn.merchant_name || null,
      txn.payment_channel || null,
      Boolean(txn.pending),
      txn.pending_transaction_id || null,
      txn.account_owner || null,
      pfc.primary,
      pfc.detailed,
      pfc.confidence,
      txn.transaction_code || null,
      JSON.stringify(txn),
    ]
  );
}

// Sync a single Item by its row id in user_plaid_items. Returns counts.
// Marks the Item as `error` status if Plaid throws — webhook can keep retrying.
async function syncItemTransactions(plaidItemRowId) {
  const items = await mysql.query(
    `SELECT id, plaid_item_id, access_token_encrypted, transactions_cursor
       FROM user_plaid_items WHERE id = ? LIMIT 1`,
    [plaidItemRowId]
  );
  if (items.length === 0) {
    return { ok: false, reason: 'item not found' };
  }
  const item = items[0];

  const accounts = await mysql.query(
    `SELECT id, plaid_account_id FROM user_plaid_accounts WHERE plaid_item_row_id = ?`,
    [item.id]
  );
  const accountRowMap = new Map(accounts.map((a) => [a.plaid_account_id, a.id]));

  let accessToken;
  try {
    accessToken = decryptToken(item.access_token_encrypted);
  } catch (e) {
    console.error('decrypt failed for item', item.id, e.message);
    return { ok: false, reason: 'decrypt failed' };
  }

  const plaidClient = getPlaidClient();
  let changes;
  try {
    changes = await fetchAllChanges(plaidClient, accessToken, item.transactions_cursor);
  } catch (e) {
    const code = e?.response?.data?.error_code;
    console.error('plaid sync failed for item', item.id, code, e?.response?.data || e.message);
    // Surface ITEM_LOGIN_REQUIRED-style errors as a status flip so the UI nags
    // the user to re-auth instead of silently failing forever.
    if (code === 'ITEM_LOGIN_REQUIRED') {
      await mysql.query(
        `UPDATE user_plaid_items SET status = 'login_required' WHERE id = ?`,
        [item.id]
      );
    } else {
      await mysql.query(
        `UPDATE user_plaid_items SET status = 'error' WHERE id = ?`,
        [item.id]
      );
    }
    return { ok: false, reason: code || 'plaid error' };
  }

  let upserted = 0;
  let skipped = 0;
  for (const txn of [...changes.added, ...changes.modified]) {
    const accountRowId = accountRowMap.get(txn.account_id);
    if (!accountRowId) {
      skipped += 1;
      continue;
    }
    await upsertTransaction(accountRowId, txn);
    upserted += 1;
  }

  let removedCount = 0;
  for (const r of changes.removed) {
    const result = await mysql.query(
      `UPDATE plaid_transactions SET removed = TRUE WHERE plaid_transaction_id = ?`,
      [r.transaction_id]
    );
    removedCount += result.affectedRows || 0;
  }

  await mysql.query(
    `UPDATE user_plaid_items
       SET transactions_cursor = ?, last_synced_at = NOW(), status = 'healthy'
       WHERE id = ?`,
    [changes.cursor, item.id]
  );

  return {
    ok: true,
    upserted,
    removed: removedCount,
    skipped,
    cursor_updated: Boolean(changes.cursor),
  };
}

async function syncByPlaidItemId(plaidItemId) {
  const rows = await mysql.query(
    `SELECT id FROM user_plaid_items WHERE plaid_item_id = ? LIMIT 1`,
    [plaidItemId]
  );
  if (rows.length === 0) return { ok: false, reason: 'item not found' };
  return syncItemTransactions(rows[0].id);
}

// Pull Plaid Liabilities (statement dates, balances, APRs) for every credit
// card account under an Item. Best-effort: failures don't poison the
// transaction sync. Many institutions return liabilities only for credit /
// student-loan accounts; depository accounts produce nothing here.
async function syncLiabilitiesForItem(plaidItemRowId) {
  const items = await mysql.query(
    `SELECT id, access_token_encrypted FROM user_plaid_items WHERE id = ? LIMIT 1`,
    [plaidItemRowId]
  );
  if (items.length === 0) return { ok: false, reason: 'item not found' };

  const accounts = await mysql.query(
    `SELECT id, plaid_account_id FROM user_plaid_accounts WHERE plaid_item_row_id = ?`,
    [plaidItemRowId]
  );
  const accountRowMap = new Map(accounts.map((a) => [a.plaid_account_id, a.id]));

  let accessToken;
  try {
    accessToken = decryptToken(items[0].access_token_encrypted);
  } catch {
    return { ok: false, reason: 'decrypt failed' };
  }

  const plaidClient = getPlaidClient();
  let res;
  try {
    res = await plaidClient.liabilitiesGet({ access_token: accessToken });
  } catch (e) {
    const code = e?.response?.data?.error_code;
    // PRODUCT_NOT_READY is normal right after Item creation — Plaid takes a
    // few minutes to prepare liabilities. Caller can retry on next sync.
    console.warn('liabilities sync skipped:', code || e.message);
    return { ok: false, reason: code || 'plaid error' };
  }

  const ccs = res.data?.liabilities?.credit || [];
  let upserted = 0;
  for (const cc of ccs) {
    const accountRowId = accountRowMap.get(cc.account_id);
    if (!accountRowId) continue;
    await mysql.query(
      `INSERT INTO user_plaid_liabilities
         (plaid_account_row_id, last_statement_issue_date, last_statement_balance,
          minimum_payment_amount, next_payment_due_date, last_payment_date,
          last_payment_amount, is_overdue, aprs, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         last_statement_issue_date = VALUES(last_statement_issue_date),
         last_statement_balance = VALUES(last_statement_balance),
         minimum_payment_amount = VALUES(minimum_payment_amount),
         next_payment_due_date = VALUES(next_payment_due_date),
         last_payment_date = VALUES(last_payment_date),
         last_payment_amount = VALUES(last_payment_amount),
         is_overdue = VALUES(is_overdue),
         aprs = VALUES(aprs),
         last_synced_at = NOW()`,
      [
        accountRowId,
        cc.last_statement_issue_date || null,
        cc.last_statement_balance ?? null,
        cc.minimum_payment_amount ?? null,
        cc.next_payment_due_date || null,
        cc.last_payment_date || null,
        cc.last_payment_amount ?? null,
        cc.is_overdue ?? null,
        JSON.stringify(cc.aprs || []),
      ]
    );
    upserted += 1;
  }
  return { ok: true, upserted };
}

module.exports = { syncItemTransactions, syncByPlaidItemId, syncLiabilitiesForItem };
