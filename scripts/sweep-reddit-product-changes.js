#!/usr/bin/env node
/**
 * Historical sweep of r/CreditCards for product-change reports.
 *
 * Reddit's search returns at most ~250 results for any one query, regardless of
 * the time range, and the cloudsearch `timestamp:a..b` syntax that once allowed
 * exhaustive time slicing is gone. So a broad query like "product change" only
 * reaches ~5 months back before hitting the cap. The way further back is to
 * PARTITION the query space so each partition stays under the cap: one query per
 * catalog card. Measured on `product change "Double Cash"`, that reaches 2022 —
 * the per-card mention volume is simply low enough not to saturate.
 *
 * This script only COLLECTS candidates. It does no extraction: deciding that a
 * post describes a real product change, and which cards it went between, is the
 * session's job downstream (same fetch/extract/finish split as
 * check-reddit-datapoints.js).
 *
 * Resumable by design. The sweep takes hours because Reddit throttles hard, so
 * progress is checkpointed after every card and a re-run skips finished cards.
 *
 *   node scripts/sweep-reddit-product-changes.js [--limit=N] [--spacing=MS]
 *                                                [--cards=name,name] [--reset]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CARDS_DIR = path.join(ROOT, 'data', 'cards');
const OUT_DIR = path.join(ROOT, '.reddit-pc-work');
const STATE_PATH = path.join(OUT_DIR, 'sweep-state.json');

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const args = process.argv.slice(2);
const argVal = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const CAPS = {
  // Spacing between requests. The throttle is the binding constraint on this
  // script, not our own politeness budget: at 6s roughly every other request
  // 429s, and each 429 costs a 61s backoff — far more than the spacing saved.
  requestSpacingMs: Number(argVal('spacing', 22000)),
  rateLimitBackoffMs: 61000,
  // Escalating 61s / 122s / 244s. Reddit's throttle persists well past a single
  // backoff, and a card abandoned mid-throttle just gets throttled again on the
  // next card, so waiting it out is cheaper than pushing on.
  maxThrottleRetries: 3,
  // Pages per card. 100 entries per page, and a card that needs more than 3 is
  // saturating the result cap anyway, so deeper paging buys nothing.
  maxPagesPerCard: 3,
  // Give up if Reddit starts refusing outright (as opposed to throttling, which
  // still returns data on retry and is expected).
  abortAfterFailures: 4,
};

// How far back the backfill cares about. Kept separate from the extraction
// rules: collecting a slightly wider window is free, and the exact cutoff is
// applied when data points are written.
const SINCE = argVal('since', '2024-08-01');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let consecutiveFailures = 0;
let throttleEvents = 0;
let requestCount = 0;

async function redditRss(url, { attempt = 0 } = {}) {
  requestCount++;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/atom+xml,application/xml,text/xml,*/*',
      },
    });
  } catch (err) {
    consecutiveFailures++;
    throw new Error(`network: ${err.message}`);
  }
  // A single 61s retry is not enough for an unattended multi-hour run: once
  // Reddit is annoyed it stays annoyed, and the retry 429s too. Escalate
  // instead (61s, 122s, 244s...), which rides out the penalty box rather than
  // burning the card's slot and moving on to get throttled again.
  if (res.status === 429 && attempt < CAPS.maxThrottleRetries) {
    throttleEvents++;
    const wait = CAPS.rateLimitBackoffMs * 2 ** attempt;
    console.warn(`    429 — backing off ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${CAPS.maxThrottleRetries})`);
    await sleep(wait);
    return redditRss(url, { attempt: attempt + 1 });
  }
  if (!res.ok) {
    consecutiveFailures++;
    throw new Error(`HTTP ${res.status}`);
  }
  consecutiveFailures = 0;
  return res.text();
}

