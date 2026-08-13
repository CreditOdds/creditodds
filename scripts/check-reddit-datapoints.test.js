// Tests for the OP-reply expansion in check-reddit-datapoints.js.
//
// Why this exists: r/CreditCards posters routinely put the credit score, or the
// outcome itself, in a reply to their own post rather than in the body. The
// extraction session cannot go get those — WebFetch is blocked for reddit.com —
// so the fetch phase has to hand them over, and it has to hand over the OP's
// replies only. A bug that let another commenter's numbers through would look
// exactly like a valid data point and would silently poison the odds data.
//
// Run: `node scripts/check-reddit-datapoints.test.js`. Exits non-zero on failure.

const assert = require('node:assert/strict');

const {
  parseAtom,
  hasPlausibleScore,
  rankForExpansion,
  fetchOpReplies,
  expandOpReplies,
  buildExtractPrompt,
  buildPrBody,
  validateDataPoint,
  looksLikeSameApplication,
  createReplyBudget,
  revisitPending,
  pendingExpiry,
  rankPending,
  validatePendingEntry,
  mergePending,
  buildFollowups,
  fetchNewPosts,
  loadSkipped,
  reconcileDispositions,
  buildDispositionSection,
  appendRun,
  SKIP_REASONS,
  RUN_LOG_LIMIT,
  NEW_FEED_PAGES,
  CAPS,
  PENDING_MAX_ATTEMPTS,
  PENDING_MAX_DAYS,
} = require('./check-reddit-datapoints.js');

// Shrink the real waits (8s between requests, 61s on a 429) so the loop tests
// run in milliseconds instead of minutes.
CAPS.requestSpacingMs = 1;
CAPS.rateLimitBackoffMs = 1;

// Queue every case, then run them in order — several stub global.fetch, so they
// must not overlap.
let failures = 0;
const queue = [];
const test = (name, fn) => queue.push({ name, fn });
const testAsync = test;

async function run() {
  for (const { name, fn } of queue) {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (err) {
      failures++;
      console.error(`✗ ${name}\n  ${err.message}`);
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} test(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
}

// Shaped after a real r/CreditCards permalink feed: entry 0 is the post itself
// (which is how we learn who OP is), the rest are comments in mixed authorship.
function entry({ id, author, title, content, updated = '2026-07-28' }) {
  return `<entry><author><name>/u/${author}</name><uri>https://www.reddit.com/user/${author}</uri></author>` +
    `<id>t3_x:${id}</id><id>${id}</id>` +
    `<link href="https://www.reddit.com/r/CreditCards/comments/abc123/x/"/>` +
    `<updated>${updated}T12:00:00+00:00</updated>` +
    `<title>${title}</title>` +
    `<content type="html">&lt;div&gt;${content}&lt;/div&gt;</content></entry>`;
}

const COMMENT_FEED = `<?xml version="1.0"?><feed>${[
  entry({ id: 't3_abc123', author: 'OrigPoster', title: 'Denied for CSP', content: 'I applied and got denied. Details in comments.' }),
  entry({ id: 't1_c1', author: 'HelpfulStranger', title: '/u/HelpfulStranger on Denied for CSP', content: 'My score was 810 and I got approved instantly with a 25k limit.' }),
  entry({ id: 't1_c2', author: 'OrigPoster', title: '/u/OrigPoster on Denied for CSP', content: 'Forgot to add: my FICO is 704 Experian and income is $61,000.' }),
  entry({ id: 't1_c3', author: 'OrigPoster', title: '/u/OrigPoster on Denied for CSP', content: 'ty!' }),
  entry({ id: 't1_c4', author: 'OrigPoster', title: '/u/OrigPoster on Denied for CSP', content: '[deleted]' }),
].join('')}</feed>`;

test('parseAtom pulls the author name and strips the /u/ prefix', () => {
  const entries = parseAtom(COMMENT_FEED);
  assert.equal(entries.length, 5);
  assert.equal(entries[0].author, 'OrigPoster');
  assert.equal(entries[1].author, 'HelpfulStranger');
});

testAsync('fetchOpReplies returns only the OP\'s substantive replies', async () => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => COMMENT_FEED });
  try {
    const replies = await fetchOpReplies({
      id: 't3_abc123',
      url: 'https://www.reddit.com/r/CreditCards/comments/abc123/x/',
    });
    // The stranger's "810 approved, 25k limit" is the dangerous one: it reads
    // like a perfect data point but belongs to someone else's application.
    assert.equal(replies.length, 1, `expected 1 OP reply, got ${replies.length}: ${JSON.stringify(replies)}`);
    assert.match(replies[0], /704 Experian/);
    assert.ok(!replies.some((r) => /810/.test(r)), 'a non-OP commenter\'s score leaked into OP replies');
    assert.ok(!replies.some((r) => /deleted/.test(r)), 'a [deleted] reply leaked through');
    assert.ok(!replies.some((r) => r === 'ty!'), 'a trivially short reply leaked through');
  } finally {
    global.fetch = original;
  }
});

testAsync('fetchOpReplies yields nothing rather than guessing when the feed is empty', async () => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => '<?xml version="1.0"?><feed></feed>' });
  try {
    const replies = await fetchOpReplies({ id: 't3_abc123', url: 'https://www.reddit.com/r/CreditCards/comments/abc123/x/' });
    assert.deepEqual(replies, []);
  } finally {
    global.fetch = original;
  }
});

test('hasPlausibleScore only counts numbers in FICO range', () => {
  assert.equal(hasPlausibleScore('my score is 742'), true);
  assert.equal(hasPlausibleScore('300 exactly'), true);
  assert.equal(hasPlausibleScore('850 exactly'), true);
  assert.equal(hasPlausibleScore('limit is 250 and i am 29'), false);
  assert.equal(hasPlausibleScore('no numbers here at all'), false);
});

