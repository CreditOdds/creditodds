#!/usr/bin/env node

/**
 * Apply Link Health Check
 *
 * Validates the apply_link for every active card in data/cards.
 * A link is flagged as broken if any of these are true:
 *   - HTTP status is 4xx or 5xx (after retrying with a browser for 403/429)
 *   - Final redirect URL matches an error path (e.g. /error/500, /404, /page-not-found)
 *   - Page title or body contains common error markers
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
];

function loadActiveCards() {
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith('.yaml'));
  const cards = [];
  for (const file of files) {
    try {
      const data = yaml.load(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
      if (
        data &&
        data.slug &&
        data.apply_link &&
        data.accepting_applications !== false
      ) {
        cards.push({
          slug: data.slug,
          name: data.name || data.slug,
          bank: data.bank || '',
          file,
          apply_link: data.apply_link,
        });
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
async function getBrowser() {
  if (_browser) return _browser;
  try {
    const { chromium } = require('playwright');
    _browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.warn(`playwright unavailable: ${err.message}`);
    return null;
  }
  return _browser;
}

async function fetchWithBrowser(url) {
  const browser = await getBrowser();
  if (!browser) return null;
  const context = await browser.newContext({ userAgent: USER_AGENT });
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

async function checkOne(card) {
  let result = null;
  let usedBrowser = false;

  try {
    result = await fetchWithTimeout(card.apply_link, FETCH_TIMEOUT_MS);
  } catch (err) {
    result = { status: 0, finalUrl: card.apply_link, body: '', error: err.message };
  }

  // 403/429/0 may be bot blocks — retry with a real browser before flagging
  if (result.status === 403 || result.status === 429 || result.status === 0) {
    const browserResult = await fetchWithBrowser(card.apply_link);
    if (browserResult) {
      result = browserResult;
      usedBrowser = true;
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
      return { ...card, ok: false, reason: browserVerdict.reason, finalUrl: browserResult.finalUrl };
    }
  }

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
    console.log(`[${idx + 1}/${cards.length}] ${tag} ${card.slug} — ${r.reason || r.finalUrl || ''}`);
    return r;
  });

  if (_browser) await _browser.close();

  const broken = results.filter(r => !r.ok);
  const summary = {
    checked_at: new Date().toISOString(),
    total: results.length,
    broken_count: broken.length,
    broken: broken.map(r => ({
      slug: r.slug,
      name: r.name,
      bank: r.bank,
      file: r.file,
      apply_link: r.apply_link,
      final_url: r.finalUrl || null,
      reason: r.reason || 'unknown',
    })),
  };

  fs.writeFileSync(RESULT_FILE, JSON.stringify(summary, null, 2));
  console.log(`\nDone: ${broken.length} broken / ${results.length} total`);
  console.log(`Wrote ${RESULT_FILE}`);
}

module.exports = { checkOne, classify, loadActiveCards };

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
