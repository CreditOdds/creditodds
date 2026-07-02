#!/usr/bin/env node
/**
 * Targeted test post. Given a tweet URL or id (TWEET env), generates an on-brand
 * reply with the real generator + judge and posts it. Proves the automation can
 * actually post to a conversation we know is open — isolating the reply-lock
 * issue from any real posting problem.
 *
 * Usage (in the workflow): TWEET=<url|id> node scripts/x-agent/testpost.js
 */

const twitter = require('./twitter');
const { generateCandidates } = require('./generate');
const { judgeCandidate } = require('./judge');

function parseId(input) {
  if (!input) return null;
  const m = String(input).match(/status\/(\d+)/) || String(input).match(/(\d{6,})/);
  return m ? m[1] : null;
}

async function main() {
  const id = parseId(process.env.TWEET);
  if (!id) {
    console.error('Set TWEET to a tweet URL or id.');
    process.exit(1);
  }

  const t = await twitter.getTweet(id);
  console.log(`Target: @${t.author} (reply_settings=${t.replySettings})`);
  console.log(`  "${t.text}"\n`);

  const tweet = { author: t.author, tier: 'competitor', text: t.text, id: t.id };
  const candidates = await generateCandidates(tweet, { dataPoint: null });

  for (const c of candidates) {
    const verdict = await judgeCandidate(tweet, c.text);
    if (!verdict.pass) {
      console.log(`  killed (${verdict.stage}): ${c.text}`);
      continue;
    }
    console.log(`Posting <${c.register} q:${verdict.score}>: ${c.text}`);
    const replyId = await twitter.postReply(c.text, t.id);
    console.log(`\nPOSTED ✅ https://x.com/creditodds/status/${replyId}`);
    return;
  }
  console.log('No candidate passed the judge.');
}

main().catch((err) => {
  console.error('testpost failed:', err.message);
  process.exit(1);
});
