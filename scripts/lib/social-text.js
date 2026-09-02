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

module.exports = { TWEET_TEXT_LIMIT, TWEET_MAX, sanitizeSocialText, enforceTweetLimit };
