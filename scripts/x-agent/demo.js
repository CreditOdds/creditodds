#!/usr/bin/env node
/**
 * Local voice demo. Runs the REAL generator + double-judge against sample
 * tweets, using only OPENAI_API_KEY (no X credentials needed). Prints, for
 * each tweet, every candidate and whether it passed the gate.
 *
 * This is how we validate the voice before wiring anything live.
 *
 * Usage: node scripts/x-agent/demo.js
 */

const fs = require('fs');
const path = require('path');
const { generateCandidates } = require('./generate');
const { judgeCandidate } = require('./judge');

const SAMPLES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'samples', 'tweets.json'), 'utf8')
);

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set. Load it from .env first.');
    process.exit(1);
  }

  console.log('\n=== CreditOdds X Reply Agent — VOICE DEMO (no posting) ===\n');

  for (const tweet of SAMPLES) {
    console.log('─'.repeat(78));
    console.log(`TWEET @${tweet.author} [${tweet.tier}]`);
    console.log(`  "${tweet.text}"`);
    if (tweet.id.includes('should-be-blocked')) {
      console.log('  (this one is expected to be BLOCKED by the safety gate)');
    }
    console.log('');

    let candidates;
    try {
      candidates = await generateCandidates(tweet, { dataPoint: tweet.dataPoint });
    } catch (err) {
      console.log(`  generation error: ${err.message}\n`);
      continue;
    }

    let anyPassed = false;
    for (const c of candidates) {
      let verdict;
      try {
        verdict = await judgeCandidate(tweet, c.text);
      } catch (err) {
        console.log(`  [judge error] ${err.message}`);
        continue;
      }
      const mark = verdict.pass ? 'PASS ✅' : `KILL ❌ (${verdict.stage})`;
      const score = verdict.score != null ? ` [q:${verdict.score}]` : '';
      console.log(`  ${mark}${score}  <${c.register}>`);
      console.log(`     ${c.text}`);
      if (!verdict.pass) console.log(`     reason: ${verdict.detail}`);
      console.log('');
      if (verdict.pass) anyPassed = true;
    }
    if (!anyPassed) {
      console.log('  >> nothing postable for this tweet (agent would skip it)\n');
    }
  }

  console.log('─'.repeat(78));
  console.log('Demo complete. Nothing was posted.\n');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
