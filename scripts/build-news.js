#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const NEWS_DIR = path.join(__dirname, '..', 'data', 'news');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'news.json');
const SCHEMA_FILE = path.join(NEWS_DIR, 'schema.json');
const CARDS_FILE = path.join(__dirname, '..', 'data', 'cards.json');

const VALID_TAGS = [
  'new-card',
  'discontinued',
  'bonus-change',
  'fee-change',
  'benefit-change',
  'limited-time',
  'policy-change',
  'general'
];

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
    console.warn('Warning: Could not load cards.json for image lookup:', err.message);
    return {};
  }
}

function validateNewsItem(item, schema) {
  const errors = [];

  // Check required fields
  for (const field of schema.required) {
    if (item[field] === undefined || item[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate id pattern
  if (item.id && !/^[a-z0-9-]+$/.test(item.id)) {
    errors.push(`Invalid id format: ${item.id} (must be lowercase with hyphens only)`);
  }

  // Validate date format
  if (item.date && !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
    errors.push(`Invalid date format: ${item.date} (must be YYYY-MM-DD)`);
  }

  // Validate tags
  if (item.tags) {
    if (!Array.isArray(item.tags)) {
      errors.push('Tags must be an array');
    } else {
      for (const tag of item.tags) {
        if (!VALID_TAGS.includes(tag)) {
          errors.push(`Invalid tag: ${tag}. Valid tags: ${VALID_TAGS.join(', ')}`);
        }
      }
    }
  }

  // Validate body if present
  if (item.body !== undefined) {
    if (typeof item.body !== 'string') {
      errors.push('body must be a string');
    } else if (item.body.length > 15000) {
      errors.push(`body is too long (${item.body.length} chars, max 15000)`);
    }
  }

  // Validate card_slug pattern if present
  if (item.card_slug && !/^[a-z0-9-]+$/.test(item.card_slug)) {
    errors.push(`Invalid card_slug format: ${item.card_slug} (must be lowercase with hyphens only)`);
  }

  // Error if both singular and plural card fields are set
  if (item.card_slug && item.card_slugs) {
    errors.push('Cannot set both card_slug and card_slugs — use one or the other');
  }

  // Validate card_slugs items if present
  if (item.card_slugs) {
    if (!Array.isArray(item.card_slugs)) {
      errors.push('card_slugs must be an array');
    } else {
      for (const slug of item.card_slugs) {
        if (!/^[a-z0-9-]+$/.test(slug)) {
          errors.push(`Invalid card_slugs item: ${slug} (must be lowercase with hyphens only)`);
        }
      }
      if (item.card_names && item.card_names.length !== item.card_slugs.length) {
        errors.push('card_slugs and card_names must have the same length');
      }
    }
  }

  return errors;
}

function buildNews() {
  console.log('Building news.json from YAML files...\n');

  const schema = loadSchema();
  const cardsLookup = loadCardsLookup();
  const newsItems = [];
  const errors = [];

  // Read all YAML files in the news directory
  const files = fs.readdirSync(NEWS_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  console.log(`Found ${files.length} news file(s)\n`);

  for (const file of files) {
    const filePath = path.join(NEWS_DIR, file);
    console.log(`Processing: ${file}`);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const item = yaml.load(content);

      // Validate the news item
      const validationErrors = validateNewsItem(item, schema);
      if (validationErrors.length > 0) {
        errors.push({ file, errors: validationErrors });
        console.log(`  ERROR: ${validationErrors.join(', ')}`);
        continue;
      }

      // Normalize singular card fields into arrays
      if (item.card_slugs) {
        // Multi-card: use arrays as-is, set singular to first element for backward compat
        item.card_slug = item.card_slugs[0];
        if (item.card_names) {
          item.card_name = item.card_names[0];
        }
      } else if (item.card_slug) {
        // Single card: wrap in arrays
        item.card_slugs = [item.card_slug];
        if (item.card_name) {
          item.card_names = [item.card_name];
        }
      }

      // Build card_image_links array and set singular for backward compat
      if (item.card_slugs) {
        item.card_image_links = item.card_slugs.map(slug => {
          const card = cardsLookup[slug];
          return card ? card.image : null;
        }).filter(Boolean);
        if (item.card_image_links.length > 0) {
          item.card_image_link = item.card_image_links[0];
        }
      }

      newsItems.push(item);
      console.log(`  OK: ${item.title}`);
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

  // Sort news by date (newest first)
  newsItems.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Write output
  const output = {
    generated_at: new Date().toISOString(),
    count: newsItems.length,
    items: newsItems,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nSuccessfully built ${newsItems.length} news item(s) to ${OUTPUT_FILE}`);
}

buildNews();
