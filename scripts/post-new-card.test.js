// Smoke tests for the reward summarizer in post-new-card.js.
//
// Guards the merchant-gate bug: a rate carrying `merchant_specific: true` or a
// non-empty `merchant_gate` covers only the merchants in its `note`, not the
// whole spending category. The Intuit Business card's Intuit-products-only 5%
// was fed to the model as plain "5% online_shopping" and came back as "5%
// rewards on online shopping", which is wrong twice over: the 5% is not
// category-wide, and the card's real headline rate is the flat 2% that the old
// everything_else filter dropped from the summary entirely.
//
// Run: `node scripts/post-new-card.test.js`. Exits non-zero if any assertion fails.

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const {
  isMerchantGated,
  summarizeRewards,
  buildCardSummary,
} = require('./post-new-card.js');

const CARDS_DIR = path.join(__dirname, '..', 'data', 'cards');

function loadCard(slug) {
  return yaml.load(fs.readFileSync(path.join(CARDS_DIR, `${slug}.yaml`), 'utf8'));
}

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

console.log('isMerchantGated');

test('merchant_specific: true is gated', () => {
  assert.equal(isMerchantGated({ category: 'online_shopping', merchant_specific: true }), true);
});

test('non-empty merchant_gate is gated', () => {
  assert.equal(isMerchantGated({ category: 'transit', merchant_gate: ['lyft'] }), true);
});

test('empty merchant_gate is not gated', () => {
  assert.equal(isMerchantGated({ category: 'transit', merchant_gate: [] }), false);
});

test('a plain category rate is not gated', () => {
  assert.equal(isMerchantGated({ category: 'dining', value: 3, unit: 'percent' }), false);
});

console.log('\nsummarizeRewards');

test('a gated rate never lands in the ungated line', () => {
  const { ungated, gated } = summarizeRewards([
    { category: 'online_shopping', value: 5, unit: 'percent', merchant_specific: true, note: 'Intuit products' },
    { category: 'everything_else', value: 2, unit: 'percent' },
  ]);
  assert.ok(!/online shopping/.test(ungated), `gated category leaked into ungated: ${ungated}`);
  assert.equal(ungated, '2% on every purchase');
  assert.match(gated, /^5% in the online shopping category, limited to: Intuit products$/);
});

test('the flat everything_else rate survives as the headline', () => {
  // The old summarizer filtered everything_else out, so a card whose only
  // ungated rate is the flat one had no truthful rate left to quote.
  const { ungated } = summarizeRewards([{ category: 'everything_else', value: 2, unit: 'percent' }]);
  assert.equal(ungated, '2% on every purchase');
});

test('everything_else reads as "everything else" alongside bonus categories', () => {
  const { ungated } = summarizeRewards([
    { category: 'dining', value: 3, unit: 'percent' },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ]);
  assert.equal(ungated, '3% on dining, 1% on everything else');
});

test('a gated rate with no note is dropped, not guessed at', () => {
  const { ungated, gated } = summarizeRewards([
    { category: 'airlines', value: 3, unit: 'points', merchant_gate: ['united-airlines'] },
    { category: 'everything_else', value: 1, unit: 'points' },
  ]);
  assert.equal(gated, null);
  assert.ok(!/airlines/.test(ungated), `unscopable gated rate leaked: ${ungated}`);
});

test('ungated bonus categories are capped at the top three by value', () => {
  const { ungated } = summarizeRewards([
    { category: 'dining', value: 4, unit: 'percent' },
    { category: 'gas', value: 3, unit: 'percent' },
    { category: 'groceries', value: 5, unit: 'percent' },
    { category: 'transit', value: 2, unit: 'percent' },
  ]);
  assert.equal(ungated, '5% on groceries, 4% on dining, 3% on gas');
});

test('long notes are truncated so one reward cannot swamp the prompt', () => {
  const { gated } = summarizeRewards([
    { category: 'online_shopping', value: 5, unit: 'percent', merchant_specific: true, note: 'x'.repeat(400) },
  ]);
  assert.ok(gated.length < 220, `note not truncated: ${gated.length} chars`);
  assert.ok(gated.endsWith('…'));
});

