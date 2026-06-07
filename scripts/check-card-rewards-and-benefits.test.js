// Smoke tests for the diff-suppression logic in
// check-card-rewards-and-benefits.js. Validates the two structural
// suppressions added to cut #1292-class noise:
//
//   1. Meta-category suppression (rotating / top_category / selected_categories)
//   2. Portal-family alias suppression (travel_portal / hotels_car_portal /
//      hotels_portal / car_rentals_portal / flights_portal)
//
// Run: `node scripts/check-card-rewards-and-benefits.test.js`. Exits non-zero
// if any assertion fails.

const assert = require('node:assert/strict');
const { diffRewards, collectMetaCoveredCategories } = require('./check-card-rewards-and-benefits');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\nMeta-category suppression:');

test('rotating: proposed eligible category is not flagged as added', () => {
  // Freedom Flex Q2 2026 rotation includes Amazon.
  const current = [
    {
      category: 'rotating', value: 5, unit: 'percent', mode: 'quarterly_rotating',
      current_categories: [{ category: 'amazon', note: 'Q2 2026' }],
    },
    { category: 'travel_portal', value: 5, unit: 'percent' },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const proposed = [
    { category: 'amazon', value: 5, unit: 'percent' },
    { category: 'travel_portal', value: 5, unit: 'percent' },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.added.length, 0, 'Amazon should be suppressed (covered by rotating)');
  assert.equal(diff.removed.length, 0, 'rotating should not be flagged as removed');
});

test('top_category: proposed eligible category is not flagged as added', () => {
  // Citi Custom Cash style — top_category covers a fixed list.
  const current = [
    {
      category: 'top_category', value: 5, unit: 'percent', mode: 'auto_top_spend',
      eligible_categories: ['dining', 'gas', 'groceries', 'travel', 'transit', 'streaming'],
    },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const proposed = [
    { category: 'dining', value: 5, unit: 'percent' },
    { category: 'gas', value: 5, unit: 'percent' },
    { category: 'groceries', value: 5, unit: 'percent' },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.added.length, 0, 'eligible categories should be suppressed');
  assert.equal(diff.removed.length, 0, 'top_category itself should not be flagged');
});

test('selected_categories: same suppression as top_category', () => {
  // Bilt Obsidian style — selected_categories with cardholder choice.
  const current = [
    {
      category: 'selected_categories', value: 3, unit: 'points_per_dollar',
      eligible_categories: ['dining', 'groceries'],
    },
    { category: 'travel', value: 2, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
  ];
  const proposed = [
    { category: 'dining', value: 3, unit: 'points_per_dollar' },
    { category: 'groceries', value: 1, unit: 'points_per_dollar' },
    { category: 'travel', value: 2, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.added.length, 0, 'dining/groceries covered by selected_categories');
  assert.equal(diff.removed.length, 0, 'selected_categories itself should not be flagged');
});

test('rotating with no current_categories list: meta-row still suppressed on removed side', () => {
  // Defensive: even if the meta-row has no covered list, the meta-row
  // itself must never be flagged as "removed" since apply pages never
  // advertise "rotating" as a category name.
  const current = [
    { category: 'rotating', value: 5, unit: 'percent', mode: 'quarterly_rotating' },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const proposed = [
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.removed.length, 0, 'rotating should not be flagged as removed');
});

console.log('\nPortal-family alias suppression:');

test('YAML has hotels_car_portal, LLM proposes travel_portal: no flag in either direction', () => {
  // Capital One Venture / Savor / VentureOne — common #1292 false positive.
  const current = [
    { category: 'hotels_car_portal', value: 5, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 2, unit: 'points_per_dollar' },
  ];
  const proposed = [
    { category: 'travel_portal', value: 5, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 2, unit: 'points_per_dollar' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.added.length, 0, 'travel_portal proposal should match hotels_car_portal');
  assert.equal(diff.removed.length, 0, 'hotels_car_portal should not be flagged as removed');
});

test('YAML has flights_portal + hotels_car_portal, LLM proposes single travel_portal: no flag', () => {
  // Venture X style: two separate portal rows in YAML, LLM compresses to one.
  const current = [
    { category: 'hotels_car_portal', value: 10, unit: 'points_per_dollar' },
    { category: 'flights_portal', value: 5, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 2, unit: 'points_per_dollar' },
  ];
  const proposed = [
    { category: 'travel_portal', value: 10, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 2, unit: 'points_per_dollar' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.added.length, 0, 'single travel_portal proposal absorbs both narrow rows');
  assert.equal(diff.removed.length, 0, 'narrow portal rows are not removed when sibling proposed');
});

test('No portal in YAML, LLM proposes travel_portal: still surfaced as new', () => {
  // Sanity: when YAML has zero portal-family rows, a fresh travel_portal
  // proposal should NOT be suppressed.
  const current = [
    { category: 'dining', value: 3, unit: 'percent' },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const proposed = [
    { category: 'travel_portal', value: 5, unit: 'percent' },
    { category: 'dining', value: 3, unit: 'percent' },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.added.length, 1, 'travel_portal should surface as new');
  assert.equal(diff.added[0].category, 'travel_portal');
});

console.log('\ncollectMetaCoveredCategories:');

test('returns null when no meta-rows', () => {
  const result = collectMetaCoveredCategories([
    { category: 'dining', value: 3 },
    { category: 'everything_else', value: 1 },
  ]);
  assert.equal(result, null);
});

test('flattens rotating + top_category covered lists', () => {
  const result = collectMetaCoveredCategories([
    {
      category: 'rotating',
      current_categories: [{ category: 'amazon' }, { category: 'gas' }],
    },
    {
      category: 'top_category',
      eligible_categories: ['dining', 'groceries'],
    },
    { category: 'everything_else', value: 1 },
  ]);
  assert.ok(result instanceof Set);
  assert.deepEqual([...result].sort(), ['amazon', 'dining', 'gas', 'groceries']);
});

console.log('\nCo-brand bundled "total miles" guard:');

test('United Club Infinite: 5x card row not bumped to bundled 11x total', () => {
  // Live page: "11x total miles on eligible United flights — 6x as a
  // MileagePlus member plus 5x from the card". YAML stores the card-only 5x.
  const current = [
    { category: 'airlines', value: 5, unit: 'points_per_dollar', note: 'United purchases' },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
  ];
  const proposed = [
    {
      category: 'airlines', value: 11, unit: 'points_per_dollar',
      note: '11x total miles on United flights (6x as a MileagePlus member plus 5x from the card)',
    },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.changed.length, 0, 'bundled 11x total should not be flagged as a change');
});

test('United Quest: 4x card row not bumped to bundled 10x total', () => {
  // Live page: "10x total miles — 6x as a MileagePlus member plus 4x with
  // the United Quest Card". YAML stores the card-only 4x.
  const current = [
    { category: 'airlines', value: 4, unit: 'points_per_dollar', note: 'United purchases' },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
  ];
  const proposed = [
    {
      category: 'airlines', value: 10, unit: 'points_per_dollar',
      note: '10x total miles (6x as a MileagePlus member plus 4x with the United Quest Card)',
    },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.changed.length, 0, 'bundled 10x total should not be flagged as a change');
});

test('Legit co-brand earn increase (no bundle language) still surfaces', () => {
  // If the card's OWN multiplier genuinely rises and the note carries no
  // member/total bundle language, the change must still be flagged.
  const current = [
    { category: 'airlines', value: 2, unit: 'points_per_dollar', note: 'United purchases' },
  ];
  const proposed = [
    { category: 'airlines', value: 3, unit: 'points_per_dollar', note: 'United purchases' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.changed.length, 1, 'a real card-only earn increase should be flagged');
  assert.equal(diff.changed[0].to.value, 3);
});

console.log('\nDone.\n');
