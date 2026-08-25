#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const NEWS_DIR = path.join(__dirname, '..', 'data', 'news');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'news.json');
const SCHEMA_FILE = path.join(NEWS_DIR, 'schema.json');
const CARDS_FILE = path.join(__dirname, '..', 'data', 'cards.json');

// Keep in sync with TITLE_MAX in apps/web-next/src/lib/seo.ts, which drives the
// generateMetadata truncation backstop.
const TITLE_MAX = 47;
const TITLE_SUFFIX_LEN = ' | CreditOdds'.length;
// Items dated on or after this are hard-failed on title length; older ones are
// pre-existing debt and only counted. See validateNewsItem.
const TITLE_GATE_DATE = '2026-07-16';

// Titles over budget on items predating TITLE_GATE_DATE, collected across the
// run so the build can report one summary line instead of 70 scattered warnings.
const legacyLongTitles = [];

const VALID_TAGS = [
  'new-card',
  'discontinued',
  'bonus-change',
  'fee-change',
  'benefit-change',
  'limited-time',
  'policy-change',
  'rumor',
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

  // SEO: rendered <title> is "${item.title} | CreditOdds" (root layout
  // template), so item.title above TITLE_MAX overflows the 60-char Bing budget.
  // generateMetadata truncates as a backstop, but truncation cuts mid-phrase and
  // drops the payload ("Discover Announces Q2 2026 5% Cash Back..." loses the
  // categories), so the title still needs to be short at the source.
  //
  // This was a bare console.warn until 70 of 123 items had drifted over budget
  // unnoticed, buried in a build log that prints two lines per item. Items dated
  // on or after TITLE_GATE_DATE are hard-failed instead; older ones are counted
  // into a single summary line (see reportTitleBudget) rather than warning
  // per-item. The cutover is the date the card-news triage prompt started
  // specifying a title length, and every item since has complied.
  if (item.title && item.title.length > TITLE_MAX) {
    const rendered = item.title.length + TITLE_SUFFIX_LEN;
    const detail = `title is ${item.title.length} chars (${rendered} after " | CreditOdds"; SEO budget is 60, so item.title must be <= ${TITLE_MAX})`;
    if (item.date && item.date >= TITLE_GATE_DATE) {
      errors.push(detail);
    } else {
      legacyLongTitles.push({ title: item.title, length: item.title.length });
    }
  }

  // Validate date format
  if (item.date && !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
    errors.push(`Invalid date format: ${item.date} (must be YYYY-MM-DD)`);
  }

  // Validate updated format
  if (item.updated && !/^\d{4}-\d{2}-\d{2}$/.test(item.updated)) {
    errors.push(`Invalid updated format: ${item.updated} (must be YYYY-MM-DD)`);
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

  // Validate replacement_cards. Resolution against cards.json happens later in
  // buildNews(), where the lookup is in scope — here we only check shape.
  if (item.replacement_cards !== undefined) {
    if (!Array.isArray(item.replacement_cards)) {
      errors.push('replacement_cards must be an array');
    } else if (item.replacement_cards.length > 4) {
      errors.push('replacement_cards accepts at most 4 entries');
    } else {
      const seen = new Set();
      for (const entry of item.replacement_cards) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          errors.push('Each replacement_cards entry must be an object with a slug');
          continue;
        }
        const extra = Object.keys(entry).filter(k => k !== 'slug' && k !== 'reason');
        if (extra.length > 0) {
          errors.push(`Unknown replacement_cards field(s): ${extra.join(', ')}`);
        }
        if (typeof entry.slug !== 'string' || !/^[a-z0-9-]+$/.test(entry.slug)) {
          errors.push(`Invalid replacement_cards slug: ${entry.slug} (must be lowercase with hyphens only)`);
          continue;
        }
        if (seen.has(entry.slug)) {
          errors.push(`Duplicate replacement_cards slug: ${entry.slug}`);
        }
        seen.add(entry.slug);
        if (entry.reason !== undefined) {
          if (typeof entry.reason !== 'string') {
            errors.push(`replacement_cards reason for ${entry.slug} must be a string`);
          } else if (entry.reason.length > 160) {
            errors.push(`replacement_cards reason for ${entry.slug} is ${entry.reason.length} chars (max 160)`);
          }
        }
        // Pointing readers at the very card the article says is gone is the one
        // mistake this module exists to prevent.
        if (item.card_slugs && item.card_slugs.includes(entry.slug)) {
          errors.push(`replacement_cards slug ${entry.slug} is also in card_slugs — a card cannot replace itself`);
        } else if (item.card_slug === entry.slug) {
          errors.push(`replacement_cards slug ${entry.slug} is also card_slug — a card cannot replace itself`);
        }
      }
    }
  }

  return errors;
}