test('rankForExpansion puts scoreless outcome posts first and skips megathread comments', () => {
  const candidates = [
    { id: 't3_a', kind: 'post', title: 'Got approved', text: 'FICO 742, approved.', url: 'https://www.reddit.com/r/CreditCards/comments/a/x/' },
    { id: 't3_b', kind: 'post', title: 'Just got denied for the CSP', text: 'No idea why.', url: 'https://www.reddit.com/r/CreditCards/comments/b/x/' },
    { id: 't3_c', kind: 'post', title: 'What card next?', text: 'Looking for advice.', url: 'https://www.reddit.com/r/CreditCards/comments/c/x/' },
    { id: 't1_d', kind: 'comment', title: 'approved 760', text: 'approved 760', url: 'https://www.reddit.com/r/CreditCards/comments/mega/x/' },
  ];
  const ranked = rankForExpansion(candidates);
  assert.deepEqual(ranked.map((c) => c.id), ['t3_b', 't3_c', 't3_a']);
  assert.ok(!ranked.some((c) => c.kind === 'comment'), 'megathread comments must not be expanded');
});

testAsync('expandOpReplies gives up after consecutive failures instead of grinding', async () => {
  const original = global.fetch;
  let calls = 0;
  // 500 rather than 429: redditRss retries a 429 after 61s, which would make
  // this test unrunnable. Either way the fetch throws and the loop counts it.
  global.fetch = async () => {
    calls++;
    return { ok: false, status: 500, text: async () => '' };
  };
  const candidates = Array.from({ length: 6 }, (_, i) => ({
    id: `t3_p${i}`,
    kind: 'post',
    title: 'Denied for the CSP',
    text: 'No score in the body.',
    url: `https://www.reddit.com/r/CreditCards/comments/p${i}/x/`,
  }));
  try {
    const result = await expandOpReplies(candidates);
    assert.equal(calls, CAPS.abortAfterFailures, `expected ${CAPS.abortAfterFailures} requests before bailing, made ${calls}`);
    assert.equal(result.attempted, CAPS.abortAfterFailures);
    assert.equal(result.expanded, 0);
    assert.ok(!candidates.some((c) => c.opReplies), 'no candidate should have gained replies');
  } finally {
    global.fetch = original;
  }
});

// The 2026-07-30 run's actual failure mode: 7 of 8 comment feeds returned 429,
// each backed off 61s and then SUCCEEDED. Every request delivered its data, so
// the consecutive-failure counter stayed at zero and the run still burned about
// 7 minutes. Throttling has to be counted separately from failure.
testAsync('expandOpReplies gives up when 429 backoffs keep succeeding', async () => {
  const original = global.fetch;
  const seenUrls = new Map();
  // First call per URL 429s, the retry succeeds — a backoff, never a failure.
  global.fetch = async (url) => {
    const n = (seenUrls.get(url) || 0) + 1;
    seenUrls.set(url, n);
    if (n === 1) return { ok: false, status: 429, text: async () => '' };
    return { ok: true, status: 200, text: async () => COMMENT_FEED };
  };
  const candidates = Array.from({ length: 8 }, (_, i) => ({
    id: `t3_q${i}`,
    kind: 'post',
    title: 'Denied for the CSP',
    text: 'No score in the body.',
    url: `https://www.reddit.com/r/CreditCards/comments/q${i}/x/`,
  }));
  try {
    const result = await expandOpReplies(candidates);
    assert.equal(result.failures, 0, 'these are backoffs, not failures — the old guard saw nothing wrong');
    assert.equal(
      result.attempted,
      CAPS.abortAfterThrottled,
      `expected to stop after ${CAPS.abortAfterThrottled} throttled posts, attempted ${result.attempted}`
    );
    // The requests that did go through still delivered, so their replies stick.
    assert.equal(result.expanded, CAPS.abortAfterThrottled);
    assert.equal(candidates.filter((c) => c.opReplies).length, CAPS.abortAfterThrottled);
  } finally {
    global.fetch = original;
  }
});

testAsync('a clean request resets the throttle counter', async () => {
  const original = global.fetch;
  let call = 0;
  // 429-then-success on the first post, clean on every later one: the counter
  // must reset so one slow request does not eventually abort a healthy run.
  global.fetch = async () => {
    call++;
    if (call === 1) return { ok: false, status: 429, text: async () => '' };
    return { ok: true, status: 200, text: async () => COMMENT_FEED };
  };
  const candidates = Array.from({ length: 5 }, (_, i) => ({
    id: `t3_r${i}`,
    kind: 'post',
    title: 'Denied for the CSP',
    text: 'No score in the body.',
    url: `https://www.reddit.com/r/CreditCards/comments/r${i}/x/`,
  }));
  try {
    const result = await expandOpReplies(candidates);
    assert.equal(result.attempted, 5, 'a single backoff must not end the run');
    assert.equal(result.expanded, 5);
  } finally {
    global.fetch = original;
  }
});

