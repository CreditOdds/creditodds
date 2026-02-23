#!/usr/bin/env node

/**
 * Auto Card Update Script
 *
 * Searches for changes to credit card data (annual fees, rewards, signup bonuses)
 * using Brave Search API, analyzes changes with Claude Sonnet, and updates YAML
 * files for human review via PR.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Configuration
const CARDS_DIR = path.join(__dirname, '..', 'data', 'cards');
const SUMMARY_FILE = path.join(__dirname, '..', '.card-update-summary.md');
const CARDS_PER_DAY = 20;
const ACTIVE_PER_DAY = 15;
const SEARCH_DELAY_MS = 1200;

/**
 * Load all card YAML files from data/cards/
 */
function loadAllCards() {
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.yaml'));
  const cards = [];
  for (const file of files) {
    try {
      const filepath = path.join(CARDS_DIR, file);
      const content = fs.readFileSync(filepath, 'utf8');
      const data = yaml.load(content);
      if (data && data.slug) {
        cards.push({ slug: data.slug, filepath, data });
      }
    } catch (err) {
      console.warn(`Warning: Could not parse ${file}: ${err.message}`);
    }
  }
  return cards;
}

/**
 * Select ~20 cards for today using day-of-year rotation.
 * Active cards (accepting applications) get more slots per day.
 */
function selectCardsForToday(allCards) {
  const active = allCards
    .filter(c => c.data.accepting_applications !== false)
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const inactive = allCards
    .filter(c => c.data.accepting_applications === false)
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const now = new Date();
  const dayOffset = parseInt(process.env.DAY_OFFSET || '0', 10);
  const dayOfYear = Math.floor(
    (now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)
  ) + dayOffset;

  const selected = [];

  // Active cards pool — more slots per day for faster rotation
  const aPerDay = Math.min(ACTIVE_PER_DAY, active.length);
  if (aPerDay > 0) {
    const aCycles = Math.ceil(active.length / aPerDay);
    const aStart = (dayOfYear % aCycles) * aPerDay;
    selected.push(...active.slice(aStart, aStart + aPerDay));
  }

  // Inactive cards pool — fill remaining slots
  const remaining = CARDS_PER_DAY - selected.length;
  const iPerDay = Math.min(remaining, inactive.length);
  if (iPerDay > 0) {
    const iCycles = Math.ceil(inactive.length / iPerDay);
    const iStart = (dayOfYear % iCycles) * iPerDay;
    selected.push(...inactive.slice(iStart, iStart + iPerDay));
  }

  return selected.slice(0, CARDS_PER_DAY);
}

/**
 * Search for card info using Brave Search API
 */
async function searchCardInfo(card) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error('BRAVE_SEARCH_API_KEY required');

  const year = new Date().getFullYear();
  const query = `"${card.data.name}" ${card.data.bank} credit card annual fee rewards benefits ${year}`;

  const params = new URLSearchParams({
    q: query,
    count: '5',
    freshness: 'py',
    text_decorations: 'false',
  });

  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?${params}`,
    {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Brave Search error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.web?.results || [];
}

/**
 * Analyze all cards in a single Claude Sonnet call.
 * Returns only high-confidence changes.
 */
async function analyzeChanges(cards, searchResults) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required');

  const cardsContext = cards
    .map((card) => {
      const current = {
        annual_fee: card.data.annual_fee,
        reward_type: card.data.reward_type || null,
        rewards: card.data.rewards || null,
        signup_bonus: card.data.signup_bonus || null,
      };

      const results = (searchResults[card.slug] || [])
        .map(
          (r, j) =>
            `  [${j + 1}] ${r.title}\n  URL: ${r.url}\n  Description: ${r.description || 'N/A'}`
        )
        .join('\n');

      return `### ${card.data.name} (slug: ${card.slug}, bank: ${card.data.bank})
Current data:
${JSON.stringify(current, null, 2)}

Search results:
${results || '  No results found'}`;
    })
    .join('\n\n---\n\n');

  const prompt = `You are a credit card data analyst. Compare each card's current data against the search results and identify any factual changes.

## Cards to Check

${cardsContext}

## Instructions
- Compare current values against information found in search results
- Only report changes you are CONFIDENT about from official issuer pages or multiple reliable sources
- For annual_fee: must be a number (e.g., 95, 0, 550). Use the standard annual fee, NOT intro/waived fees.
- For reward_type: must be one of "cashback", "points", "miles"
- For rewards: array of objects with {category, value, unit, note?}
  - unit must be "percent" or "points_per_dollar"
  - category examples: "dining", "travel", "groceries", "gas", "streaming", "everything_else", etc.
