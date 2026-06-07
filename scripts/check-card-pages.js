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
const PER_CARD_TIMEOUT_MS = 60000;   // 60s max per card (fetch + extraction)
const SCRIPT_TIMEOUT_MS = 20 * 60 * 1000; // 20 min overall safety net

// ─── Timeout helpers ─────────────────────────────────────────────────────────

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

// ─── YAML helpers ────────────────────────────────────────────────────────────

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

// Card-page-check fetches whichever URL hosts the headline signup bonus.
// When `special_apply_link` is set in the YAML, the SUB lives there — not on
// the generic apply_link — so we treat it as the source of truth for this
// script. The rewards/benefits check (which reads structural earn rates and
// perks) still uses apply_link; see check-card-rewards-and-benefits.js.
function checkUrlFor(card) {
  return card.data.special_apply_link || card.data.apply_link;
}

function filterCardsForCheck(allCards, slugFilter) {
  let cards = allCards.filter(
    c => c.data.accepting_applications !== false && checkUrlFor(c)
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
    // Mark strikethrough content so the model knows to ignore it.
    // Covers semantic tags, CSS class tokens (strike/strikethrough/strike-through/line-through),
    // and inline `text-decoration: line-through` styles. The class regex requires a token
    // boundary so e.g. Chase's sibling class `strikeThroughFollow` is NOT matched.
    .replace(/<(s|del|strike)\b[^>]*>([\s\S]*?)<\/\1>/gi, ' [STRIKETHROUGH: $2] ')
    .replace(/<(\w+)\b[^>]*\sclass\s*=\s*["']([^"']*\s)?(?:strike|strikethrough|strike-through|line-through)(\s[^"']*)?["'][^>]*>([\s\S]*?)<\/\1>/gi, ' [STRIKETHROUGH: $4] ')
    .replace(/<(\w+)\b[^>]*\sstyle\s*=\s*["'][^"']*\bline-through\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi, ' [STRIKETHROUGH: $2] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);
}

async function fetchPageContent(url) {
  // Try simple fetch first
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
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        const html = await response.text();
        const stripped = stripHtml(html);
        if (stripped.length >= 100) {
          return { content: stripped, usedBrowser: false };
        }
        console.warn(`  Simple fetch returned too little content (${stripped.length} chars) — falling back to browser`);
      }
    }
  } catch (err) {
    console.warn(`  Simple fetch failed: ${err.message} — falling back to browser`);
  }

  // Fall back to Playwright for JS-rendered pages
  const content = await fetchWithBrowser(url);
  return content ? { content, usedBrowser: true } : null;
}

let _browser = null;

async function getBrowser() {
  if (!_browser) {
    try {
      const { chromium } = require('playwright');
      _browser = await chromium.launch({ headless: true });
    } catch (err) {
      console.warn(`  Playwright not available: ${err.message}`);
      return null;
    }
  }
  return _browser;
}

async function fetchWithBrowser(url) {
  const browser = await getBrowser();
  if (!browser) return null;

  let page;
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for content to render
    await page.waitForTimeout(3000);
    const html = await page.content();
    await context.close();

    const stripped = stripHtml(html);
    if (stripped.length < 100) {
      console.warn(`  Browser fetch still too short (${stripped.length} chars) — skipping`);
      return null;
    }
    console.log(`  Browser fetch succeeded (${stripped.length} chars)`);
    return stripped;
  } catch (err) {
    console.warn(`  Browser fetch error: ${err.message} — skipping`);
    if (page) await page.context().close().catch(() => {});
    return null;
  }
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

// ─── Claude Haiku extraction ──────────────────────────────────────────────────