test('buildExtractPrompt renders OP replies and documents how to read them', () => {
  const prompt = buildExtractPrompt({
    cards: [{ name: 'Chase Sapphire Preferred', bank: 'Chase', previous_names: [] }],
    candidates: [
      {
        id: 't3_abc123',
        kind: 'post',
        title: 'Denied for CSP',
        text: 'I applied and got denied.',
        url: 'https://www.reddit.com/r/CreditCards/comments/abc123/x/',
        posted: '2026-07-28',
        opReplies: ['Forgot to add: my FICO is 704 Experian.'],
      },
      { id: 't3_noreplies', kind: 'post', title: 'Other post', text: 'Body.', url: 'https://x/', posted: '2026-07-28' },
    ],
  });
  assert.match(prompt, /OP reply: Forgot to add: my FICO is 704 Experian\./);
  assert.match(prompt, /## OP reply lines/);
  // Pre-qual results are not data points (Max, 2026-07-30). The rule has to
  // survive future prompt edits, hence asserting on it here.
  assert.match(prompt, /Pre-qualification is never an outcome, in either direction/);
  // The absence of replies must not render an empty label the model could
  // misread. Count only rendered candidate lines, not the instructions section.
  assert.equal((prompt.match(/^ {4}OP reply: /gm) || []).length, 1);
});

// The age window went 12 months -> 72 (Max, 2026-07-30): historical backfills
// are the whole point of a multi-year sweep, and the old limit silently
// rejected almost everything one would produce.
test('date_applied is accepted back to 72 months and rejected beyond it', () => {
  const ctx = () => ({
    candidateById: new Map([['t3_abc', { id: 't3_abc', url: 'u', posted: '2020-06-01' }]]),
    cardByName: new Map([['Chase Sapphire Preferred', {}]]),
    aliasToName: new Map(),
    usedSourceIds: new Set(),
    importedIds: new Set(),
  });
  const dp = (date_applied) => ({
    source_id: 't3_abc', permalink: 'u', card_name: 'Chase Sapphire Preferred',
    result: 'approved', credit_score: 750, credit_score_source: 0, date_applied,
  });
  const ageErrors = (date) => validateDataPoint(dp(date), ctx()).errors.filter((e) => /months old/.test(e));

  // THIS_MONTH is captured at module load, so derive the boundary rather than
  // hardcoding dates that would rot the moment this file is read in a new month.
  const now = new Date();
  const shift = (months) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  assert.deepEqual(ageErrors(shift(0)), [], 'this month must be accepted');
  assert.deepEqual(ageErrors(shift(71)), [], '71 months must be accepted');
  assert.deepEqual(ageErrors(shift(72)), [], '72 months is the boundary and must be accepted');
  assert.equal(ageErrors(shift(73)).length, 1, '73 months must be rejected');
});

// source_id dedupe catches the same POST twice. It cannot catch the same
// APPLICATION written up in two posts, which is what actually happens: one Blue
// Cash Everyday denial at 644 Experian appeared as both t3_1unbuu8 and
// t3_1uei5qj on 2026-07-30. The import Lambda dedupes on submitter_id, derived
// from source_id, so both would insert and count one person twice.
test('looksLikeSameApplication catches the same application reported twice', () => {
  const a = {
    source_id: 't3_1unbuu8', card_name: 'Blue Cash Everyday', result: 'denied',
    credit_score: 644, date_applied: '2026-06', total_open_cards: 2,
  };
  const retold = { ...a, source_id: 't3_1uei5qj' };
  assert.equal(looksLikeSameApplication(retold, a), true, 'the retelling must be caught');

  // Same story, month off by one — people misremember late June vs early July.
  assert.equal(looksLikeSameApplication({ ...retold, date_applied: '2026-07' }, a), true);
  assert.equal(looksLikeSameApplication({ ...retold, date_applied: '2026-09' }, a), false, 'two months apart is not the same application');
});

test('looksLikeSameApplication does not collapse two different people', () => {
  const a = {
    source_id: 't3_aaa', card_name: 'Chase Sapphire Preferred', result: 'approved',
    credit_score: 750, date_applied: '2026-06', listed_income: 90000,
  };
  // Same popular card, same month, same score — but a different income, so a
  // coincidence rather than a duplicate. This is the false positive that would
  // silently discard real data if the check were keyed on card+score alone.
  const other = { ...a, source_id: 't3_bbb', listed_income: 140000 };
  assert.equal(looksLikeSameApplication(other, a), false);

  // Differing on any distinguishing field is enough.
  assert.equal(looksLikeSameApplication({ ...a, source_id: 't3_ccc', starting_credit_limit: 5000 },
                                        { ...a, starting_credit_limit: 22000 }), false);

  // And the obvious negatives.
  assert.equal(looksLikeSameApplication({ ...a, card_name: 'Chase Freedom Unlimited' }, a), false);
  assert.equal(looksLikeSameApplication({ ...a, result: 'denied' }, a), false);
  assert.equal(looksLikeSameApplication({ ...a, credit_score: 751 }, a), false);
});

test('the finish phase rejects a duplicate row and names its twin', () => {
  const existing = {
    source_id: 't3_1unbuu8', card_name: 'Blue Cash Everyday', result: 'denied',
    credit_score: 644, date_applied: '2026-06',
  };
  const dp = {
    source_id: 't3_1uei5qj', permalink: 'u', card_name: 'Blue Cash Everyday',
    result: 'denied', credit_score: 644, credit_score_source: 1, date_applied: '2026-06',
  };
  const { errors } = validateDataPoint(dp, {
    candidateById: new Map([['t3_1uei5qj', { id: 't3_1uei5qj', url: 'u', posted: '2026-06-24' }]]),
    cardByName: new Map([['Blue Cash Everyday', {}]]),
    aliasToName: new Map(),
    usedSourceIds: new Set(),
    importedIds: new Set(),
    priorRecords: [existing],
  });
  assert.equal(errors.length, 1, `expected exactly the duplicate error, got ${JSON.stringify(errors)}`);
  assert.match(errors[0], /same application as t3_1unbuu8/);
});

// Score ranges were discarded entirely until 2026-07-30, while bounded INCOME
// took its lower bound (#1825). That asymmetry predated the backfill, when
// ranges were rare; in one 8-candidate pass it cost six data points, more than
// the pass produced. Narrow ranges now take the lower bound too.
//
// Floors held out one round longer on the theory that a score floor is the
// poster rounding up while an income floor is a real bound. Max overruled that
// on 2026-08-13 after a "780+" Smartly approval sat in the ask-list: a row that
// is certainly-at-least-780 beats no row, and it understates in a known
// direction exactly like income does. Floors now take the floor.
test('the prompt accepts narrow score ranges and floors, and still rejects wide ranges', () => {
  const prompt = buildExtractPrompt({
    cards: [{ name: 'Chase Sapphire Preferred', bank: 'Chase', previous_names: [] }],
    candidates: [],
  });
  // The threshold is stated, not hardcoded in prose, so the rule and the
  // constant cannot drift apart.
  assert.match(prompt, /spread is 20 points or fewer/);
  assert.match(prompt, /record the LOWER bound/i);
  assert.match(prompt, /"753-758" → 753/);
  // The lines that must survive any future rewording: wide ranges are still
  // out, floors are in and take the floor rather than being rounded up.
  assert.match(prompt, /wider range does NOT qualify/);
  assert.match(prompt, /A floor takes the floor/);
  assert.match(prompt, /"770\+" → 770/);
  assert.doesNotMatch(prompt, /floor.{0,40}does NOT qualify/);
  assert.match(prompt, /"mid 700s", "good credit", "excellent credit"/);
});

// ── Pending bucket (incomplete-revisit) ──────────────────────────────────────
//
// The bucket exists because precision-over-recall throws away recoverable rows:
// a real first-person denial with no score is unpublishable today but often
// answered in a comment tomorrow, by which point `seen` has retired the post.
// These tests guard the two ways that goes wrong — chasing a post forever, and
// letting a half-understood post in as if it were a near-miss.

test('pendingExpiry retires an entry on attempts or age, and says why', () => {
  const fresh = { firstSeen: '2026-08-01', attempts: 1, url: 'u' };
  assert.equal(pendingExpiry(fresh, '2026-08-03'), null);

  const tried = { firstSeen: '2026-08-01', attempts: PENDING_MAX_ATTEMPTS, url: 'u' };
  assert.match(pendingExpiry(tried, '2026-08-03'), /no answer after 3 revisit/);

  // Age bites even when attempts are low — a run that skips a day (or gets
  // throttled out of its revisits) must not keep a stale post alive forever.
  const old = { firstSeen: '2026-07-01', attempts: 1, url: 'u' };
  assert.match(pendingExpiry(old, '2026-08-03'), /past the 7-day window/);

  // Exactly at the boundary is still in.
  assert.equal(pendingExpiry({ firstSeen: '2026-07-27', attempts: 0 }, '2026-08-03'), null);
  assert.match(pendingExpiry(null, '2026-08-03'), /malformed/);
});

// Inverted 2026-08-13. Least-tried-first starved the tail: the bucket gains
// entries every run, so fresh ones with a full window left permanently outranked
// the ones down to their last look, and no entry ever reached attempt 3.
test('rankPending drains the most-tried first so nothing ages out unread', () => {
  const ranked = rankPending({
    t3_new: { firstSeen: '2026-08-03', attempts: 0 },
    t3_tried: { firstSeen: '2026-08-01', attempts: 2 },
    t3_old: { firstSeen: '2026-07-30', attempts: 0 },
  });
  assert.deepEqual(ranked.map((r) => r.id), ['t3_tried', 't3_old', 't3_new']);
});

// The starvation case itself: a full bucket where every newcomer would otherwise
// jump the queue ahead of entries with one look left.
test('rankPending puts last-look entries ahead of a run\'s fresh arrivals', () => {
  const ranked = rankPending({
    t3_fresh1: { firstSeen: '2026-08-13', attempts: 1 },
    t3_fresh2: { firstSeen: '2026-08-13', attempts: 1 },
    t3_lastlook: { firstSeen: '2026-08-10', attempts: 2 },
    t3_lastlook2: { firstSeen: '2026-08-11', attempts: 2 },
  });
  assert.deepEqual(ranked.slice(0, 2).map((r) => r.id), ['t3_lastlook', 't3_lastlook2']);
});

testAsync('revisitPending re-reads the post and counts the attempt', async () => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => COMMENT_FEED });
  const pending = {
    t3_abc123: {
      url: 'https://www.reddit.com/r/CreditCards/comments/abc123/x/',
      card_name: 'Chase Sapphire Preferred',
      result: 'denied',
      missing: ['credit_score'],
      note: 'Denial with no score given.',
      firstSeen: '2026-08-01',
      attempts: 1,
    },
  };
  try {
    const { candidates } = await revisitPending(pending, createReplyBudget());
    assert.equal(candidates.length, 1);
    const c = candidates[0];
    assert.equal(c.revisit, true);
    assert.deepEqual(c.missing, ['credit_score']);
    assert.equal(c.known.card_name, 'Chase Sapphire Preferred');
    // The body comes back fresh rather than from state, so an edited post is
    // re-read as it stands today.
    assert.match(c.text, /I applied and got denied/);
    // The score that was missing yesterday is in an OP reply today — the whole
    // point of the bucket.
    assert.ok(c.opReplies.some((r) => /704 Experian/.test(r)));
    assert.ok(!c.opReplies.some((r) => /810/.test(r)), 'a stranger\'s score leaked into a revisit');
    assert.equal(pending.t3_abc123.attempts, 2, 'a successful re-read must count as an attempt');
    assert.equal(pending.t3_abc123.lastChecked, new Date().toISOString().slice(0, 10));
  } finally {
    global.fetch = original;
  }
});

