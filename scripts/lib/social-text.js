/**
 * Shared text rules for generated social posts.
 *
 * Both scripts/queue-social.js (queues via the social-posting-service) and
 * scripts/post-social.js (posts to X directly) generate tweet text with an LLM
 * and then append the item URL. These helpers keep the two paths honest about
 * the same two things: how long the text may be, and what characters may
 * appear in it.
 */

/**
 * X counts every link as a fixed-width t.co URL (23 chars) no matter how long
 * the real URL is, and both posting paths join text and URL with "\n\n".
 * So the text budget is 280 - 23 - 2 = 255. Anything above this produces a
 * tweet over the limit that X rejects at post time.
 */
const TWEET_MAX = 280;
const TCO_LENGTH = 23;
const URL_SEPARATOR_LENGTH = 2; // the "\n\n" between text and URL
const TWEET_TEXT_LIMIT = TWEET_MAX - TCO_LENGTH - URL_SEPARATOR_LENGTH; // 255

/**
 * Strip characters the house style bans, regardless of what the model returned.
 * The prompt already forbids these; this is the backstop so a single ignored
 * instruction cannot put an emoji or an em dash in front of readers.
 *
 * Emoji are removed outright (they render as "????" in some downstream clients
 * and read as meme-y). Em/en dashes become a comma or period depending on
 * whether the dash was joining a clause or ending one.
 */
function sanitizeSocialText(input) {
  let text = String(input || '');

  // Em dash / en dash / horizontal bar -> comma, then collapse the spacing.
  // " word — word " and " word—word " both become " word, word ".
  text = text.replace(/\s*[—–―]\s*/g, ', ');

  // Drop emoji, pictographs, dingbats, symbols, and variation selectors.
  text = text
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{200D}]/gu,
      ''
    )
    // Leftover skin-tone / keycap modifiers.
    .replace(/[\u{1F3FB}-\u{1F3FF}\u{20E3}]/gu, '');

  // Tidy the damage: doubled punctuation, space before punctuation, trailing
  // separators, and runs of spaces introduced by the removals above.
  text = text
    .replace(/,\s*,/g, ',')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[\s,;:]+$/g, '')
    .trim();

  return text;
}

/**
 * Sanitize, then hard-cap to the text budget. Truncation prefers the last
 * sentence or line break so a clipped post still ends on a complete fact
 * rather than mid-number; it falls back to an ellipsis only when there is no
 * clean break to cut at.
 */
function enforceTweetLimit(input, limit = TWEET_TEXT_LIMIT) {
  const text = sanitizeSocialText(input);
  if (text.length <= limit) return text;

  const clipped = text.slice(0, limit);
  const lastBreak = Math.max(
    clipped.lastIndexOf('\n'),
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('.')
  );
  // Prefer ending on a complete sentence or line. Accept the break as long as
  // it keeps at least half the post; ending a fact short reads better than the
  // ellipsis fallback, which can clip mid-number.
  if (lastBreak >= limit * 0.5) {
    return clipped.slice(0, lastBreak + 1).trim().replace(/[\s,;:]+$/g, '');
  }
  return `${clipped.slice(0, limit - 3).trim()}...`;
}

/**
 * Outlets and sources that are NOT the company the story is about. When a
 * summary hangs a claim on one of these, the claim is somebody's reporting
 * rather than an issuer announcement, and the post has to say so.
 *
 * A first-party attribution ("Southwest said on September 2", "Citi is
 * mailing") is deliberately not in this list: the issuer speaking about its
 * own product is the confirmation, so a post may state it flatly.
 */
const THIRD_PARTY_SOURCES = [
  'doctor of credit',
  'the points guy',
  'nerdwallet',
  'upgraded points',
  'thrifty traveler',
  'view from the wing',
  'one mile at a time',
  'frequent miler',
  'wall street journal',
  'bloomberg',
  'reuters',
  'reddit',
  'r/churning',
  'r/creditcards',
  'cardholders report',
  'cardholder reports',
  'data points',
];

/**
 * Words that mark a claim as unverified regardless of who said it.
 */
