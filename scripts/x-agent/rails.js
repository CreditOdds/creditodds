/**
 * Deterministic rails: the rate-discipline and novelty checks that keep the
 * account off X's spam radar. No LLM here — these are hard, predictable gates.
 */

const { RAILS } = require('./config');
const { todayET } = require('./state');

/** Current hour (0-23) in America/New_York. */
function currentHourET() {
  const h = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false,
  });
  return parseInt(h, 10) % 24;
}

function isActiveHours() {
  const h = currentHourET();
  const { start, end } = RAILS.activeHoursET;
  return h >= start && h < end;
}

function tweetAgeMinutes(createdAt) {
  if (!createdAt) return Infinity;
  return (Date.now() - new Date(createdAt).getTime()) / 60000;
}

function tweetFreshEnough(createdAt) {
  return tweetAgeMinutes(createdAt) <= RAILS.maxTweetAgeMinutes;
}

// --- Novelty: token Jaccard similarity against recent replies -------------

function tokenize(s) {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2)
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** True if `text` is too similar to any recent reply (i.e. NOT novel enough). */
function isRepetitive(text, recentTexts) {
  const t = tokenize(text);
  return recentTexts.some((r) => jaccard(t, tokenize(r)) >= RAILS.noveltySimilarityThreshold);
}

// --- Posting eligibility (rate limits) -----------------------------------

/**
 * Can we post a live reply right now given the current state?
 * @returns {{ok: boolean, reason?: string}}
 */
function canPostNow(state, targetHandle) {
  if (state.day.count >= RAILS.maxRepliesPerDay) {
    return { ok: false, reason: `daily cap reached (${RAILS.maxRepliesPerDay})` };
  }
  const minutesSinceLast = (Date.now() - (state.lastReplyTs || 0)) / 60000;
  if (minutesSinceLast < RAILS.minMinutesBetweenReplies) {
    return { ok: false, reason: `too soon since last reply (${minutesSinceLast.toFixed(0)}min)` };
  }
  if (state.accountLastReplyDate[targetHandle] === todayET()) {
    return { ok: false, reason: `already replied to @${targetHandle} today` };
  }
  return { ok: true };
}

module.exports = {
  isActiveHours,
  currentHourET,
  tweetAgeMinutes,
  tweetFreshEnough,
  isRepetitive,
  canPostNow,
};