test('points_per_dollar renders as x, the only unit points cards actually use', () => {
  // `points_per_dollar` is one of the schema's two units (the other is
  // `percent`); a bare `points` is not a value any card carries. Rendering the
  // raw unit fed the model "5points_per_dollar on travel portal".
  const { ungated, gated } = summarizeRewards([
    { category: 'travel_portal', value: 5, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
    { category: 'transit', value: 5, unit: 'points_per_dollar', merchant_gate: ['lyft'], note: 'On Lyft rides' },
  ]);
  assert.equal(ungated, '5x on travel portal, 1x on everything else');
  assert.match(gated, /^5x in the transit category/);
});

test('no card in data/cards renders a raw unit string', () => {
  for (const file of fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.yaml'))) {
    const card = yaml.load(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
    const { ungated, gated } = summarizeRewards(card.rewards);
    for (const line of [ungated, gated]) {
      assert.ok(
        !/points_per_dollar/.test(line || ''),
        `${file} leaked a raw unit into the prompt: ${line}`
      );
    }
  }
});

test('empty or missing rewards yield no lines', () => {
  assert.deepEqual(summarizeRewards([]), { ungated: null, gated: null });
  assert.deepEqual(summarizeRewards(undefined), { ungated: null, gated: null });
});

console.log('\nbuildCardSummary against real card YAML');

test('intuit-business leads with the flat 2%, quarantines the Intuit-only 5%', () => {
  const summary = buildCardSummary(loadCard('intuit-business'));
  assert.match(summary, /whole category named: 2% on every purchase/);
  assert.match(summary, /Conditional rates[^.]*5% in the online shopping category, limited to: Intuit products/);
  // The exact wording that shipped wrong: 5% presented as a category-wide rate.
  assert.ok(
    !/whole category named:[^.]*online shopping/.test(summary),
    `Intuit 5% still presented as a category rate:\n${summary}`
  );
});

test('apple-card scopes the 3% to its merchant list', () => {
  const summary = buildCardSummary(loadCard('apple-card'));
  assert.match(summary, /Conditional rates[^.]*3% in the online shopping category, limited to: Apple purchases/);
  assert.ok(
    !/whole category named:[^.]*online shopping/.test(summary),
    `Apple 3% still presented as a category rate:\n${summary}`
  );
});

test('chase-ink-business-unlimited scopes the Lyft 5% out of transit', () => {
  const summary = buildCardSummary(loadCard('chase-ink-business-unlimited'));
  assert.match(summary, /whole category named: 1\.5% on every purchase/);
  assert.match(summary, /Conditional rates[^.]*5% in the transit category, limited to: On Lyft rides/);
  assert.ok(
    !/whole category named:[^.]*transit/.test(summary),
    `Ink Lyft 5% still presented as a category rate:\n${summary}`
  );
});

test('no card in data/cards puts a gated rate in the ungated line', () => {
  const offenders = [];
  for (const file of fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.yaml'))) {
    const card = yaml.load(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
    const gatedCategories = (card.rewards || [])
      .filter(r => r && r.value && r.category && isMerchantGated(r))
      .map(r => String(r.category).replace(/_/g, ' '));
    if (gatedCategories.length === 0) continue;

    const { ungated } = summarizeRewards(card.rewards);
    if (!ungated) continue;
    // A gated category may still appear if the card ALSO has an ungated rate in
    // that same category, which is legitimate; compare against the gated rate's
    // own value to catch only the real leaks.
    for (const r of card.rewards.filter(x => x && x.value && isMerchantGated(x))) {
      const label = `${r.value}${r.unit === 'percent' ? '%' : 'x'} on ${String(r.category).replace(/_/g, ' ')}`;
      if (ungated.includes(label)) offenders.push(`${file}: "${label}"`);
    }
  }
  assert.deepEqual(offenders, [], `gated rates leaked into ungated copy:\n${offenders.join('\n')}`);
});

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
