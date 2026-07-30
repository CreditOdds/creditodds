// Stage one month of the cached year sweep into .reddit-dp-work/ so the normal
// --phase=finish and publish scripts work on it unchanged.
//
// Usage: NODE_PATH=<repo>/node_modules node year-batch.js --month=2025-08
//        NODE_PATH=<repo>/node_modules node year-batch.js --months   (list only)
//
// The point of batching: the routine never re-proposes a seen id, and publish
// marks every candidate in candidates.json as seen. Staging a month at a time
// means a month's worth is marked seen only once it has actually been extracted,
// so the rest of the year survives for later batches.

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const REPO = path.join(__dirname, '..', '..');
const { buildExtractPrompt } = require(path.join(REPO, 'scripts/check-reddit-datapoints.js'));

const CACHE = path.join(__dirname, 'candidate-cache.json');
const WORK = path.join(REPO, '.reddit-dp-work');
const STATE_FILE = path.join(REPO, '.github', 'reddit-datapoint-state.json');
const DP_DIR = path.join(REPO, 'data', 'reddit-datapoints');
const STATE_RETENTION_DAYS = 180;
const TODAY = new Date().toISOString().slice(0, 10);

function loadCards() {
  const dir = path.join(REPO, 'data', 'cards');
  const cards = [];
  for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
    try {
      const c = yaml.load(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (c && c.name) cards.push({ name: c.name, bank: c.bank || '', previous_names: Array.isArray(c.previous_names) ? c.previous_names : [] });
    } catch { /* skip */ }
  }
  return cards;
}

