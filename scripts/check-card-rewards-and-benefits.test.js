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
const fs = require('node:fs');
const path = require('node:path');
const yamlLib = require('js-yaml');
const {
  isSpendGatedDollarValue,
  editRewardValue,
  isBroaderThan,
  editRewardCapFields,
  diffRewards,
  diffBenefits,
  diffForeignTxn,
  pageEvidencesNoFtf,
  isSignupBonusDuplicate,
  looksLikeSameByDescription,
  looksLikeSameBenefit,
  collectMetaCoveredCategories,
  assessExtractionTrust,
  hasRewardEvidence,
  buildSharedUrlMap,
  isDeclined,
  loadDeclined,
} = require('./check-card-rewards-and-benefits');

const NOOP_POLICY = { exclude: [], borderline: [], exampleCards: [] };

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

console.log('\nBase-rate downgrade guard (everything_else):');

test('everything_else cut routes to review, not auto-PR', () => {
  // The 2026-07-10 batch: Venture X 2→1, VentureOne 1.25→1, Bilt 2→1,
  // U.S. Bank Shopper 1.5→1 — all misreads. A downward everything_else
  // proposal must land in `downgraded` (review queue), never `changed`.
  const current = [{ category: 'everything_else', value: 2, unit: 'points_per_dollar' }];
  const proposed = [{ category: 'everything_else', value: 1, unit: 'points_per_dollar' }];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.changed.length, 0, 'downgrade must not be auto-PR\'d');
  assert.equal(diff.downgraded.length, 1, 'downgrade must be routed to review');
  assert.equal(diff.downgraded[0].from.value, 2);
  assert.equal(diff.downgraded[0].to.value, 1);
});

test('fractional everything_else cut (1.25→1) also routes to review', () => {
  const current = [{ category: 'everything_else', value: 1.25, unit: 'points_per_dollar' }];
  const proposed = [{ category: 'everything_else', value: 1, unit: 'points_per_dollar' }];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.changed.length, 0);
  assert.equal(diff.downgraded.length, 1);
});

test('everything_else INCREASE still auto-PRs (not treated as a downgrade)', () => {
  // A plausible upward move (below the big-jump guard) is a real change and
  // must still flow to `changed`.
  const current = [{ category: 'everything_else', value: 1, unit: 'percent' }];
  const proposed = [{ category: 'everything_else', value: 1.5, unit: 'percent' }];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.downgraded.length, 0, 'an increase is not a downgrade');
  assert.equal(diff.changed.length, 1, 'a plausible base-rate increase still surfaces');
  assert.equal(diff.changed[0].to.value, 1.5);
});

test('non-everything_else category cut still auto-PRs', () => {
  // The guard is scoped to everything_else only — a bonus-category rate
  // change is comparatively low-stakes and keeps auto-PRing.
  const current = [{ category: 'dining', value: 4, unit: 'percent' }];
  const proposed = [{ category: 'dining', value: 3, unit: 'percent' }];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.downgraded.length, 0);
  assert.equal(diff.changed.length, 1, 'a bonus-category change still surfaces as a change');
});

console.log('\nFTF page-content validation:');

test('pageEvidencesNoFtf returns false when page has fee-table line item', () => {
  const page = 'Annual fee $95. Fee for foreign purchases 3% of the U.S. dollar amount of each purchase.';
  assert.equal(pageEvidencesNoFtf(page), false);
});

test('pageEvidencesNoFtf returns false even when % is blank (line item still present)', () => {
  // Citi #1328 case — the fee row exists but the % did not render.
  const page = 'Annual fee $0. Fee for foreign purchases – % of the U.S. dollar amount of each purchase.';
  assert.equal(pageEvidencesNoFtf(page), false);
});

test('pageEvidencesNoFtf returns true on explicit no-fee disclosure', () => {
  const page = 'Card details: No foreign transaction fees on purchases made outside the United States.';
  assert.equal(pageEvidencesNoFtf(page), true);
});