function unescapeEntities(text) {
  return (text || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseAtom(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const e = match[1];
    const rawId = e.match(/<id>([\s\S]*?)<\/id>/)?.[1] || '';
    const id = rawId.match(/(t[13]_[a-z0-9]+)/i)?.[1]?.toLowerCase() || '';
    const title = unescapeEntities(e.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').trim();
    const link = e.match(/<link[^>]*href="([^"]+)"/)?.[1] || '';
    const updated = e.match(/<updated>([\s\S]*?)<\/updated>/)?.[1]?.slice(0, 10) || '';
    const rawContent = e.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || '';
    const content = unescapeEntities(unescapeEntities(rawContent).replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (id && (title || content)) {
      entries.push({ id, title, link: unescapeEntities(link), content, updated });
    }
  }
  return entries;
}

// Recall filter. Deliberately loose — the session's extraction pass is the
// precision gate, and a post that merely mentions downgrading is worth reading.
// "PC" is matched only with word boundaries plus a card-ish context word,
// because bare "pc" hits "PC gaming", "PCP", and every other two-letter noise.
const PC_SIGNAL_RE =
  /(product[- ]?chang|\bPC(?:'?d|ed|ing)?\b|down[- ]?grad|up[- ]?grad|convert(ed|ing)?|switch(ed|ing)? (?:my |the )?\w+ (?:card )?to)/i;

function loadCardCatalog() {
  const yaml = require(path.join(ROOT, 'node_modules', 'js-yaml'));
  const files = fs.readdirSync(CARDS_DIR).filter((f) => /\.ya?ml$/.test(f));
  const cards = [];
  for (const file of files) {
    try {
      const doc = yaml.load(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
      if (!doc || !doc.name) continue;
      cards.push({
        name: doc.name,
        bank: doc.bank || '',
        previousNames: Array.isArray(doc.previous_names) ? doc.previous_names : [],
      });
    } catch {
      // A malformed card file should not abort a multi-hour sweep.
    }
  }
  return cards;
}

// Reddit search chokes on very long quoted phrases and on punctuation, so the
// query uses a trimmed form of the card name. Dropping the issuer prefix widens
// recall: people write "downgraded my Freedom Flex", not "my Chase Freedom Flex".
function searchTermsFor(card) {
  const stripIssuer = (n) => {
    const banks = ['Chase', 'American Express', 'Amex', 'Citi', 'Capital One', 'Wells Fargo', 'Bank of America', 'U.S. Bank', 'US Bank', 'Discover', 'Barclays', 'Synchrony'];
    let out = n;
    for (const b of banks) {
      if (out.toLowerCase().startsWith(`${b.toLowerCase()} `)) {
        out = out.slice(b.length + 1);
        break;
      }
    }
    return out.trim();
  };
  const base = stripIssuer(card.name).replace(/["']/g, '');
  return base.length >= 4 ? base : card.name.replace(/["']/g, '');
}

async function sweepCard(card) {
  const term = searchTermsFor(card);
  const q = `product change "${term}"`;
  const found = new Map();
  let after = null;

  for (let page = 0; page < CAPS.maxPagesPerCard; page++) {
    const url =
      `https://www.reddit.com/r/CreditCards/search.rss?q=${encodeURIComponent(q)}` +
      `&restrict_sr=1&sort=new&t=all&limit=100${after ? `&after=${after}` : ''}`;
    const entries = parseAtom(await redditRss(url));
    if (!entries.length) break;

    let fresh = 0;
    for (const e of entries) {
      if (found.has(e.id)) continue;
      found.set(e.id, e);
      fresh++;
    }
    after = entries[entries.length - 1].id;
    if (fresh === 0 || entries.length < 25) break;
    await sleep(CAPS.requestSpacingMs);
  }

  // Keep only posts in the backfill window that carry a product-change signal.
  const kept = [...found.values()]
    .filter((e) => e.updated && e.updated >= SINCE)
    .filter((e) => PC_SIGNAL_RE.test(`${e.title} ${e.content}`));

  return { term, q, scanned: found.size, kept };
}

function loadState() {
  if (args.includes('--reset')) return { done: {}, candidates: {} };
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { done: {}, candidates: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));
}

async function main() {
  const catalog = loadCardCatalog();
  const only = argVal('cards', null);
  let cards = catalog;
  if (only) {
    const wanted = only.split(',').map((s) => s.trim().toLowerCase());
    cards = catalog.filter((c) => wanted.some((w) => c.name.toLowerCase().includes(w)));
  }
  const limit = Number(argVal('limit', 0));
  if (limit > 0) cards = cards.slice(0, limit);

  const state = loadState();

  // Sweep the issuers that actually run product-change programs first. A
  // product change is always within one issuer, and the volume is wildly
  // uneven: Chase/Amex/Citi/Capital One threads dominate r/CreditCards, while
  // most credit-union and small co-brand cards have never been PC'd in a public
  // post. Reddit throttling makes the full sweep a many-hour job, so ordering
  // decides which half of it is worth reading first — not how long it takes.
  const PRIORITY_ISSUERS = [
    'Chase', 'American Express', 'Citi', 'Capital One', 'Bank of America',
    'U.S. Bank', 'Wells Fargo', 'Discover', 'Barclays', 'Synchrony',
  ];
  const issuerRank = (c) => {
    const idx = PRIORITY_ISSUERS.findIndex(
      (b) => (c.bank || '').toLowerCase().includes(b.toLowerCase()),
    );
    return idx === -1 ? PRIORITY_ISSUERS.length : idx;
  };

  const pending = cards
    .filter((c) => !state.done[c.name])
    .sort((a, b) => issuerRank(a) - issuerRank(b) || a.name.localeCompare(b.name));

  console.log(
    `Sweeping ${pending.length} card(s) (${cards.length - pending.length} already done), ` +
      `since ${SINCE}, spacing ${CAPS.requestSpacingMs}ms`,
  );

  for (const [i, card] of pending.entries()) {
    try {
      const res = await sweepCard(card);
      for (const e of res.kept) {
        const prev = state.candidates[e.id];
        // A post can surface under several cards; keep every card it matched so
        // the extraction prompt knows which catalog entries are in play.
        if (prev) {
          if (!prev.matchedCards.includes(card.name)) prev.matchedCards.push(card.name);
        } else {
          state.candidates[e.id] = {
            id: e.id,
            title: e.title,
            text: e.content.length > 2500 ? `${e.content.slice(0, 2500)}…` : e.content,
            url: e.link,
            posted: e.updated,
            matchedCards: [card.name],
          };
        }
      }
      state.done[card.name] = { scanned: res.scanned, kept: res.kept.length, at: new Date().toISOString() };
      saveState(state);
      console.log(
        `  [${i + 1}/${pending.length}] ${card.name} — scanned ${res.scanned}, kept ${res.kept.length} ` +
          `(total ${Object.keys(state.candidates).length}, ${throttleEvents} throttles, ${requestCount} reqs)`,
      );
    } catch (err) {
      console.warn(`  [${i + 1}/${pending.length}] ${card.name} — FAILED: ${err.message}`);
      if (consecutiveFailures >= CAPS.abortAfterFailures) {
        console.error(`Aborting: ${consecutiveFailures} consecutive failures. Re-run to resume.`);
        break;
      }
    }
    await sleep(CAPS.requestSpacingMs);
  }

  saveState(state);
  const total = Object.keys(state.candidates).length;
  console.log(
    `\nDone. ${Object.keys(state.done).length} cards swept, ${total} unique candidate posts, ` +
      `${requestCount} requests, ${throttleEvents} throttle backoffs.`,
  );
  console.log(`State: ${STATE_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
