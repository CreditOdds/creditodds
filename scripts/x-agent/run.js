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

  // Reply-settings gate: X rejects (403) replies to conversations the author has
  // locked to followers/mentions. Only 'everyone' tweets are actually repliable.
  const openReplies = fresh.filter((t) => t.replySettings === 'everyone');

  // Relevance gate: skip tweets that aren't about credit / cards / points. Keeps
  // the agent from forcing card replies onto broad influencers' off-topic tweets.
  const relevant = openReplies.filter((t) => relevance.isRelevant(t.text));

  log(`Fetched ${search.tweets.length} tweet(s), ${fresh.length} fresh, ${openReplies.length} open-reply, ${relevant.length} card-relevant.`);
  if (!relevant.length) { state.save(st); log('Nothing relevant & repliable to do.'); return; }

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

  // 5. Order candidates by score and drop any blocked by the rate rails.
  postable.sort((a, b) => b.score - a.score);
  const ts = Date.now();

  const eligible = postable.filter((c) => rails.canPostNow(st, c.tweet.author).ok);
  if (!eligible.length) {
    const reason = rails.canPostNow(st, postable[0].tweet.author).reason;
    log(`All candidates blocked by rate rails (${reason}).`);
    const top = postable[0];
    log(`  (best pick, held back) <${top.register} q:${top.score}> @${top.tweet.author}: ${top.text}`);
    state.save(st);
    return;
  }

  // Shadow: just record the top candidate, don't post.
  if (MODE !== 'live') {
    const sel = eligible[0];
    log(`SELECTED <${sel.register} q:${sel.score}> reply to @${sel.tweet.author}`);
    log(`  in reply to: https://x.com/${sel.tweet.author}/status/${sel.tweet.id}`);
    log(`  text: ${sel.text}`);
    log('  SHADOW mode — not posting.');
    state.recordPost(st, {
      tweetId: sel.tweet.id, replyId: null, author: sel.tweet.author,
      text: sel.text, register: sel.register, score: sel.score, mode: 'shadow', ts,
    });
    await slack.notifyReply({
      mode: 'shadow', author: sel.tweet.author, register: sel.register,
      score: sel.score, text: sel.text, tweetId: sel.tweet.id,
    });
    state.save(st);
    log('=== done ===');
    return;
  }

  // Live: try candidates in score order until one posts. If the author has locked
  // the conversation (reply-restriction 403), skip it and try the next.
  const LOCKED_RE = /Reply to this conversation is not allowed|have not been mentioned/i;
  let posted = false;
  let locked = 0;
  for (const sel of eligible) {
    log(`Trying <${sel.register} q:${sel.score}> reply to @${sel.tweet.author}: ${sel.text}`);
    try {
      const replyId = await twitter.postReply(sel.text, sel.tweet.id);
      log(`  POSTED: https://x.com/creditodds/status/${replyId}`);
      state.recordPost(st, {
        tweetId: sel.tweet.id, replyId, author: sel.tweet.author,
        text: sel.text, register: sel.register, score: sel.score, mode: 'live', ts,
      });
      await slack.notifyReply({
        mode: 'live', author: sel.tweet.author, register: sel.register,
        score: sel.score, text: sel.text, tweetId: sel.tweet.id, replyId,
      });
      posted = true;
      break;
    } catch (err) {
      if (LOCKED_RE.test(err.message)) {
        log(`  skip (conversation locked): @${sel.tweet.author}`);
        locked += 1;
        continue;
      }
      log(`  POST FAILED: ${err.message}`);
      await slack.send({ text: `:warning: x-agent post FAILED replying to @${sel.tweet.author}: ${err.message}` });
      break;
    }
  }
  if (!posted) {
    log(`No reply posted this run (${locked}/${eligible.length} candidates had locked conversations).`);
  }

  state.save(st);
  log('=== done ===');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
