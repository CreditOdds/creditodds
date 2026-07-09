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
 *
 * Skip handling: a card that can't be fetched or extracted produces no changes,
 * which at the aggregate level is indistinguishable from a card whose terms are
 * unchanged. "No PR opened" therefore reads as "everything is fine" even when a
 * card hasn't actually been verified in weeks — that is how Fidelity's dead offer
 * page (HTTP 400, browser goto timing out) went unnoticed while its stale $150 SUB
 * stayed published. To close that gap:
 *   - every skip path records into `skippedCards` (see recordSkip)
 *   - consecutive skips per card persist across runs in .github/card-page-check-state.json
 *   - a card skipped SKIP_ALERT_THRESHOLD runs in a row fails the job loudly
 *   - HTTP >= 400 is a hard fetch failure, never scraped as if it were card content
 * Cards in knownBlockedReason() are excluded from the alarm: they are permanent,
 * deliberate skips, so counting them would keep the alarm on forever.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const CARDS_DIR = path.join(__dirname, '..', 'data', 'cards');
const SUMMARY_FILE = path.join(__dirname, '..', '.card-page-check-summary.md');
// Consecutive-skip counters, committed to main by the workflow so the count
// survives across runs. Lives under .github/ because every push-triggered
// workflow either filters on data/** or (deploy-frontend) ignores it — dropping
// this file anywhere under data/ would fire an Amplify build every night.
const STATE_FILE = path.join(__dirname, '..', '.github', 'card-page-check-state.json');
// Written only when a card has been skipped too many runs in a row; the workflow
// keys its Slack ping / GitHub issue / red build off this file's existence.
const STALE_REPORT_FILE = path.join(__dirname, '..', '.card-page-check-stale.md');
// A skipped card is silently indistinguishable from a healthy one — no changes
// detected either way. After this many consecutive skips the card is presumed
// rotting (dead URL, permanent bot-block, extractor blind spot) and the run
// fails loudly rather than reporting another quiet green.
const SKIP_ALERT_THRESHOLD = Number(process.env.CARD_PAGE_SKIP_ALERT_THRESHOLD || 3);
const FETCH_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 15000;
const PER_CARD_TIMEOUT_MS = 60000;   // 60s max per card (fetch + extraction)
// Overall safety net. Widening the browser-retry condition (needsBrowserRetry)
// makes every card whose welcome offer is client-side — most of the ~20 Amex
// cards — pay one extra Playwright fetch (~13s measured) per run, roughly +4 min
// on a run that already took ~14 min. Raised 20 → 30 min so that added work
// doesn't silently truncate coverage.
//
// MUST stay comfortably below `timeout-minutes` in .github/workflows/check-card-pages.yml
// (currently 45): the job needs headroom after this deadline to write the skip
// summary and open the PR. If the two are equal, GitHub hard-kills the job and
// the graceful exit path never runs.
const SCRIPT_TIMEOUT_MS = 30 * 60 * 1000; // 30 min overall safety net
// Max stripped page text handed to the extractor. Sized so nav-heavy issuer
// pages still include the card terms — e.g. business.bankofamerica.com leads
// with ~11k chars of menu chrome and the bonus/spend/timeframe land at ~12k–18k.
// Most card pages strip to well under this, so the cap only bites on long pages.
const MAX_CONTENT_CHARS = 18000;

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
    .slice(0, MAX_CONTENT_CHARS);
}

// Hosts whose bot mitigation reliably defeats headless/CI fetches (verified
// 2026-06-11). PNC (Akamai) resets the connection over HTTP/2 and black-holes
// it over HTTP/1.1 — fails from CI and residential IPs alike, via browser and
// curl. We short-circuit these so the run doesn't spend ~30s/card on guaranteed
// timeouts; they still appear in the end-of-run skip summary so the coverage gap
// stays visible. Maintained manually for now — remove an entry to resume
// automated checks if a site's protection eases.
//
// (The Atmos cards previously listed here moved to scrapeable Bank of America
// apply_links; the alaskaair.com SPA that rendered ~20 chars is no longer used.)
function knownBlockedReason(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'pnc.com') return 'pnc.com bot mitigation blocks automated fetches (HTTP/2 reset + HTTP/1.1 black-hole)';
  } catch { /* malformed URL — let the normal fetch path handle it */ }
  return null;
}

async function fetchPageContent(url) {
  // Status from the plain fetch, remembered so that if the browser fallback also
  // fails we report the origin's real complaint ("HTTP 400") rather than the
  // downstream symptom ("Timeout 30000ms exceeded").
  let simpleStatus = null;

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
    simpleStatus = response.status;

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
    } else {
      // 403/429 are usually bot mitigation the browser can get past, so still fall
      // through. Other 4xx/5xx mean the page is genuinely gone or broken.
      console.warn(`  Simple fetch returned HTTP ${response.status} — falling back to browser`);
    }
  } catch (err) {
    console.warn(`  Simple fetch failed: ${err.message} — falling back to browser`);
  }

  // Fall back to Playwright for JS-rendered pages
  const content = await fetchWithBrowser(url);
  if (content) return { content, usedBrowser: true };

  if (simpleStatus !== null && simpleStatus >= 400) {
    lastFetchError = `HTTP ${simpleStatus} from origin (browser fallback also failed: ${lastFetchError || 'unknown'})`;
  }
  return null;
}

