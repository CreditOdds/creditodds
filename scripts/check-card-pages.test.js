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
const {
  detectChanges,
  needsBrowserRetry,
  updateSkipState,
  staleCardsFrom,
  SKIP_ALERT_THRESHOLD,
} = require('./check-card-pages');

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

// ─── Replaced offers must NOT be swallowed by the tiered guard ──────────────

// Capital One Venture Business: the tiered 75k + 75k offer ended 2026-06-08 and
// was replaced by a flat 100,000 / $10,000 / 3 months. The guard suppressed the
// whole signup_bonus block every run ("No changes") because the stale note still
// said "additional 75,000 miles" and 100,000 < 150,000.
const VENTURE_BUSINESS = {
  data: {
    name: 'Capital One Venture Business',
    signup_bonus: {
      value: 150000,
      type: 'miles',
      spend_requirement: 37500,
      timeframe_months: 6,
      note: 'Earn up to 75,000 miles once you spend $7,500 in the first 3 months and an additional 75,000 miles once you spend $30,000 in the first 6 months. Offer ends 2026-06-08.',
    },
  },
};

const LIVE_OFFER = { signup_bonus: { value: 100000, spend_requirement: 10000, timeframe_months: 3 } };
const AFTER_EXPIRY = new Date('2026-07-08T00:00:00Z');
const BEFORE_EXPIRY = new Date('2026-06-01T00:00:00Z');

console.log('\nReplaced-offer detection (stale tiered note):');

test('an expired "Offer ends" date disarms the tiered guard entirely', () => {
  const changes = detectChanges(VENTURE_BUSINESS, LIVE_OFFER, AFTER_EXPIRY);
  assert.deepEqual(fieldsChanged(changes), [
    'signup_bonus.spend_requirement',
    'signup_bonus.timeframe_months',
    'signup_bonus.value',
  ]);
  const value = changes.find(c => c.field === 'signup_bonus.value');
  assert.equal(value.old_value, 150000);
  assert.equal(value.new_value, 100000);
});

test('a value matching NO tier in the note surfaces even while the offer is live', () => {
  // Same card, evaluated a week before the stated end date: 100,000 appears
  // nowhere in the note (its tiers are 75,000 and 75,000), so it cannot be a
  // base-tier misparse.
  const changes = detectChanges(VENTURE_BUSINESS, LIVE_OFFER, BEFORE_EXPIRY);
  assert.deepEqual(fieldsChanged(changes), [
    'signup_bonus.spend_requirement',
    'signup_bonus.timeframe_months',
    'signup_bonus.value',
  ]);
});

test('a value matching a named tier is still suppressed before the end date', () => {
  // The genuine base-tier misparse this guard exists for: 75,000 IS in the note.
  const changes = detectChanges(
    VENTURE_BUSINESS,
    { signup_bonus: { value: 75000, spend_requirement: 7500, timeframe_months: 3 } },
    BEFORE_EXPIRY
  );
  assert.deepEqual(fieldsChanged(changes), []);
});

test('spend_requirement overcount is suppressed while live, surfaces once expired', () => {
  const overcount = { signup_bonus: { value: 150000, spend_requirement: 37501, timeframe_months: 6 } };
  assert.deepEqual(fieldsChanged(detectChanges(VENTURE_BUSINESS, overcount, BEFORE_EXPIRY)), []);
  assert.deepEqual(fieldsChanged(detectChanges(VENTURE_BUSINESS, overcount, AFTER_EXPIRY)), [
    'signup_bonus.spend_requirement',
  ]);
});

test('a note with no end date keeps the guard armed regardless of date', () => {
  assert.deepEqual(
    fieldsChanged(detectChanges(DELTA_GOLD, { signup_bonus: { value: 70000 } }, AFTER_EXPIRY)),
    []
  );
});

test('spend figures in the note are not mistaken for tier amounts', () => {
  // Hyatt's note contains "$3,000" and "$15,000" — neither is followed by a
  // reward unit, so a proposed value of 3000 must not read as a tier match.
  const changes = detectChanges(WORLD_OF_HYATT, {
    signup_bonus: { value: 3000, spend_requirement: 15000, timeframe_months: 6 },
  });
  assert.deepEqual(fieldsChanged(changes), ['signup_bonus.value']);
});

// ─── The live page overrules the stored note ────────────────────────────────

// The residual hole after the expiry + tier-value narrowings: a tiered note with
// NO end date whose replacement offer happens to equal a named tier. Hyatt's
// 30k + 30k collapsing to a flat 30,000 is, by value alone, identical to the
// base-tier misparse the guard exists to suppress. Only the page can settle it.