// A network failure is not the poster declining to answer. Counting it would
// burn the entry's three looks on an outage and drop a recoverable row.
testAsync('a failed revisit does not consume the entry\'s attempts', async () => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, text: async () => '' });
  const pending = {
    t3_abc123: { url: 'https://www.reddit.com/r/CreditCards/comments/abc123/x/', card_name: 'Citi Custom Cash', result: 'denied', missing: ['credit_score'], firstSeen: '2026-08-01', attempts: 1 },
  };
  try {
    const { candidates } = await revisitPending(pending, createReplyBudget());
    assert.equal(candidates.length, 0);
    assert.equal(pending.t3_abc123.attempts, 1, 'a 500 must not count against the entry');
  } finally {
    global.fetch = original;
  }
});

// The shared budget is the whole reason revisits and expansion were merged into
// one counter: two independent loops would double our request rate against a
// feed that 429s us most days.
testAsync('revisits and OP expansion share one request budget', async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return { ok: true, status: 200, text: async () => COMMENT_FEED };
  };
  const budget = createReplyBudget(3);
  const pending = {
    t3_p1: { url: 'https://www.reddit.com/r/CreditCards/comments/p1/x/', card_name: 'Citi Custom Cash', result: 'denied', missing: ['credit_score'], firstSeen: '2026-08-02', attempts: 0 },
    t3_p2: { url: 'https://www.reddit.com/r/CreditCards/comments/p2/x/', card_name: 'Citi Double Cash', result: 'denied', missing: ['credit_score'], firstSeen: '2026-08-02', attempts: 0 },
  };
  const fresh = Array.from({ length: 5 }, (_, i) => ({
    id: `t3_f${i}`, kind: 'post', title: 'Denied for the CSP', text: 'No score in the body.',
    url: `https://www.reddit.com/r/CreditCards/comments/f${i}/x/`,
  }));
  try {
    await revisitPending(pending, budget);
    assert.equal(calls, 2, 'both revisits should run first');
    const result = await expandOpReplies(fresh, budget);
    assert.equal(calls, 3, `budget of 3 must cap total requests, made ${calls}`);
    assert.equal(result.attempted, 1, 'expansion gets only the leftover request');
  } finally {
    global.fetch = original;
  }
});

