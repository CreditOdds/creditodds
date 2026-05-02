#!/usr/bin/env node

/**
 * Check Card Rewards and Benefits Script
 *
 * Sibling of scripts/check-card-pages.js, but for the rewards[] and benefits[]
 * arrays plus the foreign_transaction_fee field — i.e. earn rates and perks
 * rather than the welcome bonus.
 *
 * Pipeline (per active card with apply_link):
 *   1. Fetch the apply page (simple fetch → Playwright fallback).
 *   2. Ask Claude Haiku to extract { rewards[], benefits[], foreign_transaction_fee }.
 *   3. Filter the proposal through `data/benefit-policy.yaml` and the card's
 *      git history (skip benefits previously removed from this card).
 *   4. Three-tier routing:
 *        - "auto-PR"   → write changes to the YAML; PR is opened by the workflow.
 *        - "review"    → append to .card-rewards-benefits-review.md (human triage).
 *        - "skip"      → silent; matched the exclude list or removed-history.
 *
 * Run via .github/workflows/check-card-rewards-and-benefits.yml weekly.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const CARDS_DIR = path.join(ROOT, 'data', 'cards');
const POLICY_FILE = path.join(ROOT, 'data', 'benefit-policy.yaml');
const REVIEW_SUMMARY = path.join(ROOT, '.card-rewards-benefits-review.md');
const SUMMARY_FILE = path.join(ROOT, '.card-rewards-benefits-summary.md');

const FETCH_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 15000;
const PER_CARD_TIMEOUT_MS = 90 * 1000;
const SCRIPT_TIMEOUT_MS = 25 * 60 * 1000;

// ─── Timeout helpers ─────────────────────────────────────────────────────────

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

// ─── Card loading + filtering ────────────────────────────────────────────────

function loadAllCards() {
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.yaml'));
  const cards = [];
  for (const file of files) {
    try {
      const filepath = path.join(CARDS_DIR, file);
      const content = fs.readFileSync(filepath, 'utf8');
      const data = yaml.load(content);
      if (data && data.slug) {
        cards.push({ slug: data.slug, filepath, data, content });
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

// Skip cards whose YAML was edited in the last N days — protects fresh manual
// edits from being stomped by the auto-checker.
function wasRecentlyEdited(filepath, days = 14) {
  try {
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%ct', '--', filepath],
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
    if (!out) return false;
    const lastEditMs = parseInt(out, 10) * 1000;
    return Date.now() - lastEditMs < days * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

// ─── Per-card removed-benefit history ───────────────────────────────────────
//
// Walks `git log -p` for a card's YAML and collects every benefit name that
// was ever REMOVED. The auto-PR layer treats those as deny-listed for that
// card so the system never re-adds something a human just took out.

function getRemovedBenefitsForCard(filepath) {
  let log;
  try {
    log = execFileSync(
      'git',
      ['log', '-p', '--no-color', '--', filepath],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
    );
  } catch {
    return new Set();
  }

  const removed = new Set();
  // Match deleted name: lines (`-  - name: "X"`) but NOT additions (`+  - name: "X"`).
  // We can't tell from a single line whether the surrounding hunk also re-added it,
  // so we'll cross-check against the current YAML and only deny-list names that
  // are NOT currently in the file.
  const pattern = /^-\s+-\s+name:\s+["']([^"']+)["']/gm;
  let match;
  while ((match = pattern.exec(log)) !== null) {
    removed.add(match[1]);
  }
  return removed;
}

function getCurrentBenefitNames(card) {
  return new Set((card.data.benefits || []).map(b => b.name));
}

// ─── Policy loading ─────────────────────────────────────────────────────────

function loadPolicy() {
  const raw = fs.readFileSync(POLICY_FILE, 'utf8');
  const policy = yaml.load(raw);
  return {
    exclude: (policy.exclude || []).map(s => s.toLowerCase()),
    borderline: (policy.borderline || []).map(s => s.toLowerCase()),
    exampleCards: policy.example_cards || [],
  };
}

function classifyBenefit(name, policy, removedFromThisCard) {
  const lower = name.toLowerCase();
  if (removedFromThisCard.has(name)) return 'removed_history';
  if (policy.exclude.some(p => lower.includes(p) || p.includes(lower))) return 'exclude';
  if (policy.borderline.some(p => lower.includes(p) || p.includes(lower))) return 'borderline';
  return 'auto';
}

// ─── HTML stripping ─────────────────────────────────────────────────────────

function stripHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<(s|del|strike)\b[^>]*>([\s\S]*?)<\/\1>/gi, ' [STRIKETHROUGH: $2] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000); // benefits sections are wordy — give Haiku a bit more
}

// ─── Page fetching ──────────────────────────────────────────────────────────

let _browser = null;

async function getBrowser() {
  if (_browser) return _browser;
  try {
    const { chromium } = require('playwright');
    _browser = await chromium.launch({ headless: true });
    return _browser;
  } catch (err) {
    console.warn(`  Playwright not available: ${err.message}`);
    return null;
  }
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

async function fetchPageContent(url) {
  // Simple fetch first
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
    if (response.ok) {
      const ct = response.headers.get('content-type') || '';
      if (ct.includes('text/html')) {
        const html = await response.text();
        const stripped = stripHtml(html);
        if (stripped.length >= 200) return { content: stripped, usedBrowser: false };
      }
    }
  } catch (err) {
    console.warn(`  Simple fetch failed: ${err.message} — falling back to browser`);
  }

  // Playwright fallback
  const browser = await getBrowser();
  if (!browser) return null;
  let context;
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const html = await page.content();
    const stripped = stripHtml(html);
    if (stripped.length < 200) return null;
    return { content: stripped, usedBrowser: true };
  } catch (err) {
    console.warn(`  Browser fetch error: ${err.message}`);
    return null;
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

// ─── Few-shot examples ──────────────────────────────────────────────────────

function buildFewShotExamples(allCards, exampleSlugs) {
  const examples = [];
  for (const slug of exampleSlugs) {
    const card = allCards.find(c => c.slug === slug);
    if (!card) continue;
    examples.push({
      name: card.data.name,
      rewards: card.data.rewards || [],
      benefits: card.data.benefits || [],
      foreign_transaction_fee: card.data.foreign_transaction_fee,
    });
  }
  return examples;
}

// ─── Claude Haiku extraction ────────────────────────────────────────────────

async function extractRewardsAndBenefits(card, applyLink, pageContent, examples) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required');

  const examplesBlock = examples
    .slice(0, 3)
    .map(ex => `### ${ex.name}\n${JSON.stringify({ rewards: ex.rewards, benefits: ex.benefits, foreign_transaction_fee: ex.foreign_transaction_fee }, null, 2)}`)
    .join('\n\n');

  const prompt = `You are extracting earn rates and benefits from a credit card's apply page.

Card: ${card.data.name} (${card.data.bank})
Source URL: ${applyLink}

Page content:
${pageContent}

Return ONLY valid JSON in this exact shape — no markdown, no commentary:

{
  "rewards": [
    { "category": "<category id>", "value": <number>, "unit": "percent" | "points_per_dollar", "note": "<optional>" }
  ],
  "benefits": [
    {
      "name": "<short benefit name>",
      "value": <number or 0 if perk has no monetary value>,
      "value_unit": "usd" | "points" | "miles",
      "description": "<one short sentence>",
      "frequency": "monthly" | "quarterly" | "semi_annual" | "annual" | "multi_year" | "ongoing" | "per_purchase" | "per_flight" | "per_trip" | "per_visit" | "per_rental" | "per_claim" | "every_4_years" | "one_time",
      "category": "dining" | "dining_travel" | "travel" | "hotel" | "entertainment" | "shopping" | "fitness" | "lounge" | "security" | "gas" | "streaming" | "grocery" | "rideshare" | "telecom" | "statement_credit" | "rewards" | "other",
      "enrollment_required": <true|false>
    }
  ],
  "foreign_transaction_fee": <true|false>
}

Rules:
- "rewards" describes per-CATEGORY EARN RATES on spend (e.g. "5% on dining", "3x points on travel"). Use category ids that already appear in the example cards below.
- "benefits" describes NON-SPEND PERKS — statement credits, free checked bag, lounge access, status, anniversary bonuses. Do NOT put earn rates here.
- "value_unit": use "usd" for dollar credits ("$300 travel credit"), "points" for point-denominated awards (e.g. 10,000 anniversary points), "miles" for mile-denominated. The default is "usd".
- "foreign_transaction_fee": true if the card charges a foreign transaction fee, false if not. null only if the page truly doesn't say.
- DO NOT include redemption mechanics (e.g. "Points Payback", "no blackout dates"), generic federal-law standards (e.g. "$0 Fraud Liability"), or network-tier perks (e.g. "Visa Signature Concierge", "Mastercard World Elite Benefits"). Those are filtered out post-extraction but it's cleaner if you don't include them.
- DO NOT include "Pay Over Time", "ExtendPay", "0% intro APR" entries — those are financing features, not benefits.
- DO NOT include earning multipliers (e.g. "10% bonus on points earned") — describe earn rates only in "rewards".
- DO NOT include "Free Employee Cards" or other generic business-card platform features.
- STRIKETHROUGH TEXT in [STRIKETHROUGH: ...] markers is expired/old; ignore those values.

EXAMPLES — what good extraction looks like for our team:

${examplesBlock}

Now extract for ${card.data.name}.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Claude API ${response.status}: ${text.slice(0, 200)}`);
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

// ─── Diff + classification ──────────────────────────────────────────────────

function diffRewards(current, proposed) {
  // Returns { added, removed, changed } by category id.
  const cur = new Map((current || []).map(r => [r.category, r]));
  const prop = new Map((proposed || []).map(r => [r.category, r]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [cat, p] of prop) {
    const c = cur.get(cat);
    if (!c) added.push(p);
    else if (c.value !== p.value || c.unit !== p.unit) changed.push({ from: c, to: p });
  }
  for (const [cat, c] of cur) {
    if (!prop.has(cat)) removed.push(c);
  }
  return { added, removed, changed };
}

function diffBenefits(current, proposed, policy, removedFromThisCard) {
  // Each proposed benefit is routed by classifyBenefit(); only "auto" routes
  // into the YAML. Existing benefits aren't touched (the human curated those).
  const currentNames = new Set((current || []).map(b => b.name));
  const auto = [];
  const review = [];
  const skipped = [];
  for (const b of proposed || []) {
    if (currentNames.has(b.name)) continue; // already there
    const tier = classifyBenefit(b.name, policy, removedFromThisCard);
    if (tier === 'auto') auto.push(b);
    else if (tier === 'borderline') review.push({ ...b, tier });
    else skipped.push({ ...b, tier });
  }
  return { auto, review, skipped };
}

function diffForeignTxn(current, proposed) {
  if (proposed === null || proposed === undefined) return null;
  if (current === proposed) return null;
  return { from: current ?? null, to: proposed };
}

// ─── YAML mutation ──────────────────────────────────────────────────────────

function applyChangesToYaml(card, rewardsDiff, benefitsDiff, ftxnDiff) {
  let yamlText = card.content;
  const data = yaml.load(yamlText);
  let modified = false;

  // FTF — top-level flag
  if (ftxnDiff && ftxnDiff.to !== undefined) {
    data.foreign_transaction_fee = ftxnDiff.to;
    modified = true;
  }

  // Rewards — overwrite values for changed categories; do NOT auto-add new
  // categories or remove existing ones (those need human review).
  if (rewardsDiff.changed.length > 0) {
    const cur = new Map((data.rewards || []).map(r => [r.category, r]));
    for (const { to } of rewardsDiff.changed) {
      const r = cur.get(to.category);
      if (r) {
        r.value = to.value;
        r.unit = to.unit;
        if (to.note) r.note = to.note;
        modified = true;
      }
    }
    data.rewards = Array.from(cur.values());
  }

  // Benefits — append auto-tier additions
  if (benefitsDiff.auto.length > 0) {
    if (!data.benefits) data.benefits = [];
    for (const b of benefitsDiff.auto) {
      data.benefits.push({
        name: b.name,
        ...(b.value > 0 ? { value: b.value } : {}),
        ...(b.value_unit && b.value_unit !== 'usd' ? { value_unit: b.value_unit } : {}),
        description: b.description,
        frequency: b.frequency,
        category: b.category,
        enrollment_required: !!b.enrollment_required,
      });
    }
    modified = true;
  }

  if (!modified) return false;

  // Re-serialize. We use full re-dump to avoid the regex-based field-replacement
  // hairiness in check-card-pages.js — the diff size is small per card so a
  // re-dump is fine and gives stable formatting.
  const newYaml = yaml.dump(data, {
    quotingType: '"',
    lineWidth: -1,
    sortKeys: false,
    noRefs: true,
  });
  fs.writeFileSync(card.filepath, newYaml);
  return true;
}

// ─── Review-queue formatting ────────────────────────────────────────────────

function appendReviewEntries(cardName, applyLink, reviewItems, rewardsDiff, ftxnDiff) {
  if (reviewItems.length === 0 && rewardsDiff.added.length === 0 && rewardsDiff.removed.length === 0) {
    return;
  }
  const lines = [];
  lines.push(`\n## ${cardName}`);
  lines.push(`**Apply link:** ${applyLink}\n`);

  if (rewardsDiff.added.length > 0) {
    lines.push(`### New reward category proposed (needs human routing)`);
    for (const r of rewardsDiff.added) {
      lines.push(`- \`${r.category}\`: ${r.value}${r.unit === 'percent' ? '%' : 'x'}${r.note ? ` — ${r.note}` : ''}`);
    }
  }
  if (rewardsDiff.removed.length > 0) {
    lines.push(`### Reward category present in YAML but not on apply page`);
    for (const r of rewardsDiff.removed) {
      lines.push(`- \`${r.category}\`: ${r.value}${r.unit === 'percent' ? '%' : 'x'} (verify before removing)`);
    }
  }
  if (reviewItems.length > 0) {
    lines.push(`### Borderline benefits proposed (manual decision)`);
    for (const b of reviewItems) {
      lines.push(`- **${b.name}** — ${b.description}`);
    }
  }

  fs.appendFileSync(REVIEW_SUMMARY, lines.join('\n') + '\n');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const slugFilter = process.env.CARD_SLUG || '';
  const allCards = loadAllCards();
  const cards = filterCardsForCheck(allCards, slugFilter);
  const policy = loadPolicy();
  const examples = buildFewShotExamples(allCards, policy.exampleCards);

  // Reset review summary for this run
  if (fs.existsSync(REVIEW_SUMMARY)) fs.unlinkSync(REVIEW_SUMMARY);

  console.log(`\nChecking ${cards.length} active card(s) with apply_link...\n`);

  const summary = {
    fetched: 0,
    extractFailed: 0,
    fetchFailed: 0,
    skippedRecentlyEdited: 0,
    cardsModified: 0,
    autoChanges: 0,
    reviewItems: 0,
  };

  const startMs = Date.now();

  for (const card of cards) {
    if (Date.now() - startMs > SCRIPT_TIMEOUT_MS) {
      console.warn(`Script-level timeout reached, stopping early.`);
      break;
    }

    if (wasRecentlyEdited(card.filepath)) {
      console.log(`[skip] ${card.data.name} — YAML edited within last 14 days`);
      summary.skippedRecentlyEdited++;
      continue;
    }

    console.log(`[fetch] ${card.data.name}`);
    let pageResult;
    try {
      pageResult = await withTimeout(
        fetchPageContent(card.data.apply_link),
        PER_CARD_TIMEOUT_MS,
        `fetch ${card.data.name}`
      );
    } catch (err) {
      console.warn(`  Fetch failed: ${err.message}`);
      summary.fetchFailed++;
      continue;
    }
    if (!pageResult) {
      summary.fetchFailed++;
      continue;
    }
    summary.fetched++;

    let extracted;
    try {
      extracted = await withTimeout(
        extractRewardsAndBenefits(card, card.data.apply_link, pageResult.content, examples),
        PER_CARD_TIMEOUT_MS,
        `extract ${card.data.name}`
      );
    } catch (err) {
      console.warn(`  Extraction failed: ${err.message}`);
      summary.extractFailed++;
      continue;
    }
    if (!extracted) {
      summary.extractFailed++;
      continue;
    }

    const removed = getRemovedBenefitsForCard(card.filepath);
    const currentNames = getCurrentBenefitNames(card);
    // Don't deny-list things that are CURRENTLY in the YAML (they can be
    // removed and re-added; we only deny-list ones not currently present).
    for (const name of currentNames) removed.delete(name);

    const rewardsDiff = diffRewards(card.data.rewards, extracted.rewards);
    const benefitsDiff = diffBenefits(card.data.benefits, extracted.benefits, policy, removed);
    const ftxnDiff = diffForeignTxn(card.data.foreign_transaction_fee, extracted.foreign_transaction_fee);

    const wrote = applyChangesToYaml(card, rewardsDiff, benefitsDiff, ftxnDiff);
    if (wrote) {
      summary.cardsModified++;
      summary.autoChanges +=
        rewardsDiff.changed.length + benefitsDiff.auto.length + (ftxnDiff ? 1 : 0);
      console.log(
        `  [auto] ${rewardsDiff.changed.length} reward change(s), ${benefitsDiff.auto.length} new benefit(s), ` +
        `FTF ${ftxnDiff ? `${ftxnDiff.from}→${ftxnDiff.to}` : 'unchanged'}`
      );
    }

    appendReviewEntries(card.data.name, card.data.apply_link, benefitsDiff.review, rewardsDiff, ftxnDiff);
    summary.reviewItems += benefitsDiff.review.length + rewardsDiff.added.length + rewardsDiff.removed.length;

    await new Promise(r => setTimeout(r, FETCH_DELAY_MS));
  }

  await closeBrowser();

  // Top-level summary so the workflow can decide whether to PR / open issue
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  console.log('\n=== Summary ===');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error('Fatal:', err);
  closeBrowser().catch(() => {});
  process.exit(1);
});