// One line for the whole run, so pre-existing over-budget titles stay visible
// and countable instead of scrolling past as per-item warnings nobody reads.
function reportTitleBudget() {
  if (legacyLongTitles.length === 0) return;
  const worst = legacyLongTitles
    .slice()
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  console.warn(
    `\nWARN: ${legacyLongTitles.length} item(s) predating ${TITLE_GATE_DATE} have titles over ` +
    `${TITLE_MAX} chars. These render truncated mid-phrase in <title>. Longest:`
  );
  for (const { title, length } of worst) {
    console.warn(`  ${length} chars: ${title}`);
  }
  console.warn(
    `Newer items are hard-failed on this, so the count can only go down. ` +
    `Rewrite them in data/news/ to clear it.`
  );
}

function buildNews() {
  console.log('Building news.json from YAML files...\n');

  const schema = loadSchema();
  const cardsLookup = loadCardsLookup();
  const newsItems = [];
  const errors = [];
  // Replacement-card failures found while resolving against cards.json, which
  // only becomes possible after per-item validation has run.
  const resolutionErrors = [];

  // Fail loud if cards.json didn't load. Without it, every related-card image
  // lookup below resolves to null, silently shipping a news.json where related
  // cards render the gray placeholder instead of card art. That is a systemic
  // build error, not a per-item content issue, so stop rather than deploy broken
  // data. (data/cards.json is gitignored — CI must run `npm run build:cards`
  // before this script.)
  if (Object.keys(cardsLookup).length === 0) {
    console.error(
      'ERROR: cards lookup is empty — data/cards.json is missing or unreadable.\n' +
      'Run `npm run build:cards` before building news, or related-card images will be blank.'
    );
    process.exit(1);
  }

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

      // Resolve every referenced card into a self-contained object, the same
      // shape replacement_cards_info uses below. Parallel arrays were the bug
      // here: card_image_links dropped unresolved entries, so a multi-card item
      // whose first slug was missing from cards.json shifted every later image
      // up a slot and rendered one card's art under another card's name. An
      // image that travels with its own slug and name can only ever blank
      // itself.
      if (item.card_slugs) {
        item.cards_info = item.card_slugs.map((slug, i) => {
          const card = cardsLookup[slug];
          if (!card) {
            console.warn(`  WARN: card_slug "${slug}" not found in cards.json — related-card image will be blank`);
          }
          return {
            slug,
            name: (item.card_names && item.card_names[i])
              || (card && (card.card_name || card.name))
              || slug,
            image: (card && card.image) || null,
          };
        });

        // Legacy fields. card_image_links holds resolved images only and is NOT
        // index-aligned with card_slugs/card_names — read cards_info instead.
        // Kept so a news.json published before cards_info existed still renders
        // in a frontend build that lands ahead of the next news rebuild.
        item.card_image_links = item.cards_info.map(c => c.image).filter(Boolean);
        // Singular partner of card_slug/card_name, which are card_slugs[0] /
        // card_names[0] — so it is the first card's image or nothing, never the
        // first image that happened to resolve.
        if (item.cards_info[0] && item.cards_info[0].image) {
          item.card_image_link = item.cards_info[0].image;
        }
      }

      // Resolve replacement cards into self-contained objects so the frontend
      // never has to index parallel arrays. Failures are fatal rather than
      // warnings: this module's whole job is to hand a reader a card they can
      // still apply for, and a bad slug either 404s or points at another dead
      // card — worse than rendering nothing at all.
      if (item.replacement_cards) {
        const resolved = [];
        for (const entry of item.replacement_cards) {
          const card = cardsLookup[entry.slug];
          if (!card) {
            resolutionErrors.push(
              `${file}: replacement_cards slug "${entry.slug}" not found in cards.json`
            );
            continue;
          }
          if (card.accepting_applications === false) {
            resolutionErrors.push(
              `${file}: replacement_cards slug "${entry.slug}" (${card.name}) is not accepting ` +
              'applications — it cannot be offered as a replacement'
            );
            continue;
          }
          resolved.push({
            slug: entry.slug,
            name: card.card_name || card.name,
            image: card.image || null,
            bank: card.bank || '',
            annual_fee: typeof card.annual_fee === 'number' ? card.annual_fee : null,
            ...(entry.reason ? { reason: entry.reason } : {}),
          });
        }
        item.replacement_cards_info = resolved;
      }

      newsItems.push(item);
      console.log(`  OK: ${item.title}`);
    } catch (err) {
      errors.push({ file, errors: [err.message] });
      console.log(`  ERROR: ${err.message}`);
    }
  }

  console.log('\n---');
  reportTitleBudget();


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

  if (resolutionErrors.length > 0) {
    console.error(`\nReplacement-card resolution failed with ${resolutionErrors.length} error(s):`);
    for (const err of resolutionErrors) {
      console.error(`  - ${err}`);
    }
    console.error(
      '\nFix the slug, or drop the entry. A replacement card must exist in cards.json\n' +
      'and still be accepting applications.'
    );
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
