/**
 * Shared logic for the weekly sign-up bonus change roundups.
 *
 * Pulls the past 7 days of `signup_bonus_value` rows from the card wire and
 * collapses each card down to a single net change. Consumed by
 * post-weekly-sub-changes.js (X/Facebook/LinkedIn, Thursdays) and
 * post-weekly-sub-changes-reddit.js (manual Reddit draft, Mondays).
 */

const API_BASE = 'https://d2ojrhbh2dincr.cloudfront.net';
const CARD_WIRE_URL = 'https://creditodds.com/card-wire';

// The endpoint caps `limit` at 200 and returns newest-first. A typical week
// carries well under 20 rows, so 200 covers the window with wide margin.
const FETCH_LIMIT = 200;
const WINDOW_DAYS = 7;

/**
 * Rough cash value of one unit, used only to rank changes against each other —
 * never displayed. Ranking by percent instead would let a $10 -> $0 store-card
 * gift card (a 100% drop) outrank a 185,000 -> 140,000 point devaluation (24%),
 * and would divide by zero whenever a bonus starts at 0.
 */
const UNIT_VALUE_USD = {
  cash: 1,
  cashback: 1,
  points: 0.015,
  miles: 0.013,
  free_nights: 150,
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, { maxRetries = 3, baseDelay = 2000 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok || (response.status < 500 && response.status !== 429)) {
      return response;
    }
    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`  Retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries}, status ${response.status})...`);
      await sleep(delay);
    } else {
      return response;
    }
  }
}

/**
 * Card names carry the issuer suffix in the DB ("... American Express"), which
 * eats scarce space without adding information next to the card name.
 */
function shortenCardName(name) {
  return String(name)
    .replace(/\s+American Express$/i, '')
    .replace(/\s+Credit Card$/i, '')
    .trim();
}

/**
 * Mirrors the user-facing convention: cash bonuses render as dollars, free
 * nights keep their unit (a bare "2" would be meaningless), and points/miles
 * render as a plain grouped number.
 */
function formatBonus(value, unit) {
  const num = parseFloat(value);
  if (Number.isNaN(num)) return String(value);
  if (unit === 'cash' || unit === 'cashback') return `$${num.toLocaleString('en-US')}`;
  if (unit === 'free_nights') return `${num.toLocaleString('en-US')} night${num === 1 ? '' : 's'}`;
  return num.toLocaleString('en-US');
}

async function fetchRecentSubChanges() {
  // Bust the CloudFront cache (s-maxage=300) so the run never reads a
  // response written before the morning's card sync.
  const res = await fetchWithRetry(`${API_BASE}/card-wire?limit=${FETCH_LIMIT}&_=${Date.now()}`);
  if (!res.ok) throw new Error(`Failed to fetch card wire: ${res.status}`);
  const { changes } = await res.json();

  if (changes.length >= FETCH_LIMIT) {
    console.log(`  Warning: hit the ${FETCH_LIMIT}-row fetch cap — the oldest changes in the window may be missing.`);
  }

  const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return changes.filter(
    c => c.field === 'signup_bonus_value' && new Date(c.changed_at).getTime() >= cutoff
  );
}

/**
 * A card can move more than once in a week (or flip units mid-week). Collapse
 * each card to one net change: oldest old_value -> newest new_value, using
 * only the rows that share the card's most recent unit, since values in
 * different units aren't comparable. Cards that net out flat are dropped.
 */
function collapsePerCard(rows) {
  const byCard = new Map();
  for (const row of rows) {
    if (!byCard.has(row.card_id)) byCard.set(row.card_id, []);
    byCard.get(row.card_id).push(row);
  }

  const collapsed = [];
  for (const cardRows of byCard.values()) {
    cardRows.sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at));

    const latest = cardRows[cardRows.length - 1];
    const sameUnit = cardRows.filter(r => r.unit === latest.unit);
    const first = sameUnit[0];

    const oldNum = parseFloat(first.old_value);
    const newNum = parseFloat(latest.new_value);
    if (Number.isNaN(oldNum) || Number.isNaN(newNum) || oldNum === newNum) continue;

    // A value of 0 is real data: it means the public sees no bonus amount.
    // Cards that simply have no bonus omit `signup_bonus` entirely, so a 0 here
    // is always a deliberate statement about the public offer, and a move to or
    // from it is a genuine change worth reporting.
    collapsed.push({
      cardName: shortenCardName(latest.card_name),
      unit: latest.unit,
      oldValue: first.old_value,
      newValue: latest.new_value,
      oldNum,
      newNum,
      // Approximate cash value of the swing, so changes rank against each other
      // across units. Ordering only — never shown in the post.
      weight: Math.abs(newNum - oldNum) * (UNIT_VALUE_USD[latest.unit] ?? 0.015),
      changedAt: latest.changed_at,
    });
  }
  return collapsed;
}

function buildCardWireLink(utmSource, campaign) {
  const url = new URL(CARD_WIRE_URL);
  url.searchParams.set('utm_source', utmSource);
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', campaign);
  url.searchParams.set('utm_content', `weekly-${new Date().toISOString().slice(0, 10)}`);
  return url.toString();
}

/**
 * POST an arbitrary body to the Social Posting Service queue endpoint.
 */
async function queueSocialPost(body) {
  const apiUrl = process.env.SOCIAL_API_URL;
  const apiKey = process.env.SOCIAL_API_KEY;
  if (!apiUrl || !apiKey) throw new Error('SOCIAL_API_URL and SOCIAL_API_KEY are required');

  const response = await fetchWithRetry(`${apiUrl}/social/queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Queue API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

module.exports = {
  WINDOW_DAYS,
  fetchWithRetry,
  shortenCardName,
  formatBonus,
  fetchRecentSubChanges,
  collapsePerCard,
  buildCardWireLink,
  queueSocialPost,
};
