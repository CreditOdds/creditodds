#!/usr/bin/env node

/**
 * Check Referrals Script
 *
 * Reads a list of referrals due for validation from `batch.json`, fetches
 * each referral URL with Playwright (falling back from a simple fetch),
 * and asks Claude Haiku whether the link still serves a working referral.
 * Writes per-referral results to `results.json`.
 *
 * Conservative detection only (per project_referral_validation_roadmap.md):
 *   - HTTP 4xx/410/timeout/DNS-fail short-circuit to expired/unreachable
 *     (no Haiku call needed).
 *   - HTTP 200 → Haiku looks for explicit dead signals (e.g. "this referral
 *     has expired", "no longer available", "this offer has ended"). Anything
 *     else returns "valid".
 *
 * Inputs (env / files):
 *   BATCH_FILE      : path to batch JSON                (default ./batch.json)
 *   RESULTS_FILE    : path to results JSON              (default ./results.json)
 *   ANTHROPIC_API_KEY : required for Haiku
 *
 * batch.json shape : { referrals: [{ referral_id, card_id, card_name, referral_link }] }
 * results.json shape : { results: [{ referral_id, status, reason }] }
 *   status ∈ "valid" | "expired" | "unreachable"
 */

const fs = require('fs');

const BATCH_FILE = process.env.BATCH_FILE || './batch.json';
const RESULTS_FILE = process.env.RESULTS_FILE || './results.json';

const FETCH_DELAY_MS = 1500;
const FETCH_TIMEOUT_MS = 15000;
const PER_REFERRAL_TIMEOUT_MS = 60000;
const SCRIPT_TIMEOUT_MS = 25 * 60 * 1000;

// ─── Timeout helper ──────────────────────────────────────────────────────────

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

// ─── Page fetch (mirrors check-card-pages.js patterns) ───────────────────────

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

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

// Returns one of:
//   { kind: 'ok', content: string, finalUrl: string }
//   { kind: 'expired-by-status', status: number }   (404, 410, 451)
//   { kind: 'unreachable', reason: string }
async function fetchReferralPage(url) {
  // Try simple fetch first.
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

    // Conservative dead-by-status signals.
    if (response.status === 404 || response.status === 410 || response.status === 451) {
      return { kind: 'expired-by-status', status: response.status };
    }

    if (response.ok) {
      const ct = response.headers.get('content-type') || '';
      if (ct.includes('text/html')) {
        const html = await response.text();
        const stripped = stripHtml(html);
        if (stripped.length >= 100) {
          return { kind: 'ok', content: stripped, finalUrl: response.url };
        }
        console.warn(`  Simple fetch too short (${stripped.length}); trying browser`);
      }
    }
  } catch (err) {
    console.warn(`  Simple fetch failed: ${err.message}; trying browser`);
  }

  // Fall back to Playwright for JS-rendered pages.
  const browser = await getBrowser();
  if (!browser) return { kind: 'unreachable', reason: 'browser unavailable' };

  let page;
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = response ? response.status() : 0;
    if (status === 404 || status === 410 || status === 451) {
      await context.close();
      return { kind: 'expired-by-status', status };
    }
    await page.waitForTimeout(2500);
    const html = await page.content();
    const finalUrl = page.url();
    await context.close();
    const stripped = stripHtml(html);
    if (stripped.length < 100) {
      return { kind: 'unreachable', reason: `browser content too short (${stripped.length})` };
    }
    return { kind: 'ok', content: stripped, finalUrl };
  } catch (err) {
    if (page) await page.context().close().catch(() => {});
    return { kind: 'unreachable', reason: err.message };
  }
}

// ─── Claude Haiku classification ─────────────────────────────────────────────

