// Minimal Brevo (v3) API client for newsletter contact management.
// Uses the runtime's global fetch (node22) — no SDK dependency.
//
// All functions throw on non-2xx responses (except where noted) with the
// Brevo error body in the message so CloudWatch logs show the real cause.

const BASE = 'https://api.brevo.com/v3';

function apiKey() {
  return process.env.BREVO_API_KEY || '';
}

function listId() {
  const raw = process.env.BREVO_LIST_ID || '';
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

// True when both the API key and the newsletter list id are configured.
// Handlers no-op gracefully when this is false so the stack deploys and runs
// before the Brevo account exists.
function isConfigured() {
  return Boolean(apiKey()) && listId() !== null;
}

// Sender identity for transactional sends. Separate gate from isConfigured():
// transactional email needs a verified sender but not the newsletter list.
function senderEmail() {
  return process.env.BREVO_SENDER_EMAIL || '';
}

function canSendTransactional() {
  return Boolean(apiKey()) && Boolean(senderEmail());
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Rate-limited (429) responses are retried with backoff before surfacing as
// an error: Brevo's Retry-After header when present, exponential otherwise.
async function request(method, path, body, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'api-key': apiKey(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : null;
    if (res.status === 429 && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 30000)
          : Math.min(1000 * 2 ** attempt, 30000);
      await sleep(waitMs);
      continue;
    }
    const err = new Error(`Brevo ${method} ${path} -> ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
}

// Brevo contact attributes from a Firebase displayName: first word becomes
// FIRSTNAME, the rest LASTNAME. Empty/missing names produce empty attributes
// so a later real name can still fill them in via upsert.
function nameAttributes(displayName) {
  const name = (displayName || '').trim();
  if (!name) return { FIRSTNAME: '', LASTNAME: '' };
  const parts = name.split(/\s+/);
  return { FIRSTNAME: parts[0], LASTNAME: parts.slice(1).join(' ') };
}

// Create-or-update a contact and link it to the given lists. Does NOT touch
// emailBlacklisted, so contacts who unsubscribed via a campaign link stay
// unsubscribed even though they remain list members.
async function upsertContact(email, { attributes = {}, listIds = [] } = {}) {
  return request('POST', '/contacts', {
    email,
    attributes,
    listIds,
    updateEnabled: true,
  });
}

// Returns the contact object, or null when Brevo has never seen this email.
async function getContact(email) {
  try {
    return await request('GET', `/contacts/${encodeURIComponent(email)}`);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

// Partial update: pass only the fields to change, e.g.
// { emailBlacklisted: true } or { listIds: [3] } / { unlinkListIds: [3] }.
async function updateContact(email, fields) {
  return request('PUT', `/contacts/${encodeURIComponent(email)}`, fields);
}

// Best-effort hard delete (used when a user deletes their account).
// Missing contacts are not an error.
async function deleteContact(email) {
  try {
    await request('DELETE', `/contacts/${encodeURIComponent(email)}`);
    return true;
  } catch (err) {
    if (err.status === 404) return false;
    throw err;
  }
}

// All contact emails currently in a list (paginated, lowercased).
async function getListEmails(id) {
  const emails = [];
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const page = await request(
      'GET',
      `/contacts/lists/${id}/contacts?limit=${limit}&offset=${offset}`
    );
    const contacts = page?.contacts || [];
    for (const c of contacts) {
      if (c.email) emails.push(c.email.toLowerCase());
    }
    if (contacts.length < limit) break;
  }
  return emails;
}

// Remove emails from a list without deleting the contacts (keeps their
// unsubscribe history intact). Brevo caps the batch at 150 emails.
async function removeFromList(id, emails) {
  for (let i = 0; i < emails.length; i += 150) {
    await request('POST', `/contacts/lists/${id}/contacts/remove`, {
      emails: emails.slice(i, i + 150),
    });
  }
}

// One-off transactional email via Brevo's SMTP API. Sends immediately to a
// single recipient and does not touch list membership or unsubscribe state.
// Callers gate on canSendTransactional().
async function sendTransactionalEmail({ to, subject, htmlContent, textContent }) {
  return request('POST', '/smtp/email', {
    sender: {
      email: senderEmail(),
      name: process.env.BREVO_SENDER_NAME || 'CreditOdds',
    },
    to: [{ email: to }],
    subject,
    htmlContent,
    textContent,
  });
}

module.exports = {
  isConfigured,
  canSendTransactional,
  sendTransactionalEmail,
  listId,
  nameAttributes,
  upsertContact,
  getContact,
  updateContact,
  deleteContact,
  getListEmails,
  removeFromList,
};
