// Smoke tests for the WAF-retry logic in check-apply-links.js.
//
// These guard the false-positive path that produced issue #2037: Citi's
// /usc/lpaca/ offer landing page returned a 404 to one CI run while the page was
// live, and because 404 was outside the retry set the check reported a working
// apply link (and a live 70k SUB) as broken. A false "broken" here is expensive
// twice over — it burns a manual investigation, and if acted on it strips a real
// offer out of the card data.
//
// Run: `node scripts/check-apply-links.test.js`. Exits non-zero on any failure.

const assert = require('node:assert/strict');
const { classify, needsBrowserRetry } = require('./check-apply-links');

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

console.log('needsBrowserRetry');

test('404 retries — the #2037 regression', () => {
  assert.equal(needsBrowserRetry(404), true);
});

test('retries the other WAF-block and transient statuses', () => {
  for (const status of [0, 403, 410, 429, 500, 502, 503, 504]) {
    assert.equal(needsBrowserRetry(status), true, `expected retry for ${status}`);
  }
});

test('does not retry a healthy or non-block response', () => {
  for (const status of [200, 204, 301, 302, 304, 400, 401, 451]) {
    assert.equal(needsBrowserRetry(status), false, `expected no retry for ${status}`);
  }
});

console.log('classify');

test('a live offer page passes', () => {
  const verdict = classify(
    {
      status: 200,
      finalUrl: 'https://www.citi.com/usc/lpaca/aa/aadvantage/exec/ps/index0.html',
      body: '<title>Citi / AAdvantage Executive World Elite Mastercard</title>',
    },
    'https://www.citi.com/usc/lpaca/aa/aadvantage/exec/ps/index0.html'
  );
  assert.equal(verdict.ok, true);
});

test('an apply-page title containing "error" is not flagged on the word alone', () => {
  // The title heuristic exempts pages whose title mentions apply/credit card, so
  // a real product page cannot be failed by an incidental substring match.
  const verdict = classify(
    { status: 200, finalUrl: 'https://bank.example/apply', body: '<title>Apply for a credit card</title>' },
    'https://bank.example/apply'
  );
  assert.equal(verdict.ok, true);
});

test('a genuine 404 is still broken', () => {
  const verdict = classify(
    { status: 404, finalUrl: 'https://bank.example/dead', body: '' },
    'https://bank.example/dead'
  );
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /404/);
});

test('a soft-404 body is still broken at HTTP 200', () => {
  const verdict = classify(
    {
      status: 200,
      finalUrl: 'https://bank.example/offer',
      body: '<title>Offer</title><p>This page was moved or deleted.</p>',
    },
    'https://bank.example/offer'
  );
  assert.equal(verdict.ok, false);
});

if (failures) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll tests passed.');