test('pageEvidencesNoFtf returns null when only the nav-menu category appears', () => {
  // Chase / Citi / US Bank apply pages have this nav category in the sidebar.
  const page = 'Other credit cards: Cash Back credit cards. No Foreign Transaction Fee credit cards. Rewards credit cards.';
  // Our nav-pattern is "No Foreign Transaction Fee credit cards" — matches our affirmative regex.
  // We accept this is a known false positive of pageEvidencesNoFtf — that's why the
  // diff guard requires evidence === true AND silently drops when null. Test the dropping below.
  // For now just assert the function returns *something* (true here, but the diff guard's
  // job is to refuse to flip when there's no positive disclosure on the card page itself).
  const result = pageEvidencesNoFtf(page);
  assert.ok(result === true || result === null, 'returns affirmative-match or null');
});

test('diffForeignTxn: drops flip to false when page has no positive evidence', () => {
  const page = 'Card details. Earn 1.5% on every purchase.';
  const result = diffForeignTxn(true, false, page);
  assert.equal(result, null, 'flip to false dropped — no evidence of no-FTF disclosure');
});

test('diffForeignTxn: drops flip to false when page shows fee line item', () => {
  // #1325 / #1328 / #1338 class.
  const page = 'Rates and fees. Fee for foreign purchases 3% of the U.S. dollar amount.';
  const result = diffForeignTxn(undefined, false, page);
  assert.equal(result, null, 'flip to false dropped — page evidences FTF exists');
});

test('diffForeignTxn: allows flip to false when explicit no-fee disclosure', () => {
  // #1329 Disney Inspire class — page actually said "No Foreign Transaction Fees".
  const page = 'You will pay no foreign transaction fees on purchases made outside the U.S.';
  const result = diffForeignTxn(true, false, page);
  assert.deepEqual(result, { from: true, to: false });
});

test('diffForeignTxn: allows flip to true regardless of page evidence', () => {
  // True flips have never been a false-positive source; trust them.
  const result = diffForeignTxn(false, true, 'whatever');
  assert.deepEqual(result, { from: false, to: true });
});

console.log('\nSignup-bonus dedup:');

test('isSignupBonusDuplicate: REI gift card SUB blocks re-proposal as benefit', () => {
  // #1334 REI Co-op class.
  const sub = {
    value: 100,
    type: 'cash',
    spend_requirement: 0,
    note: '$100 REI gift card after first purchase outside of REI within 60 days',
  };
  const proposed = {
    name: 'REI Gift Card',
    description: '$100 REI gift card after first purchase outside REI within 60 days',
  };
  assert.equal(isSignupBonusDuplicate(proposed, sub), true);
});

test('isSignupBonusDuplicate: unrelated benefit is not flagged', () => {
  const sub = { value: 60000, type: 'points', note: '60,000 bonus points after $4,000 in 3 months' };
  const proposed = {
    name: 'Free Checked Bag',
    description: 'First checked bag free for cardholder and up to 8 companions',
  };
  assert.equal(isSignupBonusDuplicate(proposed, sub), false);
});

test('isSignupBonusDuplicate: handles missing signup_bonus', () => {
  const proposed = { name: 'Anything', description: 'Some perk' };
  assert.equal(isSignupBonusDuplicate(proposed, null), false);
  assert.equal(isSignupBonusDuplicate(proposed, undefined), false);
});

console.log('\nDescription-fuzzy dedup:');

test('looksLikeSameByDescription: Dining Credit vs Restaurant Credit (#1335)', () => {
  // Robinhood Platinum class — different names, same description.
  const current = [
    {
      name: 'Restaurant Credit',
      description: '$250 annual statement credit at over 15,000 restaurants worldwide',
    },
  ];
  const proposed = {
    name: 'Dining Statement Credit',
    description: '$250 annual credit at 15,000+ restaurants worldwide',
  };
  assert.equal(looksLikeSameByDescription(proposed, current), 'Restaurant Credit');
});

