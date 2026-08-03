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
  buildFollowups,
  CAPS,
  PENDING_MAX_ATTEMPTS,
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
test('the prompt accepts narrow score ranges and still rejects wide ones and floors', () => {
  const prompt = buildExtractPrompt({
    cards: [{ name: 'Chase Sapphire Preferred', bank: 'Chase', previous_names: [] }],
    candidates: [],
  });
  // The threshold is stated, not hardcoded in prose, so the rule and the
  // constant cannot drift apart.
  assert.match(prompt, /spread is 20 points or fewer/);
  assert.match(prompt, /record the LOWER bound/i);
  assert.match(prompt, /"753-758" → 753/);
  // The lines that must survive any future rewording: wide ranges and floors
  // are still out, and a floor is explicitly distinguished from a range.
  assert.match(prompt, /wider range does NOT qualify/);
  assert.match(prompt, /A floor is not a range and does NOT qualify/);
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

test('rankPending chases the least-tried and oldest first', () => {
  const ranked = rankPending({
    t3_new: { firstSeen: '2026-08-03', attempts: 0 },
    t3_tried: { firstSeen: '2026-08-01', attempts: 2 },
    t3_old: { firstSeen: '2026-07-30', attempts: 0 },
  });
  assert.deepEqual(ranked.map((r) => r.id), ['t3_old', 't3_new', 't3_tried']);
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

run();
