// Smoke tests for the tiered-bonus suppression in check-card-pages.js.
//
// These guard against two recurring Haiku misparses on tiered welcome offers
// stored under the headline-max convention (max in value/spend_requirement,
// tier breakdown in note):
//
//   1. TIER COLLAPSE — returns only the base tier, proposing value < stored max
//   2. OVERLAPPING-SPEND DOUBLE-COUNT — sums nested spend windows, proposing
//      spend_requirement > stored max (World of Hyatt: $3,000 step nested in
//      the $15,000 / 6-month window; rejected on PRs #1365, #1376)
//
// Run: `node scripts/check-card-pages.test.js`. Exits non-zero on any failure.

const assert = require('node:assert/strict');
const { detectChanges } = require('./check-card-pages');

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

function fieldsChanged(changes) {
  return changes.map(c => c.field).sort();
}

// ─── World of Hyatt (the regression this fix targets) ───────────────────────

const WORLD_OF_HYATT = {
  data: {
    name: 'World of Hyatt',
    signup_bonus: {
      value: 60000,
      type: 'points',
      spend_requirement: 15000,
      timeframe_months: 6,
      note: 'Earn 30,000 Bonus Points after you spend $3,000 on purchases in your first 3 months of account opening, plus up to 30,000 more Bonus Points by earning 2 Bonus Points total per $1 spent in the first 6 months from account opening on purchases that normally earn 1 Bonus Point, on up to $15,000 spent.',
    },
  },
};

console.log('\nWorld of Hyatt overlapping-spend double-count:');

test('spend_requirement 15000 → 18000 is suppressed (the #1365/#1376 false positive)', () => {
  const changes = detectChanges(WORLD_OF_HYATT, {
    signup_bonus: { value: 60000, spend_requirement: 18000, timeframe_months: 6 },
  });
  assert.deepEqual(fieldsChanged(changes), []);
});

test('"more" phrasing (not "additional") is recognized as tiered', () => {
  // Same offer, but Haiku also collapses the value to the base tier this run.
  const changes = detectChanges(WORLD_OF_HYATT, {
    signup_bonus: { value: 30000, spend_requirement: 3000, timeframe_months: 3 },
  });
  assert.deepEqual(fieldsChanged(changes), []);
});

// ─── Existing tier-collapse behavior must still hold ────────────────────────

const DELTA_GOLD = {
  data: {
    name: 'Amex Delta Gold',
    signup_bonus: {
      value: 90000,
      type: 'miles',
      spend_requirement: 5000,
      timeframe_months: 6,
      note: 'Earn 70,000 miles after $3,000 spend in first 6 months, plus an additional 20,000 miles after an additional $2,000 spent within the first 6 months.',
    },
  },
};

console.log('\nTier-collapse suppression (regression check):');

test('base-tier-only value downgrade 90000 → 70000 is suppressed', () => {
  const changes = detectChanges(DELTA_GOLD, {
    signup_bonus: { value: 70000, spend_requirement: 3000, timeframe_months: 6 },
  });
  assert.deepEqual(fieldsChanged(changes), []);
});

// ─── Legitimate changes must still surface ──────────────────────────────────

console.log('\nLegitimate changes still surface:');

test('non-tiered card: a real spend_requirement increase is NOT suppressed', () => {
  const card = {
    data: {
      name: 'Plain Card',
      signup_bonus: { value: 60000, type: 'points', spend_requirement: 4000, timeframe_months: 3, note: null },
    },
  };
  const changes = detectChanges(card, {
    signup_bonus: { value: 60000, spend_requirement: 5000, timeframe_months: 3 },
  });
  assert.deepEqual(fieldsChanged(changes), ['signup_bonus.spend_requirement']);
});

test('tiered card: a spend_requirement DECREASE still surfaces (only overcounts are suppressed)', () => {
  const changes = detectChanges(WORLD_OF_HYATT, {
    signup_bonus: { value: 60000, spend_requirement: 12000, timeframe_months: 6 },
  });
  assert.deepEqual(fieldsChanged(changes), ['signup_bonus.spend_requirement']);
});

test('tiered card: a genuine value INCREASE (offer got richer) still surfaces', () => {
  const changes = detectChanges(WORLD_OF_HYATT, {
    signup_bonus: { value: 65000, spend_requirement: 15000, timeframe_months: 6 },
  });
  assert.deepEqual(fieldsChanged(changes), ['signup_bonus.value']);
});

console.log('');
