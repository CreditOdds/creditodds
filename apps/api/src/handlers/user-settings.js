// GET /user-settings — returns the authenticated user's per-account flags.
// Frontend reads this to decide whether to render Plaid (and future) beta UI.
// Falls back to defaults (all flags false) if no row exists yet.

const mysql = require('../db');

const responseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

exports.UserSettingsHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: responseHeaders, body: '' };
  }

  const userId = event.requestContext?.authorizer?.principalId;
  if (!userId) {
    return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const rows = await mysql.query(
      'SELECT plaid_beta_enabled FROM user_settings WHERE user_id = ? LIMIT 1',
      [userId]
    );
    await mysql.end();

    const settings = {
      plaid_beta_enabled: rows.length > 0 ? Boolean(rows[0].plaid_beta_enabled) : false,
    };
    return { statusCode: 200, headers: responseHeaders, body: JSON.stringify(settings) };
  } catch (error) {
    console.error('user-settings error:', error);
    await mysql.end();
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: 'Internal server error', details: error.message }) };
  }
};
