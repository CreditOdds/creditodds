#!/usr/bin/env node

/**
 * Refresh Best Pages Script — multi-model panel
 *
 * Re-ranks all data/best/*.yaml pages using a PANEL of models, then writes
 * a single consensus ranking. For each page:
 *   1. Loads current card list and enriches with live data from cards.json
 *   2. Sends an IDENTICAL ranking prompt to every available voter model
 *      (Claude, OpenAI, Gemini) and collects each model's ranked order.
 *   3. Aggregates the votes with a Borda count → consensus order.
 *   4. Claude (the "writer") writes the intro + per-card badge/highlight for
 *      the consensus order (prose is never voted on — one editorial voice).
 *   5. Writes updated YAML with the consensus order, badges, highlights,
 *      reasoning comments, a `panel:` block, and per-card `consensus:` data
 *      (score + every model's rank) so the frontend can offer per-model views.
 *
 * Graceful degradation: a voter that errors / returns bad JSON is dropped from
 * the panel for that run (logged), and the refresh still ships with the
 * survivors. Anthropic is required (it is the writer); if it fails on a page,
 * the page keeps its previous prose but still adopts the consensus order.
 *
 * Creates a summary file (.refresh-best-summary.md) for the PR body.
 *
 * Env:
 *   ANTHROPIC_API_KEY    (required — Claude votes AND writes)
 *   OPENAI_API_KEY       (optional — adds GPT to the panel)
 *   GEMINI_API_KEY       (optional — adds Gemini to the panel)
 *   RANKING_MODEL        (optional, default: claude-haiku-4-5-20251001)
 *   OPENAI_RANKING_MODEL (optional, default: gpt-4o-mini)
 *   GEMINI_RANKING_MODEL (optional, default: gemini-2.0-flash)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BEST_DIR = path.join(__dirname, '..', 'data', 'best');
const CARDS_FILE = path.join(__dirname, '..', 'data', 'cards.json');
const SUMMARY_FILE = path.join(__dirname, '..', '.refresh-best-summary.md');

const AGGREGATION_METHOD = 'borda';

// ─── Panel definition ────────────────────────────────────────────────────────
// `key` is the stable identifier stored in YAML and used by the frontend toggle.
// Anthropic is `required` because it is also the writer.

const PANEL = [
  {
    key: 'claude',
    label: 'Claude',
    envKey: 'ANTHROPIC_API_KEY',
    model: process.env.RANKING_MODEL || 'claude-haiku-4-5-20251001',
    call: callAnthropic,
    required: true,
  },
  {
    key: 'openai',
    label: 'GPT',
    envKey: 'OPENAI_API_KEY',
    model: process.env.OPENAI_RANKING_MODEL || 'gpt-4o-mini',
    call: callOpenAI,
  },
  {
    key: 'gemini',
    label: 'Gemini',
    envKey: 'GEMINI_API_KEY',
    model: process.env.GEMINI_RANKING_MODEL || 'gemini-3.5-flash',
    call: callGemini,
  },
];

const WRITER_KEY = 'claude';

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

// ─── Card data extraction (only the fields models need) ──────────────────────

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
  if (card.apr) ctx.apr = card.apr;
  if (card.intro_apr) ctx.intro_apr = card.intro_apr;
  return ctx;
}

function buildCardsWithData(page, cardsLookup) {
  return page.data.cards.map((entry, i) => ({
    slug: entry.slug,
    current_rank: i + 1,
    card_data: getCardContext(cardsLookup[entry.slug]),
  }));
}

// ─── Provider adapters (each returns raw response text) ───────────────────────

async function callAnthropic(model, prompt, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callOpenAI(model, prompt, apiKey) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(model, prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function stripFences(text) {
  return (text || '')
    .replace(/^```json?\n?/i, '')
    .replace(/\n?```$/, '')
    .trim();
}

// User-facing copy must never contain em dashes (project style rule). Models
// usually comply, but guarantee it: collapse " — " to ", " and any stray em
// dash to a comma. En dashes (ranges) are left alone.
function sanitizeProse(text) {
  if (!text) return text;
  return text
    .replace(/\s*—\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .trim();
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const SHARED_GUIDELINES = `RANKING GUIDELINES:
- Cards with stronger signup bonuses (higher value, lower spend requirement) should rank higher when other factors are similar.
- No-annual-fee cards that offer strong rewards punch above their weight.
- A high annual fee is justified only if the rewards and perks clearly offset it.
- Category relevance matters: for a "Best Cash Back" page a card's cash back rates matter most; for "Best Travel" transfer partners, travel perks, and portal multipliers matter most.
- Consider the full picture: a card with a slightly lower bonus but much better ongoing rewards may deserve a higher rank.

RULES:
- Rank ALL provided cards. Do NOT add, remove, or invent cards.
- ONLY use facts from the card_data provided. Never invent or assume numbers.
- If card_data is null (card not found), rank it near the bottom.`;

function buildVoterPrompt(page, cardsWithData) {
  return `You are ranking the cards for a "Best Credit Cards" page on CreditOdds based on current card terms.

PAGE: "${page.data.title}"
PAGE DESCRIPTION: "${page.data.description}"

CARDS (current order, to be re-ranked):
${JSON.stringify(cardsWithData, null, 2)}

YOUR TASK:
Rank every card from best (#1) to worst based on its current card_data. The #1 card should be the single best option for most people in this category. Consider signup bonus value and attainability, ongoing reward rates for the page's category, annual fee vs value, and overall competitiveness.

${SHARED_GUIDELINES}

Return ONLY valid JSON (no markdown fences) in this exact format, listing EVERY card slug exactly once, best first:
{
  "ranking": ["best-card-slug", "second-best-slug", "..."]
}`;
}

function buildWriterPrompt(page, orderedCardsWithData) {
  return `You are writing the editorial copy for a "Best Credit Cards" page on CreditOdds. The ranking has ALREADY been decided by a panel of models — your job is to write the prose for this fixed order, NOT to re-rank.

PAGE: "${page.data.title}"
PAGE DESCRIPTION: "${page.data.description}"
CURRENT INTRO:
${page.data.intro || '(none)'}

CARDS (FINAL ranked order — index 0 is #1, do NOT reorder):
${JSON.stringify(orderedCardsWithData, null, 2)}

YOUR TASK:
1. REWRITE the page "intro" paragraph to reflect the current landscape. Keep it 1-3 sentences.
2. For EACH card, in the SAME order given:
   a. Assign a "badge" — across the whole list use 2-4 badges total to highlight standout cards (e.g. "Best Overall" for #1, "Best No-Fee", "Best Value", "Best Premium", "Best for Beginners"). Most cards get null. The #1 card should usually get "Best Overall".
   b. Write a "highlight" — 1-3 sentences, concise and factual, using CURRENT card_data numbers (bonus value, spend requirement, annual fee, reward rates).
   c. Write a "reasoning" — 2-3 sentences explaining the card's strengths and why it sits where it does in the ranking.

RULES:
- Keep the cards array in the EXACT order provided. Do NOT reorder, add, or remove cards.
- ONLY use facts from card_data. Never invent or assume numbers.
- If a signup_bonus value is a string like "4 Free Night Awards", use it as-is.
- Match the existing concise, factual, comparative editorial tone. No hype words like "incredible", "amazing", or "unbeatable". Do not use em dashes.
- Do not mention CreditOdds or link to anything.

Return ONLY valid JSON (no markdown fences) in this exact format:
{
  "intro": "updated intro text",
  "cards": [
    { "slug": "card-slug", "badge": "Badge Name or null", "highlight": "updated highlight text", "reasoning": "2-3 sentence explanation" }
  ]
}`;
}

// ─── Voting + aggregation ────────────────────────────────────────────────────

function parseRanking(text, inputSlugs) {
  const parsed = JSON.parse(stripFences(text));
  let ranking = Array.isArray(parsed) ? parsed : parsed.ranking;
  if (!Array.isArray(ranking)) throw new Error('no ranking array in response');

  const known = new Set(inputSlugs);
  const seen = new Set();
  const cleaned = [];
  for (const slug of ranking) {
    if (known.has(slug) && !seen.has(slug)) {
      seen.add(slug);
      cleaned.push(slug);
    }
  }
  // A vote must cover at least half the pool to count; otherwise it is unreliable.
  if (cleaned.length < Math.ceil(inputSlugs.length / 2)) {
    throw new Error(`only ${cleaned.length}/${inputSlugs.length} valid slugs returned`);
  }
  return cleaned;
}

async function collectVotes(page, cardsWithData) {
  const inputSlugs = page.data.cards.map(c => c.slug);
  const prompt = buildVoterPrompt(page, cardsWithData);
  const votes = [];

  for (const provider of PANEL) {
    const apiKey = process.env[provider.envKey];
    if (!apiKey) {
      if (provider.required) throw new Error(`${provider.envKey} required (Claude is the writer)`);
      console.log(`    ${provider.label}: no ${provider.envKey} — skipping`);
      continue;
    }
    try {
      const text = await provider.call(provider.model, prompt, apiKey);
      const ranking = parseRanking(text, inputSlugs);
      votes.push({ key: provider.key, label: provider.label, model: provider.model, ranking });
      console.log(`    ${provider.label} (${provider.model}): ranked ${ranking.length} cards`);
    } catch (err) {
      console.warn(`    ${provider.label}: dropped from panel — ${err.message}`);
    }
  }
  return votes;
}

// Borda count: rank r out of N earns (N - r + 1) points. A card a voter omits
// is treated as last (rank N) so omissions are penalized, not rewarded.
function aggregate(votes, inputSlugs) {
  const N = inputSlugs.length;
  const scores = new Map(inputSlugs.map(s => [s, 0]));
  const ranks = new Map(inputSlugs.map(s => [s, {}]));

  for (const vote of votes) {
    const rankOf = new Map();
    vote.ranking.forEach((slug, i) => rankOf.set(slug, i + 1));
    for (const slug of inputSlugs) {
      const r = rankOf.has(slug) ? rankOf.get(slug) : N;
      scores.set(slug, scores.get(slug) + (N - r + 1));
      ranks.get(slug)[vote.key] = r;
    }
  }

  const bestRank = slug => {
    const vals = Object.values(ranks.get(slug));
    return vals.length ? Math.min(...vals) : N;
  };

  const order = [...inputSlugs].sort((a, b) => {
    if (scores.get(b) !== scores.get(a)) return scores.get(b) - scores.get(a);
    // Tie-break 1: best single-model rank wins.
    if (bestRank(a) !== bestRank(b)) return bestRank(a) - bestRank(b);
    // Tie-break 2: keep incumbent order for stability.
    return inputSlugs.indexOf(a) - inputSlugs.indexOf(b);
  });

  return { order, scores, ranks };
}

// ─── Writer pass ─────────────────────────────────────────────────────────────

async function writeProse(page, orderedCardsWithData, inputSlugs) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const writer = PANEL.find(p => p.key === WRITER_KEY);
  const text = await writer.call(writer.model, buildWriterPrompt(page, orderedCardsWithData), apiKey);
  const parsed = JSON.parse(stripFences(text));
  if (!Array.isArray(parsed.cards)) throw new Error('writer returned no cards array');

  const bySlug = new Map(parsed.cards.map(c => [c.slug, c]));
  const known = new Set(inputSlugs);
  // Re-key strictly to the consensus order; ignore any reordering the writer did.
  const cards = orderedCardsWithData
    .filter(c => known.has(c.slug))
    .map(c => {
      const w = bySlug.get(c.slug) || {};
      return {
        slug: c.slug,
        badge: w.badge && w.badge !== 'null' ? w.badge : null,
        highlight: sanitizeProse(w.highlight || ''),
        reasoning: w.reasoning || '',
      };
    });
  return { intro: sanitizeProse(parsed.intro || page.data.intro || ''), cards };
}

// Fallback prose: reuse the page's existing badges/highlights in consensus order.
function fallbackProse(page, order) {
  const prev = new Map(page.data.cards.map(c => [c.slug, c]));
  return {
    intro: page.data.intro || '',
    cards: order.map(slug => {
      const p = prev.get(slug) || {};
      return {
        slug,
        badge: p.badge || null,
        highlight: p.highlight || '',
        reasoning: 'Kept from previous ranking (writer model unavailable this run).',
      };
    }),
  };
}

// ─── Per-page orchestration ──────────────────────────────────────────────────

async function rankPage(page, cardsLookup) {
  const inputSlugs = page.data.cards.map(c => c.slug);
  const cardsWithData = buildCardsWithData(page, cardsLookup);

  const votes = await collectVotes(page, cardsWithData);
  if (votes.length === 0) {
    console.warn('    No usable votes — skipping page');
    return null;
  }

  const { order, scores, ranks } = aggregate(votes, inputSlugs);

  // Card data in the new consensus order, for the writer.
  const dataBySlug = new Map(cardsWithData.map(c => [c.slug, c]));
  const orderedCardsWithData = order.map(slug => dataBySlug.get(slug));

  let prose;
  try {
    prose = await writeProse(page, orderedCardsWithData, inputSlugs);
    console.log(`    Writer (${PANEL.find(p => p.key === WRITER_KEY).model}): wrote prose for ${prose.cards.length} cards`);
  } catch (err) {
    console.warn(`    Writer failed (${err.message}) — keeping previous highlights/badges`);
    prose = fallbackProse(page, order);
  }

  // Merge prose + consensus data into the final card list (already in order).
  const proseBySlug = new Map(prose.cards.map(c => [c.slug, c]));
  const cards = order.map(slug => {
    const p = proseBySlug.get(slug) || { slug, badge: null, highlight: '', reasoning: '' };
    return {
      slug,
      badge: p.badge || null,
      highlight: p.highlight || '',
      reasoning: p.reasoning || '',
      score: scores.get(slug),
      ranks: ranks.get(slug),
    };
  });

  return {
    intro: prose.intro,
    cards,
    panel: votes.map(v => ({ key: v.key, label: v.label, model: v.model })),
  };
}

// ─── YAML generation ─────────────────────────────────────────────────────────

function buildYaml(page, updates, today) {
  const d = page.data;
  const lines = [];

  const divider = '# ' + '='.repeat(60);
  lines.push(divider);
  lines.push(`# ${d.title} — Ranking Reasoning (${today})`);
  lines.push(`# Consensus of: ${updates.panel.map(p => p.label).join(', ')} (${AGGREGATION_METHOD} count)`);
  lines.push(divider);
  lines.push('#');
  for (let i = 0; i < updates.cards.length; i++) {
    const card = updates.cards[i];
    const badgeStr = card.badge ? ` (${card.badge})` : '';
    const rankStr = formatRanksComment(card.ranks, updates.panel);
    lines.push(`# #${i + 1} ${card.slug}${badgeStr}  [${rankStr}]`);
    for (const rl of wordWrap(card.reasoning || '', 74)) {
      lines.push(`#   ${rl}`);
    }
    lines.push('#');
  }
  lines.push(divider);
  lines.push('');

  // Metadata
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
    for (const il of intro.trim().split('\n')) {
      lines.push(`  ${il}`);
    }
  }

  // Panel metadata (powers the per-model toggle on the frontend)
  lines.push('');
  lines.push('panel:');
  lines.push(`  method: ${AGGREGATION_METHOD}`);
  lines.push(`  generated_at: "${today}"`);
  lines.push('  models:');
  for (const p of updates.panel) {
    lines.push(`    - key: ${p.key}`);
    lines.push(`      label: ${p.label}`);
    lines.push(`      model: ${p.model}`);
  }

  // Cards — include previous_rank when position changed + consensus block
  const oldOrder = page.data.cards.map(c => c.slug);
  lines.push('');
  lines.push('cards:');
  for (let i = 0; i < updates.cards.length; i++) {
    const card = updates.cards[i];
    const newRank = i + 1;
    const oldRank = oldOrder.indexOf(card.slug) + 1;
    lines.push(`  - slug: ${card.slug}`);
    if (card.badge) lines.push(`    badge: ${card.badge}`);
    if (oldRank > 0 && oldRank !== newRank) lines.push(`    previous_rank: ${oldRank}`);
    lines.push(`    highlight: ${card.highlight}`);
    lines.push('    consensus:');
    lines.push(`      score: ${card.score}`);
    lines.push(`      ranks: { ${updates.panel.map(p => `${p.key}: ${card.ranks[p.key]}`).join(', ')} }`);
    lines.push('');
  }

  return lines.join('\n');
}

function formatRanksComment(ranks, panel) {
  return panel.map(p => `${p.label} #${ranks[p.key]}`).join(', ');
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

  const rankChanges = [];
  for (let i = 0; i < newOrder.length; i++) {
    const slug = newOrder[i];
    const oldRank = oldOrder.indexOf(slug) + 1;
    const newRank = i + 1;
    if (oldRank !== newRank) {
      rankChanges.push({
        slug,
        oldRank,
        newRank,
        direction: newRank < oldRank ? 'up' : 'down',
        arrow: newRank < oldRank ? '↑' : '↓',
      });
    }
  }
  if (rankChanges.length > 0) changes.push({ type: 'ranking', rankChanges });

  for (const newCard of updates.cards) {
    const oldCard = page.data.cards.find(c => c.slug === newCard.slug);
    if (!oldCard) continue;
    const oldBadge = oldCard.badge || null;
    const newBadge = newCard.badge || null;
    if (oldBadge !== newBadge) {
      changes.push({ type: 'badge', slug: newCard.slug, old: oldBadge || '(none)', new: newBadge || '(none)' });
    }
  }

  if (updates.intro && updates.intro.trim() !== (page.data.intro || '').trim()) {
    changes.push({ type: 'intro' });
  }

  return changes;
}

// ─── PR summary ──────────────────────────────────────────────────────────────

function generateSummary(allResults, today) {
  let md = `## Refresh Best Pages — ${today}\n\n`;
  md += 'Re-ranked by a **panel of models** (Borda consensus), with current card data from cards.json.\n';
  md += '**Review each ranking change before merging.**\n\n';

  let totalChanges = 0;

  for (const { page, changes, updates } of allResults) {
    if (changes.length === 0) continue;
    totalChanges += changes.length;

    md += `### ${page.data.title}\n\n`;
    md += `Panel: ${updates.panel.map(p => `${p.label} (\`${p.model}\`)`).join(', ')}\n\n`;

    const rankChange = changes.find(c => c.type === 'ranking');
    if (rankChange) {
      md += '**Ranking Changes:**\n\n';
      md += '| Card | Old Rank | New Rank | Change | Per-model ranks |\n';
      md += '|------|----------|----------|--------|-----------------|\n';
      for (const rc of rankChange.rankChanges) {
        const card = updates.cards.find(c => c.slug === rc.slug);
        const perModel = updates.panel.map(p => `${p.label} #${card.ranks[p.key]}`).join(', ');
        md += `| ${rc.slug} | #${rc.oldRank} | #${rc.newRank} | ${rc.arrow} ${rc.direction} | ${perModel} |\n`;
      }
      md += '\n';
    }

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
  md += '1. Check the ranking reasoning + per-model ranks in the YAML comment block at the top of each file\n';
  md += '2. Verify highlights reflect current card terms\n';
  md += '3. Run `npm run build:best` to validate\n\n';
  md += '---\n*Automated PR — review carefully before merging.*\n';

  return md;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Refresh Best Pages (multi-model panel) ===');
  const available = PANEL.filter(p => process.env[p.envKey]);
  console.log(`Panel: ${available.map(p => `${p.label} (${p.model})`).join(', ') || '(none)'}\n`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is required (Claude is the writer)');
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

    const yamlContent = buildYaml(page, updates, today);
    fs.writeFileSync(page.filepath, yamlContent);
    console.log(`  Written to ${page.file}`);

    allResults.push({ page, changes, updates });
    console.log('');
  }

  const summary = generateSummary(allResults, today);
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
