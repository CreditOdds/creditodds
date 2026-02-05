#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ARTICLES_DIR = path.join(__dirname, '..', 'data', 'articles');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'articles.json');
const SCHEMA_FILE = path.join(ARTICLES_DIR, 'schema.json');
const CARDS_FILE = path.join(__dirname, '..', 'data', 'cards.json');

const VALID_TAGS = [
  'strategy',
  'guide',
  'analysis',
  'news-analysis',
  'beginner'
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
    console.warn('Warning: Could not load cards.json for card lookup:', err.message);
    return {};
  }
}

function generateAuthorSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function validateArticle(item, schema) {
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

  // Validate summary length
  if (item.summary && item.summary.length > 200) {
    errors.push(`Summary too long: ${item.summary.length} chars (max 200)`);
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

  // Validate related_cards patterns if present
  if (item.related_cards) {
    if (!Array.isArray(item.related_cards)) {
      errors.push('related_cards must be an array');
    } else {
      for (const cardSlug of item.related_cards) {
        if (!/^[a-z0-9-]+$/.test(cardSlug)) {
          errors.push(`Invalid related_cards slug format: ${cardSlug} (must be lowercase with hyphens only)`);
        }
      }
    }
  }

  return errors;
}

function calculateReadingTime(content) {
  // Average reading speed is about 200 words per minute
  const wordCount = content.split(/\s+/).length;
  const minutes = Math.ceil(wordCount / 200);
  return minutes;
}

function buildArticles() {
  console.log('Building articles.json from YAML files...\n');

  const schema = loadSchema();
  const cardsLookup = loadCardsLookup();
  const articles = [];
  const errors = [];

  // Read all YAML files in the articles directory
  const files = fs.readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  console.log(`Found ${files.length} article file(s)\n`);

  for (const file of files) {
    const filePath = path.join(ARTICLES_DIR, file);
    console.log(`Processing: ${file}`);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const item = yaml.load(content);

      // Validate the article
      const validationErrors = validateArticle(item, schema);
      if (validationErrors.length > 0) {
        errors.push({ file, errors: validationErrors });
        console.log(`  ERROR: ${validationErrors.join(', ')}`);
        continue;
      }

      // Calculate reading time
      item.reading_time = calculateReadingTime(item.content);

      // Generate author_slug if not provided
      if (!item.author_slug && item.author) {
        item.author_slug = generateAuthorSlug(item.author);
      }

      // Enrich related_cards with card info
      if (item.related_cards && item.related_cards.length > 0) {
        item.related_cards_info = item.related_cards
          .filter(slug => cardsLookup[slug])
          .map(slug => ({
            slug: slug,
            name: cardsLookup[slug].name,
            image: cardsLookup[slug].image,
            bank: cardsLookup[slug].bank
          }));
      }

      articles.push(item);
      console.log(`  OK: ${item.title} (${item.reading_time} min read)`);
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

  // Sort articles by date (newest first)
  articles.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Write output
  const output = {
    generated_at: new Date().toISOString(),
    count: articles.length,
    articles: articles,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nSuccessfully built ${articles.length} article(s) to ${OUTPUT_FILE}`);
}

buildArticles();
