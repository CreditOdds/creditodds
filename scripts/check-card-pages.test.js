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
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  detectChanges,
  needsBrowserRetry,
  normalizeBonusType,
  pageShowsSignupOffer,
  updateSkipState,
  resolveSkipState,
  readSkipStateFromMain,
  staleCardsFrom,
  isTransientNetworkError,
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

// #1830 (closed 2026-07-30): a bonus for adding an employee card reads as
// "10,000 additional miles", the same phrasing the tier regex hunts for. Chase
// advertises no spend tiers on either United business card, so the extractor
// correctly said offer_is_tiered:false and the retirement branch proposed
// erasing two accurate notes. Merging would have understated both offers by
// 10,000 miles and 2,000 PQP.
const UNITED_BUSINESS = {
  data: {
    name: 'United Business',
    signup_bonus: {
      value: 100000,
      type: 'miles',
      spend_requirement: 5000,
      timeframe_months: 3,
      note:
        'Plus 2,000 Premier qualifying points on meeting the spend requirement, and 10,000 additional miles for adding an employee card in the first 3 months',
    },
  },
};
const UNITED_LIVE_PAGE =
  'Earn 100,000 bonus miles + 2,000 PQP after you spend $5,000 on purchases in the first 3 months your account is open. ' +
  'Earn 10,000 bonus miles after you add an employee card in the first 3 months. welcome offer';

test('an employee-card bonus is not a tier: the note survives a flat page', () => {
  const changes = detectChanges(
    UNITED_BUSINESS,
    {
      signup_bonus: {
        value: 100000,
        spend_requirement: 5000,
        timeframe_months: 3,
        type: 'miles',
        bonus_note: null,
        offer_is_tiered: false,
      },
    },
    new Date('2026-07-29'),
    [],
    UNITED_LIVE_PAGE
  );
  assert.deepEqual(changes, [], `expected no changes, got ${JSON.stringify(changes)}`);
});

test('an authorized-user bonus is not a tier either', () => {
  const card = {
    data: {
      name: 'Some Card',
      signup_bonus: {
        value: 60000,
        type: 'points',
        spend_requirement: 4000,
        timeframe_months: 3,
        note: 'Plus 15,000 additional points for adding an authorized user in the first 3 months',
      },
    },
  };
  const changes = detectChanges(
    card,
    {
      signup_bonus: {
        value: 60000,
        spend_requirement: 4000,
        timeframe_months: 3,
        type: 'points',
        bonus_note: null,
        offer_is_tiered: false,
      },
    },
    new Date('2026-07-29'),
    [],
    'Earn 60,000 bonus points after you spend $4,000 in the first 3 months. welcome offer bonus points'
  );
  const note = changes.find(c => c.field === 'signup_bonus.note');
  assert.equal(note, undefined, 'an AU-bonus note must not be retired as a stale tier');
});

