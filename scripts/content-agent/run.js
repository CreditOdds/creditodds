#!/usr/bin/env node
/**
 * Content-intelligence agent — Phase 1 (shadow).
 *
 *   monitor competitors -> triage -> dedup -> fact-check -> report to Slack
 *
 * Turns notable competitor tweets into decisions about OUR own content (article /
 * tweet / skip). Phase 1 POSTS AND PUBLISHES NOTHING — it reports what it WOULD do
 * plus the fact-check, so we can judge its editorial quality before enabling
 * posting (Phase 2/3).
 *
 * Env: CONTENT_AGENT_MODE (shadow default), CONTENT_AGENT_KILL, CONTENT_AGENT_STATE_S3,
 *      OPENAI_API_KEY, BRAVE_SEARCH_API_KEY, TWITTER_* (search), SLACK_WEBHOOK_URL.
 */

const { MODE, MONITOR_HANDLES, RAILS, KILL_SWITCH, RESET } = require('./config');
const twitter = require('../x-agent/twitter');
const slack = require('../x-agent/slack');
const state = require('./state');
const { triage } = require('./triage');
const { checkDuplicate } = require('./dedup');
const { factCheck } = require('./factcheck');
const { generateNewsItem, writeNewsYaml } = require('./newsgen');
const { publishNews } = require('./publish-news');

function log(...a) { console.log(...a); }

function ageMinutes(createdAt) {
  if (!createdAt) return Infinity;
  return (Date.now() - new Date(createdAt).getTime()) / 60000;
}