console.log('\nLive page overrules the stored note (offer_is_tiered):');

test('offer_is_tiered=false surfaces a change that lands exactly on a named tier', () => {
  const changes = detectChanges(WORLD_OF_HYATT, {
    signup_bonus: { value: 30000, spend_requirement: 3000, timeframe_months: 3, offer_is_tiered: false },
  });
  assert.deepEqual(fieldsChanged(changes), [
    'signup_bonus.note',
    'signup_bonus.spend_requirement',
    'signup_bonus.timeframe_months',
    'signup_bonus.value',
  ]);
});

test('offer_is_tiered=false retires the stale tier breakdown (note → null)', () => {
  const changes = detectChanges(WORLD_OF_HYATT, {
    signup_bonus: { value: 30000, spend_requirement: 3000, timeframe_months: 3, offer_is_tiered: false },
  });
  const note = changes.find(c => c.field === 'signup_bonus.note');
  assert.equal(note.new_value, null);
  assert.equal(note.old_value, WORLD_OF_HYATT.data.signup_bonus.note);
});

test("offer_is_tiered=false prefers the extractor's replacement note over deletion", () => {
  const changes = detectChanges(WORLD_OF_HYATT, {
    signup_bonus: {
      value: 30000,
      spend_requirement: 3000,
      timeframe_months: 3,
      offer_is_tiered: false,
      bonus_note: 'Plus $300 Bilt Cash as a signup bonus',
    },
  });
  const note = changes.find(c => c.field === 'signup_bonus.note');
  assert.equal(note.new_value, 'Plus $300 Bilt Cash as a signup bonus');
});

test('offer_is_tiered=true keeps the guard armed (the #1365/#1376 false positive)', () => {
  const changes = detectChanges(WORLD_OF_HYATT, {
    signup_bonus: { value: 60000, spend_requirement: 18000, timeframe_months: 6, offer_is_tiered: true },
  });
  assert.deepEqual(fieldsChanged(changes), []);
});

test('offer_is_tiered omitted (null) falls back to the note heuristics', () => {
  // Unchanged behavior for a model that declines to judge: base-tier collapse
  // still suppressed, and no note is retired.
  const changes = detectChanges(WORLD_OF_HYATT, {
    signup_bonus: { value: 30000, spend_requirement: 3000, timeframe_months: 3, offer_is_tiered: null },
  });
  assert.deepEqual(fieldsChanged(changes), []);
});

test('a flat page does not retire a note on a card whose note was never tiered', () => {
  const card = {
    data: {
      name: 'Bilt',
      signup_bonus: { value: 60000, type: 'points', spend_requirement: 3000, timeframe_months: 3, note: 'Plus $300 Bilt Cash as a signup bonus' },
    },
  };
  const changes = detectChanges(card, {
    signup_bonus: { value: 60000, spend_requirement: 3000, timeframe_months: 3, offer_is_tiered: false },
  });
  assert.deepEqual(fieldsChanged(changes), []);
});

test('check_ignore on signup_bonus.note blocks stale-note retirement', () => {
  const ignored = {
    data: { ...WORLD_OF_HYATT.data, check_ignore: ['signup_bonus.note'] },
  };
  const changes = detectChanges(ignored, {
    signup_bonus: { value: 30000, spend_requirement: 3000, timeframe_months: 3, offer_is_tiered: false },
  });
  assert.ok(!fieldsChanged(changes).includes('signup_bonus.note'));
  assert.ok(fieldsChanged(changes).includes('signup_bonus.value'));
});

// ─── Suppressions are recorded, never silent ────────────────────────────────

console.log('\nSuppressions are recorded:');

test('a suppressed tier collapse is appended to the suppressions out-param', () => {
  const suppressions = [];
  detectChanges(
    WORLD_OF_HYATT,
    { signup_bonus: { value: 30000, spend_requirement: 3000, timeframe_months: 3, offer_is_tiered: true } },
    new Date('2026-07-08T00:00:00Z'),
    suppressions
  );
  assert.equal(suppressions.length, 1);
  assert.equal(suppressions[0].guard, 'tier-collapse');
  assert.equal(suppressions[0].card_name, 'World of Hyatt');
  assert.equal(suppressions[0].page_says_tiered, true);
});

test('a suppression with no page verdict records page_says_tiered=unknown', () => {
  const suppressions = [];
  detectChanges(DELTA_GOLD, { signup_bonus: { value: 70000 } }, new Date('2026-07-08T00:00:00Z'), suppressions);
  assert.equal(suppressions[0].page_says_tiered, 'unknown');
});

