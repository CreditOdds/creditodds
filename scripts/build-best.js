#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BEST_DIR = path.join(__dirname, '..', 'data', 'best');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'best.json');
const SCHEMA_FILE = path.join(BEST_DIR, 'schema.json');
const CARDS_FILE = path.join(__dirname, '..', 'data', 'cards.json');

function loadSchema() {
  const schemaContent = fs.readFileSync(SCHEMA_FILE, 'utf8');
  return JSON.parse(schemaContent);
}

function loadCardsLookup() {
  try {
    const cardsContent = fs.readFileSync(CARDS_FILE, 'utf8');
    const cardsData = JSON.parse(cardsContent);
    const lookup = {};
    for (const card of cardsData.cards) {
      lookup[card.slug] = card;
    }
    return lookup;
  } catch (err) {
    console.warn('Warning: Could not load cards.json for card lookup:', err.message);
    return {};
  }
}

function generateAuthorSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function validateBestPage(item, schema, cardsLookup) {
  const errors = [];

  // Check required fields
  for (const field of schema.required) {
    if (item[field] === undefined || item[field] === null || item[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate id pattern
  if (item.id && !/^[a-z0-9-]+$/.test(item.id)) {
    errors.push(`Invalid id format: ${item.id} (must be lowercase with hyphens only)`);
  }

  // Validate slug pattern
  if (item.slug && !/^[a-z0-9-]+$/.test(item.slug)) {
    errors.push(`Invalid slug format: ${item.slug} (must be lowercase with hyphens only)`);
  }

  // Validate date format
  if (item.date && !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
    errors.push(`Invalid date format: ${item.date} (must be YYYY-MM-DD)`);
  }

  // Validate updated_at format if present
  if (item.updated_at && !/^\d{4}-\d{2}-\d{2}$/.test(item.updated_at)) {
    errors.push(`Invalid updated_at format: ${item.updated_at} (must be YYYY-MM-DD)`);
  }

  // Validate author_slug pattern if present
  if (item.author_slug && !/^[a-z0-9-]+$/.test(item.author_slug)) {
    errors.push(`Invalid author_slug format: ${item.author_slug} (must be lowercase with hyphens only)`);
  }

  // Validate cards array
  if (item.cards) {
    if (!Array.isArray(item.cards)) {
      errors.push('cards must be an array');
    } else {
      for (const card of item.cards) {
        if (!card.slug) {
          errors.push('Each card entry must have a slug');
        } else if (!/^[a-z0-9-]+$/.test(card.slug)) {
          errors.push(`Invalid card slug format: ${card.slug} (must be lowercase with hyphens only)`);
        } else if (!cardsLookup[card.slug]) {
          errors.push(`Card slug not found in cards.json: ${card.slug}`);
        }
      }
    }
  }

  return errors;
}

function buildBest() {
  console.log('Building best.json from YAML files...\n');

  const schema = loadSchema();
  const cardsLookup = loadCardsLookup();
  const pages = [];
  const errors = [];

  // Read all YAML files in the best directory
  const files = fs.readdirSync(BEST_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  console.log(`Found ${files.length} best page file(s)\n`);

  for (const file of files) {
    const filePath = path.join(BEST_DIR, file);
    console.log(`Processing: ${file}`);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const item = yaml.load(content);

      // Validate the best page
      const validationErrors = validateBestPage(item, schema, cardsLookup);
      if (validationErrors.length > 0) {
        errors.push({ file, errors: validationErrors });
        console.log(`  ERROR: ${validationErrors.join(', ')}`);
        continue;
      }

      // Generate author_slug if not provided
      if (!item.author_slug && item.author) {
        item.author_slug = generateAuthorSlug(item.author);
      }

      pages.push(item);
      console.log(`  OK: ${item.title} (${item.cards.length} cards)`);
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

  // Sort pages by date (newest first)
  pages.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Write output
  const output = {
    generated_at: new Date().toISOString(),
    count: pages.length,
    pages: pages,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nSuccessfully built ${pages.length} best page(s) to ${OUTPUT_FILE}`);
}

buildBest();
