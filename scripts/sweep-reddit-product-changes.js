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
 *   node scripts/sweep-reddit-product-changes.js --phase=weekly   # recurring run
 *   node scripts/sweep-reddit-product-changes.js --phase=extract
 *   node scripts/sweep-reddit-product-changes.js --phase=finish
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
      // Both fields are extraction aliases even though they mean different
      // things on the card page: a rebrand's old name and a co-brand's sibling
      // banner name are equally likely to be what the poster actually typed.
      const aliases = [
        ...(Array.isArray(doc.previous_names) ? doc.previous_names : []),
        ...(Array.isArray(doc.also_known_as) ? doc.also_known_as : []),
      ].filter((a) => typeof a === 'string' && a.trim());
      cards.push({
        name: doc.name,
        bank: doc.bank || '',
        aliases,
      });
    } catch {
      // A malformed card file should not abort a multi-hour sweep.
    }
  }
  return cards;
}

// Maps every name the extractor might legitimately emit onto the one canonical
// card name, so a sibling-branded post ("my Harris Teeter card") lands on the
// same edge as the canonical one instead of being rejected as uncatalogued.
//
// Canonical names always win: an alias is only registered when nothing real
// already holds that name, which stops a careless alias on one card from
// hijacking another card's identity. Collisions are reported rather than
// silently resolved, because two cards claiming one alias means the data is
// wrong and picking a winner would hide that.
function buildNameResolver(catalog) {
  const byLower = new Map();
  const collisions = [];
  for (const c of catalog) byLower.set(c.name.toLowerCase(), c.name);
  for (const c of catalog) {
    for (const alias of c.aliases) {
      const key = alias.toLowerCase();
      const held = byLower.get(key);
      if (held === undefined) {
        byLower.set(key, c.name);
      } else if (held !== c.name) {
        collisions.push(`"${alias}" claimed by both "${held}" and "${c.name}"`);
      }
    }
  }
  return {
    canonical: (name) => byLower.get(String(name || '').trim().toLowerCase()) || name,
    collisions,
  };
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

// ── Extract phase ────────────────────────────────────────────────────────────

// A product change is an issuer converting an existing account to a different
// product. It is ALWAYS within one issuer — that is what makes it a change
// rather than a new application — so the issuer match is a hard validity check
// downstream, not a style preference.
function buildExtractPrompt(candidates, catalog) {
  const byBank = new Map();
  for (const c of catalog) {
    if (!byBank.has(c.bank)) byBank.set(c.bank, []);
    // A card with aliases is listed as "Canonical [= alias, alias]". The
    // canonical name still leads, because that is what must be emitted.
    byBank.get(c.bank).push({
      sort: c.name,
      label: c.aliases.length ? `${c.name} [= ${c.aliases.join(', ')}]` : c.name,
    });
  }
  const cardList = [...byBank.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([bank, entries]) =>
        `- **${bank}**: ${entries
          .sort((a, b) => a.sort.localeCompare(b.sort))
          .map((e) => e.label)
          .join(' · ')}`,
    )
    .join('\n');

  const posts = candidates
    .map(
      (c, i) =>
        `### ${i + 1}. ${c.id}\n` +
        `- posted: ${c.posted}\n` +
        `- matched card(s): ${c.matchedCards.join(', ')}\n` +
        `- url: ${c.url}\n` +
        `- title: ${c.title}\n` +
        `- body: ${c.text || '(no body text)'}\n`,
    )
    .join('\n');

  return `# Extract product changes from r/CreditCards posts

Read each post below and emit one JSON file per **product change that actually
happened**, into \`.reddit-pc-work/proposed/<source_id>.json\`.

## What counts

A product change is an issuer converting an existing account to a different
card, keeping the account (and its age) alive. Record one only when the poster
describes a change **that already happened**, to their **own** account.

Record:
- "PC'd my Freedom Flex to Freedom Unlimited last month" → yes
- "Citi converted my AA Plat to Mile Up without asking" → yes, reason: forced
- "Just downgraded my CSR to CSP to avoid the AF" → yes, reason: voluntary
- A post describing several hops ("Plat → Mile Up → Custom Cash") → one entry
  PER HOP, with source_id suffixed \`#1\`, \`#2\`, ...

Do NOT record:
- Anything hypothetical or still a question: "thinking about PCing", "should I
  PC?", "can I PC this?", "what would you PC it to?"
- Advice or recommendations aimed at someone else
- An upgrade/downgrade OFFER that was not taken
- A new application, an authorized-user add, or a closure
- Anything where the direction (from which card, to which card) is ambiguous
- Anything where either card is not in the catalog below

## Hard rules

1. **Both cards must be in the catalog, spelled exactly as listed.** A catalog
   entry written \`Canonical [= other, other]\` is one product that shipped
   under several names, usually a co-brand rebranded per store banner. A post
   naming any of them counts, but **always emit the canonical name** (the part
   before the \`[\`), never the alias.
2. **Both cards must be from the same issuer.** A product change never crosses
   issuers. If your reading has it crossing, the reading is wrong — drop it.
   Aliases do not change this: a sibling brand has the same issuer as its
   canonical card, so "Harris Teeter card to Smartly" is a U.S. Bank change.
3. \`source_id\` must be one of the ids listed below (optionally with a \`#N\`
   suffix for multi-hop posts). Do not invent posts.
4. \`change_month\` is \`YYYY-MM\`. Use the month the poster states; if they only
   say something like "last month", compute it from the post date; otherwise
   use the post month. Never a future month.
5. \`reason\` is \`forced\` (issuer initiated it), \`voluntary\` (the cardholder
   asked), or omitted when unstated. Do not guess — the forced-vs-voluntary
   split is one of the more interesting things this data shows, and inventing
   it would wreck that.
6. \`evidence\` is a **paraphrase**, not a quote, under 500 chars.
7. When in doubt, omit. A missing product change costs nothing; a wrong edge
   shows up as a misleading arrow on a live card page.

## Shape

\`\`\`json
{
  "source_id": "t3_abc123",
  "permalink": "https://www.reddit.com/r/CreditCards/comments/...",
  "posted": "2026-03-14",
  "from_card": "Chase Freedom Flex",
  "to_card": "Chase Freedom Unlimited",
  "change_month": "2026-02",
  "reason": "voluntary",
  "evidence": "Poster says they moved their Flex to Unlimited in February to stop juggling rotating categories."
}
\`\`\`

## Catalog

${cardList}

## Posts (${candidates.length})

${posts}
`;
}

// ── Finish phase ─────────────────────────────────────────────────────────────

function validateChange(pc, { candidateIds, cardByName, bankByName, usedIds }) {
  const errors = [];
  const id = typeof pc.source_id === 'string' ? pc.source_id : '';
  if (!/^t[13]_[a-z0-9]+(#\d+)?$/.test(id)) {
    return [`source_id "${id}" is malformed`];
  }
  // The model may only annotate posts this run actually fetched.
  if (!candidateIds.has(id.split('#')[0])) {
    errors.push(`source_id ${id} was not among this run's candidates`);
  }
  if (usedIds.has(id)) errors.push(`duplicate source_id ${id}`);

  const from = cardByName.get(pc.from_card);
  const to = cardByName.get(pc.to_card);
  if (!from) errors.push(`from_card "${pc.from_card}" is not in the catalog`);
  if (!to) errors.push(`to_card "${pc.to_card}" is not in the catalog`);
  if (from && to) {
    if (pc.from_card === pc.to_card) errors.push('from_card and to_card are the same');
    // The strongest structural check available: a product change is always
    // within one issuer, so a cross-issuer pair means the post was misread.
    const fromBank = bankByName.get(pc.from_card);
    const toBank = bankByName.get(pc.to_card);
    if (fromBank && toBank && fromBank !== toBank) {
      errors.push(`cross-issuer change ${fromBank} -> ${toBank}; product changes never cross issuers`);
    }
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(pc.change_month || '')) {
    errors.push(`change_month "${pc.change_month}" must be YYYY-MM`);
  } else {
    const nowMonth = new Date().toISOString().slice(0, 7);
    if (pc.change_month > nowMonth) errors.push('change_month is in the future');
    if (pc.change_month < SINCE.slice(0, 7)) {
      errors.push(`change_month ${pc.change_month} is before the backfill window (${SINCE.slice(0, 7)})`);
    }
  }

  if (pc.reason != null && !['voluntary', 'forced'].includes(pc.reason)) {
    errors.push(`reason "${pc.reason}" must be voluntary, forced, or omitted`);
  }
  if (pc.evidence != null && String(pc.evidence).length > 500) {
    errors.push('evidence exceeds 500 chars');
  }
  return errors;
}

function phaseFinish() {
  const yaml = require(path.join(ROOT, 'node_modules', 'js-yaml'));
  const proposedDir = path.join(OUT_DIR, 'proposed');
  const outDir = path.join(ROOT, 'data', 'reddit-product-changes');

  const state = loadState();
  const candidateIds = new Set(Object.keys(state.candidates));
  const catalog = loadCardCatalog();
  const cardByName = new Map(catalog.map((c) => [c.name, c]));
  const bankByName = new Map(catalog.map((c) => [c.name, c.bank]));
  const resolver = buildNameResolver(catalog);
  if (resolver.collisions.length) {
    console.warn(`Alias collisions in data/cards (aliases ignored for these):`);
    for (const c of resolver.collisions) console.warn(`  - ${c}`);
  }

  const files = fs.existsSync(proposedDir)
    ? fs.readdirSync(proposedDir).filter((f) => f.endsWith('.json')).sort()
    : [];
  if (!files.length) {
    console.log('No proposed changes in .reddit-pc-work/proposed/ — nothing to write.');
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const usedIds = new Set();
  const written = [];
  const rejected = [];

  for (const file of files) {
    let pc;
    try {
      pc = JSON.parse(fs.readFileSync(path.join(proposedDir, file), 'utf8'));
    } catch (err) {
      rejected.push({ file, errors: [`unparseable JSON: ${err.message}`] });
      continue;
    }
    // Fold aliases onto canonical names before validating, so the rest of the
    // pipeline — the catalog check, the same-issuer check, the written YAML,
    // and the row the Lambda imports — only ever sees one name per product.
    pc.from_card = resolver.canonical(pc.from_card);
    pc.to_card = resolver.canonical(pc.to_card);

    const errors = validateChange(pc, { candidateIds, cardByName, bankByName, usedIds });
    if (errors.length) {
      rejected.push({ file, errors });
      continue;
    }
    usedIds.add(pc.source_id);

    const safeId = pc.source_id.replace('#', '-');
    const target = path.join(outDir, `${pc.change_month}-${safeId}.yaml`);
    const doc = {
      source_id: pc.source_id,
      permalink: pc.permalink || null,
      posted: pc.posted || null,
      evidence: pc.evidence || null,
      from_card: pc.from_card,
      to_card: pc.to_card,
      change_month: pc.change_month,
      ...(pc.reason ? { reason: pc.reason } : {}),
    };
    fs.writeFileSync(target, yaml.dump(doc, { lineWidth: 100, quotingType: '"' }));
    written.push({ ...doc, file: path.basename(target) });
  }

  const rows = written
    .map((w) => `| ${w.from_card} | ${w.to_card} | ${w.change_month} | ${w.reason || '—'} | [src](${w.permalink}) |`)
    .join('\n');
  const prBody =
    `Product changes extracted from r/CreditCards.\n\n` +
    `| From | To | Month | Reason | Source |\n|---|---|---|---|---|\n${rows}\n\n` +
    (rejected.length
      ? `### Rejected (${rejected.length})\n\n` +
        rejected.map((r) => `- \`${r.file}\`: ${r.errors.join('; ')}`).join('\n') +
        '\n'
      : '');
  fs.writeFileSync(path.join(OUT_DIR, 'pr-body.md'), prBody);

  // Candidates are consumed once they have been through extraction, so the next
  // run's prompt covers only new posts. Dropping the ones that yielded nothing
  // is deliberate: they were read and judged, and the committed daily seen-state
  // is what actually prevents re-fetching them. `state.done` is kept so the
  // backfill never re-sweeps a card. Pass --keep-candidates to re-run extraction
  // over the same set (e.g. after fixing a rule and wanting a second pass).
  if (!args.includes('--keep-candidates')) {
    state.candidates = {};
    saveState(state);
  }

  console.log(`Wrote ${written.length} product change(s) to data/reddit-product-changes/`);
  if (rejected.length) {
    console.log(`Rejected ${rejected.length}:`);
    for (const r of rejected) console.log(`  ${r.file}: ${r.errors.join('; ')}`);
  }
  console.log(`PR body: ${path.join(OUT_DIR, 'pr-body.md')}`);
}

// ── Weekly mode ──────────────────────────────────────────────────────────────

// The per-card sweep is a backfill tool: 199 partitioned queries, hours of
// runtime, exhaustive history. The recurring run wants the opposite shape — a
// handful of requests covering only what is new since the last run.
//
// This runs WEEKLY, and that cadence drives the feed list. r/CreditCards is
// busy enough that /new?limit=100 spans about 27 hours (measured 2026-08-03),
// so on its own it would miss roughly six days out of every seven. The
// week-scoped searches are therefore the primary source and /new is a cheap
// top-up that catches the freshest posts before search indexes them.
//
// Several phrasings are queried because people describe the same event
// differently ("PC'd", "downgraded", "converted"), and a single week's volume
// per phrasing stays far under Reddit's ~250-result cap.
//
// Seen-state is committed to .github/ rather than kept in .reddit-pc-work/, so
// rejecting a proposal is permanent: nothing re-proposes a post once it has
// been seen, whether it became a data point or not.
const DAILY_STATE_PATH = path.join(ROOT, '.github', 'reddit-product-change-state.json');
// Staging copy the publish script reads; see saveDailyState for why the
// committed file is never written directly.
const DAILY_STATE_STAGED = path.join(OUT_DIR, 'state-updated.json');
const DAILY_STATE_RETENTION_DAYS = 180;

function loadDailyState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DAILY_STATE_PATH, 'utf8'));
    return { seen: parsed.seen && typeof parsed.seen === 'object' ? parsed.seen : {} };
  } catch {
    return { seen: {} };
  }
}