test('a run with nothing suppressed records nothing', () => {
  const suppressions = [];
  detectChanges(WORLD_OF_HYATT, { signup_bonus: { value: 65000 } }, new Date(), suppressions);
  assert.deepEqual(suppressions, []);
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

// ─── signup_bonus.timeframe_months: days-as-months misread ──────────────────

// Wyndham Earner Business pattern: the 100k offer's second tier runs 180 days.
// Haiku returned timeframe_months: 180 (raw days) on #1426; the real value is 6.
const TIERED_180_DAYS = {
  data: {
    name: 'Wyndham Rewards Earner Business',
    signup_bonus: { value: 100000, type: 'points', spend_requirement: 3500, timeframe_months: 6, note: null },
  },
};

console.log('\nsignup_bonus timeframe days-as-months misread:');

test('extracted 180 (days) normalizes to 6 months — no change when YAML already 6', () => {
  const changes = detectChanges(TIERED_180_DAYS, {
    signup_bonus: { value: 100000, spend_requirement: 3500, timeframe_months: 180 },
  });
  assert.deepEqual(fieldsChanged(changes), []);
});

test('a real timeframe change stated in days (90→ proposes 6 months) surfaces with the converted value', () => {
  const card = {
    data: { name: 'Plain Card', signup_bonus: { value: 60000, type: 'points', spend_requirement: 3000, timeframe_months: 3, note: null } },
  };
  // Issuer moved the window to 180 days; Haiku returns 180, current is 3 months.
  const changes = detectChanges(card, {
    signup_bonus: { value: 60000, spend_requirement: 3000, timeframe_months: 180 },
  });
  assert.deepEqual(fieldsChanged(changes), ['signup_bonus.timeframe_months']);
  const ch = changes.find(c => c.field === 'signup_bonus.timeframe_months');
  assert.equal(ch.new_value, 6); // converted from 180 days, NOT 180
});

test('a normal months value (≤24) is left untouched', () => {
  const card = {
    data: { name: 'Plain Card', signup_bonus: { value: 60000, type: 'points', spend_requirement: 3000, timeframe_months: 3, note: null } },
  };
  const changes = detectChanges(card, {
    signup_bonus: { value: 60000, spend_requirement: 3000, timeframe_months: 4 },
  });
  const ch = changes.find(c => c.field === 'signup_bonus.timeframe_months');
  assert.equal(ch.new_value, 4);
});

console.log('');
// ─── Browser retry when the page hides the welcome offer ────────────────────

// Amex's Delta business pages render the fee server-side and the welcome offer
// client-side ("Welcome Offer & Key Details … Loading"). The fee made the
// extraction look non-empty, so the browser retry never fired and the extractor
// returned value: 0 for the placeholder — proposing 90,000 → 0 (caught on #1589).
console.log('\nBrowser retry on a missing signup-bonus signal:');

const HAS_SUB = { value: 90000, type: 'miles', spend_requirement: 6000, timeframe_months: 6 };

test('fee extracted but bonus value 0 → retry (the Delta Gold Business case)', () => {
  const extracted = { annual_fee: 150, signup_bonus: { value: 0, spend_requirement: null } };
  assert.equal(needsBrowserRetry(extracted, HAS_SUB), true);
});

test('fee extracted but bonus value null → retry', () => {
  const extracted = { annual_fee: 150, signup_bonus: { value: null } };
  assert.equal(needsBrowserRetry(extracted, HAS_SUB), true);
});

test('a real bonus value → no retry', () => {
  const extracted = { annual_fee: 150, signup_bonus: { value: 90000 } };
  assert.equal(needsBrowserRetry(extracted, HAS_SUB), false);
});

test('a card that stores no bonus never triggers the bonus-signal retry', () => {
  const extracted = { annual_fee: 95, signup_bonus: { value: null } };
  assert.equal(needsBrowserRetry(extracted, undefined), false);
  assert.equal(needsBrowserRetry(extracted, { value: 0 }), false);
});

test('a wholly empty extraction still retries (existing citi.com behavior)', () => {
  assert.equal(needsBrowserRetry({ annual_fee: null, signup_bonus: { value: null } }, HAS_SUB), true);
  assert.equal(needsBrowserRetry(null, undefined), true);
});

test('a browser-rendered zero is NOT suppressed downstream (Amazon Store, #1579)', () => {
  // needsBrowserRetry only forces a second look; a genuine 0 must still surface.
  const card = { data: { name: 'Amazon Store', signup_bonus: { value: 60, type: 'cash', note: null } } };
  const changes = detectChanges(card, { signup_bonus: { value: 0 } });
  assert.deepEqual(fieldsChanged(changes), ['signup_bonus.value']);
});

// ─── Consecutive-skip tracking ───────────────────────────────────────────────
//
// A skipped card produces no changes, exactly like a card whose terms are
// unchanged. These guard the state machine that tells the two apart across runs.

const AT = '2026-07-08T11:00:00.000Z';
const skip = (slug, reason = 'HTTP 400', knownBlock = false) => ({ slug, reason, knownBlock });
const fold = (prev, checked, skipped, opts = {}) =>
  updateSkipState(prev, {
    checkedSlugs: new Set(checked),
    skippedCards: skipped,
    checkedAt: AT,
    isPartialRun: false,
    ...opts,
  });

test('a skipped card increments; a verified card resets to zero', () => {
  const after = fold({ a: { consecutive_skips: 2 }, b: { consecutive_skips: 4 } }, ['a', 'b'], [skip('a')]);
  assert.equal(after.a.consecutive_skips, 3);
  assert.equal(after.a.last_reason, 'HTTP 400');
  assert.equal(after.b.consecutive_skips, 0, 'a successful check must clear the counter');
  assert.equal(after.b.last_ok, AT);
});

test('a verified card keeps no stale skip reason', () => {
  const after = fold({ a: { consecutive_skips: 9, last_reason: 'HTTP 400' } }, ['a'], []);
  assert.equal(after.a.consecutive_skips, 0);
  assert.equal(after.a.last_reason, undefined);
});

test('reaching the threshold marks a card stale; below it does not', () => {
  const below = fold({ a: { consecutive_skips: SKIP_ALERT_THRESHOLD - 2 } }, ['a'], [skip('a')]);
  assert.deepEqual(staleCardsFrom(below), [], 'must not alarm before the threshold');

  const at = fold({ a: { consecutive_skips: SKIP_ALERT_THRESHOLD - 1 } }, ['a'], [skip('a')]);
  assert.deepEqual(staleCardsFrom(at).map(c => c.slug), ['a']);
});

test('known bot-blocks never alarm, however long they persist', () => {
  // pnc.com is a deliberate, permanent skip — counting it would pin the alarm on.
  const after = fold({ pnc: { consecutive_skips: 99 } }, ['pnc'], [skip('pnc', 'known block: akamai', true)]);
  assert.equal(after.pnc.consecutive_skips, 100);
  assert.deepEqual(staleCardsFrom(after), []);
});

test('a full run prunes cards that no longer exist', () => {
  const after = fold({ gone: { consecutive_skips: 7 }, a: { consecutive_skips: 0 } }, ['a'], []);
  assert.deepEqual(Object.keys(after), ['a'], 'a renamed slug must not alarm forever');
});

test('a single-card run leaves every other card untouched', () => {
  // The regression that would silently disarm the alarm: CARD_SLUG=a wiping b's
  // accumulated history, resetting a rotting card to zero every time.
  const prev = { a: { consecutive_skips: 1 }, b: { consecutive_skips: SKIP_ALERT_THRESHOLD } };
  const after = fold(prev, ['a'], [skip('a')], { isPartialRun: true });
  assert.equal(after.a.consecutive_skips, 2);
  assert.deepEqual(after.b, prev.b, 'untouched card must keep its counter');
  assert.deepEqual(staleCardsFrom(after).map(c => c.slug), ['b']);
});

test('stale cards are reported worst-first', () => {
  const state = {
    mild: { consecutive_skips: SKIP_ALERT_THRESHOLD },
    severe: { consecutive_skips: SKIP_ALERT_THRESHOLD + 10 },
  };
  assert.deepEqual(staleCardsFrom(state).map(c => c.slug), ['severe', 'mild']);
});

test('the Fidelity case: a dead offer page alarms after the threshold', () => {
  let state = {};
  for (let run = 1; run <= SKIP_ALERT_THRESHOLD; run++) {
    state = fold(state, ['fidelity', 'chase'], [skip('fidelity', 'HTTP 400 from origin')]);
    const stale = staleCardsFrom(state).map(c => c.slug);
    if (run < SKIP_ALERT_THRESHOLD) assert.deepEqual(stale, [], `run ${run} should stay quiet`);
    else assert.deepEqual(stale, ['fidelity'], `run ${run} must alarm`);
  }
  assert.equal(state.chase.consecutive_skips, 0, 'healthy cards stay green throughout');
});

console.log('');
