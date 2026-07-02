/**
 * Persistent ledger for the content agent (S3, with local fallback). Tracks which
 * tweets we've already processed, the watermark, covered topics (dedup), and a
 * daily post/publish counter. Same mechanism as x-agent/state.js.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const S3_URI = process.env.CONTENT_AGENT_STATE_S3 || null;
const LOCAL_PATH = path.join(__dirname, 'state', 'state.json');

const EMPTY = {
  seenTweetIds: [],
  lastSearchId: null,
  coveredTopics: [],   // { topic, decision, ts }
  processed: [],       // audit log of decisions (capped)
  day: { date: null, articles: 0, tweets: 0 },
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
    console.warn(`state: starting empty (${err.message.split('\n')[0]})`);
  }
  return { ...EMPTY };
}

function save(state) {
  const json = JSON.stringify(state, null, 2);
  if (S3_URI) {
    execFileSync('aws', ['s3', 'cp', '-', S3_URI, '--content-type', 'application/json'], { input: json });
    return;
  }
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_PATH, json);
}

function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function rolloverDay(state) {
  const today = todayET();
  if (state.day.date !== today) state.day = { date: today, articles: 0, tweets: 0 };
}

function markSeen(state, ids) {
  const set = new Set(state.seenTweetIds);
  for (const id of ids) set.add(id);
  state.seenTweetIds = [...set].slice(-1000);
}

function recordDecision(state, entry) {
  state.processed.push(entry);
  state.processed = state.processed.slice(-500);
  if (entry.topic && entry.decision !== 'skip') {
    state.coveredTopics.push(entry.topic);
    state.coveredTopics = state.coveredTopics.slice(-200);
  }
}

module.exports = { load, save, rolloverDay, markSeen, recordDecision, todayET, EMPTY };
