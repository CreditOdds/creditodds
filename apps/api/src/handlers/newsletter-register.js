// POST /newsletter-register — idempotent "this user exists" upsert into the
// Brevo newsletter list, called by the frontend after sign-in. New signups
// reach Brevo within seconds of their first login instead of waiting for the
// nightly newsletter-sync pass, so the welcome-email automation (triggered by
// list entry) fires the same hour they join, not the next morning.
//
// Safe to call on every login:
//   - upsertContact never touches emailBlacklisted, so unsubscribes stick.
//   - re-upserting an existing list member is not a list-entry event, so the
//     welcome automation cannot fire twice (it is also once-per-contact).
// The nightly sync remains the backstop for logins this call never reports
// (closed tab, blocked request) and still prunes deleted accounts.

const brevo = require('../lib/brevo');

const responseHeaders = {
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

function reply(statusCode, body) {
  return { statusCode, headers: responseHeaders, body: JSON.stringify(body) };
}

exports.NewsletterRegisterHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: responseHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return reply(405, { error: 'Method not allowed' });
  }

  const email = event.requestContext?.authorizer?.email;
  if (!email) {
    return reply(401, { error: 'Unauthorized' });
  }

  if (!brevo.isConfigured()) {
    return reply(200, { available: false });
  }

  try {
    await brevo.upsertContact(email, {
      attributes: brevo.nameAttributes(event.requestContext?.authorizer?.name),
      listIds: [brevo.listId()],
    });
    return reply(200, { available: true });
  } catch (error) {
    console.error('newsletter-register error:', error);
    return reply(500, { error: 'Internal server error' });
  }
};