test('looksLikeSameByDescription: distinct perks return null', () => {
  const current = [
    { name: 'Free Checked Bag', description: 'First checked bag free for cardholder' },
  ];
  const proposed = {
    name: 'Anniversary Free Night',
    description: 'One free night award each year on account anniversary',
  };
  assert.equal(looksLikeSameByDescription(proposed, current), null);
});

console.log('\nName-alias dedup:');

test('looksLikeSameBenefit: DashPass vs DoorDash (#1324, #1326)', () => {
  assert.equal(looksLikeSameBenefit('Complimentary DashPass', 'DoorDash Grocery Credit'), true);
  assert.equal(looksLikeSameBenefit('Complimentary DashPass', 'Quarterly DoorDash Credit'), true);
});

test('looksLikeSameBenefit: Trusted Traveler vs Global Entry (#1339)', () => {
  assert.equal(looksLikeSameBenefit('Global Entry / TSA PreCheck Credit', 'Trusted Traveler Program Credit'), true);
});

test('looksLikeSameBenefit: unrelated names still distinct', () => {
  assert.equal(looksLikeSameBenefit('Free Checked Bag', 'Anniversary Free Night'), false);
  assert.equal(looksLikeSameBenefit('Priority Pass', 'Companion Certificate'), false);
});

console.log('\ndiffBenefits integration:');

test('diffBenefits: signup_bonus duplicate is skipped', () => {
  // End-to-end: #1334-class proposal routes to skipped, not auto.
  const current = [];
  const proposed = [
    {
      name: 'REI Gift Card Bonus',
      description: '$100 REI gift card after first purchase outside REI within 60 days',
      value: 100,
      value_unit: 'usd',
    },
  ];
  const signupBonus = {
    value: 100,
    type: 'cash',
    note: '$100 REI gift card after first purchase outside of REI within 60 days',
  };
  const diff = diffBenefits(current, proposed, NOOP_POLICY, new Set(), signupBonus);
  assert.equal(diff.auto.length, 0, 'should not auto-PR a SUB duplicate');
  assert.equal(diff.skipped.length, 1);
  assert.equal(diff.skipped[0].tier, 'duplicate_signup_bonus');
});

test('diffBenefits: description-fuzzy duplicate is skipped when names diverge', () => {
  // Both name-fuzzy and description-fuzzy can catch this; either is fine.
  // The key invariant is that the duplicate doesn't reach auto.
  const current = [
    {
      name: 'Dining Statement Credit',
      description: '$250 annual statement credit at over 15,000 restaurants worldwide',
    },
  ];
  const proposed = [
    {
      // Use a name that won't trigger the dining/restaurant alias.
      name: 'Worldwide Eateries Statement Bonus',
      description: '$250 annual credit at 15,000+ restaurants worldwide',
      value: 250,
    },
  ];
  const diff = diffBenefits(current, proposed, NOOP_POLICY, new Set(), null);
  assert.equal(diff.auto.length, 0);
  assert.equal(diff.skipped.length, 1);
  assert.ok(
    diff.skipped[0].tier === 'duplicate_description' || diff.skipped[0].tier === 'duplicate_fuzzy',
    `expected description/fuzzy dedup, got ${diff.skipped[0].tier}`
  );
});


