#!/usr/bin/env node

/**
 * Apply Link Health Check
 *
 * Validates every outbound apply URL for each active card in data/cards —
 * both `apply_link` and `special_apply_link`. Checking only `apply_link` used to
 * hide real breakage: `special_apply_link` is the URL the card page actually sends
 * users to when it is set (see CardClient.tsx), so a dead special link is invisible
 * while the untrafficked generic link keeps returning 200. That is exactly how
 * Fidelity's dead offer page survived a daily green check.
 *
 * A link is flagged as broken if any of these are true:
 *   - HTTP status is 4xx or 5xx, and it survives a stealth-browser retry plus a
 *     second confirming attempt (see needsBrowserRetry — bank WAFs soft-block
 *     the CI runner with a 404 as readily as a 403)
 *   - Final redirect URL matches an error path (e.g. /error/500, /404, /page-not-found)
 *   - Page title or body contains common error markers
 *
 * A broken `special_apply_link` on a card that has a `signup_bonus` is additionally
 * marked `sub_at_risk`: the SUB is usually only offered on that landing page, so if
 * the page is gone the advertised bonus is probably gone too and both must be pulled.
 *
 * Writes JSON to .apply-link-check-result.json so the workflow can decide
 * whether to open, update, or close an issue.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const CARDS_DIR = path.join(__dirname, '..', 'data', 'cards');
const RESULT_FILE = path.join(__dirname, '..', '.apply-link-check-result.json');

const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 20000;
const BROWSER_TIMEOUT_MS = 30000;
const REQUEST_DELAY_MS = 100;
const RETRY_DELAY_MS = 3000;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

const ERROR_URL_PATTERNS = [
  /\/error\b/i,
  /\/404(?:\b|\/)/,
  /\/500(?:\b|\/)/,
  /\/page-not-found\b/i,
  /\/not-found\b/i,
  /\/oops\b/i,
  /\/unavailable\b/i,
];

const ERROR_BODY_PATTERNS = [
  /page (?:you('?re| are)? looking for )?(?:can(?:not| ?'?t)|could not) be found/i,
  /page not found/i,
  /this page (?:doesn(?:'?| no)t|cannot|can ?'?t) be (?:found|displayed)/i,
  /we can(?:'?| no)t find (?:the |that )?page/i,
  /sorry, (?:we|this) (?:can(?:'?| no)t|couldn'?t)/i,
  /404 error/i,
  // Fidelity's retired-offer page ("this page was moved or deleted"). It currently
  // serves a 400 so the status check catches it, but soft-404s are common enough
  // on bank marketing pages that the copy is worth matching directly.
  /page was (?:moved or deleted|removed)/i,
];

// One check target per outbound URL. A card with a distinct `special_apply_link`
// yields two targets; if the two URLs are identical we only check it once.
function targetsForCard(data, file) {
  const targets = [];
  const seen = new Set();
  for (const linkType of ['apply_link', 'special_apply_link']) {
    const url = data[linkType];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    targets.push({
      slug: data.slug,
      name: data.name || data.slug,
      bank: data.bank || '',
      file,
      link_type: linkType,
      apply_link: url,
      // A dead special link almost certainly means the offer behind it is dead too.
      sub_at_risk: linkType === 'special_apply_link' && Boolean(data.signup_bonus),
    });
  }
  return targets;
}

function loadActiveCards() {
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.yaml'));
  const cards = [];
  for (const file of files) {
    try {
      const data = yaml.load(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
      if (
        data &&
        data.slug &&
        (data.apply_link || data.special_apply_link) &&
        data.accepting_applications !== false
      ) {
        cards.push(...targetsForCard(data, file));
      }
    } catch (err) {
      console.warn(`skip ${file}: ${err.message}`);
    }
  }
  return cards;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    const finalUrl = response.url || url;
    let body = '';
    try {
      body = (await response.text()).slice(0, 30000);
    } catch {
      body = '';
    }
    return { status: response.status, finalUrl, body };
  } finally {
    clearTimeout(timer);
  }
}

let _browser = null;
let _launchChannel = null; // 'chrome' if real Chrome is available, else bundled chromium
let _browserPromise = null;

// Memoize the in-flight launch, not just the resolved browser. Several
// concurrency workers can hit getBrowser() simultaneously; without this guard
// they'd each see _browser === null and launch their own Chrome, orphaning all
// but the last. Those orphaned browsers keep open handles that prevent Node
// from exiting, so the script hangs until the CI timeout kills it.
function getBrowser() {
  if (!_browserPromise) _browserPromise = launchBrowser();
  return _browserPromise;
}

async function launchBrowser() {
  // playwright-extra + stealth plugin patches the obvious headless tells
  // (navigator.webdriver, missing plugins, headless UA, WebGL vendor, etc.)
  // that bank WAFs use to return 403 to automated browsers.
  let chromium;
  try {
    chromium = require('playwright-extra').chromium;
    const stealth = require('puppeteer-extra-plugin-stealth')();
    chromium.use(stealth);
  } catch (err) {
    console.warn(`playwright-extra unavailable, falling back to plain playwright: ${err.message}`);
    try {
      chromium = require('playwright').chromium;
    } catch (err2) {
      console.warn(`playwright unavailable: ${err2.message}`);
      return null;
    }
  }

  // Prefer real Chrome (channel: 'chrome') — its TLS/JS fingerprint is far less
  // bot-like than bundled chromium. Fall back to bundled chromium if absent.
  try {
    _browser = await chromium.launch({ headless: true, channel: 'chrome' });
    _launchChannel = 'chrome';
  } catch (err) {
    console.warn(`real Chrome unavailable, using bundled chromium: ${err.message}`);
    try {
      _browser = await chromium.launch({ headless: true });
      _launchChannel = 'chromium';
    } catch (err2) {
      console.warn(`chromium launch failed: ${err2.message}`);
      return null;
    }
  }
  console.log(`browser ready (channel: ${_launchChannel})`);
  return _browser;
}

async function fetchWithBrowser(url) {
  const browser = await getBrowser();
  if (!browser) return null;
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    },
  });
  const page = await context.newPage();
  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: BROWSER_TIMEOUT_MS,
    });
    const status = response ? response.status() : 0;
    const finalUrl = page.url();
    const body = (await page.content()).slice(0, 30000);
    return { status, finalUrl, body };
  } catch (err) {
    return { status: 0, finalUrl: url, body: '', error: err.message };
  } finally {
    await context.close().catch(() => {});
  }
}

// Statuses that may be a bank WAF blocking the CI runner rather than a real
// verdict on the URL. The stealth-browser retry exists precisely to defeat these,
// so the set decides whether that machinery ever runs.
//
// 404 is the important entry and the one that was missing. Akamai and Imperva
// both soft-block with a plain 404, which at the status-code layer is
// indistinguishable from a dead page — so the one status the script trusted
// unconditionally was also a routine block response. Citi's /usc/lpaca/ offer
// pages did exactly that on 2026-08-13 (issue #2037): a single run got a 404 on
// the AAdvantage Executive apply link while every other citi.com URL in the same
// run passed within the same second, and the page was live throughout — it had
// checked OK on 8/9, 8/10 and 8/12, and checked OK again afterwards. Because 404
// skipped the retry path, a live link with a live 70k offer was reported broken.
//
// 5xx and 410 are here for the same reason: transient edge failures that a real
// browser or a few seconds later would not reproduce.
function needsBrowserRetry(status) {
  return status === 0 || status === 403 || status === 404 || status === 410 ||
    status === 429 || status >= 500;
}

function classify(result, originalUrl) {
  if (!result) {
    return { ok: false, reason: 'No response' };
  }
  const { status, finalUrl, body } = result;

  if (status >= 400) {
    return { ok: false, reason: `HTTP ${status}`, finalUrl };
  }
  if (status === 0) {
    return { ok: false, reason: result.error || 'Network error', finalUrl };
  }

  for (const pattern of ERROR_URL_PATTERNS) {
    if (pattern.test(finalUrl)) {
      return {
        ok: false,
        reason: `Redirected to error page: ${finalUrl}`,
        finalUrl,
      };
    }
  }

  if (body) {
    const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    if (/page not found|404|error/i.test(title) && !/apply|credit card/i.test(title)) {
      return { ok: false, reason: `Title looks like an error: "${title}"`, finalUrl };
    }
    for (const pattern of ERROR_BODY_PATTERNS) {
      if (pattern.test(body)) {
        return {
          ok: false,
          reason: `Body matched error pattern: ${pattern}`,
          finalUrl,
        };
      }
    }
  }

  return { ok: true, finalUrl };
}

// Surface what the server actually sent on a failure. Without this, a WAF denial
// page and a real bank 404 are both just "HTTP 404" in the run log — which is
// what made #2037 take a manual investigation to tell apart. Citi's genuine dead
// page says "Page Not Found 404"; a block page reads nothing like it.
function bodySnippetOf(result) {
  if (!result?.body) return undefined;
  const text = result.body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, 200) : undefined;
}

async function plainFetch(url) {
  try {
    return await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  } catch (err) {
    return { status: 0, finalUrl: url, body: '', error: err.message };
  }
}

async function checkOne(card) {
  let result = await plainFetch(card.apply_link);
  let usedBrowser = false;

  // A status a WAF might have invented deserves a real browser and a second look
  // before we call the link dead. See needsBrowserRetry for why 404 is in that set.
  if (needsBrowserRetry(result.status)) {
    const browserResult = await fetchWithBrowser(card.apply_link);
    if (browserResult) {
      result = browserResult;
      usedBrowser = true;
    }

    // Still bad. Edge blocks are usually rate- or reputation-based and clear
    // within seconds, so give it one more attempt after a pause and only believe
    // the failure if it repeats. A genuinely dead URL fails both times.
    if (needsBrowserRetry(result.status)) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      const retry = await fetchWithBrowser(card.apply_link);
      if (retry) {
        result = retry;
        usedBrowser = true;
      } else {
        result = await plainFetch(card.apply_link);
        usedBrowser = false;
      }
    }
  }

  const verdict = classify(result, card.apply_link);

  // If a non-browser fetch said "broken" via URL/body pattern, double-check with
  // a browser — server-rendered apps sometimes return placeholder shells.
  if (!verdict.ok && !usedBrowser && result.status >= 200 && result.status < 400) {
    const browserResult = await fetchWithBrowser(card.apply_link);
    if (browserResult) {
      const browserVerdict = classify(browserResult, card.apply_link);
      if (browserVerdict.ok) {
        return { ...card, ok: true, finalUrl: browserResult.finalUrl };
      }
      return {
        ...card,
        ok: false,
        reason: browserVerdict.reason,
        finalUrl: browserResult.finalUrl,
        bodySnippet: bodySnippetOf(browserResult),
      };
    }
  }

  if (!verdict.ok) verdict.bodySnippet = bodySnippetOf(result);
  return { ...card, ...verdict };
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
      if (REQUEST_DELAY_MS) await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const cards = loadActiveCards();
  console.log(`Checking ${cards.length} active card apply links…`);

  const results = await runWithConcurrency(cards, CONCURRENCY, async (card, idx) => {
    const r = await checkOne(card);
    const tag = r.ok ? 'OK ' : 'BAD';
    const which = card.link_type === 'special_apply_link' ? ' [special]' : '';
    console.log(
      `[${idx + 1}/${cards.length}] ${tag} ${card.slug}${which} — ${r.reason || r.finalUrl || ''}`
    );
    if (!r.ok && r.bodySnippet) console.log(`      body: ${r.bodySnippet}`);
    return r;
  });

  if (_browser) await _browser.close();

  const broken = results.filter(r => !r.ok);
  const subAtRisk = broken.filter(r => r.sub_at_risk);
  const summary = {
    checked_at: new Date().toISOString(),
    total: results.length,
    broken_count: broken.length,
    sub_at_risk_count: subAtRisk.length,
    broken: broken.map(r => ({
      slug: r.slug,
      name: r.name,
      bank: r.bank,
      file: r.file,
      link_type: r.link_type,
      apply_link: r.apply_link,
      final_url: r.finalUrl || null,
      reason: r.reason || 'unknown',
      sub_at_risk: Boolean(r.sub_at_risk),
    })),
  };

  fs.writeFileSync(RESULT_FILE, JSON.stringify(summary, null, 2));
  console.log(`\nDone: ${broken.length} broken / ${results.length} total`);
  if (subAtRisk.length) {
    console.log(
      `${subAtRisk.length} broken special_apply_link(s) with a signup_bonus — verify the SUB still exists:`
    );
    for (const r of subAtRisk) console.log(`  - ${r.slug} (${r.file})`);
  }
  console.log(`Wrote ${RESULT_FILE}`);
}

module.exports = { checkOne, classify, loadActiveCards, needsBrowserRetry, targetsForCard };

if (require.main === module) {
  main()
    .then(() => {
      // Force exit even if a stray browser handle lingers — all work is done
      // and stdout is flushed by this point, so there's nothing left to await.
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