const UNCERTAINTY_MARKERS = [
  'unconfirmed',
  'rumor',
  'rumored',
  'rumours',
  'reportedly',
  'allegedly',
  'appears to',
  'appear to',
  'is said to',
  'are said to',
  'has not confirmed',
  'have not confirmed',
  'not confirmed',
  'has not published',
  'not yet confirmed',
  'no official',
];

function containsAny(haystack, needles) {
  const lower = haystack.toLowerCase();
  return needles.filter((needle) => lower.includes(needle));
}

const CLAIM_STOPWORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'from', 'for', 'its', 'it', 'is', 'are',
  'was', 'were', 'has', 'have', 'had', 'will', 'would', 'can', 'could', 'been',
  'not', 'but', 'they', 'their', 'them', 'there', 'then', 'than', 'also', 'only',
  'now', 'new', 'per', 'each', 'all', 'any', 'some', 'more', 'most', 'other',
  'into', 'out', 'over', 'under', 'after', 'before', 'when', 'which', 'who',
  'what', 'how', 'says', 'said', 'reports', 'reported', 'according', 'card',
  'cards', 'cardholders', 'cardholder', 'takes', 'take', 'place', 'current',
]);

/**
 * The distinctive content of a claim: numbers and dollar amounts, plus words
 * long enough to carry meaning. Used to tell "the post repeated this claim"
 * from "the post left this claim out".
 */
function claimTokens(sentence) {
  const lower = String(sentence || '').toLowerCase();
  const tokens = new Set();
  for (const amount of lower.match(/\$[\d,.]+|\b\d[\d,.]*\b/g) || []) {
    tokens.add(amount.replace(/[.,]$/, ''));
  }
  for (const word of lower.match(/[a-z][a-z-]{2,}/g) || []) {
    if (!CLAIM_STOPWORDS.has(word)) tokens.add(word);
  }
  return tokens;
}

/**
 * The sentences of `summary` that carry one of `markers`.
 */
function markedSentences(summary, markers) {
  return String(summary || '')
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => containsAny(sentence, markers).length > 0);
}

/**
 * True when `text` repeats the substance of `sentence` rather than omitting it.
 * Two distinctive tokens in common is enough: a dollar amount plus a noun is
 * the shape of nearly every claim we publish.
 */
function restatesClaim(sentence, text) {
  const claim = claimTokens(sentence);
  if (claim.size === 0) return false;
  const post = claimTokens(text);
  let shared = 0;
  for (const token of claim) {
    if (post.has(token)) shared++;
    if (shared >= 2) return true;
  }
  return false;
}

/**
 * Detect the failure where a summary carefully attributes or hedges a claim
 * ("Doctor of Credit reports it takes the place of the $5 promo") and the
 * generated post restates it as established fact ("This replaces the $5
 * promo"). The hedge is the whole point of the sentence, so dropping it
 * publishes a stronger claim than the reporting supports.
 *
 * Fires only when the post BOTH repeats the substance of the hedged claim AND
 * carries no attribution or hedge of its own. A post that leaves the claim out
 * entirely is fine, and so is a confirmed story with no hedge to begin with.
 *
 * Returns null when the post is fine, or { marker, kind } describing the hedge
 * that went missing.
 */
function findFlattenedAttribution(summary, text) {
  const summaryText = String(summary || '');
  const postText = String(text || '');
  if (!summaryText || !postText) return null;

  const checks = [
    { kind: 'uncertainty', markers: UNCERTAINTY_MARKERS },
    { kind: 'attribution', markers: THIRD_PARTY_SOURCES },
  ];

  for (const { kind, markers } of checks) {
    const found = containsAny(summaryText, markers);
    if (found.length === 0) continue;

    // The post carries a hedge of its own, or names the same source.
    if (containsAny(postText, UNCERTAINTY_MARKERS).length > 0) return null;
    if (containsAny(postText, found).length > 0) return null;

    const restated = markedSentences(summaryText, found)
      .some((sentence) => restatesClaim(sentence, postText));
    if (restated) return { marker: found[0], kind };
  }

  return null;
}

module.exports = { TWEET_TEXT_LIMIT, TWEET_MAX, sanitizeSocialText, enforceTweetLimit,
  findFlattenedAttribution, THIRD_PARTY_SOURCES, UNCERTAINTY_MARKERS };
