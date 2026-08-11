// Shared cards.json fetcher for every handler that reads the CDN copy.
//
// Warm Lambda containers freeze between invocations while the global http
// agent (keep-alive by default on Node 22) holds a pooled socket to
// CloudFront. After a few idle minutes CloudFront closes that socket
// server-side, and the next invocation fails instantly with ECONNRESET
// ("socket hang up"). A GET retry on a fresh connection is safe, so transient
// socket errors get one retry, and each attempt carries an idle timeout
// (https.get has none by default).
//
// Successful results are cached at module scope for 5 minutes (matching the
// CDN's max-age=300 and the frontend's ISR revalidate), so warm invocations
// skip the ~735KB download + JSON.parse entirely. cacheBust bypasses the
// cache in both directions — it exists for the post-deploy sync, which must
// read through the CDN, not this container's memory.
const https = require('https');

// Handlers historically read CARDS_JSON_URL but template.yml sets CardsJsonUrl;
// accept both so the template override actually applies.
const CARDS_URL =
  process.env.CARDS_JSON_URL ||
  process.env.CardsJsonUrl ||
  'https://d2hxvzw7msbtvt.cloudfront.net/cards.json';

const REQUEST_TIMEOUT_MS = 5000;
const TRANSIENT_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE']);

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null; // { expiresAt, data }

function requestCardsOnce(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.cards);
        } catch (err) {
          reject(new Error('Failed to parse cards.json'));
        }
      });
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      const err = new Error(`cards.json request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      err.code = 'ETIMEDOUT';
      req.destroy(err);
    });
    req.on('error', reject);
  });
}

function isTransientNetworkError(err) {
  return TRANSIENT_CODES.has(err.code) || /socket hang up/i.test(err.message || '');
}

// Returns json.cards (undefined when the key is missing — callers that want an
// empty-array fallback apply `|| []` themselves). Pass cacheBust: true to
// append a timestamp query param so a post-deploy sync bypasses the CDN cache.
async function fetchCardsFromCDN({ cacheBust = false } = {}) {
  if (!cacheBust && cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }
  const url = cacheBust ? `${CARDS_URL}?t=${Date.now()}` : CARDS_URL;
  let cards;
  try {
    cards = await requestCardsOnce(url);
  } catch (err) {
    if (!isTransientNetworkError(err)) throw err;
    console.warn(
      `cards.json fetch failed (${err.code || err.message}); retrying on a fresh connection`
    );
    cards = await requestCardsOnce(url);
  }
  // Only well-formed results are cached — a missing `cards` key stays a
  // per-request anomaly rather than 5 minutes of empty responses.
  if (!cacheBust && Array.isArray(cards)) {
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, data: cards };
  }
  return cards;
}

function _resetCacheForTests() {
  cache = null;
}

module.exports = { fetchCardsFromCDN, _resetCacheForTests };
