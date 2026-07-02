/**
 * Coarse relevance pre-filter. With broad personal-finance influencers on the
 * target list, most of their tweets are off-topic (crypto, stocks, real estate,
 * life advice). This cheap keyword gate skips tweets that aren't about credit /
 * cards / points / finance BEFORE we spend LLM calls generating replies.
 *
 * It's deliberately a coarse first pass — the double-judge is the real quality
 * control. A false positive just costs one wasted generation; a false negative
 * (skipping a relevant tweet) costs nothing, since skipping is free.
 */

// Distinctive multi-word phrases (matched as substrings, low false-positive risk).
const PHRASES = [
  'credit card', 'credit score', 'credit limit', 'credit utilization',
  'annual fee', 'sign up bonus', 'sign-up bonus', 'signup bonus',
  'welcome bonus', 'welcome offer', 'cash back', 'cashback', 'interest rate',
  'balance transfer', 'american express', 'capital one', 'bank of america',
  'wells fargo', 'membership rewards', 'ultimate rewards', 'thankyou points',
  'transfer partner', 'travel credit', 'statement credit', 'foreign transaction',
  'intro apr', 'no annual fee', 'hard inquiry', 'hard pull', 'authorized user',
  'minimum payment', 'retention offer', 'points and miles',
];

// Single tokens matched with word boundaries (avoids matching inside other words,
// e.g. \bapr\b does not match "April", \bcard\b does not match "discard").
const WORDS = [
  'credit', 'cards?', 'amex', 'chase', 'citi', 'citibank', 'discover', 'visa',
  'mastercard', 'bilt', 'barclays', 'synchrony', 'points', 'miles', 'rewards',
  'apr', 'apy', 'fico', 'churning', 'churn', 'redeem', 'redemption', 'avios',
  'skymiles', 'lounge', 'cardholder', 'underwriting', 'creditworthy',
];

const WORD_RE = new RegExp(`\\b(?:${WORDS.join('|')})\\b`, 'i');

function isRelevant(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (PHRASES.some((p) => lower.includes(p))) return true;
  return WORD_RE.test(lower);
}

module.exports = { isRelevant };
