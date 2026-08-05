// Tests for card-name alias resolution in sweep-reddit-product-changes.js.
//
// Why this exists: a product change is stored as an edge between two exact
// catalog names, so anything that lets a second name for one product through
// splits that product's arrows in two on the card page. Aliases exist because
// co-brands ship under several banner names at once (the Kroger card was also
// the Harris Teeter card), and the extractor sees only names — nothing in
// "Kroger" tells it those are one product. The risks worth pinning down are
// that an alias must never shadow a real card, and that whatever the extractor
// emits must be folded to the canonical name before it reaches the YAML.
//
// Run: `node scripts/sweep-reddit-product-changes.test.js`. Exits non-zero on failure.

const assert = require('node:assert/strict');

const {
  buildNameResolver,
  buildExtractPrompt,
  loadCardCatalog,
  validateChange,
} = require('./sweep-reddit-product-changes.js');

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

const CATALOG = [
  { name: 'Kroger Rewards World Elite Mastercard', bank: 'U.S. Bank', aliases: ['Harris Teeter Rewards World Elite Mastercard', "Ralphs Rewards World Elite Mastercard"] },
  { name: 'Smartly Visa Signature', bank: 'U.S. Bank', aliases: [] },
  { name: 'Citi Strata Premier', bank: 'Citi', aliases: ['Citi Premier'] },
  { name: 'Chase Freedom', bank: 'Chase', aliases: [] },
];

console.log('buildNameResolver');

test('canonical names pass through untouched', () => {
  const { canonical } = buildNameResolver(CATALOG);
  assert.equal(canonical('Chase Freedom'), 'Chase Freedom');
});

test('a sibling banner name resolves to the canonical card', () => {
  const { canonical } = buildNameResolver(CATALOG);
  assert.equal(
    canonical('Harris Teeter Rewards World Elite Mastercard'),
    'Kroger Rewards World Elite Mastercard',
  );
});

test('a previous name resolves to the current card', () => {
  const { canonical } = buildNameResolver(CATALOG);
  assert.equal(canonical('Citi Premier'), 'Citi Strata Premier');
});

test('resolution is case and whitespace insensitive', () => {
  const { canonical } = buildNameResolver(CATALOG);
  assert.equal(
    canonical('  ralphs rewards world elite mastercard '),
    'Kroger Rewards World Elite Mastercard',
  );
});

test('an unknown name is returned unchanged so validation can reject it', () => {
  const { canonical } = buildNameResolver(CATALOG);
  assert.equal(canonical('Aven Rewards Visa'), 'Aven Rewards Visa');
});

test('empty and missing names do not throw', () => {
  const { canonical } = buildNameResolver(CATALOG);
  assert.equal(canonical(''), '');
  assert.equal(canonical(undefined), undefined);
});

test('an alias never shadows a real card name', () => {
  // The nightmare case: a careless alias on card B silently rewrites every
  // report about card A onto B, and nothing downstream can tell.
  const withHijack = [
    ...CATALOG,
    { name: 'Some Other Card', bank: 'Chase', aliases: ['Chase Freedom'] },
  ];
  const { canonical, collisions } = buildNameResolver(withHijack);
  assert.equal(canonical('Chase Freedom'), 'Chase Freedom');
  assert.equal(collisions.length, 1);
  assert.match(collisions[0], /Chase Freedom/);
});

test('two cards claiming one alias is reported, not silently resolved', () => {
  const dupes = [
    { name: 'Card A', bank: 'Citi', aliases: ['Shared Name'] },
    { name: 'Card B', bank: 'Citi', aliases: ['Shared Name'] },
  ];
  const { collisions } = buildNameResolver(dupes);
  assert.equal(collisions.length, 1);
  assert.match(collisions[0], /Card A.*Card B|Card B.*Card A/);
});

test('a card aliasing its own name is not a collision', () => {
  const { collisions } = buildNameResolver([
    { name: 'Chase Freedom', bank: 'Chase', aliases: ['Chase Freedom'] },
  ]);
  assert.deepEqual(collisions, []);
});

console.log('buildExtractPrompt');

test('aliased cards render as "Canonical [= alias, alias]"', () => {
  const prompt = buildExtractPrompt([], CATALOG);
  assert.match(
    prompt,
    /Kroger Rewards World Elite Mastercard \[= Harris Teeter Rewards World Elite Mastercard, Ralphs Rewards World Elite Mastercard\]/,
  );
});

test('cards without aliases render as a bare name', () => {
  const prompt = buildExtractPrompt([], CATALOG);
  assert.match(prompt, /\*\*Chase\*\*: Chase Freedom(?!\s*\[)/);
});

test('the catalog stays grouped by issuer and sorted by canonical name', () => {
  const prompt = buildExtractPrompt([], CATALOG);
  const usBank = prompt.match(/- \*\*U\.S\. Bank\*\*: (.+)/)[1];
  assert.ok(
    usBank.indexOf('Kroger') < usBank.indexOf('Smartly'),
    'alias label must not change sort position',
  );
});

test('the prompt tells the model to emit the canonical name', () => {
  const prompt = buildExtractPrompt([], CATALOG);
  assert.match(prompt, /always emit the canonical name/i);
});

console.log('real catalog');

test('the shipped catalog has no alias collisions', () => {
  const { collisions } = buildNameResolver(loadCardCatalog());
  assert.deepEqual(collisions, [], `collisions: ${collisions.join('; ')}`);
});

test('the Kroger banner names resolve in the shipped catalog', () => {
  const { canonical } = buildNameResolver(loadCardCatalog());
  for (const banner of ['Harris Teeter', 'Ralphs', "Pick 'n Save", 'QFC']) {
    assert.equal(
      canonical(`${banner} Rewards World Elite Mastercard`),
      'Kroger Rewards World Elite Mastercard',
      `${banner} did not resolve`,
    );
  }
});

console.log('validateChange after resolution');

test('a resolved sibling pair passes the same-issuer check', () => {
  // "My Harris Teeter card became a Smartly" is a U.S. Bank change once the
  // alias is folded in; before folding it would fail as uncatalogued.
  const { canonical } = buildNameResolver(CATALOG);
  const pc = {
    source_id: 't3_abc123',
    from_card: canonical('Harris Teeter Rewards World Elite Mastercard'),
    to_card: canonical('Smartly Visa Signature'),
    change_month: '2026-08',
  };
  const errors = validateChange(pc, {
    candidateIds: new Set(['t3_abc123']),
    cardByName: new Map(CATALOG.map((c) => [c.name, c])),
    bankByName: new Map(CATALOG.map((c) => [c.name, c.bank])),
    usedIds: new Set(),
  });
  assert.deepEqual(errors, []);
});

test('an unresolved alias is still rejected as uncatalogued', () => {
  const errors = validateChange(
    {
      source_id: 't3_abc123',
      from_card: 'Harris Teeter Rewards World Elite Mastercard',
      to_card: 'Smartly Visa Signature',
      change_month: '2026-08',
    },
    {
      candidateIds: new Set(['t3_abc123']),
      cardByName: new Map(CATALOG.map((c) => [c.name, c])),
      bankByName: new Map(CATALOG.map((c) => [c.name, c.bank])),
      usedIds: new Set(),
    },
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /not in the catalog/);
});

if (failures) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nAll tests passed.');