async function main() {
  log(`\n=== content agent — mode=${MODE} @ ${new Date().toISOString()} ===`);
  if (KILL_SWITCH) { log('KILL SWITCH set (CONTENT_AGENT_KILL). Halting.'); return; }

  const st = RESET ? JSON.parse(JSON.stringify(state.EMPTY)) : state.load();
  if (RESET) log('CONTENT_AGENT_RESET set — fresh scan.');
  state.rolloverDay(st);

  let search;
  try {
    search = await twitter.searchRecent(MONITOR_HANDLES, { sinceId: st.lastSearchId, maxResults: 40 });
  } catch (err) {
    log(`Search failed: ${err.message}`);
    return;
  }
  if (search.newestId) st.lastSearchId = search.newestId;

  const seen = new Set(st.seenTweetIds);
  const fresh = search.tweets.filter(
    (t) => !seen.has(t.id) && ageMinutes(t.createdAt) <= RAILS.maxTweetAgeMinutes && t.text && t.text.trim()
  );
  state.markSeen(st, search.tweets.map((t) => t.id));

  log(`Fetched ${search.tweets.length}, ${fresh.length} fresh to triage.`);
  if (!fresh.length) { state.save(st); log('Nothing new.'); return; }

  const actionable = [];
  for (const t of fresh.slice(0, RAILS.maxTweetsPerRun)) {
    let tri;
    try { tri = await triage(t); } catch (err) { log(`  triage error: ${err.message}`); continue; }

    if (tri.decision === 'skip') {
      state.recordDecision(st, { tweetId: t.id, author: t.author, decision: 'skip', topic: tri.topic, reason: tri.reason, ts: Date.now() });
      continue;
    }

    // Dedup against existing coverage.
    let dup = { duplicate: false, matched: null };
    try { dup = await checkDuplicate(tri.topic, tri.claim, st.coveredTopics); } catch (err) { log(`  dedup error: ${err.message}`); }
    if (dup.duplicate) {
      log(`  skip (already covered: "${dup.matched}"): ${tri.topic}`);
      state.recordDecision(st, { tweetId: t.id, author: t.author, decision: 'skip-dup', topic: tri.topic, matched: dup.matched, ts: Date.now() });
      continue;
    }

    // Fact-check before it would ever go out.
    let fc;
    try { fc = await factCheck(tri.topic, tri.claim); } catch (err) { log(`  factcheck error: ${err.message}`); continue; }

    const item = { tweet: t, ...tri, factcheck: fc };
    actionable.push(item);
    state.recordDecision(st, {
      tweetId: t.id, author: t.author, decision: tri.decision, topic: tri.topic,
      verdict: fc.verdict, confidence: fc.confidence, primary: fc.primarySource, ts: Date.now(),
    });
  }

  log(`Actionable (post-dedup): ${actionable.length}`);

  // Act on each candidate. Tweets auto-post in live mode (Phase 2); articles
  // remain report-only until Phase 3.
  for (const it of actionable) {
    const fc = it.factcheck;
    const gate = it.decision === 'article'
      ? (fc.confidence >= RAILS.minArticleConfidence && (!RAILS.requirePrimarySourceForArticle || fc.primarySource))
      : (fc.confidence >= RAILS.minTweetConfidence);
    const passes = gate && ['verified', 'partly'].includes(fc.verdict);

    // News path: medium-size items become a published news page (build-news.yml
    // then handles site publish, hero image, and the social post that links to
    // it). This replaced the old naked-tweet path — a tweet with no destination
    // captures no traffic.
    let newsDraft = null;
    let action = 'reported';
    if (passes && it.decision === 'tweet') {
      try {
        newsDraft = await generateNewsItem(it, state.todayET());
      } catch (err) {
        log(`  newsgen error: ${err.message}`);
      }
    }

    if (MODE === 'live' && passes && it.decision === 'tweet' && newsDraft && newsDraft.body) {
      if (st.day.tweets >= RAILS.maxTweetsPerDay) {
        action = 'held (daily news cap)';
      } else {
        try {
          const { filename, filepath } = writeNewsYaml(newsDraft);
          const { prUrl } = await publishNews({
            filepath, filename, title: newsDraft.title,
            sourceUrl: newsDraft.source_url, factcheck: fc,
          });
          st.day.tweets += 1;
          action = `PUBLISHED NEWS (${prUrl})`;
        } catch (err) {
          action = `publish failed: ${err.message}`;
          log(`  ${action}`);
        }
      }
    }

    const srcLines = fc.sources.slice(0, 3).map((s) => `   • ${s.primary ? '(primary) ' : ''}<${s.url}|${s.title}>`).join('\n');
    const label = it.decision === 'tweet' ? 'NEWS' : it.decision.toUpperCase();
    const tag = MODE === 'live' ? (action.startsWith('PUBLISHED') ? ':rotating_light: LIVE' : 'LIVE') : 'SHADOW';
    const lines = [
      `*:mag: [${tag}] ${label}* — ${passes ? ':white_check_mark: passes gate' : ':no_entry: held (gate not met)'}${action !== 'reported' ? ` · *${action}*` : ''}`,
      `topic: *${it.topic}* (from <https://x.com/${it.tweet.author}/status/${it.tweet.id}|@${it.tweet.author}>)`,
      `claim: ${it.claim}`,
      `fact-check: *${fc.verdict}* · confidence ${fc.confidence.toFixed(2)} · primary source: ${fc.primarySource ? 'yes' : 'no'}`,
      fc.notes ? `notes: ${fc.notes}` : '',
      newsDraft ? `news draft: *${newsDraft.title}* — ${newsDraft.summary}` : '',
      srcLines ? `sources:\n${srcLines}` : '   (no corroborating sources found)',
    ].filter(Boolean);
    await slack.send({ text: lines.join('\n') });
    log(`  [${it.decision}] ${passes ? 'PASS' : 'held'} (${action}) — ${it.topic} (${fc.verdict}/${fc.confidence.toFixed(2)})`);
  }

  if (actionable.length) {
    await slack.send({ text: `:memo: content agent (${MODE}): ${actionable.length} candidate(s) this run — ${actionable.filter((i) => i.decision === 'article').length} article, ${actionable.filter((i) => i.decision === 'tweet').length} news. News today: ${st.day.tweets}/${RAILS.maxTweetsPerDay}.` });
  }

  state.save(st);
  log('=== done ===');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