async function extractCardTerms(cardName, bankName, applyLink, pageContent, currentSignupBonus) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required');

  const cur = currentSignupBonus || {};
  const currentContext = `Current YAML values (for unit context — DO NOT copy these, extract fresh from the page):
- signup_bonus.value: ${cur.value ?? 'null'}
- signup_bonus.type: ${cur.type ?? 'null'}
- signup_bonus.spend_requirement: ${cur.spend_requirement ?? 'null'}
- signup_bonus.timeframe_months: ${cur.timeframe_months ?? 'null'}
`;

  const prompt = `You are extracting credit card terms from a bank's apply page for human review.

Card: ${cardName} (${bankName})
Source URL: ${applyLink}

${currentContext}
Page content:
${pageContent}

Extract the following fields and return ONLY valid JSON — no markdown fences, no explanation.

{
  "annual_fee": <number or null>,
  "signup_bonus": {
    "value": <number or null>,
    "type": <"points"|"miles"|"cashback"|"free_nights" or null>,
    "spend_requirement": <number or null>,
    "timeframe_months": <number or null>,
    "authorized_user_bonus": <number or null>,
    "bonus_note": <string or null>
  }
}

Rules:
- annual_fee: the ongoing annual fee, NOT an introductory/$0 first year rate. If the card says "$0 intro annual fee" but $99 after, use 99. Use 0 only if the card truly has no annual fee. null if not stated at all.
- signup_bonus.value: raw number only (e.g. 60000 for "60,000 points", or 3 for "3 free night awards"). null if absent.
- signup_bonus.type: use "free_nights" when the bonus is free hotel night awards (e.g. Marriott free night certificates).
- SIGNUP BONUS SCOPE: All signup_bonus fields refer ONLY to the one-time welcome/new-cardmember offer earned during the initial signup window. NEVER capture recurring/ongoing rewards in any signup_bonus field — including: anniversary bonuses, "each calendar year" bonuses, "every account year" bonuses, annual spend bonuses earned year after year, statement credits that reset annually, or cardmember-anniversary point awards. Those are ongoing benefits, not signup bonuses. If the offer is described with phrases like "each year", "every year", "annually", "each calendar year", "each anniversary", "every account anniversary" → it is NOT a signup bonus and must be excluded from value, spend_requirement, timeframe_months, AND bonus_note.
- TIERED BONUSES: Many cards have one-time tiered signup bonuses (e.g., "earn 70,000 miles after $3,000 in 6 months, plus an additional 20,000 miles after an additional $2,000 in 6 months", or "3 free nights after $3,000 in 3 months, plus 1 more after $4,000 total in 4 months"). When the welcome offer is tiered, use the HEADLINE-MAX convention:
    - value = the **headline maximum** the issuer markets (e.g. 90000 for "up to 90,000 miles", or 4 for "up to 4 Free Night Awards")
    - spend_requirement = the **TOTAL** spend required to earn the maximum across all tiers (e.g. 5000 = $3,000 + $2,000)
    - timeframe_months = the **longest** window across all tiers (typically the same window throughout, e.g. 6)
    - bonus_note = describes the tier structure in the issuer's own words, and includes the offer end date when present on the page (see BONUS NOTE rule below)
  NEVER return just the first/base tier in value — always return the maximum attainable bonus. Floor-as-value is the OLD convention and is being phased out.
- BONUS NOTE: Use bonus_note ONLY to describe structural aspects of the one-time welcome offer that the base fields (value/spend_requirement/timeframe_months) cannot express. Allowed cases, with example phrasing:
  - Tiered/multi-step earn (describe each tier so readers see how the max breaks down): "Earn 70,000 miles after $3,000 spend in first 6 months, plus an additional 20,000 miles after an additional $2,000 spend within first 6 months. Offer ends 2026-07-15."
  - Multi-component bonus delivered as separate pieces: "$400 Disney eGift Card upon approval + $200 statement credit after spending $1,000 in first 3 months"
  - Bonus delivered in a non-cash form or with unusual timing: "$150 Amazon Gift Card instantly loaded upon approval"
  - Points + separate cash combo earned alongside the main bonus: "Plus $300 Bilt Cash as a signup bonus"
  When the apply page shows an explicit offer end date (e.g. "Offer ends 07/15/26."), append it to the note in ISO form ("Offer ends 2026-07-15.").

  DO NOT use bonus_note for ANY of the following, even when the apply page mentions them prominently — none of them are welcome-offer structure:
  - Redemption value or marketing restatements of the main bonus (e.g. "$600 toward your next trip", "$3,000 value through Chase Travel", "75,000 points valued at $750")
  - Redemption guidance ("can be redeemed for up to N reward nights", "worth 1.5x on travel through the portal")
  - First-year or limited-time enhanced rewards rates ("6% cash back in choice category for first year", "5x dining for first 6 months") — these are bonus EARN rates, not welcome offers
  - Ongoing benefits, statement credits, annual credits, anniversary perks, or any recurring value — these belong in the card's benefits, never in signup_bonus
  - Rephrasing of the existing value/spend_requirement/timeframe_months in different words
  - Authorized-user bonuses (captured in authorized_user_bonus field — set bonus_note to null when only an AU bonus is the "extra")

  When in doubt, return null. A missing note is cheap; an incorrect note clutters the data and triggers false-positive PR proposals.
- AUTHORIZED USER BONUSES: Do NOT include bonus miles/points earned for adding an authorized user in the "value" field. Only count the primary cardholder's signup bonus from spending. For example, if a card offers "90,000 miles after $4,000 spend + 10,000 miles for adding an authorized user", the value is 90000, NOT 100000. Instead, put the authorized user bonus amount in "authorized_user_bonus" (e.g. 10000). null if no AU bonus.
- CASH vs POINTS: Do NOT combine cash/dollar bonuses with points/miles. If a card offers "50,000 points + $300 cash bonus", the signup_bonus value is 50000 (points only). Cash bonuses are separate from points/miles and must NOT be added to the value field. A $300 cash bonus is NOT 300 points.
- POINTS REDEEMED AS CASH: Some cards earn points that convert to a fixed cash amount (e.g. "15,000 bonus points = $150 when deposited into your Fidelity account"). The points and the dollar amount describe the SAME offer in two different units — they are NOT two stackable bonuses. If the current YAML's signup_bonus.type is "cash" or "cashback", return the DOLLAR value (150), NOT the points count (15000). If the current type is "points" or "miles", return the points count. When unsure which unit the card is denominated in, prefer the value matching the existing type. NEVER return a 5-figure number as the value for a card whose current type is cash/cashback — that is the points figure, not the bonus value.
- STRIKETHROUGH TEXT: Text wrapped in [STRIKETHROUGH: ...] is struck through on the page and represents old/expired values. Always ignore strikethrough values and use the non-strikethrough value instead.
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

// True when Haiku returned no signal — every primary field is null/undefined.
// Used to decide whether to retry a simple-fetch result with the browser, since
// JS-rendered pages (e.g. citi.com) return real HTML but with empty bonus
// placeholders that Haiku can't extract from.
function isExtractionEmpty(extracted) {
  if (!extracted) return true;
  if (extracted.annual_fee != null) return false;
  const sb = extracted.signup_bonus;
  if (sb && (sb.value != null || sb.spend_requirement != null || sb.timeframe_months != null)) {
    return false;
  }
  return true;
}

function detectChanges(card, extracted) {
  if (!extracted) return [];

  const current = card.data;
  const changes = [];
  const ignoreFields = new Set(current.check_ignore || []);

  // annual_fee
  if (extracted.annual_fee !== null && extracted.annual_fee !== undefined) {
    const cur = current.annual_fee ?? null;
    if (cur !== null && extracted.annual_fee !== cur && !ignoreFields.has('annual_fee')) {
      changes.push({ field: 'annual_fee', old_value: cur, new_value: extracted.annual_fee });
    }
  }

  // signup_bonus subfields — only compare if the card already has a signup_bonus
  if (extracted.signup_bonus && current.signup_bonus) {
    const sb = extracted.signup_bonus;
    const cur = current.signup_bonus;

    // Defensive: when Haiku reports both a value change and an authorized_user_bonus,
    // and the value delta is exactly the AU bonus, the page's headline is bundling
    // the AU bonus into the displayed total (e.g. Chase's United Gateway shows
    // "40,000 bonus miles" = 30k base + 10k AU). Skip the value change — the AU
    // split is already captured in signup_bonus.note.
    const skipValueAsBundledAU =
      sb.value != null &&
      cur.value != null &&
      sb.authorized_user_bonus != null &&
      sb.authorized_user_bonus > 0 &&
      sb.value - cur.value === sb.authorized_user_bonus;

    if (skipValueAsBundledAU) {
      console.log(
        `  Ignoring value change ${cur.value} → ${sb.value}: matches base + authorized_user_bonus (${sb.authorized_user_bonus})`
      );
    }

    // Defensive: points-redeemed-as-cash cards (e.g. Fidelity Rewards Visa: "15,000
    // points = $150 deposited into your Fidelity account") show both a points count
    // and a dollar figure for the SAME offer. Haiku has a recurring habit of
    // returning the points count as the new value, which would imply a 100x cash
    // SUB jump. When the card's existing type is cash/cashback and the proposed
    // value is ≥10x the current value, treat it as a points/cash confusion and
    // skip. This pattern has been reverted at least twice (commits 65aecd16,
    // c35d52cb) before this guard landed.
    const cashType = cur.type === 'cash' || cur.type === 'cashback';
    const skipValueAsPointsConfusion =
      cashType &&
      sb.value != null &&
      cur.value != null &&
      cur.value > 0 &&
      sb.value >= cur.value * 10;

    if (skipValueAsPointsConfusion) {
      console.log(
        `  Ignoring value change ${cur.value} → ${sb.value}: likely points-redeemed-as-cash misparse (current type=${cur.type}, ratio ${(sb.value / cur.value).toFixed(0)}x)`
      );
    }

    // Defensive: tiered welcome offers under the headline-max convention
    // (e.g. Amex Delta Gold: value=90,000 with note "Earn 70,000 ... plus
    // additional 20,000"). YAML stores the MAX in value/spend_requirement/
    // timeframe_months and the tier breakdown in note. Haiku occasionally
    // misparses by returning only the FIRST/BASE tier (e.g. 70,000) — which
    // looks like a phantom downgrade. When the current note describes a
    // tiered offer ("additional N points/miles/nights") and the proposed
    // value is LOWER than current, treat it as a tier-collapse misparse and
    // skip the signup_bonus changes for this run. Matches either word order:
    // "N additional ..." or "additional N ...", with up to 4 filler words
    // (e.g. "bonus", brand name like "Marriott Bonvoy bonus") in between.
    // Note: pre-2026-06-04 the convention was inverted (floor-as-value) and
    // this guard skipped value INCREASES instead. See PR #1358 / memory
    // feedback_tiered_sub_convention for the convention change.
    const noteText = cur.note || '';
    const tieredAdditionalMatch =
      noteText.match(/(\d[\d,]*)\s+additional\s+(?:\w+\s+){0,4}(?:points|miles|nights|free\s+night)/i) ||
      noteText.match(/additional\s+(\d[\d,]*)\s+(?:\w+\s+){0,4}(?:points|miles|nights|free\s+night)/i);
    const skipAsTieredBonus =
      !!tieredAdditionalMatch &&
      sb.value != null &&
      cur.value != null &&
      sb.value < cur.value;

    if (skipAsTieredBonus) {
      console.log(
        `  Ignoring signup_bonus changes: current note describes a tiered offer (+${tieredAdditionalMatch[1]} additional) and proposed value ${cur.value} → ${sb.value} looks like a base-tier-only misparse`
      );
    }

    for (const key of ['value', 'spend_requirement', 'timeframe_months']) {
      if (skipAsTieredBonus) continue;
      if (key === 'value' && (skipValueAsBundledAU || skipValueAsPointsConfusion)) continue;
      if (sb[key] !== null && sb[key] !== undefined && cur[key] !== undefined) {
        const field = `signup_bonus.${key}`;
        if (sb[key] !== cur[key] && !ignoreFields.has(field)) {
          changes.push({
            field,
            old_value: cur[key],
            new_value: sb[key],
          });
        }
      }
    }

    // Authorized user bonus → generate templated note if detected and card has none.
    // Takes priority over bonus_note when both are present — templated text is more
    // predictable than Haiku's free-form description.
    if (sb.authorized_user_bonus != null && !cur.note) {
      const bonusType = cur.type || 'points';
      const note = `Plus ${sb.authorized_user_bonus.toLocaleString()} bonus ${bonusType} for adding an authorized user`;
      changes.push({
        field: 'signup_bonus.note',
        old_value: null,
        new_value: note,
      });
    } else if (sb.bonus_note) {
      // Only propose a note change when signup_bonus.value also changed in
      // this run. Applies to both adding a new note and updating an existing
      // one. Without this gate Haiku reliably manufactures boilerplate notes
      // on cards whose SUB hasn't moved — "Welcome offers vary…", "$N cash
      // redemption value", or text lifted from a benefit on the same page
      // (e.g. Fidelity's Global Entry credit) — and each one becomes a
      // recurring PR proposal even though the prompt forbids it. A missed
      // legitimate note edit is cheap; the false-positive churn is not.
      const valueChanged = changes.some(c => c.field === 'signup_bonus.value');

      if (!cur.note && valueChanged) {
        changes.push({
          field: 'signup_bonus.note',
          old_value: null,
          new_value: sb.bonus_note,
        });
      } else if (cur.note && cur.note !== sb.bonus_note && valueChanged) {
        changes.push({
          field: 'signup_bonus.note',
          old_value: cur.note,
          new_value: sb.bonus_note,
        });
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
  cardsToCheck.forEach(c => console.log(`  - ${c.data.name} (${checkUrlFor(c)})`));
  console.log('');

  const allChanges = [];

  const scriptDeadline = Date.now() + SCRIPT_TIMEOUT_MS;

  for (const card of cardsToCheck) {
    if (Date.now() > scriptDeadline) {
      console.warn(`\nScript timeout reached (${SCRIPT_TIMEOUT_MS / 60000} min) — stopping early.`);
      break;
    }

    const { name, bank } = card.data;
    const apply_link = checkUrlFor(card);
    console.log(`Checking: ${name}`);
    console.log(`  URL: ${apply_link}${card.data.special_apply_link ? ' (special_apply_link)' : ''}`);

    try {
      await withTimeout((async () => {
        // Fetch page
        const fetchResult = await fetchPageContent(apply_link);
        if (!fetchResult) {
          console.log('  Skipped (could not fetch page)\n');
          return;
        }
        let { content: pageContent, usedBrowser } = fetchResult;
        console.log(`  Fetched ${pageContent.length} chars`);

        // Extract with Claude Haiku
        let extracted;
        try {
          extracted = await extractCardTerms(name, bank, apply_link, pageContent, card.data.signup_bonus);
        } catch (err) {
          console.warn(`  Extraction error: ${err.message} — skipping\n`);
          return;
        }

        // Self-heal: simple-fetch HTML can be 200 OK but missing JS-rendered
        // bonus values (e.g. citi.com). Haiku then returns all-null, which the
        // detector silently treats as "no changes". Retry once with the browser.
        if (!usedBrowser && isExtractionEmpty(extracted)) {
          console.log('  Extraction returned no signal — retrying with browser');
          const browserContent = await fetchWithBrowser(apply_link);
          if (browserContent) {
            pageContent = browserContent;
            try {
              extracted = await extractCardTerms(name, bank, apply_link, pageContent, card.data.signup_bonus);
            } catch (err) {
              console.warn(`  Retry extraction error: ${err.message} — skipping\n`);
              return;
            }
          }
        }

        if (!extracted) {
          console.log('  No data extracted — skipping\n');
          return;
        }

        // Compare against YAML
        const changes = detectChanges(card, extracted);
        if (changes.length > 0) {
          console.log(`  ${changes.length} change(s) detected`);
          allChanges.push({ slug: card.slug, card_name: name, apply_link, changes });
        } else {
          console.log('  No changes');
        }
      })(), PER_CARD_TIMEOUT_MS, name);
    } catch (err) {
      console.warn(`  ${err.message} — skipping\n`);
    }

    console.log('');
    await new Promise(r => setTimeout(r, FETCH_DELAY_MS));
  }

  if (allChanges.length === 0) {
    console.log('No changes detected. Exiting.');
    if (fs.existsSync(SUMMARY_FILE)) fs.unlinkSync(SUMMARY_FILE);
    await closeBrowser();
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

  await closeBrowser();
  console.log('\n=== Complete ===');
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeBrowser();
  process.exit(1);
});
