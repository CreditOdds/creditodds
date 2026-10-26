// Tests for the phrase classifier in check-referrals.js.
//
// The asymmetry these guard: a wrong "expired" auto-archives a working link a
// real user submitted and emails them about it, while a missed expiry costs
// nothing. So the false-positive cases (conditional boilerplate, generic apply
// pages, bot walls) matter more than catching every dead wording.
//
// Run: `node scripts/check-referrals.test.js`. Exits non-zero on any failure.

const assert = require('node:assert/strict');
const { classifyByPhrases } = require('./check-referrals');

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

const filler = 'Apply now for the Card. Earn 60,000 bonus points after you spend $4,000 in the first 3 months. '.repeat(40);

console.log('classifyByPhrases: expired');

for (const phrase of [
  'This referral link has expired.',
  'Sorry, the referral offer you used is no longer available.',
  'We are no longer accepting referrals for this card.',
  'This offer is no longer available.',
  'This offer has ended.',
  'Our referral program has ended.',
  'This link is no longer valid.',
  'The invitation you followed has expired',
  'Your referral link is no longer active',
]) {
  test(`"${phrase}"`, () => {
    const v = classifyByPhrases(`Chase ${phrase} Explore other cards.`);
    assert.equal(v.status, 'expired');
    assert.match(v.reason, /^page says "/);
  });
}

test('matches across collapsed whitespace and case', () => {
  assert.equal(classifyByPhrases('THIS   REFERRAL\n\nLINK HAS EXPIRED').status, 'expired');
});

test('a dead phrase deep in a long page still counts', () => {
  assert.equal(classifyByPhrases(`${filler} This offer is no longer available. ${filler}`).status, 'expired');
});

console.log('classifyByPhrases: valid');

test('a normal apply page is valid', () => {
  const v = classifyByPhrases(filler);
  assert.equal(v.status, 'valid');
});

test('conditional boilerplate is not a dead signal', () => {
  const v = classifyByPhrases(`${filler} If this offer has ended, you may still apply for the card at its standard terms.`);
  assert.equal(v.status, 'valid');
});

test('"once the referral link has expired" in terms is not a dead signal', () => {
  assert.equal(classifyByPhrases(`${filler} Once the referral link has expired, bonuses will not be paid.`).status, 'valid');
});

test('"may no longer be available" is not explicit enough', () => {
  assert.equal(classifyByPhrases(`${filler} This offer may no longer be available at a later date.`).status, 'valid');
});

test('a different card being discontinued is not this referral', () => {
  assert.equal(classifyByPhrases(`${filler} The Sapphire card is no longer available to new applicants.`).status, 'valid');
});

console.log('classifyByPhrases: bot walls');

test('the Amazon "continue shopping" interstitial is left out', () => {
  // Real text from referral #56 on 2026-10-25.
  const text = 'Amazon.com Click the button below to continue shopping Continue shopping Conditions of Use Privacy Policy 1996-2025, Amazon.com, Inc. or its affiliates';
  assert.equal(classifyByPhrases(text), null);
});

test('a short Akamai "Access Denied" page is left out', () => {
  assert.equal(classifyByPhrases("Access Denied You don't have permission to access this page on this server. Reference #18.abc"), null);
});

test('a long real page that mentions captcha is still classified', () => {
  assert.equal(classifyByPhrases(`${filler} Protected by reCAPTCHA. ${filler}`).status, 'valid');
});

test('a dead phrase wins over a bot-wall word on a short page', () => {
  assert.equal(classifyByPhrases('This referral link has expired. Please complete the captcha to continue.').status, 'expired');
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll tests passed');