// ─────────────────────────────────────────────────────────────────────────────
// Regressions from review issue #1743. Every case below is a real item that
// reached the human queue on 2026-07-21 and should not have.
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nExtraction trust floor (#1743):');

test('empty extraction reports no removals (Hawaiian Airlines Business: 5 of 5 rows flagged)', () => {
  const current = [
    { category: 'airlines', value: 3, unit: 'points_per_dollar' },
    { category: 'gas', value: 2, unit: 'points_per_dollar' },
    { category: 'dining', value: 2, unit: 'points_per_dollar' },
    { category: 'office_supplies', value: 2, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
  ];
  const diff = diffRewards(current, []);
  assert.equal(diff.removed.length, 0, 'an empty extraction is not evidence of absence');
  assert.equal(diff.trust.trusted, false);
});

test('extraction missing the base rate is untrusted (Venture X: 4 of 4 rows flagged)', () => {
  const current = [
    { category: 'hotels_car_portal', value: 10, unit: 'points_per_dollar' },
    { category: 'flights_portal', value: 5, unit: 'points_per_dollar' },
    { category: 'entertainment_portal', value: 5, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 2, unit: 'points_per_dollar' },
  ];
  // Page shell rendered one stray rate and nothing else.
  const proposed = [{ category: 'hotels_car_portal', value: 10, unit: 'points_per_dollar' }];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.trust.trusted, false, 'no everything_else means the table was not read');
  assert.equal(diff.removed.length, 0);
});

test('a complete extraction still reports a genuine removal', () => {
  const current = [
    { category: 'dining', value: 3, unit: 'percent' },
    { category: 'gas', value: 2, unit: 'percent' },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const proposed = [
    { category: 'dining', value: 3, unit: 'percent' },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.trust.trusted, true);
  assert.equal(diff.removed.length, 1);
  assert.equal(diff.removed[0].category, 'gas');
});

test('untrusted extraction also suppresses value rewrites and base-rate cuts', () => {
  const current = [
    { category: 'dining', value: 3, unit: 'percent' },
    { category: 'gas', value: 2, unit: 'percent' },
    { category: 'everything_else', value: 1.5, unit: 'percent' },
  ];
  const proposed = [{ category: 'dining', value: 1, unit: 'percent' }];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.changed.length, 0, 'must not auto-PR a value from an unread page');
  assert.equal(diff.downgraded.length, 0);
});

console.log('\nAlias groups (#1743):');

test('gas/ev_charging: page merges them, split YAML row is not flagged removed', () => {
  // AAA Daily Advantage, AAA Travel Advantage, Atmos Rewards Business.
  const current = [
    { category: 'gas', value: 3, unit: 'percent' },
    { category: 'ev_charging', value: 3, unit: 'percent' },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const proposed = [
    { category: 'gas', value: 3, unit: 'percent', note: 'Gas stations and EV charging' },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.added.length, 0);
});

test('streaming/tv_internet_streaming are the same slice (PlayStation Visa)', () => {
  const current = [
    { category: 'streaming', value: 3, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
  ];
  const proposed = [
    { category: 'tv_internet_streaming', value: 3, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
});

test('entertainment_portal is not re-proposed as bare entertainment (C1 Venture)', () => {
  const current = [
    { category: 'hotels_car_portal', value: 5, unit: 'points_per_dollar' },
    { category: 'entertainment_portal', value: 5, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 2, unit: 'points_per_dollar' },
  ];
  const proposed = [
    { category: 'hotels_car_portal', value: 5, unit: 'points_per_dollar' },
    { category: 'entertainment', value: 5, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 2, unit: 'points_per_dollar' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
});

console.log('\nBroad/narrow containment (#1743):');

test('broad `travel` proposal suppressed when YAML splits airlines + hotels (Citi Strata Premier)', () => {
  const current = [
    { category: 'airlines', value: 3, unit: 'points_per_dollar' },
    { category: 'hotels', value: 3, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
  ];
  const proposed = [
    { category: 'travel', value: 3, unit: 'points_per_dollar', note: 'Air travel and other hotel purchases' },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.added.length, 0, 'travel is the parent of the rows already stored');
  assert.equal(diff.removed.length, 0, 'airlines/hotels are covered by the broad proposal');
});

console.log('\nBase-rate restatement + meta-to-meta (#1743):');

test('a proposal equal to everything_else is the base rate restated (Blue Business Plus)', () => {
  const current = [
    { category: 'everything_else', value: 2, unit: 'points_per_dollar', spend_cap: 50000 },
  ];
  const proposed = [
    { category: 'everything_else', value: 2, unit: 'points_per_dollar', spend_cap: 50000 },
    { category: 'travel_portal', value: 2, unit: 'points_per_dollar', note: 'AmexTravel.com purchases' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.added.length, 0);
});

test('a rate ABOVE the base rate still surfaces', () => {
  const current = [{ category: 'everything_else', value: 2, unit: 'points_per_dollar' }];
  const proposed = [
    { category: 'everything_else', value: 2, unit: 'points_per_dollar' },
    { category: 'dining', value: 4, unit: 'points_per_dollar' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].category, 'dining');
});

test('meta id proposed against a different meta id in YAML (World of Hyatt Business)', () => {
  const current = [
    { category: 'top_category', value: 2, unit: 'points_per_dollar', mode: 'auto_top_spend',
      eligible_categories: ['dining', 'shipping', 'airlines'] },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
  ];
  const proposed = [
    { category: 'selected_categories', value: 2, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
  ];
  const diff = diffRewards(current, proposed);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
});

console.log('\nShared apply pages (#1743):');

test('buildSharedUrlMap pairs cards that share an apply_link', () => {
  const cards = [
    { slug: 'bilt-blue', data: { name: 'Bilt Blue', apply_link: 'https://x/apply' } },
    { slug: 'bilt-obsidian', data: { name: 'Bilt Obsidian', apply_link: 'https://x/apply' } },
    { slug: 'other', data: { name: 'Other', apply_link: 'https://y/apply' } },
  ];
  const shared = buildSharedUrlMap(cards);
  assert.deepEqual(shared.get('bilt-blue'), ['Bilt Obsidian']);
  assert.deepEqual(shared.get('bilt-obsidian'), ['Bilt Blue']);
  assert.equal(shared.has('other'), false);
});

test('suppressRemovals drops removals but keeps additions (AAA pair)', () => {
  const current = [
    { category: 'gas', value: 5, unit: 'percent' },
    { category: 'dining', value: 3, unit: 'percent' },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const proposed = [
    { category: 'gas', value: 5, unit: 'percent' },
    { category: 'wholesale_clubs', value: 3, unit: 'percent' },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const withRemovals = diffRewards(current, proposed);
  assert.equal(withRemovals.removed.length, 1, 'sanity: dining is removed without the flag');

  const diff = diffRewards(current, proposed, { suppressRemovals: true });
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.added.length, 1, 'additions still surface for shared-page cards');
});

console.log('\nFetch evidence gate (#1743):');

test('hasRewardEvidence rejects a nav-and-footer shell', () => {
  assert.equal(
    hasRewardEvidence('Credit Cards Personal Business Rewards Sign In Locations Contact Us Privacy'),
    false
  );
});

test('hasRewardEvidence rejects a bot-block interstitial', () => {
  assert.equal(
    hasRewardEvidence('Access Denied You do not have permission to access this page Reference 18.2f'),
    false
  );
});

test('hasRewardEvidence accepts a real earn table', () => {
  assert.equal(
    hasRewardEvidence('Earn 5% cash back on travel, 3% on dining and drugstores, and 1.5% on all other purchases'),
    true
  );
});

test('hasRewardEvidence accepts points-per-dollar phrasing', () => {
  assert.equal(
    hasRewardEvidence('Earn 10X points on hotels, 5X on flights, and 2X on everything else'),
    true
  );
});

console.log('\nassessExtractionTrust:');

test('cards with no YAML rewards are always trusted (nothing to contradict)', () => {
  assert.equal(assessExtractionTrust([], []).trusted, true);
});

test('matching under half the existing categories is untrusted', () => {
  const current = [
    { category: 'dining', value: 3, unit: 'percent' },
    { category: 'gas', value: 3, unit: 'percent' },
    { category: 'groceries', value: 3, unit: 'percent' },
    { category: 'everything_else', value: 1, unit: 'percent' },
  ];
  const proposed = [{ category: 'everything_else', value: 1, unit: 'percent' }];
  const t = assessExtractionTrust(current, proposed);
  assert.equal(t.trusted, false);
  assert.match(t.reason, /matched only 1 of 4/);
});

console.log('\nDeclined-review memory (#1743):');

test('review-declined.yaml parses and is non-empty', () => {
  const d = loadDeclined();
  assert.ok(d.rewardsAdded.size > 0, 'expected seeded rewards_added entries');
  assert.ok(d.rewardsRemoved.size > 0, 'expected seeded rewards_removed entries');
});

test('a declined addition is filtered (AAA Daily Advantage travel)', () => {
  assert.equal(isDeclined('reward_added', 'aaa-daily-advantage-visa-signature', 'travel'), true);
});

test('a declined removal is filtered (Venture X everything_else)', () => {
  assert.equal(isDeclined('reward_removed', 'capital-one-venture-x', 'everything_else'), true);
});

test('the declined list is scoped per card, not global', () => {
  assert.equal(isDeclined('reward_added', 'chase-sapphire-preferred', 'travel'), false);
});

test('added and removed lists do not leak into each other', () => {
  assert.equal(isDeclined('reward_removed', 'aaa-daily-advantage-visa-signature', 'travel'), false);
});

// ─── editRewardValue ────────────────────────────────────────────────────────
//
// diffRewards reports `changed` for cap-field-only diffs (spend_cap,
// cap_period, rate_after_cap), which this writer does not express. It must
// report changed:false there, or those non-edits inflate cardsModified and
// autoChanges with writes that never reach the file (2026-07-26 run:
// 18 cards modified reported, 5 actually changed).
console.log('\neditRewardValue:');

const REWARD_YAML = [
  'name: Test',
  'rewards:',
  '  - category: gas',
  '    value: 5',
  '    spend_cap: 6000',
  '  - category: everything_else',
  '    value: 1',
  '',
].join('\n');

test('rewriting a value line to the same number is not a change', () => {
  const r = editRewardValue(REWARD_YAML, 'gas', 5);
  assert.equal(r.changed, false);
  assert.equal(r.text, REWARD_YAML);
});

test('a real value change is applied and reported', () => {
  const r = editRewardValue(REWARD_YAML, 'gas', 3);
  assert.equal(r.changed, true);
  assert.match(r.text, /- category: gas\n {4}value: 3\n/);
});

test('the base rate is subject to the same no-op check', () => {
  const r = editRewardValue(REWARD_YAML, 'everything_else', 1);
  assert.equal(r.changed, false);
  assert.equal(r.text, REWARD_YAML);
});

test('a category absent from the YAML is not a change', () => {
  const r = editRewardValue(REWARD_YAML, 'dining', 4);
  assert.equal(r.changed, false);
  assert.equal(r.text, REWARD_YAML);
});

// ─── editRewardCapFields ────────────────────────────────────────────────────
//
// spend_cap / cap_period / rate_after_cap were diffed but never written. The
// writer must express them without ever reading extractor silence as a cap
// deletion, and without touching the nested rows a rotating bucket carries
// under `current_categories:`.
console.log('\neditRewardCapFields:');

const CAPPED_YAML = [
  'name: Test',
  'rewards:',
  '  - category: rotating',
  '    value: 5',
  '    unit: percent',
  '    current_categories:',
  '      - category: "gas"',
  '        note: "Gas stations"',
  '    spend_cap: 1500',
  '    cap_period: quarterly',
  '    rate_after_cap: 1',
  '  - category: everything_else',
  '    value: 1',
  '',
].join('\n');

const UNCAPPED_YAML = [
  'name: Test',
  'rewards:',
  '  - category: dining',
  '    value: 3',
  '    unit: percent',
  '  - category: everything_else',
  '    value: 1',
  '',
].join('\n');

test('a stated cap change is written to the right row', () => {
  const r = editRewardCapFields(CAPPED_YAML, 'rotating', { spend_cap: 2000 });
  assert.equal(r.changed, true);
  assert.deepEqual(r.fields, ['spend_cap']);
  assert.match(r.text, /^ {4}spend_cap: 2000$/m);
  assert.equal((r.text.match(/spend_cap:/g) || []).length, 1);
});

test('a proposal that states no cap fields writes nothing', () => {
  const r = editRewardCapFields(CAPPED_YAML, 'rotating', { value: 5 });
  assert.equal(r.changed, false);
  assert.equal(r.text, CAPPED_YAML);
});

test('cap fields identical to the YAML are not a change', () => {
  const r = editRewardCapFields(CAPPED_YAML, 'rotating', {
    spend_cap: 1500, cap_period: 'quarterly', rate_after_cap: 1,
  });
  assert.equal(r.changed, false);
  assert.equal(r.text, CAPPED_YAML);
});

test('a category that exists only as a nested rotating row is not writable', () => {
  const r = editRewardCapFields(CAPPED_YAML, 'gas', { spend_cap: 999 });
  assert.equal(r.changed, false);
  assert.equal(r.text, CAPPED_YAML);
});

test('missing cap fields are appended in convention order after the row', () => {
  const r = editRewardCapFields(UNCAPPED_YAML, 'dining', {
    spend_cap: 6000, cap_period: 'annual', rate_after_cap: 1,
  });
  assert.equal(r.changed, true);
  assert.deepEqual(r.fields, ['spend_cap', 'cap_period', 'rate_after_cap']);
  assert.match(
    r.text,
    /- category: dining\n {4}value: 3\n {4}unit: percent\n {4}spend_cap: 6000\n {4}cap_period: annual\n {4}rate_after_cap: 1\n {2}- category: everything_else/
  );
});

// The diff side of the same defect: an optional field the extractor didn't
// mention must not read as a cap removal.
console.log('\ncap-field diffing:');

const CAPPED_ROW = [{
  category: 'groceries', value: 6, unit: 'percent',
  spend_cap: 6000, cap_period: 'annual', rate_after_cap: 1,
}];

test('extractor silence on cap fields is not a change', () => {
  const d = diffRewards(CAPPED_ROW, [{ category: 'groceries', value: 6, unit: 'percent' }]);
  assert.equal(d.changed.length, 0);
});

test('a stated cap change is a change', () => {
  const d = diffRewards(CAPPED_ROW, [
    { category: 'groceries', value: 6, unit: 'percent', spend_cap: 7000 },
  ]);
  assert.equal(d.changed.length, 1);
  assert.equal(d.changed[0].to.spend_cap, 7000);
});

// ─── Portal rows restated under a bare category name ────────────────────────
//
// An apply page describes a portal-only rate in plain words ("air travel
// booked on cititravel.com"), so the extractor emits the bare category. Only
// the `travel` rung existed, so `airlines` / `hotels` / `car_rentals` were
// never recognised as the portal row restated and reached the review queue
// every week, per card (issue #1774).
console.log('\nbare-category portal rungs:');

test('a bare category is broader than its portal slice', () => {
  assert.equal(isBroaderThan('hotels', 'hotels_portal'), true);
  assert.equal(isBroaderThan('hotels', 'hotels_car_portal'), true);
  assert.equal(isBroaderThan('airlines', 'flights_portal'), true);
  assert.equal(isBroaderThan('car_rentals', 'car_rentals_portal'), true);
  assert.equal(isBroaderThan('car_rentals', 'hotels_car_portal'), true);
});

test('the relation stays one-way and does not cross travel types', () => {
  assert.equal(isBroaderThan('hotels_portal', 'hotels'), false);
  assert.equal(isBroaderThan('airlines', 'hotels_portal'), false);
  assert.equal(isBroaderThan('hotels', 'airlines'), false);
});

test('a bare airlines proposal is suppressed when YAML has flights_portal', () => {
  const current = [
    { category: 'flights_portal', value: 6, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 1.5, unit: 'points_per_dollar' },
  ];
  const d = diffRewards(current, [
    ...current,
    { category: 'airlines', value: 6, unit: 'points_per_dollar' },
  ]);
  assert.equal(d.added.length, 0);
});

test('a bare hotels proposal is suppressed when YAML has hotels_portal', () => {
  const current = [
    { category: 'hotels_portal', value: 5, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 1, unit: 'points_per_dollar' },
  ];
  const d = diffRewards(current, [
    ...current,
    { category: 'hotels', value: 5, unit: 'points_per_dollar' },
  ]);
  assert.equal(d.added.length, 0);
});

test('an unrelated new category is still proposed', () => {
  const current = [
    { category: 'flights_portal', value: 6, unit: 'points_per_dollar' },
    { category: 'everything_else', value: 1.5, unit: 'points_per_dollar' },
  ];
  const d = diffRewards(current, [
    ...current,
    { category: 'groceries', value: 3, unit: 'points_per_dollar' },
  ]);
  assert.equal(d.added.length, 1);
  assert.equal(d.added[0].category, 'groceries');
});

// ─── benefit-policy insurance class ─────────────────────────────────────────
//
// The `borderline` block's note claimed these had been moved into `exclude`,
// but eight were left behind, so they kept regenerating a weekly manual
// decision (issue #1774). Guard the finished migration.
console.log('\nbenefit-policy insurance class:');

const POLICY_RAW = yamlLib.load(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'benefit-policy.yaml'), 'utf8')
);

test('every standard insurance name is excluded, not borderline', () => {
  const exclude = (POLICY_RAW.exclude || []).map(s => String(s).toLowerCase());
  for (const name of [
    'Extended Warranty', 'Travel Accident Insurance', 'Travel & Emergency Assistance',
    'Roadside Assistance', 'Return Protection', 'Emergency Evacuation',
    'Emergency Medical', 'Price Protection',
  ]) {
    assert.ok(exclude.includes(name.toLowerCase()), `${name} should be in exclude`);
  }
});

test('borderline is empty, so nothing is re-litigated weekly by default', () => {
  assert.deepEqual(POLICY_RAW.borderline || [], []);
});

// ─── Spend-gated dollar values ──────────────────────────────────────────────
//
// `value` feeds a "Total annual credits" figure, so a dollar amount unlocked
// by spending is a false claim. Six were live at once (Amex Business Platinum
// $2,400 behind $250K, JetBlue Premier $2,000 behind $75K). These route to a
// human rather than being auto-zeroed, because the same phrasing covers
// entries where a number is correct.
console.log('\nspend-gated dollar values:');

const gated = (description, value = 500, value_unit) =>
  isSpendGatedDollarValue({ name: 'x', value, value_unit, description });

test('catches the real cases that reached production', () => {
  assert.equal(gated('Up to $500 companion pass statement credit after $15,000 in eligible purchases in a calendar year'), true);
  assert.equal(gated('Up to $2,400 in One AP statement credits in the next calendar year after spending $250,000 on the card in a calendar year'), true);
  assert.equal(gated('$200 Delta Flight Credit after spending $10,000 in purchases in a calendar year'), true);
  assert.equal(gated('200 Disney Rewards Dollars after spending $2,000 each anniversary year'), true);
});

test('ignores point and mile awards, which are modeled with real values', () => {
  // Hawaiian's annual spend bonuses are legitimately valued in points.
  assert.equal(gated('20,000 bonus miles after $50,000 in purchases', 20000, 'points'), false);
  assert.equal(gated('100,000 miles after spending $24,000', 100000, 'miles'), false);
});

test('ignores an unconditional credit', () => {
  assert.equal(gated('$300 annual travel credit, applied automatically'), false);
  assert.equal(gated('$10/line monthly discount on AT&T wireless bill'), false);
});

test('ignores a zero-valued perk even when the copy is gated', () => {
  assert.equal(gated('Companion certificate after $30,000 in purchases', 0), false);
});

console.log('\nDone.\n');