let _browser = null;

// Reason for the most recent browser-fetch failure, surfaced in the
// end-of-run skip summary so silently-dropped cards stay visible.
let lastFetchError = null;

async function getBrowser() {
  if (!_browser) {
    try {
      const { chromium } = require('playwright');
      // --disable-http2 forces HTTP/1.1. Some issuer WAFs (e.g. pnc.com via
      // Akamai) reset the HTTP/2 connection for datacenter/headless clients,
      // which Chromium surfaces as net::ERR_HTTP2_PROTOCOL_ERROR and aborts the
      // whole page load. HTTP/1.1 sidesteps that reset.
      _browser = await chromium.launch({ headless: true, args: ['--disable-http2'] });
    } catch (err) {
      console.warn(`  Playwright not available: ${err.message}`);
      return null;
    }
  }
  return _browser;
}

async function fetchWithBrowser(url) {
  const browser = await getBrowser();
  if (!browser) { lastFetchError = 'Playwright unavailable'; return null; }

  let context;
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });
    const page = await context.newPage();
    // domcontentloaded fires early and reliably (waitUntil:'load' can hang on
    // ad/tracker-heavy issuer pages). Then give client-rendered content a
    // best-effort settle window via networkidle, capped so pages with
    // long-poll/keepalive connections don't stall the whole goto.
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // page.goto resolves for 4xx/5xx — it only rejects on transport errors. Without
    // this guard an issuer's "page moved or deleted" template strips to plenty of
    // text, gets handed to the extractor, yields nulls, and is read as "no changes".
    // A retired offer page then looks exactly like an unchanged one.
    const status = response ? response.status() : 0;
    if (status >= 400) {
      lastFetchError = `HTTP ${status}`;
      console.warn(`  Browser fetch returned HTTP ${status} — treating as fetch failure, not content`);
      await context.close();
      return null;
    }

    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const html = await page.content();
    await context.close();

    const stripped = stripHtml(html);
    if (stripped.length < 100) {
      lastFetchError = `content too short (${stripped.length} chars)`;
      console.warn(`  Browser fetch still too short (${stripped.length} chars) — skipping`);
      return null;
    }
    lastFetchError = null;
    console.log(`  Browser fetch succeeded (${stripped.length} chars)`);
    return stripped;
  } catch (err) {
    lastFetchError = err.message.split('\n')[0];
    console.warn(`  Browser fetch error: ${err.message} — skipping`);
    if (context) await context.close().catch(() => {});
    return null;
  }
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

// ─── OpenAI extraction ────────────────────────────────────────────────────────

async function extractCardTerms(cardName, bankName, applyLink, pageContent, currentSignupBonus) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required');

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
    "bonus_note": <string or null>,
    "offer_is_tiered": <true|false or null>
  },
  "apr": {
    "purchase_intro_months": <number or null>,
    "balance_transfer_intro_months": <number or null>
  }
}

Rules:
- annual_fee: the ongoing annual fee, NOT an introductory/$0 first year rate. If the card says "$0 intro annual fee" but $99 after, use 99. Use 0 only if the card truly has no annual fee. null if not stated at all.
- signup_bonus.value: raw number only (e.g. 60000 for "60,000 points", or 3 for "3 free night awards"). null if absent.
- signup_bonus.type: use "free_nights" when the bonus is free hotel night awards (e.g. Marriott free night certificates).
- SIGNUP BONUS SCOPE: All signup_bonus fields refer ONLY to the one-time welcome/new-cardmember offer earned during the initial signup window. NEVER capture recurring/ongoing rewards in any signup_bonus field — including: anniversary bonuses, "each calendar year" bonuses, "every account year" bonuses, annual spend bonuses earned year after year, statement credits that reset annually, or cardmember-anniversary point awards. Those are ongoing benefits, not signup bonuses. If the offer is described with phrases like "each year", "every year", "annually", "each calendar year", "each anniversary", "every account anniversary" → it is NOT a signup bonus and must be excluded from value, spend_requirement, timeframe_months, AND bonus_note.
- TIMEFRAME UNITS: signup_bonus.timeframe_months must be expressed in whole MONTHS, never raw days. Issuer pages often state the window in days (e.g. "within the first 90 days", "in the first 180 days") — convert to months: 90 days → 3, 120 days → 4, 150 days → 5, 180 days → 6, 270 days → 9, 365 days → 12. A welcome-offer window is essentially never longer than ~18 months, so NEVER return a value above 18 — if you computed one, you returned days by mistake and must convert it to months.
- TIERED BONUSES: Many cards have one-time tiered signup bonuses (e.g., "earn 70,000 miles after $3,000 in 6 months, plus an additional 20,000 miles after an additional $2,000 in 6 months", or "3 free nights after $3,000 in 3 months, plus 1 more after $4,000 total in 4 months"). When the welcome offer is tiered, use the HEADLINE-MAX convention:
    - value = the **headline maximum** the issuer markets (e.g. 90000 for "up to 90,000 miles", or 4 for "up to 4 Free Night Awards")
    - spend_requirement = the **TOTAL** spend required to earn the maximum across all tiers (e.g. 5000 = $3,000 + $2,000)
    - timeframe_months = the **longest** window across all tiers (typically the same window throughout, e.g. 6)
    - bonus_note = describes the tier structure in the issuer's own words, and includes the offer end date when present on the page (see BONUS NOTE rule below)
  NEVER return just the first/base tier in value — always return the maximum attainable bonus. Floor-as-value is the OLD convention and is being phased out.
