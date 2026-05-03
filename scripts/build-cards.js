#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const CARDS_DIR = path.join(__dirname, '..', 'data', 'cards');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'cards.json');
const SCHEMA_FILE = path.join(CARDS_DIR, 'schema.json');
const CATEGORIES_FILE = path.join(__dirname, '..', 'data', 'categories.yaml');

function loadSchema() {
  const schemaContent = fs.readFileSync(SCHEMA_FILE, 'utf8');
  return JSON.parse(schemaContent);
}

function loadCategories() {
  const content = fs.readFileSync(CATEGORIES_FILE, 'utf8');
  const data = yaml.load(content);
  return data.categories;
}

function validateCard(card, schema, categoryIds) {
  const errors = [];

  // Check required fields
  for (const field of schema.required) {
    if (card[field] === undefined || card[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate slug pattern
  if (card.slug && !/^[a-z0-9-]+$/.test(card.slug)) {
    errors.push(`Invalid slug format: ${card.slug} (must be lowercase with hyphens only)`);
  }

  // Validate category enum
  if (card.category && schema.properties.category.enum) {
    if (!schema.properties.category.enum.includes(card.category)) {
      errors.push(`Invalid category: ${card.category}`);
    }
  }

  // Validate annual_fee
  if (card.annual_fee !== undefined && (typeof card.annual_fee !== 'number' || card.annual_fee < 0)) {
    errors.push(`Invalid annual_fee: ${card.annual_fee}`);
  }

  // Validate reward_type enum
  if (card.reward_type && !['cashback', 'points', 'miles'].includes(card.reward_type)) {
    errors.push(`Invalid reward_type: ${card.reward_type}`);
  }

  // Validate rewards categories against categories.yaml
  if (card.rewards) {
    const validModes = ['quarterly_rotating', 'user_choice', 'auto_top_spend'];
    for (const reward of card.rewards) {
      if (!categoryIds.has(reward.category)) {
        errors.push(`Invalid reward category: ${reward.category} (not in categories.yaml)`);
      }
      if (typeof reward.value !== 'number') {
        errors.push(`Invalid reward value for ${reward.category}: ${reward.value}`);
      }
      if (!['percent', 'points_per_dollar'].includes(reward.unit)) {
        errors.push(`Invalid reward unit for ${reward.category}: ${reward.unit}`);
      }
      if (reward.note !== undefined && typeof reward.note !== 'string') {
        errors.push(`Invalid reward note for ${reward.category}: must be a string`);
      }
      if (reward.mode !== undefined && !validModes.includes(reward.mode)) {
        errors.push(`Invalid reward mode for ${reward.category}: ${reward.mode} (must be one of ${validModes.join(', ')})`);
      }
      if (reward.eligible_categories) {
        for (const cat of reward.eligible_categories) {
          if (!categoryIds.has(cat)) {
            errors.push(`Invalid eligible_category for ${reward.category}: ${cat} (not in categories.yaml)`);
          }
        }
      }
      if (reward.current_categories) {
        for (const cat of reward.current_categories) {
          if (reward.eligible_categories && !reward.eligible_categories.includes(cat)) {
            // current_categories should be a subset of eligible_categories when both are present
            errors.push(`current_category '${cat}' not in eligible_categories for ${reward.category}`);
          }
          if (!categoryIds.has(cat)) {
            errors.push(`Invalid current_category for ${reward.category}: ${cat} (not in categories.yaml)`);
          }
        }
      }
      if (reward.choices !== undefined && (typeof reward.choices !== 'number' || reward.choices < 1 || !Number.isInteger(reward.choices))) {
        errors.push(`Invalid reward choices for ${reward.category}: must be a positive integer`);
      }
      // Cap fields. spend_cap is the dollar threshold; cap_period is the
      // window over which it resets; rate_after_cap is the rate earned on
      // spend above the cap (defaults to 1 if unspecified).
      if (reward.spend_cap !== undefined && (typeof reward.spend_cap !== 'number' || reward.spend_cap <= 0)) {
        errors.push(`Invalid spend_cap for ${reward.category}: must be a positive number`);
      }
      const validCapPeriods = ['monthly', 'quarterly', 'semi_annual', 'annual', 'billing_cycle', 'lifetime'];
      if (reward.cap_period !== undefined && !validCapPeriods.includes(reward.cap_period)) {
        errors.push(`Invalid cap_period for ${reward.category}: ${reward.cap_period} (must be one of ${validCapPeriods.join(', ')})`);
      }
      if (reward.rate_after_cap !== undefined && (typeof reward.rate_after_cap !== 'number' || reward.rate_after_cap < 0)) {
        errors.push(`Invalid rate_after_cap for ${reward.category}: must be a non-negative number`);
      }
      // Sanity: cap_period or rate_after_cap without spend_cap doesn't make sense.
      if ((reward.cap_period !== undefined || reward.rate_after_cap !== undefined) && reward.spend_cap === undefined) {
        errors.push(`${reward.category}: cap_period/rate_after_cap requires spend_cap to be set`);
      }
    }
  }

  // Validate APR
  if (card.apr) {
    if (typeof card.apr !== 'object' || Array.isArray(card.apr)) {
      errors.push('apr must be an object');
    } else {
      if (card.apr.purchase_intro) {
        if (typeof card.apr.purchase_intro.rate !== 'number') {
          errors.push('apr.purchase_intro.rate must be a number');
        }
        if (typeof card.apr.purchase_intro.months !== 'number' || card.apr.purchase_intro.months < 1) {
          errors.push('apr.purchase_intro.months must be a positive integer');
        }
      }
      if (card.apr.balance_transfer_intro) {
        if (typeof card.apr.balance_transfer_intro.rate !== 'number') {
          errors.push('apr.balance_transfer_intro.rate must be a number');
        }
        if (typeof card.apr.balance_transfer_intro.months !== 'number' || card.apr.balance_transfer_intro.months < 1) {
          errors.push('apr.balance_transfer_intro.months must be a positive integer');
        }
      }
      if (card.apr.regular) {
        if (typeof card.apr.regular.min !== 'number') {
          errors.push('apr.regular.min must be a number');
        }
        if (typeof card.apr.regular.max !== 'number') {
          errors.push('apr.regular.max must be a number');
        }
        if (typeof card.apr.regular.min === 'number' && typeof card.apr.regular.max === 'number' && card.apr.regular.min > card.apr.regular.max) {
          errors.push('apr.regular.min must be <= apr.regular.max');
        }
      }
    }
  }

  return errors;
}

// Compute the current calendar quarter as a "Q<N> YYYY" string. Used to
// surface stale `current_period` values on rotating-category cards
// (Discover It, Chase Freedom Flex, etc.) so we don't silently keep
// last quarter's bonus categories live on the site.
function currentQuarterLabel(now = new Date()) {
  const month = now.getUTCMonth(); // 0-indexed
  const quarter = Math.floor(month / 3) + 1; // 1..4
  return `Q${quarter} ${now.getUTCFullYear()}`;
}

// Walk the loaded cards looking for rotating-category rewards whose
// `current_period` doesn't match the current calendar quarter. Returns an
// array of { file, cardName, currentPeriod } entries — non-fatal warnings.
function findStaleRotatingPeriods(cardsWithFiles) {
  const expected = currentQuarterLabel();
  const stale = [];
  for (const { file, card } of cardsWithFiles) {
    if (!card.rewards) continue;
    for (const reward of card.rewards) {
      if (reward.mode !== 'quarterly_rotating') continue;
      if (!reward.current_period) {
        // Card declares quarterly rotation but has no current_period set —
        // worth flagging so the team fills it in once the new quarter's
        // categories are announced.
        stale.push({ file, cardName: card.name, currentPeriod: '(missing)', expected });
        continue;
      }
      // Tolerate trivial whitespace / Q vs. q variations.
      const norm = String(reward.current_period).trim().toUpperCase();
      if (norm !== expected.toUpperCase()) {
        stale.push({ file, cardName: card.name, currentPeriod: reward.current_period, expected });
      }
    }
  }
  return stale;
}

function buildCards() {
  console.log('Building cards.json from YAML files...\n');

  const schema = loadSchema();
  const categories = loadCategories();
  const categoryIds = new Set(categories.map(c => c.id));
  const cards = [];
  const cardsWithFiles = [];
  const errors = [];

  // Read all YAML files in the cards directory
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  console.log(`Found ${files.length} card file(s)\n`);

  for (const file of files) {
    const filePath = path.join(CARDS_DIR, file);
    console.log(`Processing: ${file}`);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const card = yaml.load(content);

      // Validate the card
      const validationErrors = validateCard(card, schema, categoryIds);
      if (validationErrors.length > 0) {
        errors.push({ file, errors: validationErrors });
        console.log(`  ERROR: ${validationErrors.join(', ')}`);
        continue;
      }

      // Add card_id based on slug for compatibility with existing system
      card.card_id = card.slug;
      card.card_name = card.name; // Alias for compatibility
      delete card.check_ignore;

      cards.push(card);
      cardsWithFiles.push({ file, card });
      console.log(`  OK: ${card.name}`);
    } catch (err) {
      errors.push({ file, errors: [err.message] });
      console.log(`  ERROR: ${err.message}`);
    }
  }

  console.log('\n---');

  if (errors.length > 0) {
    console.error(`\nValidation failed with ${errors.length} error(s):`);
    for (const { file, errors: fileErrors } of errors) {
      console.error(`  ${file}:`);
      for (const err of fileErrors) {
        console.error(`    - ${err}`);
      }
    }
    process.exit(1);
  }

  // Non-fatal warning: rotating-category cards whose current_period is stale.
  // This protects against the failure mode where a card silently keeps last
  // quarter's bonus categories live on the site after the new quarter starts —
  // surfaced manually multiple times (e.g. Discover It Cash Back).
  const staleRotations = findStaleRotatingPeriods(cardsWithFiles);
  if (staleRotations.length > 0) {
    console.warn(
      `\n⚠️  ${staleRotations.length} card(s) have stale or missing rotating-category period (expected ${currentQuarterLabel()}):`
    );
    for (const { file, cardName, currentPeriod, expected } of staleRotations) {
      console.warn(`  - ${cardName} (${file}): current_period="${currentPeriod}", expected "${expected}"`);
    }
    console.warn(
      `  These won't fail the build — fix the YAML when you have the new quarter's categories.\n`
    );
  }

  // Sort cards by name
  cards.sort((a, b) => a.name.localeCompare(b.name));

  // Write output
  const output = {
    generated_at: new Date().toISOString(),
    count: cards.length,
    categories: categories,
    cards: cards,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nSuccessfully built ${cards.length} card(s) to ${OUTPUT_FILE}`);
}

buildCards();
