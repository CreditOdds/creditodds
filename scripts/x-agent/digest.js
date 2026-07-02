#!/usr/bin/env node
/**
 * Daily digest for the reply agent. Summarizes what the agent posted (or, in
 * shadow mode, what it WOULD have posted) in the last 24h, with engagement
 * metrics for anything actually live. Prints to the Actions log.
 *
 * Usage: node scripts/x-agent/digest.js
 */

const state = require('./state');
const twitter = require('./twitter');
const slack = require('./slack');

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const st = state.load();
  const cutoff = Date.now() - DAY_MS;
  const recent = (st.posted || []).filter((p) => p.ts && p.ts >= cutoff);

  console.log('\n===== X REPLY AGENT — DAILY DIGEST =====');
  console.log(`Window: last 24h  |  entries: ${recent.length}`);
  console.log(`Daily live count: ${st.day?.count || 0}  |  seen tweets tracked: ${st.seenTweetIds?.length || 0}`);

  const live = recent.filter((p) => p.mode === 'live' && p.replyId);
  const shadow = recent.filter((p) => p.mode === 'shadow');

  // Fetch engagement for live replies (best effort).
  let metrics = {};
  if (live.length) {
    try { metrics = await twitter.getMetrics(live.map((p) => p.replyId)); }
    catch (err) { console.log(`(metrics fetch failed: ${err.message})`); }
  }

  if (live.length) {
    console.log(`\n--- LIVE (${live.length}) ---`);
    for (const p of live) {
      const m = metrics[p.replyId] || {};
      const eng = `♥${m.like_count ?? '?'} ↻${m.retweet_count ?? '?'} 💬${m.reply_count ?? '?'} 👁${m.impression_count ?? '?'}`;
      console.log(`\n@${p.author} [${p.register} q:${p.score}]  ${eng}`);
      console.log(`  ${p.text}`);
      console.log(`  https://x.com/creditodds/status/${p.replyId}`);
    }
  }

  if (shadow.length) {
    console.log(`\n--- SHADOW / would-have-posted (${shadow.length}) ---`);
    for (const p of shadow) {
      console.log(`\n@${p.author} [${p.register} q:${p.score}]`);
      console.log(`  ${p.text}`);
      console.log(`  re: https://x.com/${p.author}/status/${p.tweetId}`);
    }
  }

  if (!recent.length) console.log('\n(nothing in the last 24h)');
  console.log('\n===== END DIGEST =====\n');

  // Mirror a compact summary to Slack.
  const slackLines = [
    `*:bar_chart: X reply agent — daily digest*`,
    `last 24h: *${live.length}* live · *${shadow.length}* shadow · daily live count ${st.day?.count || 0}`,
  ];
  for (const p of live) {
    const m = metrics[p.replyId] || {};
    slackLines.push(`• :rotating_light: <https://x.com/creditodds/status/${p.replyId}|@${p.author}> ♥${m.like_count ?? '?'} ↻${m.retweet_count ?? '?'} 👁${m.impression_count ?? '?'} — ${p.text}`);
  }
  for (const p of shadow) {
    slackLines.push(`• :eyes: re @${p.author} [q${p.score}] — ${p.text}`);
  }
  if (!recent.length) slackLines.push('_(nothing in the last 24h)_');
  await slack.send({ text: slackLines.join('\n') });
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
