// Tests for the social post text rules in scripts/lib/social-text.js.
//
// Guards two bugs that reached production on 2026-08-02:
//
//   1. The Citi Curated Table tweet went out with a trailing fire emoji, which
//      rendered as "????" for readers and read as meme-y rather than factual.
//      The prompt at the time allowed "0-1 emoji max", so the model was within
//      its instructions. Emoji are now banned outright and stripped here as a
//      backstop.
//   2. The same tweet used em dashes, which the house style bans everywhere in
//      user-facing copy. Nothing enforced that on the social path.
//
// Also pins the length budget. X counts every link as a 23-char t.co URL and
// both posting paths join text and URL with "\n\n", so text above 255 chars
// produces a tweet over 280 that X rejects at post time. The old cap was 260.
//
// Run: `node scripts/lib/social-text.test.js`. Exits non-zero on any failure.

const assert = require('node:assert/strict');

const {
  TWEET_TEXT_LIMIT,
  TWEET_MAX,
  sanitizeSocialText,
  enforceTweetLimit,
  findFlattenedAttribution,
} = require('./social-text.js');

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}\n       ${err.message}`);
  }
}

const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}]/u;

console.log('social text sanitizer');

// The exact string that was posted on 2026-08-02.
const SHIPPED_TWEET =
  'NEW: Citi is hosting exclusive Curated Table events for Strata Elite ' +
  'cardmembers—New York on Sept 9, Austin on Oct 21, Miami on Dec 2. ' +
  'Tickets start at $100—first come, first served! \u{1F525}';

test('the shipped tweet loses its emoji and em dashes', () => {
  const out = sanitizeSocialText(SHIPPED_TWEET);
  assert.ok(!EMOJI_RE.test(out), `emoji survived: ${out}`);
  assert.ok(!/[—–―]/.test(out), `dash survived: ${out}`);
  // The facts must all still be there.
  for (const fact of ['Sept 9', 'Oct 21', 'Dec 2', '$100', 'Strata Elite']) {
    assert.ok(out.includes(fact), `lost fact "${fact}": ${out}`);
  }
});

test('strips flag, skin-tone, and ZWJ-sequence emoji', () => {
  const out = sanitizeSocialText('Rates up \u{1F1FA}\u{1F1F8} today \u{1F44D}\u{1F3FD} and family \u{1F468}‍\u{1F469}‍\u{1F467} gone');
  assert.equal(out, 'Rates up today and family gone');
});

test('em dash and en dash both become commas, spacing collapses', () => {
  assert.equal(
    sanitizeSocialText('Fee goes 95 – 150 next month — effective Sept 1'),
    'Fee goes 95, 150 next month, effective Sept 1'
  );
});

test('a dangling dash at the end does not leave trailing punctuation', () => {
  assert.equal(sanitizeSocialText('Something happened —'), 'Something happened');
});

test('newlines are preserved so multi-line posts survive', () => {
  const multiline =
    'NEW: Citi expands Curated Table.\n\nNew York: Sept 9\nAustin: Oct 21\nMiami: Dec 2';
  const out = sanitizeSocialText(multiline);
  assert.ok(out.includes('\n'), 'newlines were flattened');
  assert.equal(out.split('\n').filter(Boolean).length, 4);
});

test('null and empty input are safe', () => {
  assert.equal(sanitizeSocialText(null), '');
  assert.equal(enforceTweetLimit(undefined), '');
});

console.log('\nlength budget');

test('the text limit leaves room for a t.co link and the "\\n\\n" join', () => {
  assert.equal(TWEET_TEXT_LIMIT, 255);
  assert.equal(TWEET_TEXT_LIMIT + 23 + 2, TWEET_MAX);
});

test('text plus link plus separator never exceeds the tweet max', () => {
  const long = enforceTweetLimit(`NEW: ${'Fact about the card here. '.repeat(40)}`);
  assert.ok(long.length <= TWEET_TEXT_LIMIT, `text was ${long.length}`);
  const composed = `${long}\n\n${'x'.repeat(23)}`;
  assert.ok(composed.length <= TWEET_MAX, `composed tweet was ${composed.length}`);
});

test('overlong text is cut at a sentence boundary, not mid-number', () => {
  const out = enforceTweetLimit(`NEW: ${'The annual fee is $250. '.repeat(20)}`);
  assert.ok(out.length <= TWEET_TEXT_LIMIT);
  assert.ok(out.endsWith('.'), `did not end on a sentence: ${out}`);
  assert.ok(!out.endsWith('...'), 'fell back to ellipsis despite clean breaks');
});

// A single long lead sentence followed by an overrunning second one: the only
// sentence boundary sits just past halfway, so the clean-break path has to
// accept it rather than clipping the second sentence mid-word.
test('a lone early sentence boundary is preferred over an ellipsis', () => {
  const lead = `NEW: ${'x'.repeat(130)}.`;
  const out = enforceTweetLimit(`${lead} ${'y'.repeat(200)} trailing words`);
  assert.equal(out, lead, `did not cut back to the lead sentence: ${out}`);
  assert.ok(!out.endsWith('...'), 'fell back to ellipsis despite a clean break');
});

test('text with no clean break falls back to an ellipsis within the limit', () => {
  const out = enforceTweetLimit('a'.repeat(300), 50);
  assert.equal(out.length, 50);
  assert.ok(out.endsWith('...'));
});

test('text already within the limit is returned unchanged apart from sanitizing', () => {
  const clean = 'NEW: Citi expands Curated Table for Strata Elite cardmembers.';
  assert.equal(enforceTweetLimit(clean), clean);
});

console.log('\nattribution and hedging');

// A summary that hangs a claim on an outlet must not become a bare assertion.
// This is the 2026-09-02 Sapphire Reserve DoorDash post, which published
// "This replaces the current $5 credit" from a summary that said Doctor of
// Credit reported it.
test('an outlet attribution dropped from the post is caught', () => {
  const summary = 'Doctor of Credit reports it takes the place of the current $5 restaurant only promo.';
  const hit = findFlattenedAttribution(summary, 'This replaces the current $5 restaurant-only promo.');
  assert.ok(hit, 'flattened attribution went undetected');
  assert.equal(hit.kind, 'attribution');
  assert.equal(hit.marker, 'doctor of credit');
});

test('a post that keeps the outlet attribution passes', () => {
  const summary = 'Doctor of Credit reports it takes the place of the current $5 promo.';
  assert.equal(findFlattenedAttribution(summary, 'Doctor of Credit reports it replaces the $5 promo.'), null);
});

test('an uncertainty marker dropped from the post is caught', () => {
  const summary = 'Unconfirmed: a cardholder says Chase will drop the foreign transaction fee.';
  const hit = findFlattenedAttribution(summary, 'Chase will drop the foreign transaction fee.');
  assert.ok(hit);
  assert.equal(hit.kind, 'uncertainty');
});

test('a hedge kept in different words still passes', () => {
  const summary = 'Unconfirmed: a cardholder says Chase will drop the fee.';
  assert.equal(findFlattenedAttribution(summary, 'Chase reportedly will drop the fee.'), null);
});

// The issuer speaking about its own product is the confirmation, so a post may
// state it flatly. These are the common case and must never block a queue.
test('a first-party issuer statement is not treated as a hedge', () => {
  const summary = 'Southwest said on September 2, 2026 that it is building its first airport lounges.';
  assert.equal(findFlattenedAttribution(summary, 'Southwest is building its first airport lounges.'), null);
});

test('a summary with no hedge at all passes', () => {
  const summary = 'Citi is mailing Sunoco cardholders notice that every account closes on October 31, 2026.';
  assert.equal(findFlattenedAttribution(summary, 'Citi is closing every Sunoco account on October 31, 2026.'), null);
});

// The prompt lets the model drop a hedged claim instead of hedging it. A post
// that leaves the claim out is correct and must not be blocked, even though the
// summary still names the outlet.
test('a post that omits the hedged claim entirely passes', () => {
  const summary = 'Starting October 1, 2026, Chase Sapphire Reserve cardholders get a $15 monthly '
    + 'DoorDash credit that works on any eligible order. Doctor of Credit reports it takes the '
    + 'place of the current $5 restaurant only promo.';
  const post = 'Starting October 1, 2026, Chase Sapphire Reserve cardholders will receive a $15 '
    + 'monthly DoorDash credit applicable to any eligible order, including restaurants.';
  assert.equal(findFlattenedAttribution(summary, post), null);
});

test('restating the hedged claim without the hedge is still caught', () => {
  const summary = 'Starting October 1, 2026, cardholders get a $15 monthly DoorDash credit. '
    + 'Doctor of Credit reports it takes the place of the current $5 restaurant only promo.';
  const post = 'Cardholders get a $15 monthly DoorDash credit. This replaces the current $5 '
    + 'restaurant-only promo.';
  const hit = findFlattenedAttribution(summary, post);
  assert.ok(hit, 'flattened claim went undetected');
  assert.equal(hit.kind, 'attribution');
});

test('empty input is safe', () => {
  assert.equal(findFlattenedAttribution('', 'anything'), null);
  assert.equal(findFlattenedAttribution('Doctor of Credit reports a change.', ''), null);
});


console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
