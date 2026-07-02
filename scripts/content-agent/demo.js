#!/usr/bin/env node
/**
 * Local demo of the content-agent brain: runs triage -> dedup -> fact-check on
 * sample competitor tweets using OPENAI_API_KEY + BRAVE_SEARCH_API_KEY (no Twitter
 * or Slack needed). Prints the editorial decision and the fact-check for each.
 *
 * Usage: node scripts/content-agent/demo.js
 */

const { triage } = require('./triage');
const { checkDuplicate } = require('./dedup');
const { factCheck } = require('./factcheck');
const { RAILS } = require('./config');

const SAMPLES = [
  { author: 'thepointsguy', text: 'The Chase Sapphire Preferred sign-up bonus just jumped to 100,000 points — the highest offer we have ever seen on this card.' },
  { author: 'dannydealguru', text: 'Targeted: some Amex cardholders are seeing a $50 statement credit for spending $200 at grocery stores this month. Check your offers tab.' },
  { author: 'nerdwallet', text: 'Capital One has agreed to a $190 million settlement over its 360 savings account interest rates. Here is how to check if you are owed money.' },
  { author: 'someguy', text: 'Use my referral link to grab the Capital One Venture X and we BOTH cash in on the bonus!! link in bio 🔥🔥' },
  { author: 'onemileatatime', text: 'A refresher on how the Amex once-per-lifetime welcome bonus rule works and which card families share eligibility.' },
  { author: 'garyleff', text: 'United just quietly devalued MileagePlus award pricing on several partner routes, with some business class awards up 30%.' },
];

async function main() {
  if (!process.env.OPENAI_API_KEY || !process.env.BRAVE_SEARCH_API_KEY) {
    console.error('Need OPENAI_API_KEY and BRAVE_SEARCH_API_KEY.');
    process.exit(1);
  }
  console.log('\n=== CONTENT AGENT — BRAIN DEMO (no posting) ===\n');

  for (const t of SAMPLES) {
    console.log('─'.repeat(78));
    console.log(`@${t.author}: "${t.text}"`);
    const tri = await triage(t);
    console.log(`  triage: ${tri.decision.toUpperCase()}  topic="${tri.topic}"`);
    if (tri.reason) console.log(`    reason: ${tri.reason}`);
    if (tri.decision === 'skip') { console.log(''); continue; }

    const dup = await checkDuplicate(tri.topic, tri.claim, []);
    if (dup.duplicate) { console.log(`  dedup: ALREADY COVERED -> "${dup.matched}" (skip)\n`); continue; }
    console.log('  dedup: new topic');

    const fc = await factCheck(tri.topic, tri.claim);
    const gate = tri.decision === 'article'
      ? (fc.confidence >= RAILS.minArticleConfidence && (!RAILS.requirePrimarySourceForArticle || fc.primarySource))
      : (fc.confidence >= RAILS.minTweetConfidence);
    const wouldAct = gate && ['verified', 'partly'].includes(fc.verdict);
    console.log(`  fact-check: ${fc.verdict} · conf ${fc.confidence.toFixed(2)} · primary:${fc.primarySource ? 'yes' : 'no'}`);
    if (fc.notes) console.log(`    notes: ${fc.notes}`);
    for (const s of fc.sources.slice(0, 3)) console.log(`    ${s.primary ? '(primary) ' : ''}${s.url}`);
    console.log(`  >> would ${wouldAct ? `*** ${tri.decision.toUpperCase()} ***` : 'HOLD (gate not met)'}\n`);
  }
  console.log('─'.repeat(78) + '\nDemo complete. Nothing posted.\n');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
