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
      "value_unit": "usd" | "points" | "miles" | "percent",
      "description": "<one short sentence>",
      "frequency": "monthly" | "quarterly" | "semi_annual" | "annual" | "multi_year" | "ongoing" | "per_purchase" | "per_flight" | "per_trip" | "per_visit" | "per_rental" | "per_claim" | "one_time",
      "frequency_years": <number, REQUIRED when frequency is "multi_year"; e.g. 5 for Global Entry / TSA PreCheck (5-year renewal cycle), 4 for benefits with explicit 4-year cycle, 2 for biennial perks>,
      "category": "dining" | "dining_travel" | "travel" | "hotel" | "entertainment" | "shopping" | "fitness" | "lounge" | "security" | "gas" | "streaming" | "grocery" | "rideshare" | "car_rental" | "telecom" | "statement_credit" | "rewards" | "other",
      "enrollment_required": <true|false>
    }
  ],
  "foreign_transaction_fee": <true|false>
}

Rules:

# WHAT COUNTS AS A "BENEFIT"
A benefit is a FREE thing of QUANTIFIABLE MONETARY VALUE that you get from
holding this specific card. Examples of real benefits:
  - "$300 annual travel credit"
  - "Free checked bag for cardholder + 8 companions"
  - "Companion certificate after $30K spend"
  - "10,000 anniversary points each year"
  - "Free unlimited Priority Pass lounge access"
  - "Anniversary free night award (up to 35,000 points)"
  - "25% inflight purchase rebate"
  - "Automatic Diamond elite status"
  - "Global Entry / TSA PreCheck application fee credit ($100)"