// Writes to a STAGING file, not to the committed state. The publish script
// pushes it straight to main via the contents API, because "seen" means
// "presented for extraction", not "accepted" — a post whose PR was closed
// unmerged must not come back tomorrow. Routing it through the review PR would
// lose exactly the rejections it needs to remember. Same rationale as
// check-reddit-datapoints-publish.sh.
function saveDailyState(state) {
  // Prune well past any plausible re-surfacing so the file cannot grow forever.
  const cutoff = new Date(Date.now() - DAILY_STATE_RETENTION_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);
  const seen = {};
  for (const [id, date] of Object.entries(state.seen)) {
    if (date >= cutoff) seen[id] = date;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(DAILY_STATE_STAGED, `${JSON.stringify({ seen }, null, 1)}\n`);
}

// Phrasings people actually use for the same event. Queried separately rather
// than OR'd into one query because Reddit's relevance ranking buries the weaker
// terms when they share a query, and a week of any one phrasing is nowhere near
// the result cap, so the extra requests cost nothing worth saving.
const WEEKLY_QUERIES = ['product change', 'downgraded', 'upgraded', 'converted'];

const weekSearchUrl = (q) =>
  'https://www.reddit.com/r/CreditCards/search.rss?q=' +
  encodeURIComponent(q) +
  '&restrict_sr=1&sort=new&t=week&limit=100';

async function phaseWeekly() {
  const today = new Date().toISOString().slice(0, 10);
  const dailyState = loadDailyState();
  const seen = new Set(Object.keys(dailyState.seen));

  const feeds = [
    // Top-up only: this spans roughly a day, so it exists to catch posts too
    // fresh to be indexed by search, not to cover the week.
    ['r/CreditCards new', 'https://www.reddit.com/r/CreditCards/new/.rss?limit=100'],
    ...WEEKLY_QUERIES.map((q) => [`search "${q}"`, weekSearchUrl(q)]),
  ];

  const found = new Map();
  for (const [label, url] of feeds) {
    try {
      const entries = parseAtom(await redditRss(url));
      const kept = entries
        .filter((e) => !seen.has(e.id))
        .filter((e) => PC_SIGNAL_RE.test(`${e.title} ${e.content}`));
      for (const e of kept) if (!found.has(e.id)) found.set(e.id, e);
      console.log(`  ${label}: ${entries.length} entries, ${kept.length} new with PC signal`);
    } catch (err) {
      console.warn(`  ${label}: FAILED ${err.message}`);
    }
    await sleep(CAPS.requestSpacingMs);
  }

  // Everything fetched is marked seen, including posts that never become a data
  // point. Re-reading a post that already failed extraction just burns requests.
  const state = loadState();
  for (const e of found.values()) {
    dailyState.seen[e.id] = today;
    state.candidates[e.id] = {
      id: e.id,
      title: e.title,
      text: e.content.length > 2500 ? `${e.content.slice(0, 2500)}…` : e.content,
      url: e.link,
      posted: e.updated || today,
      matchedCards: [],
    };
  }
  saveDailyState(dailyState);
  saveState(state);

  console.log(`\nWeekly scan: ${found.size} new candidate(s). Run --phase=extract next.`);
}

async function main() {
  const phase = argVal('phase', 'sweep');

  // 'daily' kept as an alias so an older scheduled task prompt does not break
  // silently; both run the same weekly-shaped fetch.
  if (phase === 'weekly' || phase === 'daily') {
    await phaseWeekly();
    return;
  }

  if (phase === 'extract') {
    const state = loadState();
    const candidates = Object.values(state.candidates).sort((a, b) =>
      (b.posted || '').localeCompare(a.posted || ''),
    );
    if (!candidates.length) {
      console.log('No candidates yet — run the sweep phase first.');
      return;
    }
    fs.mkdirSync(path.join(OUT_DIR, 'proposed'), { recursive: true });
    const promptPath = path.join(OUT_DIR, 'extract-prompt.md');
    fs.writeFileSync(promptPath, buildExtractPrompt(candidates, loadCardCatalog()));
    console.log(`Wrote ${promptPath} (${candidates.length} candidates)`);
    return;
  }

  if (phase === 'finish') {
    phaseFinish();
    return;
  }

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

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  buildNameResolver,
  buildExtractPrompt,
  loadCardCatalog,
  validateChange,
};