test('a real tier alongside an employee-card bonus still counts as tiered', () => {
  const card = {
    data: {
      name: 'Hybrid Card',
      signup_bonus: {
        value: 135000,
        type: 'points',
        spend_requirement: 6000,
        timeframe_months: 6,
        note:
          'Earn 85,000 points after $6,000 in purchases, plus an additional 50,000 points after an additional $3,000 in purchases, and 10,000 additional points for adding an employee card',
      },
    },
  };
  const suppressions = [];
  detectChanges(
    card,
    {
      signup_bonus: { value: 50000, spend_requirement: 6000, timeframe_months: 6, type: 'points', offer_is_tiered: null },
    },
    new Date('2026-07-29'),
    suppressions,
    'Earn 85,000 bonus points welcome offer'
  );
  assert.equal(suppressions.length, 1, 'stripping the employee-card clause must not disarm a genuine tier');
  assert.equal(suppressions[0].guard, 'tier-collapse');
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

// ─── offer_is_tiered:false is only trusted from a rendered offer page ────────

// The 4 Amex cards on #1598: the welcome offer is JS/API-gated and never renders
// (verified — absent even after a full browser fetch). The extractor echoes the
// stored value and defaults offer_is_tiered:false; without a page-render check
// that deletes a live tiered note. The offer BODY ("after you spend $X") is the
// trustworthy signal; the "Welcome Offer" header is not (Amex ships it with a
// "Loading" body).
console.log('\noffer_is_tiered:false requires a rendered offer page:');

const AMEX_EARN_ONLY = 'Rewards Earn 3X Miles on Delta Purchases. Earn 2X Miles at restaurants. Earn 1X Miles on all other eligible purchases. Welcome Offer Key Details Loading Loading';
const RENDERED_FLAT_OFFER = 'Limited Time Offer. Earn 30,000 bonus points after you spend $3,000 on purchases in the first 3 months from account opening.';

test('de-tiering is NOT trusted when the page never rendered the offer (#1598 Amex)', () => {
  // Echoed value (== stored) + offer_is_tiered:false, but only earn-rate copy.
  const changes = detectChanges(
    WORLD_OF_HYATT,
    { signup_bonus: { value: 60000, spend_requirement: 15000, timeframe_months: 6, offer_is_tiered: false } },
    new Date(), [], AMEX_EARN_ONLY,
  );
  assert.deepEqual(fieldsChanged(changes), []); // note NOT retired; no phantom change
});

test('de-tiering IS trusted when the offer body rendered ("after you spend $X")', () => {
  const changes = detectChanges(
    WORLD_OF_HYATT,
    { signup_bonus: { value: 30000, spend_requirement: 3000, timeframe_months: 3, offer_is_tiered: false } },
    new Date(), [], RENDERED_FLAT_OFFER,
  );
  const note = changes.find(c => c.field === 'signup_bonus.note');
  assert.equal(note && note.new_value, null); // stale tier note retired
});

test('no pageContent (unit-test / legacy call) keeps prior behavior', () => {
  const changes = detectChanges(WORLD_OF_HYATT, {
    signup_bonus: { value: 30000, spend_requirement: 3000, timeframe_months: 3, offer_is_tiered: false },
  });
  assert.ok(fieldsChanged(changes).includes('signup_bonus.note'));
});

test('pageShowsSignupOffer: spend language must anchor to a new-account window', () => {
  // Real offer bodies — spend + first-N-months window nearby (issuer wordings)
  assert.equal(pageShowsSignupOffer('Earn 140,000 Bonus Points after spending $4,000 in the first 3 months from account opening'), true);
  assert.equal(pageShowsSignupOffer('bonus miles after $ 500 in purchases in the first 3 months'), true); // Citi spacing
  assert.equal(pageShowsSignupOffer('after you make $6,000 in purchases within the first 6 months of Card Membership'), true);
  assert.equal(pageShowsSignupOffer('after you make $4,000 or more in purchases within the first 90 days of opening your account'), true); // BofA
  assert.equal(pageShowsSignupOffer('after you spend $6,000 in purchases within your first six months of Card Membership'), true); // spelled-out count
  // Not offers
  assert.equal(pageShowsSignupOffer('Earn 3X Miles. Welcome Offer Key Details Loading'), false); // header only
  assert.equal(pageShowsSignupOffer('0% intro APR for the first 15 months on purchases'), false); // window without spend
  assert.equal(pageShowsSignupOffer(null), true); // unknown → present (back-compat)
});

test('pageShowsSignupOffer: BENEFIT spend thresholds do not count (#1613 Marriott)', () => {
  // Verbatim from the 2026-07-10 run's fetched text — these defeated the spend-only gate.
  const BEVY_BENEFIT = 'nvoy Bevy Free Night Award benefit, Card Members can earn 1 Free Night Award after spending $15,000 on eligible purchases with their Marriott Bonvoy Bevy card in a calendar year';
  const BRILLIANT_BENEFIT = 'Each calendar year after spending $60,000 on eligible purchases on your Marriott Bonvoy Brilliant Card, Card Members are eligible for Ambassador Elite status';
  assert.equal(pageShowsSignupOffer(BEVY_BENEFIT), false);
  assert.equal(pageShowsSignupOffer(BRILLIANT_BENEFIT), false);
  // And the same page with a genuinely rendered offer still passes
  const BRILLIANT_WITH_OFFER = BRILLIANT_BENEFIT + ' Card Member Offer: Earn 100,000 Marriott Bonvoy bonus points after you use your new Card to make $6,000 in purchases within the first 6 months of Card Membership.';
  assert.equal(pageShowsSignupOffer(BRILLIANT_WITH_OFFER), true);
});

test('de-tiering is NOT trusted when only benefit spend text rendered (#1613 end-to-end)', () => {
  // Echoed value + offer_is_tiered:false + benefit-only page → no note deletion.
  const bevyBody = 'Earn 6X points at hotels. Card Members can earn 1 Free Night Award after spending $15,000 on eligible purchases in a calendar year. Welcome Offer Key Details';
  const card = {
    data: {
      name: 'Marriott Bonvoy Bevy',
      signup_bonus: { value: 135000, type: 'points', spend_requirement: 7000, timeframe_months: 6, note: 'Earn 85,000 Marriott Bonvoy bonus points after $5,000 in purchases within first 6 months, plus an additional 50,000 bonus points after an additional $2,000 in purchases within first 6 months of Card Membership.' },
    },
  };
  const changes = detectChanges(
    card,
    { signup_bonus: { value: 135000, spend_requirement: 7000, timeframe_months: 6, bonus_note: null, offer_is_tiered: false } },
    new Date(), [], bevyBody,
  );
  assert.deepEqual(fieldsChanged(changes), []);
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

// ─── signup_bonus additions on a card that stores no block ──────────────────
//
// Before this path existed the diff required `current.signup_bonus`, so a card
// that had never carried an offer could never gain one — Marriott Bonvoy Bold's
// live 60,000-point offer was invisible on every run.

const NO_BONUS = { data: { name: 'Marriott Bonvoy Bold', annual_fee: 0 } };

// pageShowsSignupOffer(null) returns true, so tests that don't care about the
// rendered-page gate can omit pageContent. This one exercises the gate directly.
const BOLD_OFFER_PAGE =
  'Earn 60,000 bonus points after you spend $1,000 on purchases in your first 3 months from account opening.';

console.log('\nsignup_bonus additions (card stores no signup_bonus):');

test('a new offer on a card with no signup_bonus block surfaces every subfield', () => {
  const changes = detectChanges(
    NO_BONUS,
    {
      signup_bonus: { value: 60000, type: 'points', spend_requirement: 1000, timeframe_months: 3 },
    },
    new Date(),
    [],
    BOLD_OFFER_PAGE
  );
  assert.deepEqual(fieldsChanged(changes), [
    'signup_bonus.spend_requirement',
    'signup_bonus.timeframe_months',
    'signup_bonus.type',
    'signup_bonus.value',
  ]);
  const value = changes.find(c => c.field === 'signup_bonus.value');
  assert.equal(value.old_value, null);
  assert.equal(value.new_value, 60000);
});

test('subfields the page did not state are left out rather than written as null', () => {
  const changes = detectChanges(NO_BONUS, {
    signup_bonus: { value: 100, type: 'cashback', spend_requirement: null, timeframe_months: null },
  });
  assert.deepEqual(fieldsChanged(changes), ['signup_bonus.type', 'signup_bonus.value']);
  // "cashback" is the prompt's spelling; YAML stores "cash".
  assert.equal(changes.find(c => c.field === 'signup_bonus.type').new_value, 'cash');
});

test('a page with no rendered offer body cannot manufacture a block', () => {
  const changes = detectChanges(
    NO_BONUS,
    { signup_bonus: { value: 60000, type: 'points' } },
    new Date(),
    [],
    'Earn 3X points at restaurants. Welcome Offer Loading...'
  );
  assert.deepEqual(fieldsChanged(changes), []);
});

test('value 0 or null means "still no public offer", not an addition', () => {
  for (const value of [0, null, undefined]) {
    const changes = detectChanges(NO_BONUS, {
      signup_bonus: { value, type: 'points', spend_requirement: 1000, timeframe_months: 3 },
    });
    assert.deepEqual(fieldsChanged(changes), [], `value ${value} should add nothing`);
  }
});

test('an addition with no type is rejected — the unit is not inferable', () => {
  const changes = detectChanges(NO_BONUS, {
    signup_bonus: { value: 60000, type: null, spend_requirement: 1000 },
  });
  assert.deepEqual(fieldsChanged(changes), []);
});

test('an authorized-user bonus becomes the templated note', () => {
  const changes = detectChanges(NO_BONUS, {
    signup_bonus: { value: 60000, type: 'points', authorized_user_bonus: 10000 },
  });
  assert.equal(
    changes.find(c => c.field === 'signup_bonus.note').new_value,
    'Plus 10,000 bonus points for adding an authorized user'
  );
});

test('a raw day count is converted to months on the way in', () => {
  const changes = detectChanges(NO_BONUS, {
    signup_bonus: { value: 60000, type: 'points', spend_requirement: 1000, timeframe_months: 90 },
  });
  assert.equal(changes.find(c => c.field === 'signup_bonus.timeframe_months').new_value, 3);
});

test('check_ignore: "signup_bonus" opts a card out of additions entirely', () => {
  const ignored = { data: { ...NO_BONUS.data, check_ignore: ['signup_bonus'] } };
  const changes = detectChanges(ignored, {
    signup_bonus: { value: 60000, type: 'points', spend_requirement: 1000 },
  });
  assert.deepEqual(fieldsChanged(changes), []);
});

test('a card that already stores a signup_bonus still takes the update path', () => {
  const changes = detectChanges(WORLD_OF_HYATT, {
    signup_bonus: { value: 60000, spend_requirement: 15000, timeframe_months: 6 },
  });
  assert.deepEqual(fieldsChanged(changes), []);
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
// ─── signup_bonus.type: unit switches, through the cash/cashback alias ──────

// type went undiffed entirely until this section existed, so a bonus converting
// from cashback to points (or free nights to points, as Marriott Bonvoy
// Boundless actually did) never surfaced. The blocker was vocabulary: the
// extraction prompt says "cashback", YAML says "cash" on 36 cards, so a naive
// diff proposes a phantom change on every cash-back card. normalizeBonusType
// collapses that pair; everything else compares straight.

// A page whose offer body actually rendered — pageShowsSignupOffer gates the
// type diff, so the JS-gated case has to be tested separately.
const OFFER_PAGE =
  'Earn 60,000 bonus points after you spend $4,000 on purchases in the first 3 months from account opening.';

function typedCard(type, extra = {}) {
  return {
    data: {
      name: 'Type Test',
      signup_bonus: { value: 60000, type, spend_requirement: 4000, timeframe_months: 3, note: null, ...extra },
    },
  };
}

function typedExtract(type, extra = {}) {
  return {
    signup_bonus: { value: 60000, type, spend_requirement: 4000, timeframe_months: 3, ...extra },
  };
}

function typeChange(card, extracted, page = OFFER_PAGE) {
  return detectChanges(card, extracted, new Date(), [], page).find(c => c.field === 'signup_bonus.type');
}

console.log('\nsignup_bonus.type normalization:');

test('cash → cashback is NOT a change (the phantom that kept type undiffed)', () => {
  assert.equal(typeChange(typedCard('cash'), typedExtract('cashback')), undefined);
});

test('cashback → cash is NOT a change either (alias is symmetric)', () => {
  assert.equal(typeChange(typedCard('cashback'), typedExtract('cash')), undefined);
});

test('the alias is case- and whitespace-insensitive', () => {
  assert.equal(typeChange(typedCard('cash'), typedExtract('  CashBack ')), undefined);
});

test('normalizeBonusType collapses only the cash pair', () => {
  assert.equal(normalizeBonusType('cashback'), 'cash');
  assert.equal(normalizeBonusType('cash'), 'cash');
  assert.equal(normalizeBonusType('points'), 'points');
  assert.equal(normalizeBonusType('miles'), 'miles');
  assert.equal(normalizeBonusType('free_nights'), 'free_nights');
  assert.equal(normalizeBonusType(null), null);
  assert.equal(normalizeBonusType('   '), null);
});

console.log('\nsignup_bonus.type genuine unit switches:');

test('cash → points surfaces as a real change', () => {
  const ch = typeChange(typedCard('cash'), typedExtract('points'));
  assert.deepEqual([ch.old_value, ch.new_value], ['cash', 'points']);
});

test('points → miles surfaces as a real change', () => {
  const ch = typeChange(typedCard('points'), typedExtract('miles'));
  assert.deepEqual([ch.old_value, ch.new_value], ['points', 'miles']);
});

test('free nights → points surfaces (the Marriott Bonvoy Boundless transition)', () => {
  const ch = typeChange(typedCard('free_nights', { value: 3 }), typedExtract('points', { value: 125000 }));
  assert.deepEqual([ch.old_value, ch.new_value], ['free_nights', 'points']);
});

test('a points → cashback switch is written in the YAML spelling ("cash", not "cashback")', () => {
  const ch = typeChange(typedCard('points'), typedExtract('cashback'));
  assert.equal(ch.new_value, 'cash');
});

console.log('\nsignup_bonus.type guards:');

test('a JS-gated page (offer never rendered) cannot flip the unit', () => {
  assert.equal(typeChange(typedCard('points'), typedExtract('cash'), 'Rewards Terms apply. Member FDIC.'), undefined);
});

test('a null extracted type never erases a real one', () => {
  assert.equal(typeChange(typedCard('points'), typedExtract(null)), undefined);
});

test('a null extracted value blocks the flip (no concrete offer was read)', () => {
  assert.equal(typeChange(typedCard('points'), typedExtract('cash', { value: null })), undefined);
});

test('a card with no stored type is never given one', () => {
  const card = typedCard('points');
  delete card.data.signup_bonus.type;
  assert.equal(typeChange(card, typedExtract('miles')), undefined);
});

test('check_ignore on signup_bonus.type suppresses the flip', () => {
  const card = typedCard('miles');
  card.data.check_ignore = ['signup_bonus.type'];
  assert.equal(typeChange(card, typedExtract('points')), undefined);
});

test('a run suppressed as tiered skips type along with value', () => {
  const card = typedCard('points', {
    value: 90000,
    note: 'Earn 70,000 points after you spend $3,000, plus an additional 20,000 points after $2,000 more.',
  });
  // Base-tier misparse: value collapses to a named tier AND the unit flips.
  // Neither is trusted — the offer parse itself is in doubt.
  const changes = detectChanges(card, typedExtract('miles', { value: 70000 }), new Date(), [], OFFER_PAGE);
  assert.deepEqual(fieldsChanged(changes), []);
});

test('legacy two-arg calls (no pageContent) still diff type', () => {
  const changes = detectChanges(typedCard('cash'), typedExtract('points'));
  assert.ok(changes.some(c => c.field === 'signup_bonus.type'));
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

// ─── browser_first memory ────────────────────────────────────────────────────
//
// The ~30 JS-rendered issuer pages (Citi, BofA, most Amex) fail the simple
// fetch identically every night; the flag lets the next run skip that doomed
// fetch and its wasted extraction. These guard the flag's lifecycle inside
// updateSkipState — set on a browser-verified card, kept across skips, dropped
// once the simple fetch suffices again.

console.log('\nbrowser_first memory:');

test('a browser-verified card records browser_first; a simple-fetch card does not', () => {
  const after = fold({}, ['citi', 'chase'], [], { browserFirst: new Map([['citi', AT]]) });
  assert.equal(after.citi.browser_first, AT);
  assert.equal(after.chase.browser_first, undefined);
});

test('a verified card whose simple fetch sufficed drops its stale flag', () => {
  // Page reverted to server-rendered HTML after the TTL re-probe: this run
  // verified it without the browser, so no entry in browserFirst.
  const prev = { citi: { consecutive_skips: 0, browser_first: '2026-06-01T00:00:00.000Z' } };
  const after = fold(prev, ['citi'], []);
  assert.equal(after.citi.browser_first, undefined);
});

test('a skip proves nothing about rendering — the flag survives it', () => {
  const prev = { citi: { consecutive_skips: 0, browser_first: '2026-06-01T00:00:00.000Z' } };
  const after = fold(prev, ['citi'], [skip('citi', 'Timed out after 60000ms')]);
  assert.equal(after.citi.browser_first, '2026-06-01T00:00:00.000Z');
  assert.equal(after.citi.consecutive_skips, 1);
});

test('a carried-forward flag keeps its original date (so the TTL can expire)', () => {
  // main() passes the PREVIOUS date for a still-valid flag; a fresh date would
  // make the TTL unreachable since browser-first guarantees browser use.
  const original = '2026-06-20T00:00:00.000Z';
  const prev = { citi: { consecutive_skips: 0, browser_first: original } };
  const after = fold(prev, ['citi'], [], { browserFirst: new Map([['citi', original]]) });
  assert.equal(after.citi.browser_first, original);
});

test('callers without a browserFirst map (legacy/tests) still work', () => {
  const after = updateSkipState({}, {
    checkedSlugs: new Set(['a']),
    skippedCards: [],
    checkedAt: AT,
    isPartialRun: false,
  });
  assert.equal(after.a.consecutive_skips, 0);
});

// ─── Transient-network classifier ────────────────────────────────────────────
//
// Decides which fetch-phase skips get a second attempt. The cost of a wrong
// answer is asymmetric: a missed network error strands a card in the stale
// alarm for days (2026-07-21, 87 cards), while a needlessly retried page
// costs one fetch. But retrying a REAL failure is not free either — it blurs
// the "this page is broken" signal the alarm exists to raise, so the false
// side of the list matters just as much as the true side.

console.log('\nisTransientNetworkError:');

for (const reason of [
  'page.goto: net::ERR_INTERNET_DISCONNECTED at https://cards.barclaycardus.com/',
  'page.goto: net::ERR_NAME_NOT_RESOLVED at https://example.com/',
  'page.goto: net::ERR_CONNECTION_RESET at https://example.com/',
  'page.goto: net::ERR_CONNECTION_TIMED_OUT at https://example.com/',
  'page.goto: net::ERR_NETWORK_CHANGED at https://example.com/',
  'fetch failed',
  'socket hang up',
  'request to https://example.com failed, reason: ECONNREFUSED',
  'getaddrinfo EAI_AGAIN example.com',
  'page.goto: Timeout 30000ms exceeded.',
  'Timed out after 60000ms: Chase Sapphire Preferred',
]) {
  test(`retries: ${reason.slice(0, 52)}`, () => {
    assert.equal(isTransientNetworkError(reason), true);
  });
}

for (const reason of [
  'HTTP 404 from origin (browser fallback also failed: HTTP 404)',
  'HTTP 403',
  'HTTP 500 from origin (browser fallback also failed: unknown)',
  'content too short (42 chars)',
  'known block: pnc.com bot mitigation blocks automated fetches',
  'known block: amazon.com serves an automation interstitial',
  'no data extracted from page',
  'no extraction returned for this card',
  'extraction error: OpenAI 401',
  'Playwright unavailable',
  'script timeout (90 min) reached before this card was checked',
  'could not fetch page',
]) {
  test(`does NOT retry: ${reason.slice(0, 48)}`, () => {
    assert.equal(isTransientNetworkError(reason), false);
  });
}

test('an empty or missing reason is not retried', () => {
  assert.equal(isTransientNetworkError(''), false);
  assert.equal(isTransientNetworkError(null), false);
  assert.equal(isTransientNetworkError(undefined), false);
});

// ─── Session-targeted offer downgrades ──────────────────────────────────────
//
// Delta SkyMiles Reserve Business, 2026-08-05: the run's headless fetch was
// served a flat 80,000 while an incognito browser showed 125,000. The stored
// entry had no note, so no tier guard applied and the downgrade was written
// into the YAML (caught in review on PR #1956). Only DECREASES on these hosts
// are held — a targeted-down session cannot invent a higher number.

const AMEX_URL =
  'https://www.americanexpress.com/en-us/business/credit-cards/delta-skymiles-reserve/';

function amexCard(value, url = AMEX_URL) {
  return {
    name: 'Delta SkyMiles Reserve Business American Express',
    data: {
      name: 'Delta SkyMiles Reserve Business American Express',
      apply_link: url,
      signup_bonus: { value, type: 'miles', spend_requirement: 12000, timeframe_months: 6 },
    },
  };
}

const amexExtract = value => ({
  signup_bonus: { value, spend_requirement: 12000, timeframe_months: 6, offer_is_tiered: null },
});

const RENDERED_OFFER =
  'Earn Bonus Miles after you spend $12,000 in purchases in your first 6 months of Card Membership.';

console.log('\nSession-targeted offer downgrade suppression:');

test('Amex value downgrade 125000 → 80000 is suppressed and recorded', () => {
  const suppressions = [];
  const changes = detectChanges(
    amexCard(125000), amexExtract(80000), new Date(), suppressions, RENDERED_OFFER
  );
  assert.deepEqual(fieldsChanged(changes), []);
  assert.equal(suppressions.length, 1);
  assert.equal(suppressions[0].guard, 'offer-variant-downgrade');
});

test('an Amex value INCREASE still flows through', () => {
  const changes = detectChanges(
    amexCard(80000), amexExtract(125000), new Date(), [], RENDERED_OFFER
  );
  assert.deepEqual(fieldsChanged(changes), ['signup_bonus.value']);
});

test('the host match covers subdomains', () => {
  const changes = detectChanges(
    amexCard(125000, 'https://cards.americanexpress.com/x'), amexExtract(80000),
    new Date(), [], RENDERED_OFFER
  );
  assert.deepEqual(fieldsChanged(changes), []);
});

test('a lookalike host is NOT treated as Amex', () => {
  const changes = detectChanges(
    amexCard(125000, 'https://www.notamericanexpress.com/x'), amexExtract(80000),
    new Date(), [], RENDERED_OFFER
  );
  assert.deepEqual(fieldsChanged(changes), ['signup_bonus.value']);
});

test('a downgrade on an unlisted host is unaffected', () => {
  const changes = detectChanges(
    amexCard(125000, 'https://creditcards.chase.com/x'), amexExtract(80000),
    new Date(), [], RENDERED_OFFER
  );
  assert.deepEqual(fieldsChanged(changes), ['signup_bonus.value']);
});

test('a card with no URL at all does not crash the guard', () => {
  const card = { name: 'No URL', data: { name: 'No URL', signup_bonus: { value: 125000 } } };
  assert.doesNotThrow(() =>
    detectChanges(card, amexExtract(80000), new Date(), [], RENDERED_OFFER)
  );
});

// ─── Skip-state source: the pushed copy on main, not the reverted local file ──
//
// Both publish paths commit .github/card-page-check-state.json to main through
// the contents API and then revert the local copy, so the local file is a run's
// output and never its input. Reading it back made a second run in the same
// working tree start from pre-first-run state and erase the first run's entries
// (observed 2026-08-09 — 122 verified cards' last_ok lost to a 44-card recovery
// run). These tests pin both halves: the source preference, and the full
// two-sequential-runs cycle against a real git remote.

console.log('\nSkip-state source preference:');

const STATE_V0 = JSON.stringify({
  updated_at: '2026-08-06T07:00:00.000Z',
  cards: { 'card-a': { consecutive_skips: 0, last_ok: '2026-08-06T07:00:00.000Z' } },
});
const STATE_V1 = JSON.stringify({
  updated_at: '2026-08-09T07:00:00.000Z',
  cards: { 'card-a': { consecutive_skips: 0, last_ok: '2026-08-09T07:00:00.000Z' } },
});

test('the copy on main wins over a stale local file', () => {
  assert.equal(resolveSkipState(STATE_V1, STATE_V0)['card-a'].last_ok, '2026-08-09T07:00:00.000Z');
});

test('an unreadable main copy falls back to the local file', () => {
  assert.equal(resolveSkipState(null, STATE_V0)['card-a'].last_ok, '2026-08-06T07:00:00.000Z');
});

test('a corrupt main copy falls back to the local file', () => {
  assert.equal(resolveSkipState('{not json', STATE_V0)['card-a'].last_ok, '2026-08-06T07:00:00.000Z');
});

test('a main copy missing the cards key falls back to the local file', () => {
  assert.equal(resolveSkipState('{"updated_at":"x"}', STATE_V0)['card-a'].last_ok, '2026-08-06T07:00:00.000Z');
});

test('neither copy readable is not fatal — every card starts at zero', () => {
  assert.deepEqual(resolveSkipState(null, null), {});
});

console.log('\nTwo sequential runs from one working tree:');

const git = (cwd, args) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });

// Stand up origin + a clone, mirroring the real layout: the state file is
// committed on main, and the checkout the run happens in tracks it.
function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'card-page-state-'));
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  git(root, ['clone', '-q', origin, work]);
  fs.mkdirSync(path.join(work, '.github'), { recursive: true });
  return { root, origin, work };
}

// What both publish paths do: PUT the file to main through the contents API
// (never into the local branch), then `git checkout --` the local copy back to
// HEAD so the uncommitted data/cards/ edits survive for the PR step.
function publishToMain({ origin, work }, statePath, content) {
  const pusher = fs.mkdtempSync(path.join(os.tmpdir(), 'card-page-push-'));
  git(pusher, ['clone', '-q', origin, 'c']);
  const clone = path.join(pusher, 'c');
  fs.mkdirSync(path.join(clone, '.github'), { recursive: true });
  fs.writeFileSync(path.join(clone, statePath), content);
  git(clone, ['add', statePath]);
  git(clone, ['commit', '-q', '-m', 'chore: update card-page skip-tracking state [skip ci]']);
  git(clone, ['push', '-q', 'origin', 'main']);
  fs.rmSync(pusher, { recursive: true, force: true });
  git(work, ['checkout', '--', statePath]);
}

test("run 2 preserves run 1's last_ok for cards it never looked at", () => {
  const STATE_PATH = '.github/card-page-check-state.json';
  const repo = makeRepo();
  const localFile = path.join(repo.work, STATE_PATH);
  try {
    // Baseline on main: 123 cards last verified three days ago.
    const allSlugs = Array.from({ length: 123 }, (_, i) => `card-${String(i).padStart(3, '0')}`);
    const baseline = {};
    for (const slug of allSlugs) baseline[slug] = { consecutive_skips: 0, last_ok: '2026-08-06T07:00:00.000Z' };
    fs.writeFileSync(localFile, JSON.stringify({ updated_at: '2026-08-06T07:00:00.000Z', cards: baseline }, null, 2) + '\n');
    git(repo.work, ['add', STATE_PATH]);
    git(repo.work, ['commit', '-q', '-m', 'baseline state']);
    git(repo.work, ['push', '-q', '-u', 'origin', 'main']);

    // Run 1 — full run, verifies all 123 (the last 44 skip, as on 2026-08-09).
    const RUN_1_AT = '2026-08-09T07:30:00.000Z';
    const skipped1 = allSlugs.slice(-44).map(slug => ({ slug, reason: 'fetch failed' }));
    const state1 = updateSkipState(
      resolveSkipState(readSkipStateFromMain(repo.work), fs.readFileSync(localFile, 'utf8')),
      { checkedSlugs: new Set(allSlugs), skippedCards: skipped1, checkedAt: RUN_1_AT, isPartialRun: false }
    );
    fs.writeFileSync(localFile, JSON.stringify({ updated_at: RUN_1_AT, cards: state1 }, null, 2) + '\n');
    publishToMain(repo, STATE_PATH, fs.readFileSync(localFile, 'utf8'));

    // The local file is now back to the pre-run baseline — this is the trap.
    assert.equal(
      JSON.parse(fs.readFileSync(localFile, 'utf8')).cards['card-000'].last_ok,
      '2026-08-06T07:00:00.000Z'
    );

    // Run 2 — CARD_SLUG-scoped recovery over the 44 that skipped.
    const RUN_2_AT = '2026-08-09T09:00:00.000Z';
    const recovered = allSlugs.slice(-44);
    const state2 = updateSkipState(
      resolveSkipState(readSkipStateFromMain(repo.work), fs.readFileSync(localFile, 'utf8')),
      { checkedSlugs: new Set(recovered), skippedCards: [], checkedAt: RUN_2_AT, isPartialRun: true }
    );
    fs.writeFileSync(localFile, JSON.stringify({ updated_at: RUN_2_AT, cards: state2 }, null, 2) + '\n');
    publishToMain(repo, STATE_PATH, fs.readFileSync(localFile, 'utf8'));

    const onMain = JSON.parse(execFileSync('git', ['show', `main:${STATE_PATH}`], {
      cwd: repo.origin, encoding: 'utf8',
    })).cards;

    // Every card carries a 2026-08-09 timestamp: run 1's for the 79 it verified,
    // run 2's for the 44 it recovered. None is left back at the baseline.
    assert.equal(Object.keys(onMain).length, 123);
    const stillBaseline = allSlugs.filter(s => onMain[s].last_ok === '2026-08-06T07:00:00.000Z');
    assert.deepEqual(stillBaseline, []);
    for (const slug of allSlugs.slice(0, 79)) assert.equal(onMain[slug].last_ok, RUN_1_AT);
    for (const slug of recovered) assert.equal(onMain[slug].last_ok, RUN_2_AT);
    // And the recovery cleared the skip counters run 1 raised.
    for (const slug of recovered) assert.equal(onMain[slug].consecutive_skips, 0);
  } finally {
    fs.rmSync(repo.root, { recursive: true, force: true });
  }
});

console.log('');