async function classifyWithHaiku(cardName, referralUrl, finalUrl, pageContent) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required');

  const prompt = `You are classifying a credit-card referral landing page.

Card: ${cardName}
Referral URL: ${referralUrl}
Final URL after redirects: ${finalUrl}

Page content (HTML stripped to plain text, truncated to 6000 chars):
${pageContent}

Decide whether this referral link is still WORKING (referrer will be credited if a new applicant signs up via this link) or DEAD (the page no longer accepts a referral signup).

Return ONLY valid JSON, no markdown fences, no explanation:

{
  "status": "valid" | "expired",
  "reason": "<short phrase quoting the signal you saw>"
}

Rules:
- "expired" ONLY when the page contains an EXPLICIT dead-signal phrase such as:
    "this referral link has expired"
    "no longer accepting referrals"
    "this offer is no longer available"
    "this offer has ended"
    "referral program has ended"
    "this link is no longer valid"
  Or visually equivalent variants from the issuer (Chase, Amex, Citi, Capital One, Discover, US Bank, Wells Fargo, etc.). Quote the phrase you saw in "reason".
- If the page is the issuer's normal apply form / card landing page with no expiration notice, return "valid".
- Do NOT mark "expired" just because the page is a generic apply page or doesn't show the referrer's name.
- Do NOT mark "expired" because the signup bonus differs from what the user advertised.
- When unsure, return "valid". A missed expiry is cheap; a wrong "expired" auto-archives a working link after two runs.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
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

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    console.warn(`  Could not parse Claude response: ${err.message}`);
    return { status: 'valid', reason: 'unparseable Haiku response; defaulting to valid' };
  }
  // Defensive: clamp to the two values we trust here. unreachable is
  // produced by the network layer above; Haiku never emits it.
  const status = parsed.status === 'expired' ? 'expired' : 'valid';
  return { status, reason: String(parsed.reason || '').slice(0, 200) };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Check Referrals ===\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  if (!fs.existsSync(BATCH_FILE)) {
    console.error(`Error: batch file not found at ${BATCH_FILE}`);
    process.exit(1);
  }

  const batch = JSON.parse(fs.readFileSync(BATCH_FILE, 'utf8'));
  const referrals = Array.isArray(batch.referrals) ? batch.referrals : [];
  console.log(`Loaded ${referrals.length} referral(s) from ${BATCH_FILE}\n`);

  if (referrals.length === 0) {
    fs.writeFileSync(RESULTS_FILE, JSON.stringify({ results: [] }, null, 2));
    console.log('No referrals to check. Wrote empty results.');
    return;
  }

  const results = [];
  const scriptDeadline = Date.now() + SCRIPT_TIMEOUT_MS;

  for (const ref of referrals) {
    if (Date.now() > scriptDeadline) {
      console.warn(`\nScript timeout reached (${SCRIPT_TIMEOUT_MS / 60000} min) — stopping early.`);
      break;
    }

    console.log(`Checking: ${ref.card_name} (#${ref.referral_id})`);
    console.log(`  URL: ${ref.referral_link}`);

    try {
      await withTimeout(
        (async () => {
          const fetched = await fetchReferralPage(ref.referral_link);

          if (fetched.kind === 'expired-by-status') {
            console.log(`  → expired (HTTP ${fetched.status})`);
            results.push({
              referral_id: ref.referral_id,
              status: 'expired',
              reason: `HTTP ${fetched.status}`,
            });
            return;
          }

          if (fetched.kind === 'unreachable') {
            console.log(`  → unreachable (${fetched.reason})`);
            results.push({
              referral_id: ref.referral_id,
              status: 'unreachable',
              reason: fetched.reason,
            });
            return;
          }

          // HTTP 200 with content → ask Haiku.
          try {
            const verdict = await classifyWithHaiku(
              ref.card_name,
              ref.referral_link,
              fetched.finalUrl,
              fetched.content,
            );
            console.log(`  → ${verdict.status} (${verdict.reason})`);
            results.push({
              referral_id: ref.referral_id,
              status: verdict.status,
              reason: verdict.reason,
            });
          } catch (err) {
            console.warn(`  Haiku error: ${err.message} — recording unreachable`);
            results.push({
              referral_id: ref.referral_id,
              status: 'unreachable',
              reason: `haiku error: ${err.message}`,
            });
          }
        })(),
        PER_REFERRAL_TIMEOUT_MS,
        `referral #${ref.referral_id}`,
      );
    } catch (err) {
      console.warn(`  ${err.message} — recording unreachable`);
      results.push({
        referral_id: ref.referral_id,
        status: 'unreachable',
        reason: err.message,
      });
    }

    console.log('');
    await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
  }

  fs.writeFileSync(RESULTS_FILE, JSON.stringify({ results }, null, 2));
  console.log(`\nWrote ${results.length} result(s) to ${RESULTS_FILE}`);
  await closeBrowser();
  console.log('\n=== Complete ===');
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeBrowser();
  process.exit(1);
});
