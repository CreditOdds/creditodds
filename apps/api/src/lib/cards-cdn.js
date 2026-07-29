// Shared cards.json fetcher for every handler that reads the CDN copy.
//
// Warm Lambda containers freeze between invocations while the global http
// agent (keep-alive by default on Node 22) holds a pooled socket to
// CloudFront. After a few idle minutes CloudFront closes that socket
// server-side, and the next invocation fails instantly with ECONNRESET
// ("socket hang up"). A GET retry on a fresh connection is safe, so transient
// socket errors get one retry, and each attempt carries an idle timeout
// (https.get has none by default).
const https = require('https');

// Handlers historically read CARDS_JSON_URL but template.yml sets CardsJsonUrl;
// accept both so the template override actually applies.
const CARDS_URL =
  process.env.CARDS_JSON_URL ||
  process.env.CardsJsonUrl ||
  'https://d2hxvzw7msbtvt.cloudfront.net/cards.json';

const REQUEST_TIMEOUT_MS = 5000;
const TRANSIENT_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE']);

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
  const url = cacheBust ? `${CARDS_URL}?t=${Date.now()}` : CARDS_URL;
  try {
    return await requestCardsOnce(url);
  } catch (err) {
    if (!isTransientNetworkError(err)) throw err;
    console.warn(
      `cards.json fetch failed (${err.code || err.message}); retrying on a fresh connection`
    );
    return requestCardsOnce(url);
  }
}

module.exports = { fetchCardsFromCDN };
