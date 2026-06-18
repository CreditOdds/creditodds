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

// ─── Intro APR detection ────────────────────────────────────────────────────

const SHIELD = {
  data: {
    name: 'US Bank Shield',
    apr: {
      purchase_intro: { rate: 0, months: 24 },
      balance_transfer_intro: { rate: 0, months: 24 },
      regular: { min: 16.99, max: 27.99 },
    },
  },
};

console.log('\nIntro APR detection:');

test('a shortened intro APR (24 → 21) surfaces on both purchase and BT', () => {
  const changes = detectChanges(SHIELD, {
    apr: { purchase_intro_months: 21, balance_transfer_intro_months: 21 },
  });
  assert.deepEqual(fieldsChanged(changes), [
    'apr.balance_transfer_intro.months',
    'apr.purchase_intro.months',
  ]);
  const purchase = changes.find(c => c.field === 'apr.purchase_intro.months');
  assert.equal(purchase.old_value, 24);
  assert.equal(purchase.new_value, 21);
});

test('an unchanged intro APR produces no change', () => {
  const changes = detectChanges(SHIELD, {
    apr: { purchase_intro_months: 24, balance_transfer_intro_months: 24 },
  });
  assert.deepEqual(fieldsChanged(changes), []);
});

test('a null intro months (page wording Haiku could not parse) never erases a real value', () => {
  const changes = detectChanges(SHIELD, {
    apr: { purchase_intro_months: null, balance_transfer_intro_months: null },
  });
  assert.deepEqual(fieldsChanged(changes), []);
});

test('a card with no apr block is never given an invented intro offer', () => {
  const noApr = { data: { name: 'No APR Card' } };
  const changes = detectChanges(noApr, {
    apr: { purchase_intro_months: 18, balance_transfer_intro_months: 18 },
  });
  assert.deepEqual(fieldsChanged(changes), []);
});

test('check_ignore suppresses an intro APR field', () => {
  const ignored = {
    data: {
      ...SHIELD.data,
      check_ignore: ['apr.purchase_intro.months'],
    },
  };
  const changes = detectChanges(ignored, {
    apr: { purchase_intro_months: 21, balance_transfer_intro_months: 21 },
  });
  assert.deepEqual(fieldsChanged(changes), ['apr.balance_transfer_intro.months']);
});

// ─── annual_fee: first-year-waiver misread + check_ignore ───────────────────

// Citi AAdvantage pattern: ongoing $99, waived the first 12 months. The fee is
// JS-rendered, so Haiku reads the waiver and returns 0 (#1413/#1434).
const CITI_AADVANTAGE = {
  data: {
    name: 'Citi AAdvantage Platinum Select',
    annual_fee: 99,
    annual_fee_intro: { value: 0, months: 12 },
  },
};

console.log('\nannual_fee first-year-waiver misread:');

test('extracted annual_fee matching the intro waiver (99 → 0) is suppressed', () => {
  const changes = detectChanges(CITI_AADVANTAGE, { annual_fee: 0 });
  assert.deepEqual(fieldsChanged(changes), []);
});

test('a real ongoing-fee change on a waiver card (99 → 149) still surfaces', () => {
  const changes = detectChanges(CITI_AADVANTAGE, { annual_fee: 149 });
  assert.deepEqual(fieldsChanged(changes), ['annual_fee']);
});

test('a normal card (no waiver) still surfaces a genuine annual_fee change', () => {
  const plain = { data: { name: 'Plain Card', annual_fee: 95 } };
  const changes = detectChanges(plain, { annual_fee: 99 });
  assert.deepEqual(fieldsChanged(changes), ['annual_fee']);
});

test('check_ignore suppresses annual_fee (Atmos split per-card fee)', () => {
  const atmos = {
    data: { name: 'Atmos Rewards Business', annual_fee: 95, check_ignore: ['annual_fee'] },
  };
  const changes = detectChanges(atmos, { annual_fee: 70 });
  assert.deepEqual(fieldsChanged(changes), []);
});

console.log('');