- OFFER IS TIERED: signup_bonus.offer_is_tiered describes the welcome offer AS ADVERTISED ON THE PAGE RIGHT NOW. Judge it from the page alone — ignore anything you know or infer about the card's past offers.
    - true = the live welcome offer has two or more earn steps ("earn X after $A, plus an additional Y after $B").
    - false = the live welcome offer is a single flat bonus with one spend requirement ("earn 100,000 miles when you spend $10,000 in the first 3 months"). A lone authorized-user bonus alongside a flat offer is still false — an AU bonus is not an earn tier.
    - null ONLY when the page states no welcome offer at all, or the wording is too ambiguous to judge.
  This field decides whether a stored tier breakdown is still accurate, so answer it from the live page even when every other field is null.
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
- INTRO APR: The introductory (promotional) APR is the temporary 0% (or low) APR a card extends to new cardholders. Issuer pages state its length in "months" or "billing cycles" — treat one billing cycle as one month. Extract the LENGTH in months only:
    - apr.purchase_intro_months = the intro APR period for PURCHASES (e.g. "0% intro APR for 21 billing cycles on purchases" → 21).
    - apr.balance_transfer_intro_months = the intro APR period for BALANCE TRANSFERS (e.g. "0% intro APR for 21 billing cycles on balance transfers" → 21).
    - When a single 0% intro period is described as applying to both purchases and balance transfers, use that same value for both fields.
    - These are the INTRO/promotional period ONLY. NEVER put the ongoing/regular APR here — e.g. "16.99%–27.99% variable APR" after the intro ends is the regular APR, not an intro length.
    - Return null (NOT 0) when the card has no intro APR offer or the page doesn't state one. Ignore any intro APR length found inside [STRIKETHROUGH: ...] (expired offer) and use the live value.
