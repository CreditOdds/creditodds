// Smoke tests for the ranking-image stat block in post-best-rankings.js.
//
// Guards the merchant-gate bug: a rate carrying `merchant_specific: true` or a
// non-empty `merchant_gate` covers only the merchants it names, not the whole
// spending category. The stat block used to render the Hilton Aspire's
// Hilton-only 14x as "14x HOTELS" — the same overstatement that shipped in the
// Intuit Business tweet as "5% on online shopping".
//
// Run: `node scripts/post-best-rankings.test.js`. Exits non-zero on failure.

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const {
  REWARD_LABELS,
  isMerchantGated,
  findTopReward,
  rewardStat,
  fitLabel,
  getCategoryStat,
} = require('./post-best-rankings.js');

const CARDS_DIR = path.join(__dirname, '..', 'data', 'cards');

const CATEGORIES = [
  'best-travel-cards',
  'best-airline-cards',
  'best-cash-back-cards',
  'best-dining-grocery-cards',
  'best-secured-cards',
];

function loadCard(slug) {
  return yaml.load(fs.readFileSync(path.join(CARDS_DIR, `${slug}.yaml`), 'utf8'));
}

function allCards() {
  return fs.readdirSync(CARDS_DIR)
    .filter(f => f.endsWith('.yaml'))
    .map(f => ({ file: f, card: yaml.load(fs.readFileSync(path.join(CARDS_DIR, f), 'utf8')) }));
}

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${err.message}`);
  }
}

console.log('isMerchantGated');

test('merchant_specific: true is gated', () => {
  assert.equal(isMerchantGated({ category: 'hotels', merchant_specific: true }), true);
});

test('a non-empty merchant_gate is gated', () => {
  assert.equal(isMerchantGated({ category: 'transit', merchant_gate: ['lyft'] }), true);
});

test('an empty merchant_gate is not gated', () => {
  assert.equal(isMerchantGated({ category: 'transit', merchant_gate: [] }), false);
});

console.log('\nfindTopReward');

test('a gated rate with no named merchants is skipped, not labeled', () => {
  // Apple Card's 3% online_shopping: merchant_specific with no gate slugs, so
  // there is no brand to name and no truthful short label.
  const top = findTopReward([
    { category: 'online_shopping', value: 3, unit: 'percent', merchant_specific: true },
    { category: 'dining', value: 2, unit: 'percent' },
  ]);
  assert.equal(top.category, 'dining');
});

test('a gated rate with named merchants keeps its place by value', () => {
  const top = findTopReward([
    { category: 'hotels', value: 14, unit: 'points_per_dollar', merchant_gate: ['hilton'] },
    { category: 'dining', value: 7, unit: 'points_per_dollar' },
  ]);
  assert.equal(top.category, 'hotels');
});

test('a card whose only rate is unlabelable yields no reward', () => {
  const top = findTopReward([
    { category: 'online_shopping', value: 3, unit: 'percent', merchant_specific: true },
  ]);
  assert.equal(top, null);
});

console.log('\nrewardStat');

test('a single gate is labeled with the store name, not the category', () => {
  const stat = rewardStat({
    category: 'hotels', value: 14, unit: 'points_per_dollar', merchant_gate: ['hilton'],
  });
  assert.deepEqual(stat, { value: '14x', label: 'HILTON' });
});

test('several gates read as "SELECT <category>"', () => {
  const stat = rewardStat({
    category: 'streaming', value: 10, unit: 'percent',
    merchant_gate: ['disney-plus', 'hulu', 'espn-plus'],
  });
  assert.deepEqual(stat, { value: '10%', label: 'SELECT STREAMING' });
});

test('an ungated rate keeps its category label', () => {
  const stat = rewardStat({ category: 'dining', value: 3, unit: 'points_per_dollar' });
  assert.deepEqual(stat, { value: '3x', label: 'DINING' });
});

test('an unknown gate slug falls back to the slug, not a category claim', () => {
  const stat = rewardStat({ category: 'hotels', value: 5, unit: 'percent', merchant_gate: ['some-new-brand'] });
  assert.equal(stat.label, 'SOME NEW BRAND');
});

console.log('\nfitLabel');

test('a long label drops trailing words instead of cutting mid-word', () => {
  assert.equal(fitLabel('AMERICAN AIRLINES'), 'AMERICAN');
  assert.equal(fitLabel('SOUTHWEST AIRLINES'), 'SOUTHWEST');
});

test('a label that fits is left alone', () => {
  assert.equal(fitLabel('UNITED AIRLINES'), 'UNITED AIRLINES');
  assert.equal(fitLabel('HILTON'), 'HILTON');
});

console.log('\ngetCategoryStat against real card YAML');

test('Hilton Aspire names Hilton rather than claiming all hotels', () => {
  const stat = getCategoryStat(loadCard('hilton-honors-american-express-aspire-card'), 'best-travel-cards');
  assert.deepEqual(stat, { value: '14x', label: 'HILTON' });
});

test('Ink Business Unlimited names Lyft rather than claiming all transit', () => {
  const stat = getCategoryStat(loadCard('chase-ink-business-unlimited'), 'best-cash-back-cards');
  assert.equal(stat.label, 'LYFT');
});

test('Sapphire Preferred skips its online-only grocery rate', () => {
  // The 3x groceries is gated to online grocers; dining is the ungated rate.
  const stat = getCategoryStat(loadCard('chase-sapphire-preferred'), 'best-dining-grocery-cards');
  assert.equal(stat.label, 'DINING');
});

test('no card renders a gated rate under a plain category label', () => {
  for (const { file, card } of allCards()) {
    const gated = (card.rewards || []).filter(isMerchantGated);
    if (gated.length === 0) continue;
    for (const categorySlug of CATEGORIES) {
      const stat = getCategoryStat(card, categorySlug);
      if (!stat) continue;
      for (const reward of gated) {
        const categoryLabels = [
          REWARD_LABELS[reward.category],
          String(reward.category).replace(/_/g, ' ').toUpperCase(),
        ].filter(Boolean);
        const sameRate = stat.value === `${reward.value}%` || stat.value === `${reward.value}x`;
        assert.ok(
          !(sameRate && categoryLabels.includes(stat.label)),
          `${file} [${categorySlug}] renders gated ${reward.category} as "${stat.value} ${stat.label}"`
        );
      }
    }
  }
});

test('every gated rate that survives selection is labeled by merchant', () => {
  for (const { file, card } of allCards()) {
    for (const categorySlug of CATEGORIES) {
      const rewards = card.rewards || [];
      const picked = findTopReward(rewards) || null;
      if (!picked || !isMerchantGated(picked)) continue;
      assert.ok(
        Array.isArray(picked.merchant_gate) && picked.merchant_gate.length > 0,
        `${file} [${categorySlug}] selected an unlabelable gated rate: ${picked.category}`
      );
    }
  }
});

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
