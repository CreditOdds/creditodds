// POST /plaid/link-token — issues a short-lived link_token for Plaid Link.
//
// The frontend exchanges this for a public_token via the Plaid Link drop-in,
// then sends the public_token to /plaid/exchange-token to swap for a long-lived
// access_token. Gated behind user_settings.plaid_beta_enabled.

const mysql = require('../db');
const { getPlaidClient } = require('../lib/plaid');
const { isPlaidBetaEnabled } = require('../lib/plaid-gate');

const responseHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

exports.PlaidLinkTokenHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: responseHeaders, body: '' };
  }

  const userId = event.requestContext?.authorizer?.principalId;
  if (!userId) {
    return { statusCode: 401, headers: responseHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    if (!(await isPlaidBetaEnabled(userId))) {
      await mysql.end();
      return { statusCode: 403, headers: responseHeaders, body: JSON.stringify({ error: 'Plaid beta not enabled for this account' }) };
    }
    await mysql.end();

    const plaid = getPlaidClient();
    const webhookUrl = process.env.PLAID_WEBHOOK_URL;
    const res = await plaid.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'CreditOdds',
      products: ['transactions', 'liabilities'],
      country_codes: ['US'],
      language: 'en',
      ...(webhookUrl ? { webhook: webhookUrl } : {}),
    });

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ link_token: res.data.link_token, expiration: res.data.expiration }),
    };
  } catch (error) {
    console.error('plaid link-token error:', error?.response?.data || error);
    await mysql.end();
    return {
      statusCode: 500,
      headers: responseHeaders,
      body: JSON.stringify({ error: 'Failed to create link token', details: error?.response?.data?.error_message || error.message }),
    };
  }
};
