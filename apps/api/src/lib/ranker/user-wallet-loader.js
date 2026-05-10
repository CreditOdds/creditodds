// Loads a user's wallet rows + active category selections in the shape
// the ranker expects: Array<{ id, card_name, selections }>.
//
// Kept separate from the user-wallet handler's GET path so that surface
// can evolve independently (it does much more: ratings, sort order,
// timestamps). The ranker only needs the three fields below.

const mysql = require("../../db");

async function loadUserWallet(userId) {
  const walletCards = await mysql.query(
    `SELECT uc.id, c.card_name
     FROM user_cards uc
     JOIN cards c ON uc.card_id = c.card_id
     WHERE uc.user_id = ?`,
    [userId],
  );

  const walletRowIds = walletCards.map((w) => w.id);
  const selectionsByWalletId = new Map();
  if (walletRowIds.length > 0) {
    try {
      const selectionRows = await mysql.query(
        `SELECT user_card_id, reward_category, reward_rate, selected_category, auto_renew
         FROM user_card_selections
         WHERE user_card_id IN (?) AND valid_to IS NULL`,
        [walletRowIds],
      );
      for (const r of selectionRows) {
        const list = selectionsByWalletId.get(r.user_card_id) || [];
        list.push({
          reward_category: r.reward_category,
          reward_rate: Number(r.reward_rate),
          selected_category: r.selected_category,
          auto_renew: Boolean(r.auto_renew),
        });
        selectionsByWalletId.set(r.user_card_id, list);
      }
    } catch (selErr) {
      // Mirrors the user-wallet handler: degrade to empty selections rather
      // than failing the whole request if user_card_selections is missing
      // (e.g. mid-deploy before migration 029 runs).
      console.error(
        "user_card_selections lookup failed (continuing with empty selections):",
        selErr.message,
      );
    }
  }

  return walletCards.map((w) => ({
    id: w.id,
    card_name: w.card_name,
    selections: selectionsByWalletId.get(w.id) || [],
  }));
}

module.exports = { loadUserWallet };