const PENDING_CTX = {
  candidateById: new Map([
    ['t3_ok', { id: 't3_ok', kind: 'post', url: 'https://reddit.com/x', title: 'Denied', posted: '2026-08-03' }],
    ['t1_mega', { id: 't1_mega', kind: 'comment', url: 'https://reddit.com/mega', title: 'c', posted: '2026-08-03' }],
  ]),
  cardByName: new Map([['Chase Sapphire Preferred', {}]]),
  aliasToName: new Map([['Chase Freedom Student', 'Chase Freedom Rise']]),
};

test('validatePendingEntry accepts a genuine near-miss', () => {
  const { errors, entry } = validatePendingEntry(
    { source_id: 't3_ok', missing: ['credit_score'], card_name: 'Chase Sapphire Preferred', result: 'denied', note: 'No score given.' },
    PENDING_CTX
  );
  assert.deepEqual(errors, []);
  assert.equal(entry.url, 'https://reddit.com/x');
  assert.deepEqual(entry.missing, ['credit_score']);
});

test('validatePendingEntry keeps junk out of the bucket', () => {
  const bad = (raw) => validatePendingEntry(raw, PENDING_CTX).errors;

  // Three missing fields is a post we did not understand, not a near-miss —
  // and it would still be unpublishable if one of them arrived.
  assert.match(
    bad({ source_id: 't3_ok', missing: ['credit_score', 'card_name', 'date_applied'], result: 'denied' }).join(),
    /that is a skip, not a near-miss/
  );
  // A megathread comment has no feed of its own, so it could never be revisited
  // and would burn a request every run until it aged out.
  assert.match(bad({ source_id: 't1_mega', missing: ['credit_score'], card_name: 'Chase Sapphire Preferred', result: 'denied' }).join(), /only posts can be revisited/);
  assert.match(bad({ source_id: 't3_ok', missing: [], card_name: 'Chase Sapphire Preferred', result: 'denied' }).join(), /at least one field/);
  assert.match(bad({ source_id: 't3_ok', missing: ['vibes'], card_name: 'Chase Sapphire Preferred', result: 'denied' }).join(), /unknown missing field/);
  assert.match(bad({ source_id: 't3_nope', missing: ['credit_score'], card_name: 'Chase Sapphire Preferred', result: 'denied' }).join(), /not one of this run's candidates/);
  assert.match(bad({ source_id: 't3_ok', missing: ['credit_score'], card_name: 'Fake Card', result: 'denied' }).join(), /not in the catalog/);
  // A field is only optional when it is the thing being chased.
  assert.match(bad({ source_id: 't3_ok', missing: ['credit_score'], card_name: 'Chase Sapphire Preferred' }).join(), /result is required/);
  assert.match(bad({ source_id: 't3_ok', missing: ['credit_score'], result: 'denied' }).join(), /card_name is required/);
  assert.deepEqual(bad({ source_id: 't3_ok', missing: ['card_name'], result: 'denied' }), []);
});

// The revisit queue is capped and shares a budget with OP expansion, so on a
// throttled run some pending entries never make it into the prompt. Before this
// split, finish read their absence from pending/ as the session giving up on
// them — three real entries were lost that way on 2026-08-06, two to 429s and
// one to the request budget, each with attempts and days still left.
test('an entry the session never saw is carried forward, not dropped', () => {
  const carriedEntry = {
    url: 'https://www.reddit.com/r/CreditCards/comments/never/x/',
    title: 'Denied for Custom Cash',
    card_name: 'Citi Custom Cash',
    result: 'denied',
    missing: ['credit_score'],
    note: 'Denial with no score given.',
    firstSeen: '2026-08-04',
    attempts: 1,
    lastChecked: '2026-08-05',
  };
  const { pending, carriedForward } = mergePending({
    carried: { t3_unfetched: carriedEntry },
    declared: {},
    // Only the entries this run actually presented — t3_unfetched is not one.
    candidateById: new Map([['t3_ok', { id: 't3_ok', kind: 'post' }]]),
  });
  assert.deepEqual(Object.keys(pending), ['t3_unfetched']);
  // Untouched: a look it never got must not be charged to it, or Reddit
  // throttling would quietly eat the entry's whole window.
  assert.deepEqual(pending.t3_unfetched, carriedEntry);
  assert.deepEqual(carriedForward.map((c) => c.id), ['t3_unfetched']);
});

test('an entry the session saw and did not re-declare is still dropped', () => {
  const { pending, carriedForward } = mergePending({
    carried: {
      t3_shown: { url: 'https://reddit.com/x', missing: ['credit_score'], firstSeen: '2026-08-04', attempts: 2 },
    },
    declared: {},
    candidateById: new Map([['t3_shown', { id: 't3_shown', kind: 'post' }]]),
  });
  assert.deepEqual(pending, {}, 'silence on a presented entry means give up on it');
  assert.deepEqual(carriedForward, []);
});

test('a re-declared entry wins over the carried copy', () => {
  const { pending, carriedForward } = mergePending({
    carried: { t3_shown: { url: 'https://reddit.com/x', missing: ['credit_score'], firstSeen: '2026-08-04', attempts: 1 } },
    declared: { t3_shown: { url: 'https://reddit.com/x', missing: ['credit_score'], firstSeen: '2026-08-04', attempts: 2, note: 'still no score' } },
    candidateById: new Map([['t3_shown', { id: 't3_shown', kind: 'post' }]]),
  });
  assert.equal(pending.t3_shown.attempts, 2);
  assert.equal(pending.t3_shown.note, 'still no score');
  assert.deepEqual(carriedForward, [], 'a re-declared entry was presented, so it is not a carry');
});

// Carrying forward must not become immortality: the entry keeps its original
// firstSeen, so the age half of pendingExpiry retires it on schedule even if
// every single run gets throttled out of revisiting it.
test('carried entries still age out of the bucket', () => {
  const stale = { url: 'https://reddit.com/x', missing: ['credit_score'], firstSeen: '2026-07-28', attempts: 1 };
  const { pending } = mergePending({ carried: { t3_stale: stale }, declared: {}, candidateById: new Map() });
  assert.equal(pending.t3_stale.firstSeen, '2026-07-28', 'the clock must not restart on a carry');
  assert.match(pendingExpiry(pending.t3_stale, '2026-08-05'), new RegExp(`past the ${PENDING_MAX_DAYS}-day window`));
  assert.equal(pendingExpiry(pending.t3_stale, '2026-08-04'), null, 'and not before the window is up');
});

test('validatePendingEntry canonicalizes a previous card name', () => {
  const { errors, entry } = validatePendingEntry(
    { source_id: 't3_ok', missing: ['credit_score'], card_name: 'Chase Freedom Student', result: 'approved' },
    { ...PENDING_CTX, cardByName: new Map([['Chase Freedom Rise', {}]]) }
  );
  assert.deepEqual(errors, []);
  assert.equal(entry.card_name, 'Chase Freedom Rise');
});

test('the prompt tells the session when to declare a near-miss and when not to', () => {
  const prompt = buildExtractPrompt({
    cards: [{ name: 'Chase Sapphire Preferred', bank: 'Chase', previous_names: [] }],
    candidates: [],
  });
  assert.match(prompt, /\.reddit-dp-work\/pending\/<n>\.yaml/);
  assert.match(prompt, /at most two/);
  // The bucket must not become a dumping ground for the posts we already skip.
  assert.match(prompt, /never a pre-qual and never a hypothetical/);
  assert.match(prompt, /recommendation-template post, or a pre-qual rejection is NOT pending/);
});

test('a revisit is rendered with what is known and what is still missing', () => {
  const prompt = buildExtractPrompt({
    cards: [{ name: 'Citi Custom Cash', bank: 'Citi', previous_names: [] }],
    candidates: [
      {
        id: 't3_rev', kind: 'post', revisit: true, posted: '2026-08-01',
        title: 'Denied for Custom Cash', text: 'No idea why.',
        url: 'https://reddit.com/x', missing: ['credit_score'],
        known: { card_name: 'Citi Custom Cash', result: 'denied' },
        note: 'Denial with no score.', firstSeen: '2026-08-01', attempts: 2,
        opReplies: ['It was 690 TransUnion.'],
      },
      { id: 't3_new', kind: 'post', posted: '2026-08-03', title: 'New post', text: 'Approved!', url: 'https://reddit.com/y' },
    ],
  });
  assert.match(prompt, /## Revisits \(1\)/);
  assert.match(prompt, /REVISIT \(look 2 of 3/);
  assert.match(prompt, /Already established: Citi Custom Cash, denied/);
  assert.match(prompt, /Still missing: credit_score/);
  assert.match(prompt, /OP reply: It was 690 TransUnion\./);
  // Revisits are labelled separately so the two lists cannot be confused.
  assert.match(prompt, /## New candidates \(1\)/);
  assert.match(prompt, /\[R1\]/);
  // And the session is told that silence drops an entry, since that is the only
  // way one ever leaves the bucket early.
  assert.match(prompt, /An entry not re-declared in `pending\/` is dropped/);
});

test('followups name the post, the gap, and what to ask', () => {
  const md = buildFollowups({
    t3_x: {
      url: 'https://www.reddit.com/r/CreditCards/comments/x/',
      title: 'Denied for BofA Premium Rewards Elite',
      card_name: 'Bank of America Premium Rewards Elite',
      result: 'denied',
      missing: ['credit_score'],
      note: 'Denial cited no banking relationship. No score given.',
      firstSeen: '2026-08-03',
      attempts: 1,
    },
  });
  assert.match(md, /https:\/\/www\.reddit\.com\/r\/CreditCards\/comments\/x\//);
  assert.match(md, /Bank of America Premium Rewards Elite · denied/);
  assert.match(md, /What was your score at the time, and which bureau\?/);
  assert.match(md, /2 left before it ages out/);
  assert.equal(buildFollowups({}).includes('Nothing pending'), true);
});

test('the PR body carries the ask-list and says merging does not touch it', () => {
  const body = buildPrBody(
    [{ dp: { source_id: 't3_a', permalink: 'https://reddit.com/a', card_name: 'Apple Card', result: 'approved', credit_score: 750, date_applied: '2026-08' }, filename: 'f.yaml' }],
    {
      t3_x: {
        url: 'https://reddit.com/x', title: 'Denied for Premium Rewards Elite',
        card_name: 'Bank of America Premium Rewards Elite', result: 'denied',
        missing: ['credit_score'], firstSeen: '2026-08-03', attempts: 1,
      },
    }
  );
  assert.match(body, /### Needs one more field \(1\)/);
  assert.match(body, /merging does not change them/);
  assert.match(body, /What was your score at the time/);
  // No pending bucket means no section at all, rather than an empty table.
  assert.ok(!buildPrBody([{ dp: { source_id: 't3_a', permalink: 'u', card_name: 'Apple Card', result: 'approved', credit_score: 750, date_applied: '2026-08' }, filename: 'f.yaml' }], {}).includes('Needs one more field'));
});

// ── Drop-reason accounting ───────────────────────────────────────────────────
//
// The gap these close: before the skip log, a run reported "15 candidates, 1
// data point" and nothing about the other 14. Since the seen-state retires
// every candidate presented, a correctly-strict extractor and one silently
// dropping good posts produced identical output. So the log has to be both
// mandatory (unaccounted candidates are reported) and trustworthy (a
// malformed entry must not count as an explanation).

const fs = require('node:fs');
const path = require('node:path');
const SKIPPED_PATH = path.join(__dirname, '..', '.reddit-dp-work', 'skipped.yaml');

function withSkippedFile(body, fn) {
  fs.mkdirSync(path.dirname(SKIPPED_PATH), { recursive: true });
  if (body === null) fs.rmSync(SKIPPED_PATH, { force: true });
  else fs.writeFileSync(SKIPPED_PATH, body);
  try {
    return fn();
  } finally {
    fs.rmSync(SKIPPED_PATH, { force: true });
  }
}

const candidatesOf = (...ids) => ids.map((id) => ({ id, url: `https://reddit.com/${id}` }));
const byId = (...ids) => new Map(candidatesOf(...ids).map((c) => [c.id, c]));

test('a well-formed skip log is accepted and counted by reason', () => {
  const { entries, rejected } = withSkippedFile(
    `- source_id: "t3_a"\n  reason: no_outcome\n- source_id: "t3_b"\n  reason: pre_qual\n- source_id: "t3_c"\n  reason: no_outcome\n`,
    () => loadSkipped(byId('t3_a', 't3_b', 't3_c'))
  );
  assert.deepEqual(rejected, []);
  const d = reconcileDispositions({
    candidates: candidatesOf('t3_a', 't3_b', 't3_c'),
    publishedIds: [],
    pendingIds: [],
    skipped: { entries, rejected },
  });
  assert.deepEqual(d.byReason, { no_outcome: 2, pre_qual: 1 });
  assert.equal(d.unaccounted.length, 0);
});

test('a skip log cannot explain away a post that was never a candidate', () => {
  const { entries, rejected } = withSkippedFile(
    `- source_id: "t3_a"\n  reason: no_outcome\n- source_id: "t3_ghost"\n  reason: no_outcome\n`,
    () => loadSkipped(byId('t3_a'))
  );
  assert.equal(entries.length, 1);
  assert.match(rejected.join(' '), /t3_ghost was not a candidate/);
});

test('an unknown skip reason is rejected rather than silently bucketed', () => {
  const { entries, rejected } = withSkippedFile(
    `- source_id: "t3_a"\n  reason: vibes\n`,
    () => loadSkipped(byId('t3_a'))
  );
  assert.equal(entries.length, 0);
  assert.match(rejected.join(' '), /unknown reason "vibes"/);
  // And because the entry was rejected, its candidate stays unaccounted for
  // instead of passing as explained.
  const d = reconcileDispositions({
    candidates: candidatesOf('t3_a'),
    publishedIds: [],
    pendingIds: [],
    skipped: { entries, rejected },
  });
  assert.equal(d.unaccounted.length, 1);
});

test('reasons that are useless without a field demand that field', () => {
  const { entries, rejected } = withSkippedFile(
    `- source_id: "t3_a"\n  reason: card_not_in_catalog\n- source_id: "t3_b"\n  reason: other\n`,
    () => loadSkipped(byId('t3_a', 't3_b'))
  );
  assert.equal(entries.length, 0);
  assert.match(rejected.join(' '), /card_not_in_catalog" requires the card name/);
  assert.match(rejected.join(' '), /other" requires a note/);
});

test('catalog gaps come back as a deduped list to act on', () => {
  const { entries } = withSkippedFile(
    `- source_id: "t3_a"\n  reason: card_not_in_catalog\n  card: "Sofi Everyday Cash Rewards"\n` +
      `- source_id: "t3_b"\n  reason: card_not_in_catalog\n  card: "Sofi Everyday Cash Rewards"\n` +
      `- source_id: "t3_c"\n  reason: card_not_in_catalog\n  card: "Aven Home Card"\n`,
    () => loadSkipped(byId('t3_a', 't3_b', 't3_c'))
  );
  const d = reconcileDispositions({
    candidates: candidatesOf('t3_a', 't3_b', 't3_c'),
    publishedIds: [],
    pendingIds: [],
    skipped: { entries, rejected: [] },
  });
  assert.deepEqual(d.catalogGaps, ['Aven Home Card', 'Sofi Everyday Cash Rewards']);
});

test('a candidate the session said nothing about is reported, not assumed judged', () => {
  const { entries, rejected } = withSkippedFile(
    `- source_id: "t3_a"\n  reason: no_outcome\n`,
    () => loadSkipped(byId('t3_a', 't3_b', 't3_c', 't3_d'))
  );
  const d = reconcileDispositions({
    candidates: candidatesOf('t3_a', 't3_b', 't3_c', 't3_d'),
    publishedIds: ['t3_b'],
    pendingIds: ['t3_c'],
    skipped: { entries, rejected },
  });
  // published + pending + skipped account for three; t3_d is the hole.
  assert.deepEqual(d.unaccounted.map((c) => c.id), ['t3_d']);
  assert.match(buildDispositionSection(d), /never accounted for/);
});

test('a missing skip log is an empty log, not a crash', () => {
  const { entries, rejected } = withSkippedFile(null, () => loadSkipped(byId('t3_a')));
  assert.deepEqual(entries, []);
  assert.deepEqual(rejected, []);
});

test('unparseable or wrongly-shaped skip logs are rejected whole', () => {
  assert.match(
    withSkippedFile('- source_id: "t3_a"\n  reason: [unclosed\n', () => loadSkipped(byId('t3_a'))).rejected.join(' '),
    /unparseable YAML/
  );
  assert.match(
    withSkippedFile('source_id: t3_a\nreason: no_outcome\n', () => loadSkipped(byId('t3_a'))).rejected.join(' '),
    /expected a list/
  );
});

test('the PR body shows the skip breakdown and the catalog gaps', () => {
  const d = {
    byReason: { no_outcome: 9, no_score: 3, card_not_in_catalog: 1 },
    catalogGaps: ['Aven Home Card'],
    unaccounted: [],
    rejected: [],
  };
  const section = buildDispositionSection(d);
  assert.match(section, /### Candidates that produced nothing/);
  assert.match(section, /\| `no_outcome` \| 9 \|/);
  assert.match(section, /Aven Home Card/);
  // Ordered most-common first, so the biggest loss bucket reads at a glance.
  assert.ok(section.indexOf('no_outcome') < section.indexOf('no_score'));
  // A fully-published run adds no section at all.
  assert.equal(buildDispositionSection({ byReason: {}, catalogGaps: [], unaccounted: [], rejected: [] }), '');
});

test('the prompt makes the skip log mandatory and names every valid reason', () => {
  const prompt = buildExtractPrompt({
    candidates: [{ id: 't3_a', kind: 'post', title: 'Approved', text: 'x', url: 'https://reddit.com/a', posted: '2026-08-09' }],
    cards: [{ name: 'Apple Card', bank: 'Goldman Sachs', previous_names: [] }],
  });
  assert.match(prompt, /every candidate needs a disposition/i);
  assert.match(prompt, /skipped\.yaml/);
  for (const reason of Object.keys(SKIP_REASONS)) {
    assert.match(prompt, new RegExp(`\`${reason}\``), `prompt is missing the ${reason} reason`);
  }
  // The first-failing-bar rule is what keeps the counts comparable run to run.
  assert.match(prompt, /first.{0,20}bar the candidate fails/i);
});

test('the run log trends across runs, replaces same-day reruns, and stays bounded', () => {
  const one = appendRun([], { date: '2026-08-01', published: 1 });
  assert.equal(one.length, 1);
  // Re-running finish on the same day must not stack a second row.
  const rerun = appendRun(one, { date: '2026-08-01', published: 3 });
  assert.deepEqual(rerun, [{ date: '2026-08-01', published: 3 }]);
  const two = appendRun(rerun, { date: '2026-08-02', published: 0 });
  assert.deepEqual(two.map((r) => r.date), ['2026-08-01', '2026-08-02']);
  // Bounded: the state file is committed on every run, so it cannot grow forever.
  let long = [];
  for (let i = 0; i < RUN_LOG_LIMIT + 20; i++) long = appendRun(long, { date: `day-${i}`, published: 0 });
  assert.equal(long.length, RUN_LOG_LIMIT);
  assert.equal(long[long.length - 1].date, `day-${RUN_LOG_LIMIT + 19}`);
});

// ── /new pagination (coverage) ───────────────────────────────────────────────
//
// One page of /new?limit=100 could not cover a day of r/CreditCards, so posts
// below the newest 100 were never fetched — invisible to the extractor and
// uncounted as misses. Paging back with `after` is what lifts that ceiling
// while the routine still runs once a day.

// A /new-style feed page. Every post carries an approval signal so DP_SIGNAL_RE
// keeps them all and the tests measure paging, not the keyword filter.
function newFeedPage(ids) {
  const entries = ids
    .map(
      (id) =>
        `<entry><author><name>/u/poster_${id}</name></author>` +
        `<id>${id}</id>` +
        `<link href="https://www.reddit.com/r/CreditCards/comments/${id}/x/"/>` +
        `<updated>2026-08-09T12:00:00+00:00</updated>` +
        `<title>Approved for something</title>` +
        `<content type="html">&lt;div&gt;I applied and got approved.&lt;/div&gt;</content></entry>`
    )
    .join('');
  return `<?xml version="1.0"?><feed>${entries}</feed>`;
}

// Serves one page per call and records the `after` cursor each request used.
function pagedFetch(pages) {
  const cursors = [];
  let call = 0;
  global.fetch = async (url) => {
    cursors.push(new URL(url).searchParams.get('after'));
    const page = pages[call++];
    if (page instanceof Error) throw page;
    return { ok: true, status: 200, text: async () => newFeedPage(page) };
  };
  return cursors;
}

testAsync('the crawl walks several pages back with an after cursor', async () => {
  const original = global.fetch;
  const cursors = pagedFetch([
    ['t3_a1', 't3_a2'],
    ['t3_b1', 't3_b2'],
    ['t3_c1', 't3_c2'],
    ['t3_d1', 't3_d2'],
  ]);
  try {
    const { candidates, label } = await fetchNewPosts(new Set());
    assert.equal(candidates.length, 8, 'every page of unseen posts should reach the session');
    // Page 1 has no cursor; each later page resumes after the previous page's
    // last post, which is what actually moves the window back.
    assert.deepEqual(cursors, [null, 't3_a2', 't3_b2', 't3_c2']);
    assert.match(label, /4 page\(s\), 8 unseen/);
  } finally {
    global.fetch = original;
  }
});

testAsync('paging stops at the page cap even when posts keep coming', async () => {
  const original = global.fetch;
  const pages = Array.from({ length: NEW_FEED_PAGES + 3 }, (_, i) => [`t3_p${i}a`, `t3_p${i}b`]);
  const cursors = pagedFetch(pages);
  try {
    await fetchNewPosts(new Set());
    assert.equal(cursors.length, NEW_FEED_PAGES, `crawl must stop at ${NEW_FEED_PAGES} pages`);
  } finally {
    global.fetch = original;
  }
});

testAsync('paging stops as soon as a page holds nothing new', async () => {
  const original = global.fetch;
  // Page 2 is entirely posts we already recorded: that is where yesterday's
  // crawl finished, so there is nothing older worth paying for.
  const cursors = pagedFetch([['t3_new1'], ['t3_old1'], ['t3_never']]);
  try {
    const { candidates } = await fetchNewPosts(new Set(['t3_old1']));
    assert.deepEqual(candidates.map((c) => c.id), ['t3_new1']);
    assert.equal(cursors.length, 2, 'must not page past the point where the feed is all seen');
  } finally {
    global.fetch = original;
  }
});

testAsync('a mid-crawl failure keeps the pages already fetched', async () => {
  const original = global.fetch;
  pagedFetch([['t3_a1'], ['t3_b1'], new Error('Reddit RSS -> 429')]);
  try {
    const { candidates } = await fetchNewPosts(new Set());
    // Partial coverage beats throwing away two good pages over a late 429.
    assert.deepEqual(candidates.map((c) => c.id), ['t3_a1', 't3_b1']);
  } finally {
    global.fetch = original;
  }
});

testAsync('a first-page failure still fails the source', async () => {
  const original = global.fetch;
  pagedFetch([new Error('Reddit RSS -> 429')]);
  try {
    // Nothing was fetched, so this is a source failure, not a quiet day — the
    // run's exit-2 check depends on it throwing.
    await assert.rejects(() => fetchNewPosts(new Set()), /429/);
  } finally {
    global.fetch = original;
  }
});

testAsync('a post repeated across pages is only presented once', async () => {
  const original = global.fetch;
  // A new submission during the crawl shifts the window, so the last post of
  // page 1 can reappear at the top of page 2.
  pagedFetch([['t3_a1', 't3_a2'], ['t3_a2', 't3_b1'], []]);
  try {
    const { candidates } = await fetchNewPosts(new Set());
    assert.deepEqual(candidates.map((c) => c.id), ['t3_a1', 't3_a2', 't3_b1']);
  } finally {
    global.fetch = original;
  }
});

run();