When in doubt, UNDER-report. We'd rather miss a real benefit than list a
non-benefit. Only include items you can clearly describe with either a
dollar amount, a point/mile amount, a free count (e.g. "free first checked
bag"), an elite status tier, or a clearly free recurring service.

# DO NOT INCLUDE — these are CARD FEATURES, not benefits
- "Paperless Statements", "eStatements", "Digital Statements" — features.
- "No Annual Fee", "$0 Annual Fee" — that's the \`annual_fee\` field.
- "Foreign Transaction Fee", "No Foreign Transaction Fees" — that's the
  \`foreign_transaction_fee\` field. NEVER list this in \`benefits[]\`.
- "Mobile Wallet", "Digital Wallet", "Apple Pay", "Google Pay",
  "Contactless Payment", "Tap to Pay" — every modern card has these.
- "Mobile App", "Online Banking", "Account Alerts", "Autopay" — features.
- "Card Design", "Custom Card Design" — cosmetic.
- "FICO Score", "Credit Close-Up", "Credit Monitoring" — issuer-platform
  features available to all the bank's customers.

# DO NOT INCLUDE — issuer-platform "deals" portals
- "My Wells Fargo Deals", "Chase Offers", "BankAmeriDeals", "Citi Merchant
  Offers", "Capital One Offers", "Card Exclusives", "Cardmember Exclusives",
  "Autograph Card Exclusives" — vague platform-wide marketing programs, not
  card-specific perks.

# DO NOT INCLUDE — vague / unquantifiable
- "Exclusive access to events" without a specific recurring value.
- "Special offers" / "Hand-picked offers" / "Curated experiences".
- "Concierge service" without a specific dollar value.
- Anything described only with marketing adjectives ("premium", "elite",
  "exclusive") and no concrete amount or quantity.

# DO NOT INCLUDE — pay-to-use / opt-in-fee features
- "LoungeKey" or "Pay-as-you-go Lounge Access" where you must pay per visit.
- "Priority Pass" ONLY counts as a benefit if access is FREE (unlimited or
  N free visits per year). If the page says "with pay-per-visit pricing"
  or "members rate" or similar, OMIT it.

# DO NOT INCLUDE — earn / redemption / finance mechanics
- "rewards" describes per-CATEGORY EARN RATES on spend (e.g. "5% on dining"). Use category ids that already appear in the example cards below.
- DO NOT include redemption mechanics (e.g. "Points Payback", "no blackout dates"), generic federal-law standards (e.g. "$0 Fraud Liability"), or network-tier perks (e.g. "Visa Signature Concierge", "Mastercard World Elite Benefits").
- DO NOT include "Pay Over Time", "ExtendPay", "0% intro APR" entries — financing features, not benefits.
- DO NOT include earning multipliers (e.g. "10% bonus on points earned") — describe earn rates only in "rewards".
- DO NOT include "Free Employee Cards" or other generic business-card platform features.
- DO NOT include the welcome/signup bonus as a benefit. Names like "Welcome Bonus", "New Cardmember Bonus", "Sign-Up Bonus", "Introductory Bonus" must NOT appear in the \`benefits[]\` array.
- DO NOT include "Roadside Dispatch", "Emergency Cash Disbursement", or "Emergency Card Replacement" — Visa/Mastercard network-tier features on every card.

# FIELD RULES — value + value_unit + frequency
The \`value\` is a number, paired with a \`value_unit\` that says what the
number means. CRITICAL: never put a percentage in \`value\` without setting
\`value_unit: "percent"\` — \`value: 5\` with no unit means "$5", which is
WRONG for a "5% rebate" benefit.

\`value\` is the ANNUAL TOTAL the cardholder gets in a typical year. The
\`frequency\` field is just a display hint (renders as "$15/mo", "$50/qtr",
"$200/6 mo", etc.) — it is NOT used as a multiplier. Examples that match
the existing repo convention:
  Amex Platinum Uber Cash ("$15/month"):
    value: 200, frequency: monthly      ← value is the annual total ($200)
  Hilton Aspire flight credit ("$50/quarter"):
    value: 200, frequency: quarterly    ← annual total ($50 × 4 = $200)
  Hilton Aspire resort credit ("$400 semi-annually"):
    value: 800, frequency: semi_annual  ← annual total ($400 × 2 = $800)
  Amex Biz Plat Indeed credit ("$90/quarter"):
    value: 360, frequency: quarterly    ← annual total
DO NOT store the per-occurrence value with a sub-annual frequency — the
frontend would treat \`value: 15, frequency: monthly\` as $15/yr, not
$180/yr. The only frequency that does cycle math is \`multi_year\`, where
\`value\` is the amount per cycle and \`frequency_years\` is the cycle
length (Global Entry: value=120, frequency=multi_year, frequency_years=5).

- \`value_unit: "usd"\` — dollar credits/rebates. Default. Examples:
  "$300 travel credit" → value=300, value_unit=usd (or omitted).
  "Up to $100 statement credit" → value=100.
- \`value_unit: "points"\` — point-denominated awards. Examples:
  "10,000 anniversary points" → value=10000, value_unit=points.
- \`value_unit: "miles"\` — mile-denominated awards. Examples:
  "10,000 mile award flight discount" → value=10000, value_unit=miles.
- \`value_unit: "percent"\` — percentage rebates, discounts, or back-rates.
  Use this whenever the value represents a percent of something. Examples:
  "25% inflight purchase rebate" → value=25, value_unit=percent.
  "5% off Hertz Pay Later rates" → value=5, value_unit=percent.
  "2% Booking.com travel credit" → value=2, value_unit=percent.

- "foreign_transaction_fee": true if the card charges one, false if not. null only if the page truly doesn't say.
- For ELITE-NIGHT-CREDIT or TIER-QUALIFYING-NIGHT type benefits, use \`value: 0\` and OMIT \`value_unit\` — non-monetary count perks. The count goes in the description (e.g. "5 elite night credits each year").
- For elite STATUS perks (e.g. "Automatic Diamond Status"), use \`value: 0\` and put the tier name in the description.
- When you set \`frequency: "multi_year"\` you MUST also set \`frequency_years\` to the actual cycle length. Examples:
    Global Entry credit ($120, renews every 5 years) → \`frequency: "multi_year"\`, \`frequency_years: 5\`.
    TSA PreCheck credit ($85, every 5 years) → same — 5.
    A biennial fitness credit ($200 every 2 years) → \`frequency_years: 2\`.
  The frontend uses \`frequency_years\` to amortize the credit per year (so a $120/5yr Global Entry contributes $24/yr to the card's total annual credits).
- STRIKETHROUGH TEXT in [STRIKETHROUGH: ...] markers is expired/old; ignore those values.

# CALIBRATION
We currently have ~80 cards. A typical week should produce ≤10–15 truly new
benefits across all cards. If you find yourself listing more than 2–3 new
benefits for one card, you're probably over-reporting — re-read each one and
ask: "Is this a free thing with concrete monetary value, or is it just a
feature of the card?"

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

// Load valid reward category ids from data/categories.yaml so we can drop
// extractor-proposed rewards that wouldn't pass build:cards validation.
let _validCategoryIds = null;
function getValidCategoryIds() {
  if (_validCategoryIds) return _validCategoryIds;
  try {
    const catYaml = yaml.load(
      fs.readFileSync(path.join(ROOT, 'data', 'categories.yaml'), 'utf8')
    );
    const list = Array.isArray(catYaml) ? catYaml : (catYaml?.categories || []);
    _validCategoryIds = new Set(
      list.map(c => (typeof c === 'string' ? c : c.id)).filter(Boolean)
    );
  } catch {
    _validCategoryIds = new Set();
  }
  return _validCategoryIds;
}

// Coerce LLM-emitted units/categories to schema-valid values. The schema only
// accepts unit 'percent' or 'points_per_dollar' and category ids from
// categories.yaml; an extractor that emits 'miles_per_dollar' or an unknown
// category is technically wrong but salvageable — normalize where possible,
// drop where not, rather than poison the whole card's changes.
function normalizeRewardsUnits(rewards) {
  if (!Array.isArray(rewards)) return [];
  const validCats = getValidCategoryIds();
  const cleaned = [];
  for (const r of rewards) {
    if (!r || typeof r !== 'object') continue;
    let unit = typeof r.unit === 'string' ? r.unit.toLowerCase().trim() : '';
    if (unit === '%' || unit === 'percent' || unit === 'pct') {
      unit = 'percent';
    } else if (
      unit === 'points_per_dollar' ||
      unit === 'miles_per_dollar' ||
      unit === 'avios_per_dollar' ||
      unit === 'points' ||
      unit === 'miles' ||
      unit === 'x' ||
      unit === 'point' ||
      unit === 'mile'
    ) {
      unit = 'points_per_dollar';
    } else {
      // Couldn't normalize — drop this reward rather than poison the YAML.
      continue;
    }

    // Drop rewards with categories not in categories.yaml.
    if (validCats.size > 0 && r.category && !validCats.has(r.category)) {
      continue;
    }

    cleaned.push({ ...r, unit });
  }
  return cleaned;
}

function diffRewards(current, proposed) {
  // Returns { added, removed, changed } by category id.
  //
  // IMPORTANT: we only emit a "changed" entry when the unit MATCHES. A unit
  // flip (e.g. points_per_dollar → percent) is almost always an LLM
  // misreading — the apply page often advertises an alt-redemption rate
  // ("4% Bilt Cash on everyday purchases") that the model treats as the
  // earn rate. Drop those silently rather than overwriting the human-curated
  // earn rate with the wrong unit.
  const cur = new Map((current || []).map(r => [r.category, r]));
  const prop = new Map((proposed || []).map(r => [r.category, r]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [cat, p] of prop) {
    const c = cur.get(cat);
    if (!c) {
      added.push(p);
    } else if (c.unit !== p.unit) {
      // Unit mismatch — skip; almost always an LLM misread.
      continue;
    } else if (c.value !== p.value) {
      changed.push({ from: c, to: p });
    }
  }
  for (const [cat, c] of cur) {
    if (!prop.has(cat)) removed.push(c);
  }
  return { added, removed, changed };
}

// Tokenize a benefit name into meaningful words for fuzzy duplicate detection.
// Drops short words and a small stop-list of glue words that show up across
// many benefits (Annual, Statement, Credit, etc.) and would otherwise
// produce false positives.
const BENEFIT_NAME_STOP_WORDS = new Set([
  'annual', 'statement', 'credit', 'credits', 'free', 'on', 'and', 'the', 'a',
  'of', 'for', 'in', 'with', 'plan', 'membership', 'rewards', 'reward',
]);
// Normalize synonyms so the tokenizer treats "cell"/"cellular" and
// "phone"/"telephone" as the same word — apply pages frequently use both.
const BENEFIT_NAME_ALIASES = new Map([
  ['cellular', 'cell'],
  ['telephone', 'phone'],
  ['baggage', 'luggage'],
  ['waiver', 'damage'],
  ['cdw', 'damage'],
]);
// Naive plural normalization: 'nights' → 'night', 'miles' → 'mile',
// 'passes' → 'pass'. Imperfect (won't catch 'companies' → 'company') but
// covers the common cases for benefit names without pulling in a full stemmer.
function depluralize(word) {
  // 'passes' → 'pass', 'losses' → 'loss'
  if (word.length > 4 && word.endsWith('sses')) return word.slice(0, -2);
  // 'nights' → 'night', 'miles' → 'mile' (but not 'pass' or 'loss')
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}

function tokenizeBenefitName(name) {
  return new Set(
    String(name || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .map(t => BENEFIT_NAME_ALIASES.get(t) || t)
      .map(depluralize)
      .filter(t => t.length > 2 && !BENEFIT_NAME_STOP_WORDS.has(t))
  );
}

// Two benefit names are likely the same benefit if EITHER:
//  - they share at least 2 meaningful tokens, OR
//  - one's meaningful-token set is a subset of the other AND ≥1 token is shared, OR
//  - the smaller set is ≤2 tokens AND ≥1 token is shared
//    (catches things like "5 Qualifying Night Credits" vs "Elite Night Credits"
//     — only 'night' is shared, but with 2-token sets that's plenty of signal)
function looksLikeSameBenefit(a, b) {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  const ta = tokenizeBenefitName(a);
  const tb = tokenizeBenefitName(b);
  if (ta.size === 0 || tb.size === 0) return false;
  const shared = [...ta].filter(t => tb.has(t)).length;
  if (shared >= 2) return true;
  if (shared >= 1) {
    const aSubsetOfB = [...ta].every(t => tb.has(t));
    const bSubsetOfA = [...tb].every(t => ta.has(t));
    if (aSubsetOfB || bSubsetOfA) return true;
    // Small-set rule: when both names have ≤2 meaningful tokens, sharing 1
    // out of 2 is a strong signal (and the alternative is to add a near-dup).
    if (Math.min(ta.size, tb.size) <= 2) return true;
  }
  return false;
}

// Monetary-value gate.
//
// A benefit must describe something with concrete, quantifiable VALUE — a
// dollar credit, a point/mile award, a free recurring service, an elite
// status tier, or a discount/rebate at a specific rate. Pure card features
// (paperless statements, mobile wallet, FICO score access, "exclusive
// access" with no specifics) get dropped here so we never auto-PR them
// even if they slip past the policy file.
//
// We accept the proposal if ANY of these are true:
//   1. b.value > 0 (the LLM gave it a numeric value)
//   2. description contains a $-amount, percentage, or numeric quantity
//      tied to a value-bearing word (off, back, rebate, discount, bonus,
//      credit, points, miles, nights, visits, statements [credits])
//   3. name matches a high-confidence "valuable perk" pattern
//      (free X, complimentary X, anniversary, companion, lounge access,
//      checked bag, status, night award, application fee credit, …)
//
// Anything else gets routed to `skipped` with tier 'no_monetary_value'.
function hasMonetaryValue(b) {
  if (!b || typeof b !== 'object') return false;
  if (typeof b.value === 'number' && b.value > 0) return true;

  const name = String(b.name || '').toLowerCase();
  const desc = String(b.description || '').toLowerCase();
  const text = `${name} ${desc}`;

  // 1. Hard reject — names/descriptions that are inherently non-monetary
  //    even if they pass other heuristics.
  const HARD_REJECT_PATTERNS = [
    /\bpaperless\b/, /\bestatement/, /\be-statement/,
    /\bmobile wallet\b/, /\bdigital wallet\b/, /\bcontactless\b/,
    /\btap to pay\b/, /\bapple pay\b/, /\bgoogle pay\b/, /\bsamsung pay\b/,
    /\bcard design\b/, /\bcustom card\b/,
    /\bfico\b/, /\bcredit close-?up\b/, /\bcredit monitoring\b/,
    /\bcredit score\b/,
    /\baccount alerts?\b/, /\bonline banking\b/, /\bmobile app\b/,
    /\bautopay\b/, /\bauto pay\b/, /\bbill pay\b/,
    /\bno annual fee\b/, /\$0 annual fee\b/,
    /\bforeign transaction fee\b/,
    /\brefer.a.friend\b/,
  ];
  for (const re of HARD_REJECT_PATTERNS) {
    if (re.test(text)) return false;
  }

  // 2. Pay-per-visit lounges aren't free → not a benefit.
  if (/lounge/i.test(text) && /(pay.as.you.go|pay.per.visit|members? rate|fee per visit|per.visit fee)/i.test(text)) {
    return false;
  }

  // 3. Vague "exclusive access" without a concrete amount → not a benefit.
  if (
    /(exclusive|special|curated|hand.?picked|cardmember).{0,40}(access|offer|experience|event|deal)/i.test(text) &&
    !/\$\s?\d/.test(text) &&
    !/\d+\s?(%|percent|points|miles|nights?|visits?|times?)/i.test(text)
  ) {
    return false;
  }

  // 4. Numeric-value heuristics — a dollar amount, a percent rebate/off,
  //    or a quantity of points/miles/nights/visits.
  if (/\$\s?\d/.test(text)) return true;
  if (/\d+\s*%\s*(off|back|rebate|discount|bonus|credit|cash)/i.test(text)) return true;
  if (/\d[\d,]*\s*(points?|miles?|nights?|free visits?|free checked bag)/i.test(text)) return true;
  if (/\d+\s*(free|complimentary)\s+(visits?|nights?|bags?|passes?|rounds?)/i.test(text)) return true;

  // 5. Allowlist of high-confidence "real benefit" name patterns. These are
  //    types of perks our team consistently keeps even without a number in
  //    the LLM's description.
  const ALLOW_PATTERNS = [
    /\bfree (checked|first|second) bag\b/,
    /\bfree night\b/, /\bnight award\b/, /\banniversary night\b/,
    /\bcompanion (certificate|fare|pass|ticket)\b/,
    /\bglobal entry\b/, /\btsa pre.?check\b/,
    /\bpriority pass\b/,                    // policy + pay-per-visit reject above will filter LoungeKey-only
    /\bairport lounge\b/,
    /\bfree lounge\b/, /\bcomplimentary lounge\b/, /\bunlimited lounge\b/,
    /\b(automatic|complimentary)\s+\w+\s+status\b/,  // "Automatic Diamond Status"
    /\b(diamond|platinum|gold|titanium|emerald)\s+(elite\s+)?status\b/,
    /\belite night credits?\b/, /\bqualifying night\b/,
    /\bstatement credit\b/,
    /\btravel credit\b/, /\bdining credit\b/, /\bairline credit\b/,
    /\buber credit\b/, /\blyft credit\b/,
    /\bfree (delivery|membership|subscription)\b/,
    /\bcomplimentary \w+ membership\b/,
    /\bin.?flight (rebate|discount|credit)\b/,
    /\bsaver award\b/,
    /\bpoints? (back|payback|rebate|bonus)\b/,
    /\bearn.{0,10}bonus\b/,
  ];
  for (const re of ALLOW_PATTERNS) {
    if (re.test(text)) return true;
  }

  return false;
}

// If the LLM emitted a small `value` (≤100) and the description shows a
// matching "N%" pattern but didn't set `value_unit`, infer "percent". This
// is a safety net — the prompt now explicitly asks for value_unit:"percent"
// for percentage rebates, but cheaper to also normalize here than re-run.
function normalizeBenefitUnit(b) {
  if (!b || typeof b !== 'object') return b;
  if (b.value_unit) return b; // already set, trust it
  if (typeof b.value !== 'number' || b.value <= 0 || b.value > 100) return b;
  const desc = String(b.description || '');
  // Match "<value>%" anywhere in the description.
  const pctRe = new RegExp(`\\b${b.value}\\s*%`);
  if (pctRe.test(desc)) {
    return { ...b, value_unit: 'percent' };
  }
  return b;
}

function diffBenefits(current, proposed, policy, removedFromThisCard) {
  // Each proposed benefit is routed by classifyBenefit(); only "auto" routes
  // into the YAML. Existing benefits aren't touched (the human curated those).
  const currentNames = (current || []).map(b => b.name);
  const auto = [];
  const review = [];
  const skipped = [];
  for (const raw of proposed || []) {
    const b = normalizeBenefitUnit(raw);
    // Exact-name dedup
    if (currentNames.includes(b.name)) {
      skipped.push({ ...b, tier: 'duplicate_exact' });
      continue;
    }
    // Fuzzy dedup — skip a proposal that probably refers to an existing benefit
    // (the human curated the existing wording; we won't replace it).
    const fuzzyMatch = currentNames.find(n => looksLikeSameBenefit(n, b.name));
    if (fuzzyMatch) {
      skipped.push({ ...b, tier: 'duplicate_fuzzy', fuzzyMatch });
      continue;
    }
    // Monetary-value gate — drop card-features-not-benefits even if the
    // policy file doesn't have an exact-string match for them. The team's
    // standing rule: "benefits are free things with VALUE, not features."
    if (!hasMonetaryValue(b)) {
      skipped.push({ ...b, tier: 'no_monetary_value' });
      continue;
    }
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
//
// We do NOT full-re-dump the YAML (`yaml.dump(data)`) because the repo's
// hand-written cards have inconsistent quoting style — some fields are
// quoted, some aren't, tags and category ids are usually unquoted, etc.
// Any full re-dump produces 30+ lines of cosmetic diff per card, which
// drowns the actual signal.
//
// Instead, we do surgical edits to the original file text:
//   - FTF: regex-replace the existing `foreign_transaction_fee:` line, or
//     insert a new one near the top of the file.
//   - Rewards: find the `- category: <id>` block and edit just the `value:`
//     line beneath it. (Unit edits are rejected by diffRewards now.)
//   - Benefits: append YAML-formatted entries to the existing `benefits:`
//     block, or create a new block at the end of the file if missing.
//
// The result: PR diffs show only the lines that actually changed.

// YAML-quote a string value the way the repo's existing cards do — wrap
// in double quotes and escape embedded quotes/backslashes.
function ymlString(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// Render one benefit object as a YAML list-item block matching the repo
// style. Field order mirrors the existing hand-curated cards. `indent` is
// the column where the `-` lives; field lines sit at `indent + 2` so they
// line up with the `name:` key after `- `.
function renderBenefitBlock(b, indent = '  ') {
  const fieldIndent = indent + '  ';
  const lines = [];
  lines.push(`${indent}- name: ${ymlString(b.name)}`);
  if (typeof b.value === 'number' && b.value > 0) {
    lines.push(`${fieldIndent}value: ${b.value}`);
  }
  if (b.value_unit && b.value_unit !== 'usd') {
    lines.push(`${fieldIndent}value_unit: ${ymlString(b.value_unit)}`);
  }
  if (b.description) {
    lines.push(`${fieldIndent}description: ${ymlString(b.description)}`);
  }
  if (b.frequency) {
    lines.push(`${fieldIndent}frequency: ${ymlString(b.frequency)}`);
  }
  if (b.frequency === 'multi_year' && typeof b.frequency_years === 'number' && b.frequency_years > 0) {
    lines.push(`${fieldIndent}frequency_years: ${b.frequency_years}`);
  }
  if (b.category) {
    lines.push(`${fieldIndent}category: ${ymlString(b.category)}`);
  }
  lines.push(`${fieldIndent}enrollment_required: ${b.enrollment_required ? 'true' : 'false'}`);
  return lines.join('\n');
}

// Edit the `value:` for a specific reward category in place. We locate the
// `- category: <id>` line (allowing optional quotes around the id), then
// edit the immediately-following `value:` line. We do NOT touch `unit:`
// because diffRewards already rejected unit-mismatch updates.
function editRewardValue(text, categoryId, newValue) {
  // Match: `  - category: airlines` or `  - category: "airlines"` (with any leading indent).
  const catRe = new RegExp(
    String.raw`^(\s*-\s*category:\s*"?)${categoryId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}("?\s*)$`,
    'm'
  );
  const m = text.match(catRe);
  if (!m) return { text, changed: false };
  // Find the `value:` line within the next ~6 lines after the category line.
  const after = text.slice(m.index + m[0].length);
  const lines = after.split('\n');
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const valM = lines[i].match(/^(\s*)value:\s*[\d.]+(\s*)$/);
    if (valM) {
      lines[i] = `${valM[1]}value: ${newValue}${valM[2]}`;
      const newAfter = lines.join('\n');
      return { text: text.slice(0, m.index + m[0].length) + newAfter, changed: true };
    }
    // Bail if we hit the next list item or a non-indented line.
    if (/^\s*-\s/.test(lines[i]) || /^\S/.test(lines[i])) break;
  }
  return { text, changed: false };
}

// Set or insert the foreign_transaction_fee field. If the line already
// exists (true/false/null), edit it. Otherwise insert it after `apply_link:`
// or at the end of the top-level fields (before any nested blocks).
function setForeignTransactionFee(text, newVal) {
  const valStr = newVal === true ? 'true' : newVal === false ? 'false' : 'null';
  const re = /^foreign_transaction_fee:\s*(true|false|null|~)\s*$/m;
  if (re.test(text)) {
    return { text: text.replace(re, `foreign_transaction_fee: ${valStr}`), changed: true };
  }
  // Insert after apply_link (most common location in existing cards).
  const applyRe = /^(apply_link:\s*[^\n]+)$/m;
  const aM = text.match(applyRe);
  if (aM) {
    const insertAt = aM.index + aM[0].length;
    return {
      text: text.slice(0, insertAt) + `\nforeign_transaction_fee: ${valStr}` + text.slice(insertAt),
      changed: true,
    };
  }
  // Fallback: append before the first multiline block (rewards:/benefits:/apr:/tags:/signup_bonus:).
  const blockRe = /^(rewards|benefits|apr|tags|signup_bonus):\s*$/m;
  const bM = text.match(blockRe);
  if (bM) {
    return {
      text: text.slice(0, bM.index) + `foreign_transaction_fee: ${valStr}\n` + text.slice(bM.index),
      changed: true,
    };
  }
  // Last-resort: append at end.
  const trimmed = text.replace(/\n+$/, '');
  return { text: `${trimmed}\nforeign_transaction_fee: ${valStr}\n`, changed: true };
}

// Append benefits to the existing `benefits:` block (preserving everything
// already there), or create a new `benefits:` block at the end of the file
// if no block exists.
function appendBenefits(text, newBenefits) {
  if (newBenefits.length === 0) return { text, changed: false };
  const blocks = newBenefits.map(b => renderBenefitBlock(b)).join('\n');

  // Locate `^benefits:` at column 0.
  const bRe = /^benefits:\s*$/m;
  const m = text.match(bRe);
  if (m) {
    // Find the end of the benefits block — the next top-level key or EOF.
    // A top-level key starts with `[a-zA-Z_]` at column 0.
    const after = text.slice(m.index + m[0].length);
    const nextTopRe = /\n([a-zA-Z_][a-zA-Z0-9_]*:)/;
    const nM = after.match(nextTopRe);
    const blockEndOffset =
      m.index + m[0].length + (nM ? nM.index + 1 : after.length);
    const before = text.slice(0, blockEndOffset).replace(/\n+$/, '');
    const tail = text.slice(blockEndOffset);
    return {
      text: `${before}\n${blocks}` + (tail ? `\n${tail.replace(/^\n+/, '')}` : '\n'),
      changed: true,
    };
  }
  // No existing block — append at end.
  const trimmed = text.replace(/\n+$/, '');
  return { text: `${trimmed}\nbenefits:\n${blocks}\n`, changed: true };
}

function applyChangesToYaml(card, rewardsDiff, benefitsDiff, ftxnDiff) {
  let text = card.content;
  let modified = false;

  // FTF — single-line edit or insert
  if (ftxnDiff && ftxnDiff.to !== undefined) {
    const r = setForeignTransactionFee(text, ftxnDiff.to);
    if (r.changed) {
      text = r.text;
      modified = true;
    }
  }

  // Rewards — overwrite the `value:` line for changed categories only.
  // (Unit changes are rejected upstream by diffRewards.)
  for (const { to } of rewardsDiff.changed) {
    const r = editRewardValue(text, to.category, to.value);
    if (r.changed) {
      text = r.text;
      modified = true;
    }
  }

  // Benefits — append-only, never rewrite existing entries.
  if (benefitsDiff.auto.length > 0) {
    const r = appendBenefits(text, benefitsDiff.auto);
    if (r.changed) {
      text = r.text;
      modified = true;
    }
  }

  if (!modified) return false;
  fs.writeFileSync(card.filepath, text);
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

// ─── Rotating-period staleness check ────────────────────────────────────────
//
// Discover It / Chase Freedom Flex / NHL Discover It / etc. rotate their
// 5% bonus categories every quarter. The team has surfaced the same failure
// mode multiple times: the new quarter starts but nobody updates the YAML,
// so the site keeps showing last quarter's categories.
//
// Each weekly run we audit every rotating-category card. If `current_period`
// doesn't match the current calendar quarter — or is missing entirely — we
// surface it at the TOP of the review issue so the team sees it before
// triaging the per-card benefit/reward proposals.

function currentQuarterLabel(now = new Date()) {
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${now.getUTCFullYear()}`;
}

