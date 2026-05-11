// /user-settings — per-user flags (plaid beta, avatar seed, future toggles).
// GET returns the authenticated user's settings, falling back to defaults if no row exists.
// PUT upserts updatable fields (currently: avatar_seed).

const mysql = require('../db');

const responseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
};

const MAX_AVATAR_SEED_LENGTH = 64;
const AVATAR_SEED_PATTERN = /^[A-Za-z0-9_-]+$/;

exports.UserSettingsHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: responseHeaders, body: '' };
  }

  const userId = event.requestContext?.authorizer?.principalId;
  if (!userId) {
    return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    if (event.httpMethod === 'GET') {
      const rows = await mysql.query(
        'SELECT plaid_beta_enabled, avatar_seed FROM user_settings WHERE user_id = ? LIMIT 1',
        [userId]
      );
      await mysql.end();
      const settings = {
        plaid_beta_enabled: rows.length > 0 ? Boolean(rows[0].plaid_beta_enabled) : false,
        avatar_seed: rows.length > 0 ? rows[0].avatar_seed : null,
      };
      return { statusCode: 200, headers: responseHeaders, body: JSON.stringify(settings) };
    }

    if (event.httpMethod === 'PUT') {
      let body;
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        await mysql.end();
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
      }

      if (!Object.prototype.hasOwnProperty.call(body, 'avatar_seed')) {
        await mysql.end();
        return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'No updatable fields provided' }) };
      }

      const rawSeed = body.avatar_seed;
      let avatarSeed = null;
      if (rawSeed !== null && rawSeed !== undefined && rawSeed !== '') {
        if (typeof rawSeed !== 'string' || rawSeed.length > MAX_AVATAR_SEED_LENGTH || !AVATAR_SEED_PATTERN.test(rawSeed)) {
          await mysql.end();
          return { statusCode: 400, headers: responseHeaders, body: JSON.stringify({ error: 'Invalid avatar_seed' }) };
        }
        avatarSeed = rawSeed;
      }

      await mysql.query(
        `INSERT INTO user_settings (user_id, avatar_seed)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE avatar_seed = VALUES(avatar_seed)`,
        [userId, avatarSeed]
      );
      const rows = await mysql.query(
        'SELECT plaid_beta_enabled, avatar_seed FROM user_settings WHERE user_id = ? LIMIT 1',
        [userId]
      );
      await mysql.end();
      const settings = {
        plaid_beta_enabled: rows.length > 0 ? Boolean(rows[0].plaid_beta_enabled) : false,
        avatar_seed: rows.length > 0 ? rows[0].avatar_seed : null,
      };
      return { statusCode: 200, headers: responseHeaders, body: JSON.stringify(settings) };
    }

    await mysql.end();
    return { statusCode: 405, headers: responseHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('user-settings error:', error);
    await mysql.end();
    return { statusCode: 500, headers: responseHeaders, body: JSON.stringify({ error: 'Internal server error', details: error.message }) };
  }
};
