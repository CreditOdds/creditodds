#!/usr/bin/env node

/**
 * Refresh Best Pages Script
 *
 * Re-ranks all data/best/*.yaml pages using Claude. For each page:
 * 1. Loads current card list and enriches with live data from cards.json
 * 2. Sends to Claude to re-rank, reassign badges, rewrite highlights,
 *    and provide reasoning for each ranking decision
 * 3. Writes updated YAML with new order, badges, highlights, and
 *    reasoning comments
 *
 * Creates a summary file (.refresh-best-summary.md) for the PR body.
 *
 * Env:
 *   ANTHROPIC_API_KEY (required)
 *   RANKING_MODEL (optional, default: claude-haiku-4-5-20251001)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BEST_DIR = path.join(__dirname, '..', 'data', 'best');
const CARDS_FILE = path.join(__dirname, '..', 'data', 'cards.json');
const SUMMARY_FILE = path.join(__dirname, '..', '.refresh-best-summary.md');
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

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

// ─── Claude API call ─────────────────────────────────────────────────────────

async function rankPage(page, cardsLookup) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required');

  const model = process.env.RANKING_MODEL || DEFAULT_MODEL;

  // Build card context for each entry
  const cardsWithData = page.data.cards.map(entry => {
    const liveCard = cardsLookup[entry.slug];
    return {
      slug: entry.slug,
      badge: entry.badge || null,
      current_rank: page.data.cards.indexOf(entry) + 1,
      current_highlight: entry.highlight || '',
      card_data: getCardContext(liveCard),
    };
  });

  const prompt = `You are re-ranking the cards for a "Best Credit Cards" page on CreditOdds based on current card terms.

PAGE: "${page.data.title}"
PAGE DESCRIPTION: "${page.data.description}"
CURRENT INTRO:
${page.data.intro || '(none)'}

CARDS (current ranked order):
${JSON.stringify(cardsWithData, null, 2)}

YOUR TASK:
1. RE-RANK these cards from best to worst based on their current card_data. Consider: signup bonus value and attainability, ongoing reward rates for the page's category, annual fee vs value, and overall competitiveness. The #1 card should be the single best option for most people in this category.
2. REASSIGN BADGES — assign 2-4 badges across the list to highlight standout cards (e.g. "Best Overall", "Best No-Fee", "Best Value", "Best Premium", "Best for Beginners"). Not every card needs a badge. Use null for cards without one.
3. REWRITE each card's "highlight" text using CURRENT card_data numbers. Keep 1-3 sentences, concise and factual. Mention specific numbers (bonus value, spend requirement, annual fee, reward rates).
4. REWRITE the page "intro" paragraph to reflect the current landscape. Keep it 1-3 sentences.
5. Provide REASONING for each card's rank — 2-3 sentences explaining why it's ranked where it is.

RANKING GUIDELINES:
- Cards with stronger signup bonuses (higher value, lower spend requirement) should rank higher when other factors are similar.
- No-annual-fee cards that offer strong rewards punch above their weight.
- A high annual fee is justified only if the rewards and perks clearly offset it.
- Category relevance matters: for a "Best Cash Back" page, a card's cash back rates matter most. For "Best Travel", transfer partners, travel perks, and portal multipliers matter most.
- Consider the full picture: a card with a slightly lower bonus but much better ongoing rewards may deserve a higher rank.

RULES:
- Do NOT add or remove cards — only reorder the ones provided.
- ONLY use facts from the card_data provided. Never invent or assume numbers.
- If card_data is null (card not found in cards.json), keep its current position and return its current_highlight unchanged.
- If a signup_bonus value is a string like "4 Free Night Awards", use it as-is.
- Match the existing concise, factual, comparative editorial tone. No hype words like "incredible", "amazing", or "unbeatable".
- Do not mention CreditOdds or link to anything.

Return ONLY valid JSON (no markdown fences) in this exact format:
{
  "intro": "updated intro text",
  "cards": [
    {
      "slug": "card-slug",
      "badge": "Badge Name or null",
      "highlight": "updated highlight text",
      "reasoning": "2-3 sentence explanation of this ranking position"
    }
  ]
}

The cards array MUST be in your new ranked order (index 0 = #1 rank).`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
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
    const result = JSON.parse(text);
    // Validate all slugs are present
    const inputSlugs = new Set(page.data.cards.map(c => c.slug));
    const outputSlugs = new Set(result.cards.map(c => c.slug));
    for (const slug of inputSlugs) {
      if (!outputSlugs.has(slug)) {
        console.warn(`    Warning: Claude dropped card "${slug}" — adding back at end`);
        const original = page.data.cards.find(c => c.slug === slug);
        result.cards.push({
          slug,
          badge: original.badge || null,
          highlight: original.highlight || '',
          reasoning: 'Kept from previous ranking (not included in AI response).',
        });
      }
    }
    // Remove any cards Claude added that weren't in the input
    result.cards = result.cards.filter(c => inputSlugs.has(c.slug));
    return result;
  } catch (err) {
    console.warn(`  Could not parse Claude response for ${page.data.title}: ${err.message}`);
    console.warn(`  Raw response: ${text.slice(0, 500)}`);
    return null;
  }
}

// ─── YAML generation ─────────────────────────────────────────────────────────

function buildYaml(page, updates, today) {
  const d = page.data;
  const lines = [];

  // Reasoning comment block at the top
  const divider = '# ' + '='.repeat(60);
  lines.push(divider);
  lines.push(`# ${d.title} — Ranking Reasoning (${today})`);
  lines.push(divider);
  lines.push('#');
  for (let i = 0; i < updates.cards.length; i++) {
    const card = updates.cards[i];
    const badgeStr = card.badge ? ` (${card.badge})` : '';
    lines.push(`# #${i + 1} ${card.slug}${badgeStr}`);
    // Wrap reasoning to ~76 chars per line
    const reasoningLines = wordWrap(card.reasoning || '', 74);
    for (const rl of reasoningLines) {
      lines.push(`#   ${rl}`);
    }
    lines.push('#');
  }
  lines.push(divider);
  lines.push('');

  // Metadata fields
  lines.push(`id: ${d.id}`);
  lines.push(`slug: ${d.slug}`);
  lines.push(`title: ${d.title}`);
  lines.push(`description: ${d.description}`);
  lines.push(`date: "${d.date}"`);
  lines.push(`updated_at: "${today}"`);
  if (d.author) lines.push(`author: ${d.author}`);
  if (d.author_slug) lines.push(`author_slug: ${d.author_slug}`);
  if (d.seo_title) lines.push(`seo_title: ${d.seo_title}`);
  if (d.seo_description) lines.push(`seo_description: ${d.seo_description}`);

  // Intro
  const intro = updates.intro || d.intro;
  if (intro) {
    lines.push('intro: |');
    const introLines = intro.trim().split('\n');
    for (const il of introLines) {
      lines.push(`  ${il}`);
    }
  }

  // Cards
  lines.push('');
  lines.push('cards:');
  for (const card of updates.cards) {
    lines.push(`  - slug: ${card.slug}`);
    if (card.badge) {
      lines.push(`    badge: ${card.badge}`);
    }
    lines.push(`    highlight: ${card.highlight}`);
    lines.push('');
  }

  return lines.join('\n');
}

function wordWrap(text, maxLen) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line.length + word.length + 1 > maxLen && line.length > 0) {
      lines.push(line);
      line = word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ─── Change detection ────────────────────────────────────────────────────────

function detectChanges(page, updates) {
  const changes = [];
  const oldOrder = page.data.cards.map(c => c.slug);
  const newOrder = updates.cards.map(c => c.slug);

  // Detect ranking changes
  const rankChanges = [];
  for (let i = 0; i < newOrder.length; i++) {
    const slug = newOrder[i];
    const oldRank = oldOrder.indexOf(slug) + 1;
    const newRank = i + 1;
    if (oldRank !== newRank) {
      const direction = newRank < oldRank ? 'up' : 'down';
      const arrow = newRank < oldRank ? '\u2191' : '\u2193'; // ↑ or ↓
      rankChanges.push({
        slug,
        oldRank,
        newRank,
        direction,
        arrow,
      });
    }
  }

  if (rankChanges.length > 0) {
    changes.push({ type: 'ranking', rankChanges });
  }

  // Detect badge changes
  for (const newCard of updates.cards) {
    const oldCard = page.data.cards.find(c => c.slug === newCard.slug);
    if (!oldCard) continue;
    const oldBadge = oldCard.badge || null;
    const newBadge = newCard.badge || null;
    if (oldBadge !== newBadge) {
      changes.push({
        type: 'badge',
        slug: newCard.slug,
        old: oldBadge || '(none)',
        new: newBadge || '(none)',
      });
    }
  }

  // Detect intro change
  if (updates.intro && updates.intro.trim() !== (page.data.intro || '').trim()) {
    changes.push({ type: 'intro' });
  }

  return changes;
}

// ─── PR summary ──────────────────────────────────────────────────────────────

function generateSummary(allResults, today, model) {
  let md = `## Refresh Best Pages — ${today}\n\n`;
  md += `Re-ranked using **${model}** with current card data from cards.json.\n`;
  md += '**Review each ranking change before merging.**\n\n';

  let totalChanges = 0;

  for (const { page, changes } of allResults) {
    if (changes.length === 0) continue;
    totalChanges += changes.length;

    md += `### ${page.data.title}\n\n`;

    // Show ranking changes
    const rankChange = changes.find(c => c.type === 'ranking');
    if (rankChange) {
      md += '**Ranking Changes:**\n\n';
      md += '| Card | Old Rank | New Rank | Change |\n';
      md += '|------|----------|----------|--------|\n';
      for (const rc of rankChange.rankChanges) {
        md += `| ${rc.slug} | #${rc.oldRank} | #${rc.newRank} | ${rc.arrow} ${rc.direction} |\n`;
      }
      md += '\n';
    }

    // Show badge changes
    const badgeChanges = changes.filter(c => c.type === 'badge');
    if (badgeChanges.length > 0) {
      md += '**Badge Changes:**\n\n';
      for (const bc of badgeChanges) {
        md += `- ${bc.slug}: ${bc.old} → ${bc.new}\n`;
      }
      md += '\n';
    }
  }

  if (totalChanges === 0) return '';

  md += '### How to Review\n';
  md += '1. Check the ranking reasoning in the YAML comment block at the top of each file\n';
  md += '2. Verify highlights reflect current card terms\n';
  md += '3. Run `npm run build:best` to validate\n\n';
  md += '---\n*Automated PR — review carefully before merging.*\n';

  return md;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const model = process.env.RANKING_MODEL || DEFAULT_MODEL;
  console.log('=== Refresh Best Pages ===');
  console.log(`Model: ${model}\n`);

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
    console.log(`Ranking: ${page.data.title} (${page.data.cards.length} cards)`);

    let updates;
    try {
      updates = await rankPage(page, cardsLookup);
    } catch (err) {
      console.warn(`  Error: ${err.message} — skipping\n`);
      continue;
    }

    if (!updates) {
      console.log('  No response — skipping\n');
      continue;
    }

    console.log(`  Received ${updates.cards.length} cards in ranked order`);

    // Detect changes
    const changes = detectChanges(page, updates);
    const rankChange = changes.find(c => c.type === 'ranking');
    if (rankChange) {
      console.log(`  ${rankChange.rankChanges.length} ranking change(s):`);
      for (const rc of rankChange.rankChanges) {
        console.log(`    ${rc.slug}: #${rc.oldRank} → #${rc.newRank}`);
      }
    } else {
      console.log('  No ranking changes');
    }

    // Always write the file (highlights and reasoning are always refreshed)
    const yamlContent = buildYaml(page, updates, today);
    fs.writeFileSync(page.filepath, yamlContent);
    console.log(`  Written to ${page.file}`);

    allResults.push({ page, changes });
    console.log('');
  }

  // Generate PR summary
  const summary = generateSummary(allResults, today, model);
  if (summary) {
    fs.writeFileSync(SUMMARY_FILE, summary);
    console.log(`PR summary written to ${SUMMARY_FILE}`);
  } else {
    console.log('No ranking changes across any best pages.');
    if (fs.existsSync(SUMMARY_FILE)) fs.unlinkSync(SUMMARY_FILE);
  }

  console.log('\n=== Complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
