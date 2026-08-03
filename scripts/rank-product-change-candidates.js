#!/usr/bin/env node
/**
 * Rank swept candidates by how likely they are to contain a COMPLETED,
 * first-person product change.
 *
 * The sweep's recall filter is deliberately loose, so most of what it collects
 * is people ASKING about product changes rather than reporting one they made.
 * Reading all of it costs far more than it returns, and the same lesson already
 * bit the data-points routine: rank on a first-person completed-action phrase
 * before spending attention on a post.
 *
 *   node scripts/rank-product-change-candidates.js [--min=3] [--json]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATE_PATH = path.join(ROOT, '.reddit-pc-work', 'sweep-state.json');

// Past-tense, first-person, the change already happened.
const COMPLETED_RE = [
  /\bI\s+(?:just\s+|recently\s+|finally\s+)?(?:PC'?d|product[- ]?changed|downgraded|upgraded|converted|switched)\b/i,
  /\b(?:PC'?d|product[- ]?changed|downgraded|upgraded|converted)\s+my\b/i,
  /\bmy\s+\w[\w\s]{0,30}?\s+(?:was|got)\s+(?:product[- ]?changed|converted|downgraded|upgraded)\b/i,
  /\b(?:they|citi|chase|amex|barclays|discover)\s+(?:product[- ]?changed|converted|downgraded)\s+my\b/i,
];

// Still hypothetical: the post is a question, not a report.
const HYPOTHETICAL_RE = [
  /\b(?:should|can|could|would)\s+I\s+(?:PC|product[- ]?change|downgrade|upgrade|convert)/i,
  /\bthinking\s+(?:about|of)\s+(?:PC|product[- ]?chang|downgrad|upgrad|convert)/i,
  /\bwhat\s+(?:should|would|can)\s+I\s+(?:PC|downgrade|upgrade|convert)/i,
  /\b(?:is it|are they)\s+possible\s+to\s+(?:PC|product[- ]?change)/i,
  /\bplanning\s+(?:to|on)\s+(?:PC|downgrad|upgrad|convert)/i,
];

// An explicit A -> B pairing is the single best predictor that both endpoints
// of the edge are actually stated.
const DIRECTION_RE = [
  /\b(?:from|PC'?d|changed|downgraded|upgraded|converted)\b[^.!?]{0,60}\bto\b/i,
  /->|→|-->/,
];

function score(c) {
  const text = `${c.title} ${c.text}`;
  let s = 0;
  const hits = [];
  for (const re of COMPLETED_RE) if (re.test(text)) { s += 3; hits.push('completed'); break; }
  for (const re of DIRECTION_RE) if (re.test(text)) { s += 2; hits.push('direction'); break; }
  for (const re of HYPOTHETICAL_RE) if (re.test(text)) { s -= 3; hits.push('hypothetical'); break; }
  // A title that is a question is usually asking for advice, not reporting.
  if (/\?$/.test((c.title || '').trim())) { s -= 1; hits.push('question-title'); }
  if ((c.matchedCards || []).length >= 2) { s += 1; hits.push('multi-card'); }
  return { score: s, hits };
}

const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
const scored = Object.values(state.candidates)
  .map((c) => ({ ...c, ...score(c) }))
  .sort((a, b) => b.score - a.score || (b.posted || '').localeCompare(a.posted || ''));

const min = Number((process.argv.find((a) => a.startsWith('--min=')) || '--min=3').slice(6));

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(scored.filter((c) => c.score >= min), null, 1));
} else {
  const buckets = {};
  for (const c of scored) buckets[c.score] = (buckets[c.score] || 0) + 1;
  console.log('score distribution (higher = more likely a real completed change):');
  for (const k of Object.keys(buckets).map(Number).sort((a, b) => b - a)) {
    console.log(`  ${String(k).padStart(3)}: ${buckets[k]}`);
  }
  const keep = scored.filter((c) => c.score >= min);
  console.log(`\n>= ${min}: ${keep.length} of ${scored.length} candidates`);
  const yrs = {};
  keep.forEach((c) => { const y = (c.posted || '').slice(0, 4); yrs[y] = (yrs[y] || 0) + 1; });
  console.log('by year:', JSON.stringify(yrs));
  console.log('chars to read:', keep.reduce((a, c) => a + (c.text || '').length, 0).toLocaleString());
}