- STRIKETHROUGH TEXT: Text wrapped in [STRIKETHROUGH: ...] is struck through on the page and represents old/expired values. Always ignore strikethrough values and use the non-strikethrough value instead.
- Return null for any field you cannot determine with confidence.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} — ${errText}`);
  }

  const data = await response.json();
  const text = (data.choices[0]?.message?.content || '{}')
    .replace(/^```json?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  try {
    return JSON.parse(text);
  } catch (err) {
    console.warn(`  Could not parse OpenAI response: ${err.message}`);
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

// isExtractionEmpty only catches a page that yielded NOTHING. A page can render
// its annual fee server-side and its welcome offer client-side — Amex's Delta
// business pages ship the fee in the HTML and leave "Welcome Offer & Key
// Details … Loading" where the bonus belongs. The fee alone made the extraction
// look non-empty, the browser retry never ran, and the extractor returned
// value: 0 for the placeholder, proposing 90,000 → 0 on a card whose offer had
// not moved (caught in review on PR #1589). value: 0 also slips past the
// "a null never erases a real value" rule, since 0 is not null.
//
// So retry whenever the page gave us no signup-bonus signal for a card that
// stores one. This deliberately does NOT suppress a zero — a card really can
// lose its public offer (see the Amazon Store card, #1579). It only insists we
// look at a fully rendered page before believing it.
function needsBrowserRetry(extracted, currentSignupBonus) {
  if (isExtractionEmpty(extracted)) return true;
  if (!(currentSignupBonus?.value > 0)) return false;
  const proposed = extracted.signup_bonus?.value;
  return proposed == null || proposed === 0;
}

// Haiku occasionally returns the signup-bonus timeframe as a raw DAY count instead
// of months (e.g. "180 days" → 180 rather than 6), which surfaced a bogus
// timeframe_months: 180 on Wyndham Earner Business (#1426). No real welcome offer
// runs longer than ~18 months, so any extracted timeframe above 24 is a
// days-as-months misread — convert it to whole months. Applied before the diff so
// the change either disappears (YAML already stores the right month count) or
// surfaces in the correct unit (e.g. a genuine 3 → 6 move) instead of as 180.
function normalizeTimeframeMonths(v) {
  if (typeof v === 'number' && v > 24) return Math.round(v / 30);
  return v;
}

// A tiered note carries the tier amounts it describes ("70,000 miles ... an
// additional 20,000 miles"). Pull them out so the tier-collapse guard can
// insist that a proposed downgrade actually LANDS on one of them. Only counts
// followed by a reward unit qualify — spend figures ("$3,000 on purchases")
// never sit next to points/miles/nights, so they don't leak in.
function tierAmountsInNote(noteText) {
  const matches = noteText.matchAll(
    /(\d[\d,]{2,})\s+(?:\w+\s+){0,4}(?:points|miles|nights|free\s+nights?)/gi
  );
  return [...matches].map(m => Number(m[1].replace(/,/g, '')));
}

// The script writes "Offer ends YYYY-MM-DD." into notes when the apply page
// states an end date (see the extraction prompt). Read it back: once that date
// has passed, the note is a description of a DEAD offer and has no authority
// over what the live page says today.
function noteOfferHasExpired(noteText, now) {
  const m = noteText.match(/Offer ends (\d{4})-(\d{2})-(\d{2})/i);
  if (!m) return false;
  const end = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return today > end;
}

// `suppressions` is an out-param: every guard that swallows a change appends a
// record so the run can report what it chose not to show. A silent suppressor is
// indistinguishable from a correct one.
// True when the fetched page actually rendered a new-cardmember welcome OFFER
// BODY. JS/API-gated offer pages (consumer Amex Delta/Marriott — verified
// 2026-07-09 that the offer is absent even after a full ~14s browser render)
// yield only earn-rate copy ("Earn 3X Miles"), so the extractor echoes the stored
// value and defaults offer_is_tiered:false. Trusting that "flat" reading would
// delete a live tiered note (#1598).
//
// Keyed strictly on the offer's spend-requirement language ("after you spend $X",
// "after $N ...") — that only appears once the offer body renders. Header labels
// like "Welcome Offer" are deliberately NOT used: Amex ships that header with a
// "Loading" body (Delta Gold Business, #1590), so it's present even when the offer
// isn't. Unknown input (no pageContent, e.g. unit tests) is treated as present so
// callers without it keep their prior behavior.
function pageShowsSignupOffer(pageContent) {
  if (pageContent == null) return true;
  return /\bafter (?:you )?(?:spend|spending|make|making)\b|\bafter \$\s?[\d,]+/i.test(pageContent);
}

function detectChanges(card, extracted, now = new Date(), suppressions = [], pageContent = null) {
  if (!extracted) return [];

  const current = card.data;
  const changes = [];
  const ignoreFields = new Set(current.check_ignore || []);

  // annual_fee
  if (extracted.annual_fee !== null && extracted.annual_fee !== undefined) {
    const cur = current.annual_fee ?? null;

    // Defensive: cards with a first-year fee waiver (annual_fee_intro) render the
    // ongoing fee client-side, so the stripped page text frequently shows only the
    // waived "$0 first year" figure. Haiku then returns that waiver value as the
    // annual fee, proposing a phantom drop from the ongoing fee to the intro value
    // (Citi AAdvantage: ongoing $99, extracted 0 = the 12-month waiver — rejected
    // on #1413/#1416/#1426/#1434). When the extracted value equals the card's known
    // annual_fee_intro waiver value and differs from the ongoing fee, it's the
    // waiver misread, not a real fee change — skip it.
    const introWaiver = current.annual_fee_intro?.value;
    const isIntroWaiverMisread =
      introWaiver !== null && introWaiver !== undefined &&
      extracted.annual_fee === introWaiver &&
      cur !== introWaiver;
    if (isIntroWaiverMisread) {
      console.log(
        `  Ignoring annual_fee change ${cur} → ${extracted.annual_fee}: matches the first-year annual_fee_intro waiver ($${introWaiver}), not the ongoing fee`
      );
    }

    if (
      cur !== null &&
      extracted.annual_fee !== cur &&
      !isIntroWaiverMisread &&
      !ignoreFields.has('annual_fee')
    ) {
      changes.push({ field: 'annual_fee', old_value: cur, new_value: extracted.annual_fee });
    }
  }

  // signup_bonus subfields — only compare if the card already has a signup_bonus
  if (extracted.signup_bonus && current.signup_bonus) {
    const sb = extracted.signup_bonus;
    const cur = current.signup_bonus;

    // Convert a days-as-months misread before any comparison (see helper above).
    if (sb.timeframe_months != null) {
      sb.timeframe_months = normalizeTimeframeMonths(sb.timeframe_months);
    }

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
    // timeframe_months and the tier breakdown in note. Haiku misparses these
    // in two recurring ways, both of which we suppress:
    //
    //   1. TIER COLLAPSE — returns only the FIRST/BASE tier (e.g. 70,000),
    //      which looks like a phantom value downgrade (proposed value < cur).
    //   2. OVERLAPPING-SPEND DOUBLE-COUNT — sums tier spend steps that overlap
    //      in time, inflating spend_requirement above the stored max. The
    //      World of Hyatt offer is the canonical case: "30,000 points after
    //      $3,000 in 3 months, plus up to 30,000 more by earning 2x on up to
    //      $15,000 in the first 6 months." The $3,000 step is *nested inside*
    //      the $15,000 / 6-month window, so the true total to max the bonus is
    //      $15,000 — but Haiku adds $3,000 + $15,000 = $18,000 and re-proposes
    //      spend_requirement 15000 → 18000 every run (rejected on #1365, #1376).
    //
    // We detect a tiered note via the "additional N" / "N additional" phrasing
    // OR the equivalent "more N" / "N more" phrasing (Chase uses "30,000 more
    // Bonus Points"), with up to 4 filler words (e.g. "bonus", a brand name
    // like "Marriott Bonvoy bonus") between the count and the unit. When the
    // note is tiered, we skip the whole signup_bonus block for the run if the
    // proposed value drops below the stored max (tier collapse) OR the proposed
    // spend_requirement rises above it (overlapping-window double-count).
    // Note: pre-2026-06-04 the convention was inverted (floor-as-value) and
    // this guard skipped value INCREASES instead. See PR #1358 / memory
    // feedback_tiered_sub_convention for the convention change.
    //
    // Both suppressions trust the stored note to describe the LIVE offer. When
    // an issuer replaces a tiered offer with a smaller flat one, that trust is
    // misplaced and the guard silently swallows a real change on every run
    // (Capital One Venture Business: tiered 75k+75k retired, replaced by a flat
    // 100,000 / $10,000 / 3 months — suppressed because 100000 < 150000). Two
    // narrowings keep the guard honest:
    //
    //   a. An expired "Offer ends" date in the note disarms it entirely.
    //   b. Tier collapse requires the proposed value to actually EQUAL one of
    //      the tier amounts the note names. A base-tier misparse returns a
    //      number that is written in the note (70,000 / 30,000 / 75,000); a
    //      replacement offer returns one that isn't.
    //   c. The LIVE PAGE OVERRULES THE NOTE. (a) and (b) are still note-derived,
    //      so they can't see a replacement offer that carries no end date and
    //      happens to land on a named tier — e.g. Hyatt's tiered 30k+30k
    //      collapsing to a flat 30,000 is, by value alone, indistinguishable
    //      from the base-tier misparse this guard exists to suppress. Only the
    //      page can settle it, so the extractor reports offer_is_tiered for the
    //      offer as advertised today. When it says false, the stored breakdown
    //      describes a dead offer: surface the change and retire the note.
    //      When it can't tell (null), fall back to the note heuristics.
    //
    // Ordering matters: a suppression that fires forever is invisible, so every
    // skip is recorded in `suppressions` and reported at the end of the run.
    const noteText = cur.note || '';
    const tieredAdditionalMatch =
      noteText.match(/(\d[\d,]*)\s+(?:additional|more)\s+(?:\w+\s+){0,4}(?:points|miles|nights|free\s+night)/i) ||
      noteText.match(/(?:additional|more)\s+(\d[\d,]*)\s+(?:\w+\s+){0,4}(?:points|miles|nights|free\s+night)/i);
    // offer_is_tiered:false is only trustworthy when the page actually rendered
    // the welcome offer. On JS-gated pages the extractor echoes the stored value
    // and defaults offer_is_tiered:false; treating that as "flat" would disarm the
    // tier guards below AND delete a live tiered note (the 4 Amex cards on #1598).
    // Require a rendered offer before believing the offer went flat.
    const pageSaysFlat = sb.offer_is_tiered === false && pageShowsSignupOffer(pageContent);
    const noteDescribesTiered =
      !!tieredAdditionalMatch && !noteOfferHasExpired(noteText, now) && !pageSaysFlat;

    const tierCollapse =
      noteDescribesTiered &&
      sb.value != null &&
      cur.value != null &&
      sb.value < cur.value &&
      tierAmountsInNote(noteText).includes(sb.value);

    const spendOvercount =
      noteDescribesTiered &&
      sb.spend_requirement != null &&
      cur.spend_requirement != null &&
      sb.spend_requirement > cur.spend_requirement;

    const skipAsTieredBonus = tierCollapse || spendOvercount;

    if (skipAsTieredBonus) {
      const reason = tierCollapse
        ? `proposed value ${cur.value} → ${sb.value} looks like a base-tier-only misparse`
        : `proposed spend_requirement ${cur.spend_requirement} → ${sb.spend_requirement} looks like an overlapping-window double-count`;
      console.log(
        `  Ignoring signup_bonus changes: current note describes a tiered offer (${tieredAdditionalMatch[1]}) — ${reason}`
      );
      suppressions.push({
        card_name: current.name,
        guard: tierCollapse ? 'tier-collapse' : 'spend-overcount',
        reason,
        // Recorded so a human can tell a stable, correct suppression from one
        // that has quietly outlived the offer it was written for.
        page_says_tiered: sb.offer_is_tiered ?? 'unknown',
        note: noteText,
      });
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

    // Retire a tier breakdown the live page no longer advertises. Without this
    // the note outlives the offer it describes and re-arms the guard against
    // the NEXT change (the Venture Business note had to be deleted by hand).
    // Only fires when nothing above already proposed a note — the extractor's
    // own bonus_note, when it supplies one, is the better replacement.
    const noteAlreadyProposed = changes.some(c => c.field === 'signup_bonus.note');
    if (
      pageSaysFlat &&
      !!tieredAdditionalMatch &&
      !noteAlreadyProposed &&
      !ignoreFields.has('signup_bonus.note')
    ) {
      changes.push({ field: 'signup_bonus.note', old_value: cur.note, new_value: null });
    }
  }

  // Intro APR period length (months). Only diff a card that ALREADY stores an
  // intro months value for that line — so we never invent an intro offer for a
  // card without one, and never overwrite a real number with a null Haiku
  // returns when the page wording it can't parse. The regular APR
  // (apr.regular.min/max) is intentionally not compared here: it drifts with
  // the prime rate and would generate constant false-positive PRs.
  if (extracted.apr && current.apr) {
    const introFields = [
      { group: 'purchase_intro', extracted: extracted.apr.purchase_intro_months },
      { group: 'balance_transfer_intro', extracted: extracted.apr.balance_transfer_intro_months },
    ];
    for (const f of introFields) {
      const field = `apr.${f.group}.months`;
      const curVal = current.apr[f.group]?.months;
      if (
        f.extracted !== null && f.extracted !== undefined &&
        curVal !== null && curVal !== undefined &&
        f.extracted !== curVal &&
        !ignoreFields.has(field)
      ) {
        changes.push({ field, old_value: curVal, new_value: f.extracted });
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
        // new_value null means "retire this subfield" (a stale tier breakdown).
        // Drop the key rather than dumping `note: null` into the YAML.
        if (new_value === null) delete parsedData.signup_bonus[subfield];
        else parsedData.signup_bonus[subfield] = new_value;
        yamlText = replaceYamlBlock(yamlText, 'signup_bonus', parsedData.signup_bonus);
        modified = true;
      } else if (field.startsWith('apr.')) {
        // apr.<group>.<key>, e.g. apr.purchase_intro.months — re-dump the whole
        // apr block so the untouched lines (rate, regular range) are preserved.
        const [, group, key] = field.split('.');
        if (!parsedData.apr) parsedData.apr = {};
        if (!parsedData.apr[group]) parsedData.apr[group] = {};
        parsedData.apr[group][key] = new_value;
        yamlText = replaceYamlBlock(yamlText, 'apr', parsedData.apr);
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

// Suppressed changes are the script's blind spot: a guard that swallows the same
// proposal on every run looks exactly like a card whose terms never move. Print
// them, and when running under Actions push them to the job summary too — a run
// that finds no changes opens no PR, so stdout would be the only trace and it
// ages out with the logs. `page_says_tiered` is the column to read: `true` means
// the live page corroborates the stored tier breakdown and the suppression is
// sound; `unknown` means the extractor couldn't tell and the skip rests on the
// note alone, which is the case worth spot-checking. (`false` can't appear —
// it disarms the guard rather than suppressing.)
function reportSuppressions(suppressions) {
  if (suppressions.length === 0) return;

  console.log(`\n🔇 Suppressed ${suppressions.length} proposed change(s) as likely misparses:`);
  for (const s of suppressions) {
    console.log(`  - ${s.card_name} [${s.guard}] ${s.reason}`);
    console.log(`      page_says_tiered=${s.page_says_tiered}`);
  }
  console.log('');

  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (!stepSummary) return;

  const rows = suppressions
    .map(s => `| ${s.card_name} | ${s.guard} | ${s.page_says_tiered} | ${s.reason} |`)
    .join('\n');
  const md = [
    '## Suppressed changes',
    '',
    'These proposals were withheld as likely extraction misparses. `page_says_tiered = true`',
    'means the live page still advertises the stored tier breakdown, so the skip is sound.',
    '`unknown` means the extractor could not tell and the skip rests on the stored note alone —',
    'worth spot-checking against the issuer page.',
    '',
    '| Card | Guard | page_says_tiered | Reason |',
    '| --- | --- | --- | --- |',
    rows,
    '',
  ].join('\n');
  try {
    fs.appendFileSync(stepSummary, md);
  } catch (err) {
    console.warn(`  Could not write job summary: ${err.message}`);
  }
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

// ─── Fetched-text audit logging ───────────────────────────────────────────────

// Dump the exact page text handed to Haiku plus Haiku's parsed output, wrapped in
// greppable delimiters. Lets a reviewer audit a detected change after the fact —
// search a run log for "FETCHED-TEXT <card>" to see whether the offer figure was
// even present in what the model saw, vs. present-but-misread. This is the gap
// that made Delta Gold Business's 60000→0 impossible to diagnose from logs alone
// (we only logged the char count, not the content). Called for every changed card;
// set LOG_FETCHED_TEXT=all to also dump unchanged cards (catches silent
// non-checks, e.g. Amex pages that fetch chrome but no client-rendered offer).
function logFetchedText(name, url, usedBrowser, pageContent, extracted) {
  console.log(`  >>>>> FETCHED-TEXT ${name} | ${url} | via ${usedBrowser ? 'browser' : 'simple-fetch'} | ${pageContent.length} chars`);
  console.log(`  >>>>> EXTRACTED-JSON ${name}: ${JSON.stringify(extracted)}`);
  console.log(pageContent);
  console.log(`  <<<<< FETCHED-TEXT-END ${name}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// ─── Consecutive-skip state ──────────────────────────────────────────────────

function loadSkipState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return parsed && typeof parsed.cards === 'object' && parsed.cards ? parsed.cards : {};
  } catch {
    // Missing or corrupt state is not fatal — every card just starts at zero. The
    // alarm re-arms after SKIP_ALERT_THRESHOLD runs rather than never firing.
    return {};
  }
}

function writeSkipState(cards, checkedAt) {
  const sorted = {};
  for (const slug of Object.keys(cards).sort()) sorted[slug] = cards[slug];
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ updated_at: checkedAt, cards: sorted }, null, 2) + '\n');
}

/**
 * Fold this run's outcomes into the persisted counters.
 *
 * A partial run (CARD_SLUG=…) must not touch cards it never looked at, and must
 * not prune them — otherwise one single-card run would wipe every other card's
 * accumulated history and silently disarm the alarm.
 */
function updateSkipState(prev, { checkedSlugs, skippedCards, checkedAt, isPartialRun }) {
  const next = { ...prev };
  const skippedBySlug = new Map(skippedCards.map(s => [s.slug, s]));

  for (const slug of checkedSlugs) {
    const skip = skippedBySlug.get(slug);
    if (!skip) {
      next[slug] = { consecutive_skips: 0, last_ok: checkedAt };
      continue;
    }
    const previous = prev[slug] || {};
    next[slug] = {
      consecutive_skips: (previous.consecutive_skips || 0) + 1,
      last_ok: previous.last_ok || null,
      last_skip: checkedAt,
      last_reason: skip.reason,
      // Permanent, deliberate skips (see knownBlockedReason) count but never alarm.
      known_block: Boolean(skip.knownBlock),
    };
  }

  if (isPartialRun) return next;

  // Full run: drop cards that no longer exist so a renamed slug can't alarm forever.
  for (const slug of Object.keys(next)) {
    if (!checkedSlugs.has(slug)) delete next[slug];
  }
  return next;
}

function staleCardsFrom(state) {
  return Object.entries(state)
    .filter(([, s]) => !s.known_block && (s.consecutive_skips || 0) >= SKIP_ALERT_THRESHOLD)
    .map(([slug, s]) => ({ slug, ...s }))
    .sort((a, b) => b.consecutive_skips - a.consecutive_skips);
}

function writeStaleReport(stale, cardsBySlug) {
  const lines = [
    `## ⚠️ ${stale.length} card(s) not verified in ${SKIP_ALERT_THRESHOLD}+ consecutive runs`,
    '',
    'These cards were skipped, not checked. Their published terms have gone unverified',
    'for at least ' + SKIP_ALERT_THRESHOLD + ' runs — a dead apply URL or a blocked fetch looks identical',
    'to "no changes" in this job, so treat each row as possibly-stale data, not as passing.',
    '',
    '| Card | Consecutive skips | Last verified | Latest reason |',
    '|------|-------------------|---------------|---------------|',
  ];
  for (const s of stale) {
    const card = cardsBySlug.get(s.slug);
    const name = card ? card.data.name : s.slug;
    const url = card ? checkUrlFor(card) : null;
    const label = url ? `[${name}](${url})` : name;
    lines.push(`| ${label} | ${s.consecutive_skips} | ${s.last_ok || 'never'} | ${s.last_reason || 'unknown'} |`);
  }
  lines.push('', '_Fix the URL, add the host to `knownBlockedReason()`, or set `accepting_applications: false`._');
  const report = lines.join('\n') + '\n';
  fs.writeFileSync(STALE_REPORT_FILE, report);
  return report;
}

async function main() {
  console.log('=== Check Card Pages ===\n');

  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
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
  const skippedCards = [];
  const allSuppressions = [];

  // Every path that abandons a card must land here. A skip that isn't recorded is
  // worse than a loud failure: it silently shrinks the verified set while the run
  // still reports success.
  const recordSkip = (card, reason, opts = {}) =>
    skippedCards.push({
      slug: card.slug,
      name: card.data.name,
      url: checkUrlFor(card),
      reason,
      knownBlock: Boolean(opts.knownBlock),
    });

  const scriptDeadline = Date.now() + SCRIPT_TIMEOUT_MS;

  for (const [i, card] of cardsToCheck.entries()) {
    if (Date.now() > scriptDeadline) {
      // Record the cards we never reached. Without this the loop just breaks and
      // they vanish — absent from both the checked set and the end-of-run skip
      // summary, so a truncated run is indistinguishable from a clean one.
      const unreached = cardsToCheck.slice(i);
      const mins = SCRIPT_TIMEOUT_MS / 60000;
      console.warn(`\nScript timeout reached (${mins} min) — stopping early; ${unreached.length} card(s) never checked.`);
      for (const c of unreached) {
        recordSkip(c, `script timeout (${mins} min) reached before this card was checked`);
      }
      break;
    }

    const { name, bank } = card.data;
    const apply_link = checkUrlFor(card);
    console.log(`Checking: ${name}`);
    console.log(`  URL: ${apply_link}${card.data.special_apply_link ? ' (special_apply_link)' : ''}`);

    const blockedReason = knownBlockedReason(apply_link);
    if (blockedReason) {
      console.log(`  Skipped (known bot-block — manual maintenance): ${blockedReason}\n`);
      recordSkip(card, `known block: ${blockedReason}`, { knownBlock: true });
      continue;
    }

    try {
      await withTimeout((async () => {
        // Fetch page
        const fetchResult = await fetchPageContent(apply_link);
        if (!fetchResult) {
          console.log('  Skipped (could not fetch page)\n');
          recordSkip(card, lastFetchError || 'could not fetch page');
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
          recordSkip(card, `extraction error: ${err.message}`);
          return;
        }

        // Self-heal: simple-fetch HTML can be 200 OK but missing JS-rendered
        // bonus values (e.g. citi.com, Amex business pages). Haiku then returns
        // nulls — or a 0 for a "Loading" placeholder — which the detector reads
        // as "no changes" or, worse, as a real SUB going to zero. Retry once
        // with the browser.
        if (!usedBrowser && needsBrowserRetry(extracted, card.data.signup_bonus)) {
          console.log('  Extraction returned no signup-bonus signal — retrying with browser');
          const browserContent = await fetchWithBrowser(apply_link);
          if (browserContent) {
            pageContent = browserContent;
            usedBrowser = true;
            try {
              extracted = await extractCardTerms(name, bank, apply_link, pageContent, card.data.signup_bonus);
            } catch (err) {
              console.warn(`  Retry extraction error: ${err.message} — skipping\n`);
              recordSkip(card, `retry extraction error: ${err.message}`);
              return;
            }
          }
        }

        if (!extracted) {
          console.log('  No data extracted — skipping\n');
          recordSkip(card, 'no data extracted from page');
          return;
        }

        // Compare against YAML
        const changes = detectChanges(card, extracted, new Date(), allSuppressions, pageContent);
        if (changes.length > 0) {
          console.log(`  ${changes.length} change(s) detected`);
          // Every detected change becomes a PR row a human must verify against
          // the source page — log what Haiku saw + returned so it's auditable
          // later without a re-run.
          logFetchedText(name, apply_link, usedBrowser, pageContent, extracted);
          allChanges.push({ slug: card.slug, card_name: name, apply_link, changes });
        } else {
          console.log('  No changes');
          if (process.env.LOG_FETCHED_TEXT === 'all') {
            logFetchedText(name, apply_link, usedBrowser, pageContent, extracted);
          }
        }
      })(), PER_CARD_TIMEOUT_MS, name);
    } catch (err) {
      console.warn(`  ${err.message} — skipping\n`);
      recordSkip(card, err.message);
    }

    console.log('');
    await new Promise(r => setTimeout(r, FETCH_DELAY_MS));
  }

  if (skippedCards.length > 0) {
    console.log(`\n⚠️  Skipped ${skippedCards.length} card(s) (NOT checked this run — not the same as unchanged):`);
    for (const s of skippedCards) {
      console.log(`  - ${s.name}: ${s.reason}\n      ${s.url}`);
    }
    console.log('');
  }

  // Fold this run into the persisted counters before any early return below —
  // a run that found changes still needs to record which cards it never verified.
  const checkedAt = new Date().toISOString();
  const checkedSlugs = new Set(cardsToCheck.map(c => c.slug));
  const nextState = updateSkipState(loadSkipState(), {
    checkedSlugs,
    skippedCards,
    checkedAt,
    isPartialRun: Boolean(slugFilter),
  });
  writeSkipState(nextState, checkedAt);

  const verified = checkedSlugs.size - skippedCards.length;
  console.log(`Verified ${verified}/${checkedSlugs.size} card(s) against their live page this run.`);

  const stale = staleCardsFrom(nextState);
  if (fs.existsSync(STALE_REPORT_FILE)) fs.unlinkSync(STALE_REPORT_FILE);
  if (stale.length > 0) {
    const cardsBySlug = new Map(allCards.map(c => [c.slug, c]));
    console.warn('\n' + writeStaleReport(stale, cardsBySlug));
  }

  reportSuppressions(allSuppressions);

  // NB: a stale-card alarm must not fail this script. The workflow still has to
  // commit the state file, open the changes PR, and post to Slack — all of which
  // are skipped if this step exits non-zero. The workflow's final step reads
  // STALE_REPORT_FILE and fails the build there instead.
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

if (require.main === module) {
  main().catch(async (err) => {
    console.error('Fatal error:', err);
    await closeBrowser();
    process.exit(1);
  });
}

module.exports = {
  detectChanges,
  applyChanges,
  needsBrowserRetry,
  pageShowsSignupOffer,
  updateSkipState,
  staleCardsFrom,
  SKIP_ALERT_THRESHOLD,
};
