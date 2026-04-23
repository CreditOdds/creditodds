/**
 * Bank Twitter handle lookup — used by social posting scripts to append
 * issuer @mentions to tweets. Handles live in data/bank-twitter-handles.json
 * keyed by bank name (as it appears in cards.json `bank` field).
 *
 * Only used for Twitter/X posts. Other platforms should not receive these
 * mentions since the handle format is X-specific.
 */

const fs = require('fs');
const path = require('path');

const HANDLES_PATH = path.join(__dirname, '..', '..', 'data', 'bank-twitter-handles.json');
const CARDS_PATH = path.join(__dirname, '..', '..', 'data', 'cards.json');

let _handles = null;
function loadHandles() {
  if (_handles) return _handles;
  try {
    const raw = fs.readFileSync(HANDLES_PATH, 'utf8');
    _handles = JSON.parse(raw);
  } catch (err) {
    console.warn(`  Warning: failed to load bank handles (${err.message}); skipping @mentions`);
    _handles = {};
  }
  return _handles;
}

let _cardNameToBank = null;
function loadCardNameToBank() {
  if (_cardNameToBank) return _cardNameToBank;
  try {
    const raw = fs.readFileSync(CARDS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const cards = Array.isArray(parsed) ? parsed : (parsed.cards || []);
    _cardNameToBank = {};
    for (const card of cards) {
      const name = card.card_name || card.name;
      if (name && card.bank) _cardNameToBank[name] = card.bank;
    }
  } catch (err) {
    console.warn(`  Warning: failed to load cards.json for bank lookup (${err.message})`);
    _cardNameToBank = {};
  }
  return _cardNameToBank;
}

/**
 * Resolve an array of card names to their issuer bank names using
 * local data/cards.json. Unknown cards are dropped.
 */
function resolveBanksFromCardNames(cardNames) {
  if (!Array.isArray(cardNames) || cardNames.length === 0) return [];
  const map = loadCardNameToBank();
  const banks = [];
  for (const name of cardNames) {
    if (name && map[name]) banks.push(map[name]);
  }
  return banks;
}

/**
 * Resolve a bank name to its Twitter handle (including the leading @).
 * Returns null if no handle is configured.
 */
function getBankHandle(bankName) {
  if (!bankName) return null;
  const handles = loadHandles();
  const handle = handles[bankName];
  if (!handle || typeof handle !== 'string') return null;
  return handle.startsWith('@') ? handle : `@${handle}`;
}

/**
 * Resolve a list of bank names into a de-duplicated, order-preserving array
 * of Twitter handles. Skips banks that aren't in the handles file.
 */
function getBankHandles(bankNames) {
  if (!Array.isArray(bankNames)) return [];
  const seen = new Set();
  const out = [];
  for (const name of bankNames) {
    const handle = getBankHandle(name);
    if (handle && !seen.has(handle)) {
      seen.add(handle);
      out.push(handle);
    }
  }
  return out;
}

/**
 * Append bank @mentions to a tweet body, respecting a max-length ceiling.
 * Handles are joined with spaces on a new line (blank-line separated). If
 * adding all handles would push the tweet past `maxLength`, drops handles
 * from the end until it fits. Returns the original text if nothing fits.
 *
 * @param {string} text - The tweet body (no URL).
 * @param {string[]} bankNames - Bank names to mention.
 * @param {number} [maxLength=260] - Max total characters for text+mentions.
 */
function appendBankHandles(text, bankNames, maxLength = 260) {
  const handles = getBankHandles(bankNames);
  if (handles.length === 0) return text;

  let kept = [...handles];
  while (kept.length > 0) {
    const suffix = '\n\n' + kept.join(' ');
    if ((text + suffix).length <= maxLength) {
      return text + suffix;
    }
    kept.pop();
  }
  return text;
}

module.exports = {
  getBankHandle,
  getBankHandles,
  appendBankHandles,
  resolveBanksFromCardNames,
};
