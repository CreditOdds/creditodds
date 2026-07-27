// Smoke tests for the card context handed to the /best ranking panel.
//
// getCardContext used to map rewards to {category, value, unit, description}.
// No card has ever set `reward.description` and build-cards.js does not emit
// it, so the field was always undefined: all 278 reward `note`s and every
// merchant_specific / merchant_gate flag were silently dropped, and the panel
// ranked (and the writer described) gated rates as if they were category-wide.
//
// Run: `node scripts/refresh-best-pages.test.js`. Exits non-zero on failure.
// Requires data/cards.json — run `npm run build:cards` first if it is missing.

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { getCardContext, buildVoterPrompt, buildWriterPrompt } = require('./refresh-best-pages.js');

const CARDS_FILE = path.join(__dirname, '..', 'data', 'cards.json');

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

console.log('getCardContext');

test('a reward note reaches the panel', () => {
  const ctx = getCardContext({
    name: 'X', rewards: [{ category: 'groceries', value: 3, unit: 'points_per_dollar', note: 'Online grocery purchases only' }],
  });
  assert.equal(ctx.rewards[0].note, 'Online grocery purchases only');
});

test('merchant_specific is flagged', () => {
  const ctx = getCardContext({
    name: 'X', rewards: [{ category: 'online_shopping', value: 5, unit: 'percent', note: 'Intuit products', merchant_specific: true }],
  });
  assert.equal(ctx.rewards[0].merchant_specific, true);
});

test('a non-empty merchant_gate is passed through', () => {
  const ctx = getCardContext({
    name: 'X', rewards: [{ category: 'transit', value: 5, unit: 'percent', note: 'On Lyft rides', merchant_gate: ['lyft'] }],
  });
  assert.deepEqual(ctx.rewards[0].merchant_gate, ['lyft']);
});

test('absent scope fields are omitted rather than sent as undefined keys', () => {
  const ctx = getCardContext({ name: 'X', rewards: [{ category: 'dining', value: 4, unit: 'percent' }] });
  assert.deepEqual(Object.keys(ctx.rewards[0]), ['category', 'value', 'unit']);
  // An empty gate list is not a gate.
  const empty = getCardContext({ name: 'X', rewards: [{ category: 'dining', value: 4, unit: 'percent', merchant_gate: [] }] });
  assert.equal('merchant_gate' in empty.rewards[0], false);
});

test('the dead `description` field is gone', () => {
  const ctx = getCardContext({
    name: 'X', rewards: [{ category: 'dining', value: 4, unit: 'percent', description: 'should not be read' }],
  });
  assert.equal('description' in ctx.rewards[0], false);
});

console.log('\nprompts');

test('both prompts explain what a gate means', () => {
  const page = { data: { title: 'Best X', description: 'd', cards: [], intro: '' } };
  for (const [label, prompt] of [['voter', buildVoterPrompt(page, [])], ['writer', buildWriterPrompt(page, [])]]) {
    assert.match(prompt, /merchant_specific/, `${label} prompt does not mention merchant_specific`);
    assert.match(prompt, /merchant_gate/, `${label} prompt does not mention merchant_gate`);
  }
});

console.log('\nagainst built cards.json');

if (!fs.existsSync(CARDS_FILE)) {
  console.log('  skip (data/cards.json missing; run `npm run build:cards`)');
} else {
  const cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8')).cards;

  test('no reward in cards.json sets `description` (the field the old code read)', () => {
    const offenders = cards
      .filter(c => (c.rewards || []).some(r => r && r.description !== undefined))
      .map(c => c.slug);
    assert.deepEqual(offenders, []);
  });

  test('every gated reward reaches the panel with both its flag and its scope', () => {
    const missing = [];
    for (const card of cards) {
      const ctx = getCardContext(card);
      for (const r of ctx.rewards || []) {
        const gated = r.merchant_specific === true || (r.merchant_gate && r.merchant_gate.length > 0);
        if (gated && !r.note) missing.push(`${card.slug}: ${r.value} ${r.category}`);
      }
    }
    // A gated rate with no note gives the panel a flag it cannot interpret.
    // If this ever fails, the card YAML needs a note, not a code change.
    assert.deepEqual(missing, [], `gated rewards with no scope note:\n${missing.join('\n')}`);
  });

  test('notes and gates actually survive for a known-gated card', () => {
    const csp = cards.find(c => c.slug === 'chase-sapphire-preferred');
    assert.ok(csp, 'chase-sapphire-preferred missing from cards.json');
    const groceries = getCardContext(csp).rewards.find(r => r.category === 'groceries');
    assert.equal(groceries.merchant_specific, true);
    assert.match(groceries.note, /Online grocery purchases only/);
  });
}

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