- For signup_bonus: object with {value, type, spend_requirement, timeframe_months}
  - value = number of points/miles/dollars
  - type = "points", "miles", or "cashback"
  - spend_requirement = dollar amount
  - timeframe_months = number of months
- Confidence levels:
  - "high" = official card issuer page or multiple reliable sources confirm the change
  - "medium" = single reliable source
- If you are NOT sure about a change, DO NOT report it. False positives are much worse than missed updates.
- If no changes exist for a card, omit it entirely from the output.

## Output Format
Return ONLY a JSON array (no markdown code fences, no extra text). Each element:
{
  "slug": "card-slug",
  "card_name": "Card Name",
  "changes": [
    {
      "field": "annual_fee",
      "old_value": 95,
      "new_value": 250,
      "source_url": "https://example.com",
      "confidence": "high"
    }
  ]
}

For nested fields use dot notation: "signup_bonus.value", "signup_bonus.spend_requirement", "signup_bonus.timeframe_months", "signup_bonus.type"
For rewards changes, use field "rewards" with the full new array as new_value.

If NO changes found for ANY card, return: []`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.content[0]?.text || '[]';

  // Parse JSON — handle possible markdown fences
  const jsonStr = text
    .replace(/^```json?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  try {
    const results = JSON.parse(jsonStr);
    // Filter to high-confidence changes where values actually differ
    return results
      .map((card) => ({
        ...card,
        changes: card.changes.filter((c) => {
          if (c.confidence !== 'high') return false;
          // Skip no-op changes (old_value === new_value)
          if (JSON.stringify(c.old_value) === JSON.stringify(c.new_value)) {
            console.log(`  Skipping no-op change for "${card.card_name}": ${c.field} (${JSON.stringify(c.old_value)} unchanged)`);
            return false;
          }
          return true;
        }),
      }))
      .filter((card) => card.changes.length > 0);
  } catch (err) {
    console.warn('Warning: Could not parse Claude response as JSON:', err.message);
    console.warn('Response:', text.substring(0, 500));
    return [];
  }
}

/**
 * Replace a scalar YAML field value in raw YAML text.
 * Handles both quoted and unquoted values.
 */
function replaceYamlField(yamlText, field, newValue) {
  // Match "field: <value>" (quoted or unquoted) on its own line
  const pattern = new RegExp(`^(${field}:\\s*).*$`, 'm');
  const replacement = typeof newValue === 'string'
    ? `$1"${newValue}"`
    : `$1${newValue}`;
  return yamlText.replace(pattern, replacement);
}

/**
 * Replace a nested YAML block (like signup_bonus or rewards) in raw YAML text.
 * Dumps just the block and splices it into the file.
 */
function replaceYamlBlock(yamlText, field, newValue) {
  // Build the new block as YAML
  const blockObj = { [field]: newValue };
  const blockYaml = yaml.dump(blockObj, {
    quotingType: '"',
    forceQuotes: true,
    lineWidth: -1,
    sortKeys: false,
  }).trimEnd();

  // Find the existing block: starts with "field:" and continues until next top-level key or EOF
  const blockPattern = new RegExp(
    `^${field}:.*(?:\\n(?:  | \\t).*)*`, 'm'
  );
  if (blockPattern.test(yamlText)) {
    return yamlText.replace(blockPattern, blockYaml);
  }

  // Field doesn't exist yet — append it
  return yamlText.trimEnd() + '\n' + blockYaml + '\n';
}

/**
 * Apply changes to YAML files using targeted edits (not full rewrite).
 * Returns the list of applied changes.
 */
