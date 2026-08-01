// /newsletter-settings — the authenticated user's newsletter subscription,
// backed directly by Brevo (single source of truth for suppression, so the
// in-app toggle and the email unsubscribe link can never disagree).
//
// GET returns { available, subscribed }. available=false means Brevo isn't
// configured yet — the frontend hides the row entirely in that case.
//
// PUT { subscribed: boolean }:
//   false -> emailBlacklisted=true (identical to clicking unsubscribe in an
//            email: suppressed from all marketing sends).
//   true  -> upsert into the newsletter list + emailBlacklisted=false. This
//            is an explicit user opt-in, the one case where clearing the
//            blacklist flag is legitimate.

const brevo = require('../lib/brevo');

const responseHeaders = {
  // Authenticated, user-specific responses: never cache at browser or any
  // shared edge (CloudFront/proxy). Belt-and-suspenders for routing the API
  // through a CDN without leaking one user's data to another.
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
};

function reply(statusCode, body) {
  return { statusCode, headers: responseHeaders, body: JSON.stringify(body) };
}

exports.NewsletterSettingsHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: responseHeaders, body: '' };
  }

  const email = event.requestContext?.authorizer?.email;
  if (!email) {
    return reply(401, { error: 'Unauthorized' });
  }

  if (!brevo.isConfigured()) {
    return reply(200, { available: false, subscribed: false });
  }
  const listId = brevo.listId();

  try {
    if (event.httpMethod === 'GET') {
      const contact = await brevo.getContact(email);
      const subscribed = Boolean(
        contact &&
          !contact.emailBlacklisted &&
          (contact.listIds || []).includes(listId)
      );
      return reply(200, { available: true, subscribed });
    }

    if (event.httpMethod === 'PUT') {
      let body;
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return reply(400, { error: 'Invalid JSON body' });
      }
      if (typeof body.subscribed !== 'boolean') {
        return reply(400, { error: 'subscribed must be a boolean' });
      }

      if (body.subscribed) {
        await brevo.upsertContact(email, { listIds: [listId] });
        await brevo.updateContact(email, { emailBlacklisted: false });
      } else {
        const contact = await brevo.getContact(email);
        if (contact) {
          await brevo.updateContact(email, { emailBlacklisted: true });
        }
      }
      return reply(200, { available: true, subscribed: body.subscribed });
    }

    return reply(405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('newsletter-settings error:', error);
    return reply(500, { error: 'Internal server error' });
  }
};
