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
  buildExtractPrompt,
} = require('./check-reddit-datapoints.js');

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
  // The absence of replies must not render an empty label the model could
  // misread. Count only rendered candidate lines, not the instructions section.
  assert.equal((prompt.match(/^ {4}OP reply: /gm) || []).length, 1);
});

run();
