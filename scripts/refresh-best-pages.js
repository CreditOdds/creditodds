#!/usr/bin/env node

/**
 * Refresh Best Pages Script
 *
 * Reads all data/best/*.yaml files, enriches each card entry with live
 * data from cards.json, and uses Claude Haiku to rewrite the highlight
 * text and intro to reflect current card terms.
 *
 * Creates a summary file (.refresh-best-summary.md) for the PR body.
 *
 * Env: ANTHROPIC_API_KEY (required)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BEST_DIR = path.join(__dirname, '..', 'data', 'best');
const CARDS_FILE = path.join(__dirname, '..', 'data', 'cards.json');
const SUMMARY_FILE = path.join(__dirname, '..', '.refresh-best-summary.md');

// ─── Data loading ────────────────────────────────────────────────────────────

function loadCards() {
  const content = fs.readFileSync(CARDS_FILE, 'utf8');
  const data = JSON.parse(content);
  const lookup = {};
  for (const card of data.cards) {
    lookup[card.slug] = card;
  }
  return lookup;
}

function loadBestPages() {
  const files = fs.readdirSync(BEST_DIR).filter(f => f.endsWith('.yaml'));
  const pages = [];
  for (const file of files) {
    const filepath = path.join(BEST_DIR, file);
    const raw = fs.readFileSync(filepath, 'utf8');
    const data = yaml.load(raw);
    pages.push({ file, filepath, raw, data });
  }
  return pages;
}

// ─── Card data extraction (only the fields Claude needs) ─────────────────────

function getCardContext(card) {
  if (!card) return null;
  const ctx = {
    name: card.name,
    bank: card.bank,
    annual_fee: card.annual_fee,
  };
  if (card.signup_bonus) {
    ctx.signup_bonus = {
      value: card.signup_bonus.value,
      type: card.signup_bonus.type,
      spend_requirement: card.signup_bonus.spend_requirement,
      timeframe_months: card.signup_bonus.timeframe_months,
    };
  }
  if (card.rewards) {
    ctx.rewards = card.rewards.map(r => ({
      category: r.category,
      value: r.value,
      unit: r.unit,
      description: r.description,
    }));
  }
  if (card.apr) {
    ctx.apr = card.apr;
  }
  if (card.intro_apr) {
    ctx.intro_apr = card.intro_apr;
  }
  return ctx;
}

// ─── Claude Haiku API call ───────────────────────────────────────────────────

async function refreshPage(page, cardsLookup) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required');

  // Build card context for each entry
  const cardsWithData = page.data.cards.map(entry => {
    const liveCard = cardsLookup[entry.slug];
    return {
      slug: entry.slug,
      badge: entry.badge || null,
      current_highlight: entry.highlight || '',
      card_data: getCardContext(liveCard),
    };
  });

  const prompt = `You are updating the editorial content for a "Best Credit Cards" ranking page on CreditOdds.

PAGE: "${page.data.title}"
CURRENT INTRO:
${page.data.intro || '(none)'}

CARDS (in ranked order — do NOT reorder, add, or remove any cards):
${JSON.stringify(cardsWithData, null, 2)}

YOUR TASK:
1. Rewrite each card's "highlight" text to reflect the CURRENT card_data provided. Use specific numbers (signup bonus value, spend requirement, annual fee, reward rates). Keep 1-3 sentences, similar length and tone to the current_highlight.
2. Rewrite the page "intro" paragraph to reflect the current landscape. Keep it 1-3 sentences, same editorial tone.

RULES:
- ONLY use facts from the card_data provided. Never invent or assume numbers.
- If card_data is null (card not found), return the current_highlight unchanged.
- If a signup_bonus value is a string like "4 Free Night Awards", use it as-is (don't convert to a number).
- Keep badges exactly as they are — do not include them in your response.
- Match the existing concise, factual, comparative tone. No hype words like "incredible" or "amazing".
- Do not mention CreditOdds or link to anything.

Return ONLY valid JSON (no markdown fences) in this exact format:
{
  "intro": "updated intro text",
  "cards": [
    { "slug": "card-slug", "highlight": "updated highlight text" }
  ]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
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
    console.warn(`  Could not parse Claude response for ${page.data.title}: ${err.message}`);
    console.warn(`  Raw response: ${text.slice(0, 500)}`);
    return null;
  }
}

// ─── YAML update ─────────────────────────────────────────────────────────────

function applyUpdates(page, updates, today) {
  let yamlContent = page.raw;
  const changes = [];

  // Update intro
  if (updates.intro && updates.intro !== page.data.intro?.trim()) {
    const oldIntro = page.data.intro?.trim();
    // Replace the intro block in YAML
    // Intro is a multi-line scalar using |
    const introPattern = /^intro:\s*\|\n([\s\S]*?)(?=\n\w|\n$)/m;
    if (introPattern.test(yamlContent)) {
      const indentedIntro = updates.intro
        .split('\n')
        .map(line => '  ' + line)
        .join('\n');
      yamlContent = yamlContent.replace(introPattern, `intro: |\n${indentedIntro}`);
      changes.push({
        field: 'intro',
        old: oldIntro?.slice(0, 80) + (oldIntro?.length > 80 ? '...' : ''),
        new: updates.intro.slice(0, 80) + (updates.intro.length > 80 ? '...' : ''),
      });
    }
  }

  // Update each card's highlight
  if (updates.cards) {
    for (const updatedCard of updates.cards) {
      const existingEntry = page.data.cards.find(c => c.slug === updatedCard.slug);
      if (!existingEntry) continue;
      if (!updatedCard.highlight) continue;

      const oldHighlight = existingEntry.highlight?.trim();
      const newHighlight = updatedCard.highlight.trim();
      if (oldHighlight === newHighlight) continue;

      // Find and replace this card's highlight in the YAML
      // Cards are listed under `cards:` with `- slug:` entries
      // We need to find the specific card block and replace its highlight
      const escapedOld = oldHighlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const highlightPattern = new RegExp(
        `(- slug: ${updatedCard.slug}\\n(?:    \\w+:.*\\n)*    highlight: )${escapedOld}`,
        'm'
      );

      if (highlightPattern.test(yamlContent)) {
        yamlContent = yamlContent.replace(highlightPattern, `$1${newHighlight}`);
        changes.push({
          field: `${updatedCard.slug} highlight`,
          old: oldHighlight.slice(0, 60) + (oldHighlight.length > 60 ? '...' : ''),
          new: newHighlight.slice(0, 60) + (newHighlight.length > 60 ? '...' : ''),
        });
      } else {
        // Fallback: replace the highlight string directly if unique in file
        if (yamlContent.includes(oldHighlight) &&
            yamlContent.indexOf(oldHighlight) === yamlContent.lastIndexOf(oldHighlight)) {
          yamlContent = yamlContent.replace(oldHighlight, newHighlight);
          changes.push({
            field: `${updatedCard.slug} highlight`,
            old: oldHighlight.slice(0, 60) + (oldHighlight.length > 60 ? '...' : ''),
            new: newHighlight.slice(0, 60) + (newHighlight.length > 60 ? '...' : ''),
          });
        } else {
          console.warn(`    Could not find unique highlight for ${updatedCard.slug} — skipping`);
        }
      }
    }
  }

  // Update updated_at date
  if (changes.length > 0) {
    if (/^updated_at:/m.test(yamlContent)) {
      yamlContent = yamlContent.replace(/^(updated_at:\s*).*$/m, `$1"${today}"`);
    } else {
      // Insert after date field
      yamlContent = yamlContent.replace(/^(date:\s*".*")$/m, `$1\nupdated_at: "${today}"`);
    }
  }

  return { yamlContent, changes };
}

// ─── PR summary ──────────────────────────────────────────────────────────────

function generateSummary(allResults, today) {
  let md = `## Refresh Best Pages — ${today}\n\n`;
  md += 'AI-refreshed highlight text and intros using current card data from cards.json.\n';
  md += '**Review each change before merging — verify tone and accuracy.**\n\n';

  let totalChanges = 0;

  for (const { page, changes } of allResults) {
    if (changes.length === 0) continue;
    totalChanges += changes.length;

    md += `### ${page.data.title}\n\n`;
    md += '| Field | Before | After |\n';
    md += '|-------|--------|-------|\n';
    for (const ch of changes) {
      md += `| ${ch.field} | ${ch.old} | ${ch.new} |\n`;
    }
    md += '\n';
  }

  if (totalChanges === 0) return '';

  md += '### How to Review\n';
  md += '1. Check that updated highlights match current card terms\n';
  md += '2. Verify tone is factual and concise (no hype)\n';
  md += '3. Run `npm run build:best` to validate\n\n';
  md += '---\n*Automated PR — review carefully before merging.*\n';

  return md;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Refresh Best Pages ===\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);

  console.log('Loading cards.json...');
  const cardsLookup = loadCards();
  console.log(`  ${Object.keys(cardsLookup).length} cards loaded\n`);

  console.log('Loading best pages...');
  const pages = loadBestPages();
  console.log(`  ${pages.length} page(s) found\n`);

  const allResults = [];

  for (const page of pages) {
    console.log(`Refreshing: ${page.data.title} (${page.data.cards.length} cards)`);

    let updates;
    try {
      updates = await refreshPage(page, cardsLookup);
    } catch (err) {
      console.warn(`  Error: ${err.message} — skipping\n`);
      continue;
    }

    if (!updates) {
      console.log('  No updates returned — skipping\n');
      continue;
    }

    const { yamlContent, changes } = applyUpdates(page, updates, today);

    if (changes.length > 0) {
      fs.writeFileSync(page.filepath, yamlContent);
      console.log(`  ${changes.length} change(s) applied`);
    } else {
      console.log('  No changes needed');
    }

    allResults.push({ page, changes });
    console.log('');
  }

  // Generate PR summary
  const summary = generateSummary(allResults, today);
  if (summary) {
    fs.writeFileSync(SUMMARY_FILE, summary);
    console.log(`PR summary written to ${SUMMARY_FILE}`);
  } else {
    console.log('No changes across any best pages.');
    if (fs.existsSync(SUMMARY_FILE)) fs.unlinkSync(SUMMARY_FILE);
  }

  console.log('\n=== Complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