// Anything already presented to a run, or already sitting in the repo as an
// accepted data point, must not come back round.
function loadSeen() {
  const seen = new Set();
  let state = { seen: {} };
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { /* fresh */ }
  Object.keys(state.seen || {}).forEach((k) => seen.add(k));
  if (fs.existsSync(DP_DIR)) {
    for (const f of fs.readdirSync(DP_DIR).filter((x) => /\.ya?ml$/.test(x))) {
      try {
        const dp = yaml.load(fs.readFileSync(path.join(DP_DIR, f), 'utf8'));
        if (dp && dp.source_id) seen.add(String(dp.source_id).replace(/#\d+$/, ''));
      } catch { /* skip */ }
    }
  }
  return { seen, state };
}

const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const { seen, state } = loadSeen();
const unseen = cache.candidates.filter((c) => !seen.has(c.id));

const monthArg = process.argv.find((a) => a.startsWith('--month='));
const listOnly = process.argv.includes('--months');

// Month histogram, so the batching plan is visible before committing to a batch.
const byMonth = new Map();
for (const c of unseen) {
  const m = c.posted.slice(0, 7);
  byMonth.set(m, (byMonth.get(m) || 0) + 1);
}
const months = [...byMonth.keys()].sort();

if (listOnly || (!monthArg && !process.argv.includes('--all') && !process.argv.some((a) => a.startsWith('--since=')))) {
  console.log(`Cached candidates: ${cache.candidates.length}  (span ${cache.span?.oldest} .. ${cache.span?.newest})`);
  console.log(`Already seen / imported: ${cache.candidates.length - unseen.length}`);
  console.log(`Unseen and stageable: ${unseen.length}\n`);
  console.log('month     candidates');
  for (const m of months) console.log(`${m}   ${String(byMonth.get(m)).padStart(4)}`);
  console.log(`\nStage one with: --month=<YYYY-MM>`);
  process.exit(0);
}

// --month=YYYY-MM stages one month; --all stages every unseen candidate. The
// all-at-once path exists because reviewing month by month adds no value once
// the extraction is going to be done in one pass anyway (Max, 2026-07-30).
// --since=YYYY-MM-DD stages everything on or after a date, newest first. Max
// chose this over sweeping all six years (2026-07-30): 80% of candidates sit in
// 2025-2026, and the pre-2024 tail is both the least useful for current odds and
// the least representative, since the search depth cap means we only ever saw
// whichever old posts happened to remain reachable.
const sinceArg = process.argv.find((a) => a.startsWith('--since='));
const since = sinceArg ? sinceArg.split('=')[1] : null;
const month = monthArg ? monthArg.split('=')[1] : null;
let batch = month ? unseen.filter((c) => c.posted.startsWith(month)) : unseen.slice();
if (since) batch = batch.filter((c) => c.posted >= since);
// Order by likely yield, then recency. The sweep's outcome gate matches the
// word "approved" anywhere, and r/CreditCards' recommendation-request template
// contains the line "Cards approved in the past 6 months" — so ~42% of
// candidates are advice posts that can never produce a data point. They still
// carry a score and the word, so they pass the gate and cost a full read each.
// Measured 2026-07-30: 216 of 514 staged were template-only.
//
// Deliberately a sort, not a filter: an unusual phrasing might still hide a real
// outcome, so nothing is discarded, it just goes last.
const TEMPLATE_FIELD = /Cards approved in the past|personal credit cards approved for in the past/i;
// The overlap that made the first attempt useless: "approved for" also appears
// inside the template line "personal credit cards approved for in the past 6
// months", so it matched almost every advice post. Strip the template lines out
// of the text BEFORE testing for an outcome, then require a phrase that reads as
// a narrated event rather than a form field.
const TEMPLATE_LINES = /(number of )?(personal )?(credit )?cards approved for in the past[^\n*•]*/gi;
const FIRST_PERSON_OUTCOME = /\b(i (was |got |am )?(instantly |just |finally )?(approved|denied|rejected|declined)|(was|got) (instantly |just |finally )?(approved|denied|rejected|declined)|approval dp|dp:|denied (for|me)|rejected (for|from|me)|declined for|denial letter|rejection letter|got the card|approved with|approved at|approved me)\b/i;
const yieldRank = (c) => {
  const raw = `${c.title} ${c.text}`;
  const body = raw.replace(TEMPLATE_LINES, ' ');   // form fields cannot be outcomes
  if (FIRST_PERSON_OUTCOME.test(body)) return 0;   // read these first
  if (TEMPLATE_FIELD.test(raw)) return 2;         // almost certainly a form field
  return 1;
};
batch.sort((a, b) => yieldRank(a) - yieldRank(b) || b.posted.localeCompare(a.posted));
if (batch.length === 0) {
  console.error(`No unseen candidates for ${month}. Available: ${months.join(', ')}`);
  process.exit(1);
}

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(path.join(WORK, 'proposed'), { recursive: true });
// Strip the sweep-only bookkeeping field; the extraction prompt and the
// finish-phase validator both expect the routine's candidate shape.
const staged = batch.map(({ found_via, ...c }) => c);
fs.writeFileSync(path.join(WORK, 'candidates.json'), JSON.stringify(staged, null, 1));

const cutoffDate = new Date(Date.now() - STATE_RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
const nextSeen = {};
for (const [id, d] of Object.entries(state.seen || {})) if (d >= cutoffDate) nextSeen[id] = d;
// ONLY this batch. That is the whole point of batching.
for (const c of staged) nextSeen[c.id] = TODAY;
fs.writeFileSync(path.join(WORK, 'state-updated.json'), `${JSON.stringify({ seen: nextSeen }, null, 2)}\n`);

const prompt = buildExtractPrompt({ candidates: staged, cards: loadCards() });
fs.writeFileSync(path.join(WORK, 'extract-prompt.md'), prompt);

console.log(`Staged ${month || (since ? 'since ' + since : 'ALL unseen months')}: ${staged.length} candidate(s), newest first`);
console.log(`Span: ${staged[staged.length - 1].posted} .. ${staged[0].posted}`);
console.log(`Prompt: ${(prompt.length / 1024).toFixed(0)} KB`);
console.log(`Remaining unseen after this batch publishes: ${unseen.length - staged.length}`);
