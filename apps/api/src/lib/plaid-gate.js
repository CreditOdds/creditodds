// Beta gate for Plaid endpoints. Returns true if the user has plaid_beta_enabled = TRUE
// in user_settings. Absent row counts as false (default off).
const mysql = require('../db');

async function isPlaidBetaEnabled(userId) {
  const rows = await mysql.query(
    'SELECT plaid_beta_enabled FROM user_settings WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows.length > 0 && Boolean(rows[0].plaid_beta_enabled);
}

module.exports = { isPlaidBetaEnabled };
