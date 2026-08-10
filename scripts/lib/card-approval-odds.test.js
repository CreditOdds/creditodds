// Tests for the "<card> approval odds?" Reddit post builder.
//
// Why this exists: this routine publishes approval statistics as fact. The two
// ways it can embarrass us are picking a card that should not be posted (closed,
// too thin, already covered) and printing a median that misrepresents its
// sample. Both are pure functions, so both are pinned here.
//
// Run: `node scripts/lib/card-approval-odds.test.js`. Exits non-zero on failure.

const assert = require('node:assert/strict');

const {
  median,
  summarize,
  computeStats,
  selectCard,
  buildPostText,
  describeDeniedScore,
  samplingCaveat,
  cardPageUrl,
} = require('./card-approval-odds');

/** Build a stats object with just the two score medians the describer reads. */
const scores = (approvedMedian, deniedMedian, n = 10) => ({
  approvedScore: { median: approvedMedian, n },
  deniedScore: { median: deniedMedian, n },
});

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}\n       ${err.message}`);
  }
}

console.log('median / summarize');

test('median of an odd-length set is the middle value', () => {
  assert.equal(median([700, 750, 800]), 750);
});

test('median of an even-length set averages the two middles', () => {
  assert.equal(median([700, 750, 800, 850]), 775);
});

test('median is order-independent', () => {
  assert.equal(median([800, 700, 750]), 750);
});

test('median of an empty set is null, not 0', () => {
  // 0 would render as "Median FICO: 0" instead of omitting the row.
  assert.equal(median([]), null);
});

test('summarize ignores missing and non-positive values and reports its own n', () => {
  const records = [
    { listed_income: 50000 },
    { listed_income: null },
    { listed_income: 0 },
    { listed_income: 70000 },
    {},
  ];
  assert.deepEqual(summarize(records, 'listed_income'), { median: 60000, n: 2 });
});

console.log('computeStats');

const sample = [
  { result: 1, credit_score: 780, listed_income: 90000, starting_credit_limit: 8000 },
  { result: 1, credit_score: 740, listed_income: null, starting_credit_limit: 6000 },
  { result: 1, credit_score: 760, listed_income: 70000, starting_credit_limit: null },
  { result: 0, credit_score: 660, listed_income: 40000, starting_credit_limit: null },
  { result: 0, credit_score: 700, listed_income: null, starting_credit_limit: null },
];

test('counts and approval rate use decided records only', () => {
  const s = computeStats(sample);
  assert.equal(s.approvedCount, 3);
  assert.equal(s.deniedCount, 2);
  assert.equal(s.counted, 5);
  assert.equal(s.approvalRate, 0.6);
});

test('denied-side medians are computed, not taken from approved stats', () => {
  const s = computeStats(sample);
  assert.equal(s.approvedScore.median, 760);
  assert.equal(s.deniedScore.median, 680);
});

test('each stat carries the n of the records that reported that field', () => {
  const s = computeStats(sample);
  assert.equal(s.approvedScore.n, 3);
  assert.equal(s.approvedIncome.n, 2); // one approved record has no income
  assert.equal(s.approvedLimit.n, 2); // one approved record has no limit
});

test('an unexpected result value is excluded from the rate rather than counted as denied', () => {
  // Guards against a future "pending" status silently deflating the percentage.
  const withPending = [...sample, { result: 2, credit_score: 720 }];
  const s = computeStats(withPending);
  assert.equal(s.counted, 5);
  assert.equal(s.approvalRate, 0.6);
  assert.equal(s.total, 6);
});

console.log('selectCard');

const cards = [
  { slug: 'big-closed', card_name: 'Big Closed', total_records: 40, accepting_applications: false },
  { slug: 'top', card_name: 'Top Card', total_records: 30, accepting_applications: true },
  { slug: 'mid', card_name: 'Mid Card', total_records: 20, accepting_applications: true },
  { slug: 'thin', card_name: 'Thin Card', total_records: 4, accepting_applications: true },
];

test('picks the highest record count among eligible cards', () => {
  assert.equal(selectCard(cards, new Set()).slug, 'top');
});

test('skips cards that are closed to applications', () => {
  // Big Closed has the most records but cannot be applied for.
  assert.notEqual(selectCard(cards, new Set()).slug, 'big-closed');
});

test('skips cards below the record floor', () => {
  const picked = selectCard(cards, new Set(['top', 'mid']), { minRecords: 10 });
  assert.equal(picked, null, 'Thin Card is under the floor and must not be picked');
});

test('never repeats a card that has already been posted', () => {
  assert.equal(selectCard(cards, new Set(['top'])).slug, 'mid');
});

test('returns null when the rotation is exhausted rather than looping', () => {
  assert.equal(selectCard(cards, new Set(['top', 'mid'])), null);
});

test('ties break by name so a rerun is deterministic', () => {
  const tied = [
    { slug: 'b', card_name: 'B Card', total_records: 15, accepting_applications: true },
    { slug: 'a', card_name: 'A Card', total_records: 15, accepting_applications: true },
  ];
  assert.equal(selectCard(tied, new Set()).slug, 'a');
  assert.equal(selectCard([...tied].reverse(), new Set()).slug, 'a');
});

test('a card with an undefined accepting_applications is still eligible', () => {
  // The field is merged from the DB and can be absent; absence must not
  // silently drop a card that is in fact open.
  const unknown = [{ slug: 'u', card_name: 'U', total_records: 12 }];
  assert.equal(selectCard(unknown, new Set()).slug, 'u');
});

console.log('buildPostText');

const card = { slug: 'citi-double-cash', card_name: 'Citi Double Cash' };
const text = buildPostText(card, computeStats(sample), 'https://creditodds.com/card/citi-double-cash?utm_source=reddit');

test('first line is the title in the requested format', () => {
  assert.equal(text.split('\n')[0], 'Citi Double Cash approval odds?');
});

test('body states the approval rate and both counts', () => {
  assert.match(text, /Approval rate: 60% \(3 approved, 2 denied\)/);
});

test('body shows the approved profile and describes the denied side in prose', () => {
  assert.match(text, /Approved:/);
  assert.match(text, /Denied applicants reported a median FICO/);
});

console.log('describeDeniedScore');

test('a real gap is stated plainly as points below approved', () => {
  const s = describeDeniedScore(scores(760, 700));
  assert.match(s, /median FICO of 700/);
  assert.match(s, /60 points below/);
});

test('an inverted gap is called out rather than printed as-is', () => {
  // The Citi Strata Premier case: denied 815 vs approved 759. Left bare this
  // reads as broken data, which is the failure this framing exists to prevent.
  const s = describeDeniedScore(scores(759, 815));
  assert.match(s, /56 points higher/);
  assert.match(s, /velocity|thin file|issuer rules/);
  assert.ok(!/points below/.test(s));
});

test('a gap inside the noise band is described as effectively the same', () => {
  const s = describeDeniedScore(scores(751, 750));
  assert.match(s, /effectively the same/);
  assert.ok(!/points below/.test(s), 'a 1-point gap must not be reported as a real difference');
});

test('the noise band is applied symmetrically', () => {
  assert.match(describeDeniedScore(scores(760, 746)), /effectively the same/);
  assert.match(describeDeniedScore(scores(746, 760)), /effectively the same/);
  assert.match(describeDeniedScore(scores(760, 745)), /points below/);
  assert.match(describeDeniedScore(scores(745, 760)), /points higher/);
});

test('no denied scores means no denied sentence at all', () => {
  assert.equal(describeDeniedScore(scores(750, null)), null);
  assert.equal(describeDeniedScore(scores(null, 750)), null);
});

test('body links the card page and repeats the URL for the CTA', () => {
  assert.match(text, /\[Citi Double Cash\]\(https:\/\/creditodds\.com\/card\/citi-double-cash\?utm_source=reddit\)/);
  assert.match(text, /card page: https:\/\/creditodds\.com\/card\/citi-double-cash/);
});

test('body asks for data points in the comments', () => {
  assert.match(text, /drop your data point in the comments/);
});

test('copy contains no em dashes', () => {
  assert.ok(!text.includes('—'), 'em dash found in user-facing copy');
});

test('rows omit themselves rather than printing a null median', () => {
  const noIncome = [
    { result: 1, credit_score: 780 },
    { result: 0, credit_score: 660 },
  ];
  const t = buildPostText(card, computeStats(noIncome), 'https://example.com');
  assert.ok(!t.includes('Median income'), 'income row should be absent when nothing reported it');
  assert.match(t, /Median FICO/);
});

test('sampling caveat scales down as the sample shrinks', () => {
  assert.match(samplingCaveat(12), /directional only, not a prediction/);
  assert.match(samplingCaveat(30), /treat this as directional/);
  assert.match(samplingCaveat(60), /self-reported sample/);
});

console.log('cardPageUrl');

test('card link carries reddit UTM attribution', () => {
  const url = new URL(cardPageUrl('citi-double-cash', 'card-approval-odds-reddit'));
  assert.equal(url.pathname, '/card/citi-double-cash');
  assert.equal(url.searchParams.get('utm_source'), 'reddit');
  assert.equal(url.searchParams.get('utm_campaign'), 'card-approval-odds-reddit');
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll tests passed.');
