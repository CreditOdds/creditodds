#!/usr/bin/env node

/**
 * Check Card Pages Script
 *
 * Fetches the apply page for each active card that has an apply_link,
 * uses Claude Haiku to extract current terms, and creates a PR for
 * human review when changes are detected.
 *
 * Only processes cards where:
 *   - accepting_applications !== false
 *   - apply_link is set
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const CARDS_DIR = path.join(__dirname, '..', 'data', 'cards');
const SUMMARY_FILE = path.join(__dirname, '..', '.card-page-check-summary.md');
const FETCH_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 15000;

// ─── YAML helpers (shared pattern with auto-card-update.js) ──────────────────

function replaceYamlField(yamlText, field, newValue) {
  const pattern = new RegExp(`^(${field}:\\s*).*$`, 'm');
  const replacement =
    typeof newValue === 'string' ? `$1"${newValue}"` : `$1${newValue}`;
  if (pattern.test(yamlText)) {
    return yamlText.replace(pattern, replacement);
  }
  // Field not present — append it
  return yamlText.trimEnd() + `\n${field}: ${newValue}\n`;
}

function replaceYamlBlock(yamlText, field, newValue) {
  const blockObj = { [field]: newValue };
  const blockYaml = yaml.dump(blockObj, {
    quotingType: '"',
    forceQuotes: true,
    lineWidth: -1,
    sortKeys: false,
  }).trimEnd();

  const blockPattern = new RegExp(`^${field}:.*(?:\\n(?:  |\\t).*)*`, 'm');
  if (blockPattern.test(yamlText)) {
    return yamlText.replace(blockPattern, blockYaml);
  }
  return yamlText.trimEnd() + '\n' + blockYaml + '\n';
}

// ─── Card loading ─────────────────────────────────────────────────────────────

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

function filterCardsForCheck(allCards, slugFilter) {
  let cards = allCards.filter(
    c => c.data.accepting_applications !== false && c.data.apply_link
  );
  if (slugFilter) {
    cards = cards.filter(c => c.slug === slugFilter);
    if (cards.length === 0) {
      console.warn(`Warning: No active card with apply_link found for slug "${slugFilter}"`);
    }
  }
  return cards;
}

// ─── Page fetching ────────────────────────────────────────────────────────────

function stripHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);
}

async function fetchPageContent(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`  HTTP ${response.status} — skipping`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      console.warn(`  Non-HTML response (${contentType}) — skipping`);
      return null;
    }

    const html = await response.text();
    const stripped = stripHtml(html);
    if (stripped.length < 100) {
      console.warn(`  Page content too short (${stripped.length} chars) — likely blocked`);
      return null;
    }
    return stripped;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`  Timeout after ${FETCH_TIMEOUT_MS / 1000}s — skipping`);
    } else {
      console.warn(`  Fetch error: ${err.message} — skipping`);
    }
    return null;
  }
}

// ─── Claude Haiku extraction ──────────────────────────────────────────────────

async function extractCardTerms(cardName, bankName, applyLink, pageContent) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required');

  const prompt = `You are extracting credit card terms from a bank's apply page for human review.

Card: ${cardName} (${bankName})
Source URL: ${applyLink}

Page content:
${pageContent}

Extract the following fields and return ONLY valid JSON — no markdown fences, no explanation.

{
  "annual_fee": <number or null>,
  "signup_bonus": {
    "value": <number or null>,
    "type": <"points"|"miles"|"cashback" or null>,
    "spend_requirement": <number or null>,
    "timeframe_months": <number or null>
  },
}

Rules:
- annual_fee: the ongoing annual fee, NOT an introductory/$0 first year rate. If the card says "$0 intro annual fee" but $99 after, use 99. Use 0 only if the card truly has no annual fee. null if not stated at all.
- signup_bonus.value: raw number only (e.g. 60000 for "60,000 points"). null if absent.
- Return null for any field you cannot determine with confidence.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error: ${response.status} — ${errText}`);
  }

  const data = await response.json();
  const text = (data.content[0]?.text || '{}')
    .replace(/^```json?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  try {
    return JSON.parse(text);
  } catch (err) {
    console.warn(`  Could not parse Claude response: ${err.message}`);
    return null;
  }
}

// ─── Change detection ─────────────────────────────────────────────────────────

function detectChanges(card, extracted) {
  if (!extracted) return [];

  const current = card.data;
  const changes = [];

  // annual_fee
  if (extracted.annual_fee !== null && extracted.annual_fee !== undefined) {
    const cur = current.annual_fee ?? null;
    if (cur !== null && extracted.annual_fee !== cur) {
      changes.push({ field: 'annual_fee', old_value: cur, new_value: extracted.annual_fee });
    }
  }

  // signup_bonus subfields — only compare if the card already has a signup_bonus
  if (extracted.signup_bonus && current.signup_bonus) {
    const sb = extracted.signup_bonus;
    const cur = current.signup_bonus;

    for (const key of ['value', 'spend_requirement', 'timeframe_months']) {
      if (sb[key] !== null && sb[key] !== undefined && cur[key] !== undefined) {
        if (sb[key] !== cur[key]) {
          changes.push({
            field: `signup_bonus.${key}`,
            old_value: cur[key],
            new_value: sb[key],
          });
        }
      }
    }
  }

  return changes;
}

// ─── Apply YAML changes ───────────────────────────────────────────────────────

function applyChanges(allChanges, allCards) {
  const cardMap = new Map(allCards.map(c => [c.slug, c]));
  const applied = [];

  for (const { slug, card_name, apply_link, changes } of allChanges) {
    const card = cardMap.get(slug);
    if (!card) {
      console.warn(`Warning: Card not found for slug "${slug}"`);
      continue;
    }

    let yamlText = fs.readFileSync(card.filepath, 'utf8');
    // Parse once for block-level updates
    const parsedData = yaml.load(yamlText);
    let modified = false;

    for (const change of changes) {
      const { field, new_value } = change;

      if (field === 'annual_fee') {
        yamlText = replaceYamlField(yamlText, field, new_value);
        modified = true;
      } else if (field.startsWith('signup_bonus.')) {
        const subfield = field.split('.')[1];
        if (!parsedData.signup_bonus) parsedData.signup_bonus = {};
        parsedData.signup_bonus[subfield] = new_value;
        yamlText = replaceYamlBlock(yamlText, 'signup_bonus', parsedData.signup_bonus);
        modified = true;
      }

      const oldStr = JSON.stringify(change.old_value);
      const newStr = JSON.stringify(change.new_value);
      console.log(`  "${card_name}": ${field} ${oldStr} → ${newStr}`);
    }

    if (modified) {
      fs.writeFileSync(card.filepath, yamlText);
      applied.push({ slug, card_name, apply_link, changes });
    }
  }

  return applied;
}

// ─── PR summary ───────────────────────────────────────────────────────────────

function generateSummary(applied) {
  if (applied.length === 0) return '';

  const today = new Date().toISOString().slice(0, 10);

  let md = `## Card Page Check — ${today}\n\n`;
  md += 'Detected by fetching official apply pages and extracting card terms with Claude Haiku.\n';
  md += '**Verify each change against the source page before merging.**\n\n';

  md += '### Term Changes\n\n';
  md += '| Card | Field | Current | Detected | Source |\n';
  md += '|------|-------|---------|----------|--------|\n';
  for (const card of applied) {
    for (const ch of card.changes) {
      const oldStr = ch.old_value !== null ? String(ch.old_value) : '—';
      const newStr = ch.new_value !== null ? String(ch.new_value) : '—';
      md += `| ${card.card_name} | ${ch.field} | ${oldStr} | ${newStr} | [apply page](${card.apply_link}) |\n`;
    }
  }
  md += '\n';

  md += '### How to Review\n';
  md += '1. Click each source link and verify the detected value on the issuer\'s page\n';
  md += '2. Remove any YAML changes that look incorrect before merging\n';
  md += '3. Run `npm run build:cards` to validate\n\n';
  md += '---\n*Automated PR — review carefully before merging.*\n';

  return md;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Check Card Pages ===\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  const slugFilter = process.env.CARD_SLUG || null;

  console.log('Loading cards...');
  const allCards = loadAllCards();
  const cardsToCheck = filterCardsForCheck(allCards, slugFilter);

  if (cardsToCheck.length === 0) {
    console.log('No active cards with apply_link found. Exiting.');
    return;
  }

  console.log(`Checking ${cardsToCheck.length} card(s):`);
  cardsToCheck.forEach(c => console.log(`  - ${c.data.name} (${c.data.apply_link})`));
  console.log('');

  const allChanges = [];

  for (const card of cardsToCheck) {
    const { name, bank, apply_link } = card.data;
    console.log(`Checking: ${name}`);
    console.log(`  URL: ${apply_link}`);

    // Fetch page
    const pageContent = await fetchPageContent(apply_link);
    if (!pageContent) {
      console.log('  Skipped (could not fetch page)\n');
      await new Promise(r => setTimeout(r, FETCH_DELAY_MS));
      continue;
    }
    console.log(`  Fetched ${pageContent.length} chars`);

    // Extract with Claude Haiku
    let extracted;
    try {
      extracted = await extractCardTerms(name, bank, apply_link, pageContent);
    } catch (err) {
      console.warn(`  Extraction error: ${err.message} — skipping\n`);
      await new Promise(r => setTimeout(r, FETCH_DELAY_MS));
      continue;
    }

    if (!extracted) {
      console.log('  No data extracted — skipping\n');
      await new Promise(r => setTimeout(r, FETCH_DELAY_MS));
      continue;
    }

    // Compare against YAML
    const changes = detectChanges(card, extracted);
    if (changes.length > 0) {
      console.log(`  ${changes.length} change(s) detected`);
      allChanges.push({ slug: card.slug, card_name: name, apply_link, changes });
    } else {
      console.log('  No changes');
    }

    console.log('');
    await new Promise(r => setTimeout(r, FETCH_DELAY_MS));
  }

  if (allChanges.length === 0) {
    console.log('No changes detected. Exiting.');
    if (fs.existsSync(SUMMARY_FILE)) fs.unlinkSync(SUMMARY_FILE);
    return;
  }

  console.log(`\nApplying ${allChanges.length} card update(s)...`);
  const applied = applyChanges(allChanges, allCards);
  console.log(`\nApplied changes to ${applied.length} card(s)`);

  const summary = generateSummary(applied);
  if (summary) {
    fs.writeFileSync(SUMMARY_FILE, summary);
    console.log(`\nPR summary written to ${SUMMARY_FILE}`);
  }

  console.log('\n=== Complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