function applyChanges(changes, allCards) {
  const cardMap = new Map(allCards.map((c) => [c.slug, c]));
  const applied = [];

  for (const cardChanges of changes) {
    const card = cardMap.get(cardChanges.slug);
    if (!card) {
      console.warn(`Warning: Card not found for slug "${cardChanges.slug}"`);
      continue;
    }

    let yamlText = fs.readFileSync(card.filepath, 'utf8');
    let modified = false;

    for (const change of cardChanges.changes) {
      const { field, new_value } = change;

      if (field === 'annual_fee' || field === 'reward_type') {
        yamlText = replaceYamlField(yamlText, field, new_value);
        modified = true;
      } else if (field === 'rewards') {
        yamlText = replaceYamlBlock(yamlText, 'rewards', new_value);
        modified = true;
      } else if (field === 'signup_bonus') {
        yamlText = replaceYamlBlock(yamlText, 'signup_bonus', new_value);
        modified = true;
      } else if (field.startsWith('signup_bonus.')) {
        // For sub-field changes, update the parsed object and rewrite the block
        const data = yaml.load(yamlText);
        const subfield = field.split('.')[1];
        if (!data.signup_bonus) data.signup_bonus = {};
        data.signup_bonus[subfield] = new_value;
        yamlText = replaceYamlBlock(yamlText, 'signup_bonus', data.signup_bonus);
        modified = true;
      }

      const oldStr = JSON.stringify(change.old_value);
      const newStr = JSON.stringify(change.new_value);
      console.log(
        `  "${cardChanges.card_name}": ${field} ${oldStr} → ${newStr} (source: ${change.source_url})`
      );
    }

    if (modified) {
      fs.writeFileSync(card.filepath, yamlText);
      applied.push(cardChanges);
    }
  }

  return applied;
}

/**
 * Generate PR summary markdown
 */
function generateSummary(applied) {
  if (applied.length === 0) return '';

  let md = '## Auto Card Data Updates\n\n';
  md += 'The following card data changes were detected:\n\n';

  for (const card of applied) {
    md += `### ${card.card_name}\n`;
    for (const change of card.changes) {
      const oldStr =
        typeof change.old_value === 'object'
          ? JSON.stringify(change.old_value)
          : String(change.old_value ?? 'none');
      const newStr =
        typeof change.new_value === 'object'
          ? JSON.stringify(change.new_value)
          : String(change.new_value);
      md += `- **${change.field}**: ${oldStr} → ${newStr} ([source](${change.source_url}))\n`;
    }
    md += '\n';
  }

  md += '### How to Review\n';
  md += '1. Verify each change against the linked source\n';
  md += '2. Check that the values match the official card terms\n';
  md += '3. Remove any changes that look incorrect\n';
  md += '4. Run `npm run build:cards` to validate YAML\n\n';
  md += '---\n*Automated PR — review carefully before merging.*\n';

  return md;
}

/**
 * Main execution
 */
async function main() {
  console.log('=== Auto Card Data Update ===\n');

  if (!process.env.BRAVE_SEARCH_API_KEY) {
    console.error('Error: BRAVE_SEARCH_API_KEY environment variable is required');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  // Load all cards
  console.log('Loading cards...');
  const allCards = loadAllCards();
  console.log(`  Found ${allCards.length} cards\n`);

  // Select today's batch
  const todayCards = selectCardsForToday(allCards);
  const activeCount = todayCards.filter(
    (c) => c.data.accepting_applications !== false
  ).length;
  const inactiveCount = todayCards.length - activeCount;
  console.log(
    `Selected ${todayCards.length} cards for today (${activeCount} active, ${inactiveCount} inactive):`
  );
  todayCards.forEach((c) => console.log(`  - ${c.data.name} (${c.slug})`));
  console.log('');

  // Search for each card
  console.log('Searching for card info...');
  const searchResults = {};
  for (const card of todayCards) {
    try {
      const results = await searchCardInfo(card);
      searchResults[card.slug] = results;
      console.log(`  "${card.data.name}" → ${results.length} results`);
    } catch (err) {
      console.warn(
        `  Warning: Search failed for "${card.data.name}": ${err.message}`
      );
      searchResults[card.slug] = [];
    }
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DELAY_MS));
  }
  console.log('');

  // Analyze with Claude
  console.log('Analyzing changes with Claude Sonnet...');
  const changes = await analyzeChanges(todayCards, searchResults);
  console.log(`Found ${changes.length} card(s) with high-confidence changes\n`);

  if (changes.length === 0) {
    console.log('No changes detected. Exiting.');
    // Clean up any previous summary
    if (fs.existsSync(SUMMARY_FILE)) fs.unlinkSync(SUMMARY_FILE);
    return;
  }

  // Apply changes
  console.log('Applying changes...');
  const applied = applyChanges(changes, allCards);
  console.log(`\nApplied changes to ${applied.length} card(s)\n`);

  // Write summary for PR body
  const summary = generateSummary(applied);
  if (summary) {
    fs.writeFileSync(SUMMARY_FILE, summary);
    console.log(`PR summary written to ${SUMMARY_FILE}`);
  }

  console.log('\n=== Complete ===');
  if (applied.length > 0) {
    console.log('Run "npm run build:cards" to validate the updated YAML files.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
