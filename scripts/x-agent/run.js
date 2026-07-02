#!/usr/bin/env node
/**
 * Orchestrator for the CreditOdds X reply agent.
 *
 *   monitor -> filter -> generate -> judge -> rails -> (shadow log | live post)
 *
 * Posts AT MOST ONE reply per invocation. With an hourly cron that gives natural
 * spacing well above the minimum, keeps volume low, and makes each run cheap.
 *
 * Mode is controlled by X_AGENT_MODE ('shadow' default, 'live' to post).
 * Kill switch: X_AGENT_KILL=1.
 *
 * Usage: node scripts/x-agent/run.js
 */

const { MODE, TARGETS, REPLYABLE_TIERS, KILL_SWITCH, FORCE, RESET, CANDIDATES_PER_TWEET } = require('./config');
const state = require('./state');
const rails = require('./rails');
const { generateCandidates } = require('./generate');
const { judgeCandidate } = require('./judge');
const twitter = require('./twitter');
const slack = require('./slack');
const relevance = require('./relevance');

const MAX_TWEETS_PER_RUN = 8; // bound LLM cost per invocation

function log(...a) { console.log(...a); }

async function main() {
  log(`\n=== X reply agent — mode=${MODE} @ ${new Date().toISOString()} ===`);

  if (KILL_SWITCH) {
    log('KILL SWITCH is set (X_AGENT_KILL). Halting, doing nothing.');
    return;
  }

  const st = RESET ? JSON.parse(JSON.stringify(state.EMPTY)) : state.load();
  if (RESET) log('X_AGENT_RESET set — ignoring saved state, doing a fresh scan.');
  state.rolloverDay(st);

  if (!rails.isActiveHours()) {
    if (!FORCE) {
      log(`Outside active hours (ET hour ${rails.currentHourET()}). Skipping to conserve reads.`);
      return;
    }
    log(`Outside active hours (ET hour ${rails.currentHourET()}), but X_AGENT_FORCE is set — proceeding.`);
  }

  const handles = TARGETS.filter((t) => REPLYABLE_TIERS.includes(t.tier)).map((t) => t.handle);
  const tierByHandle = new Map(TARGETS.map((t) => [t.handle.toLowerCase(), t.tier]));

  // 1. Monitor
  let search;
  try {
    search = await twitter.searchRecent(handles, { sinceId: st.lastSearchId });
  } catch (err) {
    log(`Search failed: ${err.message}`);
    return;
  }
  if (search.newestId) st.lastSearchId = search.newestId;

  // 2. Filter to fresh, unseen, replyable tweets
  const seen = new Set(st.seenTweetIds);
  const fresh = search.tweets.filter((t) =>
    !seen.has(t.id) &&
    rails.tweetFreshEnough(t.createdAt) &&
    REPLYABLE_TIERS.includes(tierByHandle.get(t.author.toLowerCase()) || 'unknown') &&
    t.text && t.text.trim()
  );
  // Mark everything we pulled as seen so we don't reprocess next run.
  state.markSeen(st, search.tweets.map((t) => t.id));

  // Relevance gate: skip tweets that aren't about credit / cards / points. Keeps
  // the agent from forcing card replies onto broad influencers' off-topic tweets.
  const relevant = fresh.filter((t) => relevance.isRelevant(t.text));

  log(`Fetched ${search.tweets.length} tweet(s), ${fresh.length} fresh, ${relevant.length} card-relevant.`);
  if (!relevant.length) { state.save(st); log('Nothing relevant to do.'); return; }

  // 3+4. Generate + judge, collect postable candidates
  const postable = [];
  for (const t of relevant.slice(0, MAX_TWEETS_PER_RUN)) {
    const tweet = { author: t.author, tier: tierByHandle.get(t.author.toLowerCase()), text: t.text, id: t.id };
    let candidates = [];
    try {
      candidates = await generateCandidates(tweet, { dataPoint: null });
    } catch (err) {
      log(`  gen error on ${t.id}: ${err.message}`);
      continue;
    }
    for (const c of candidates.slice(0, CANDIDATES_PER_TWEET)) {
      let verdict;
      try { verdict = await judgeCandidate(tweet, c.text); }
      catch (err) { log(`  judge error: ${err.message}`); continue; }
      if (!verdict.pass) continue;
      if (rails.isRepetitive(c.text, st.recentReplyTexts)) {
        log(`  skip (too similar to a recent reply): "${c.text.slice(0, 60)}..."`);
        continue;
      }
      postable.push({ tweet: t, text: c.text, register: c.register, score: verdict.score || 0 });
    }
  }

  log(`Postable candidates this run: ${postable.length}`);
  if (!postable.length) { state.save(st); log('No postable candidate. Skipping.'); return; }

  // 5. Select the best, subject to rate rails
  postable.sort((a, b) => b.score - a.score);
  const ts = Date.now();

  let selected = null;
  let railBlock = null;
  for (const cand of postable) {
    const gate = rails.canPostNow(st, cand.tweet.author);
    if (gate.ok) { selected = cand; break; }
    railBlock = gate.reason;
  }

  if (!selected) {
    log(`All candidates blocked by rate rails (${railBlock}).`);
    // Still show the top pick for the digest/visibility.
    const top = postable[0];
    log(`  (best pick, held back) <${top.register} q:${top.score}> @${top.tweet.author}: ${top.text}`);
    state.save(st);
    return;
  }

  const url = `https://x.com/${selected.tweet.author}/status/${selected.tweet.id}`;
  log(`SELECTED <${selected.register} q:${selected.score}> reply to @${selected.tweet.author}`);
  log(`  in reply to: ${url}`);
  log(`  text: ${selected.text}`);

  if (MODE === 'live') {
    try {
      const replyId = await twitter.postReply(selected.text, selected.tweet.id);
      log(`  POSTED: https://x.com/creditodds/status/${replyId}`);
      state.recordPost(st, {
        tweetId: selected.tweet.id, replyId, author: selected.tweet.author,
        text: selected.text, register: selected.register, score: selected.score,
        mode: 'live', ts,
      });
      await slack.notifyReply({
        mode: 'live', author: selected.tweet.author, register: selected.register,
        score: selected.score, text: selected.text, tweetId: selected.tweet.id, replyId,
      });
    } catch (err) {
      log(`  POST FAILED: ${err.message}`);
      await slack.send({ text: `:warning: x-agent post FAILED replying to @${selected.tweet.author}: ${err.message}` });
    }
  } else {
    log('  SHADOW mode — not posting.');
    state.recordPost(st, {
      tweetId: selected.tweet.id, replyId: null, author: selected.tweet.author,
      text: selected.text, register: selected.register, score: selected.score,
      mode: 'shadow', ts,
    });
    await slack.notifyReply({
      mode: 'shadow', author: selected.tweet.author, register: selected.register,
      score: selected.score, text: selected.text, tweetId: selected.tweet.id,
    });
  }

  state.save(st);
  log('=== done ===');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