function findStaleRotatingPeriods(allCards) {
  const expected = currentQuarterLabel();
  const stale = [];
  for (const card of allCards) {
    const rewards = card.data?.rewards;
    if (!Array.isArray(rewards)) continue;
    for (const reward of rewards) {
      if (reward.mode !== 'quarterly_rotating') continue;
      const cur = reward.current_period;
      if (!cur) {
        stale.push({ name: card.data.name, applyLink: card.data.apply_link, currentPeriod: '(missing)', expected });
        continue;
      }
      if (String(cur).trim().toUpperCase() !== expected.toUpperCase()) {
        stale.push({ name: card.data.name, applyLink: card.data.apply_link, currentPeriod: String(cur), expected });
      }
    }
  }
  return stale;
}

// Prepend stale-rotation entries to the review summary so they sit above
// the per-card sections. We write before any per-card appendReviewEntries
// calls (in main()), so the order is: header → stale rotations → cards.
function writeRotatingPeriodSection(stale) {
  if (stale.length === 0) return;
  const lines = [];
  lines.push(`## ⚠️ Stale rotating-category periods (${stale.length})`);
  lines.push(``);
  lines.push(`These cards rotate their 5% bonus categories every quarter, but their \`current_period\` doesn't match **${stale[0].expected}** (or is missing). Update \`current_categories\` and \`current_period\` in the YAML — the site is otherwise still serving last quarter's categories on the card page and rewards filters.`);
  lines.push(``);
  for (const s of stale) {
    const link = s.applyLink ? ` ([apply page](${s.applyLink}))` : '';
    lines.push(`- **${s.name}** — currently \`${s.currentPeriod}\`, expected \`${s.expected}\`${link}`);
  }
  lines.push(``);
  fs.writeFileSync(REVIEW_SUMMARY, lines.join('\n') + '\n');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const slugFilter = process.env.CARD_SLUG || '';
  const allCards = loadAllCards();
  const cards = filterCardsForCheck(allCards, slugFilter);
  const policy = loadPolicy();
  const examples = buildFewShotExamples(allCards, policy.exampleCards);

  // Reset review summary for this run, then immediately write the
  // rotating-period staleness section so it sits at the top.
  if (fs.existsSync(REVIEW_SUMMARY)) fs.unlinkSync(REVIEW_SUMMARY);
  const staleRotations = findStaleRotatingPeriods(allCards);
  writeRotatingPeriodSection(staleRotations);
  if (staleRotations.length > 0) {
    console.log(`\n⚠️  ${staleRotations.length} card(s) have stale rotating-category period (expected ${currentQuarterLabel()}):`);
    for (const s of staleRotations) {
      console.log(`  - ${s.name}: current_period="${s.currentPeriod}"`);
    }
  }

  console.log(`\nChecking ${cards.length} active card(s) with apply_link...\n`);

  const summary = {
    fetched: 0,
    extractFailed: 0,
    fetchFailed: 0,
    skippedRecentlyEdited: 0,
    cardsModified: 0,
    autoChanges: 0,
    reviewItems: 0,
    staleRotatingPeriods: staleRotations.length,
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

    const normalizedRewards = normalizeRewardsUnits(extracted.rewards);
    const rewardsDiff = diffRewards(card.data.rewards, normalizedRewards);
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
