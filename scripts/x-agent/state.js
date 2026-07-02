/**
 * Persistent state for the reply agent. GitHub Actions is stateless between runs,
 * so we keep a small JSON blob in S3 (seen tweet ids, posted log, per-account
 * cooldowns, novelty history). Falls back to a local file when X_AGENT_STATE_S3
 * is not set, so the pipeline is testable locally.
 *
 * S3 mode shells out to the AWS CLI (already available + authed in the workflow),
 * avoiding an SDK dependency at the repo root.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const S3_URI = process.env.X_AGENT_STATE_S3 || null; // e.g. s3://bucket/x-agent/state.json
const LOCAL_PATH = path.join(__dirname, 'state', 'state.json');

const EMPTY = {
  seenTweetIds: [],
  lastSearchId: null,
  posted: [],            // { tweetId, replyId|null, author, text, register, score, mode, ts }
  recentReplyTexts: [],  // novelty history
  accountLastReplyDate: {}, // handle -> YYYY-MM-DD
  day: { date: null, count: 0 },
  lastReplyTs: 0,
};

function load() {
  try {
    if (S3_URI) {
      const buf = execFileSync('aws', ['s3', 'cp', S3_URI, '-'], { encoding: 'utf8' });
      return { ...EMPTY, ...JSON.parse(buf) };
    }
    if (fs.existsSync(LOCAL_PATH)) {
      return { ...EMPTY, ...JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8')) };
    }
  } catch (err) {
    // First run (object doesn't exist yet) or unreadable — start clean.
    console.warn(`state: starting from empty (${err.message.split('\n')[0]})`);
  }
  return { ...EMPTY };
}

function save(state) {
  const json = JSON.stringify(state, null, 2);
  if (S3_URI) {
    execFileSync('aws', ['s3', 'cp', '-', S3_URI, '--content-type', 'application/json'], {
      input: json,
    });
    return;
  }
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_PATH, json);
}

// --- helpers -------------------------------------------------------------

function todayET() {
  // YYYY-MM-DD in America/New_York.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** Reset the daily counter if the day rolled over (ET). Mutates state. */
function rolloverDay(state) {
  const today = todayET();
  if (state.day.date !== today) state.day = { date: today, count: 0 };
  return today;
}

function markSeen(state, ids) {
  const set = new Set(state.seenTweetIds);
  for (const id of ids) set.add(id);
  // Cap the ring buffer so state doesn't grow unbounded.
  state.seenTweetIds = [...set].slice(-800);
}

function recordPost(state, entry) {
  state.posted.push(entry);
  state.posted = state.posted.slice(-500);
  if (entry.text) {
    state.recentReplyTexts.push(entry.text);
    state.recentReplyTexts = state.recentReplyTexts.slice(-40);
  }
  if (entry.mode === 'live') {
    state.day.count += 1;
    state.lastReplyTs = entry.ts;
    state.accountLastReplyDate[entry.author] = todayET();
  }
}

module.exports = { load, save, markSeen, recordPost, rolloverDay, todayET, EMPTY };
