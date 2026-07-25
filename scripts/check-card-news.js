#!/usr/bin/env node

/**
 * Check Card News — local, twice-daily news discovery.
 *
 * Successor to the deleted auto-news-update.js (PR #1688), rebuilt for the
 * local scheduled-task pattern (see check-card-pages.js --phase=fetch/finish):
 * everything exact (source fetching, dedup context, schema validation, YAML
 * writing) stays in this script; the model work (triage, source verification,
 * article writing) happens in the Claude Code session between the two phases.
 * No LLM API keys are used anywhere in this script.
 *
 * Phases:
 *   --phase=fetch   Pull candidates from r/churning (News & Updates thread),
 *                   r/CreditCards (top of day), Doctor of Credit (RSS), and
 *                   Google News RSS (+ Brave web search when
 *                   BRAVE_SEARCH_API_KEY is set). Assemble the dedup context
 *                   (existing news, rejected news, items sitting in open
 *                   auto-news PRs) and write one self-contained triage prompt
 *                   to .card-news-work/triage-prompt.md.
 *
 *   (session)       Reads the triage prompt, verifies chosen stories against
 *                   primary sources, writes full news YAML (with body) to
 *                   .card-news-work/proposed/<id>.yaml.
 *
 *   --phase=finish  Validate every proposed item (schema, tags, slug
 *                   sanitization, self-source, em dashes, duplicate id/URL),
 *                   force date to today, and move survivors into data/news/.
 *
 * Publishing (branch + PR) is scripts/check-card-news-publish.sh. The branch
 * MUST start with "auto-news-" — reject-news.yml keys on that prefix to
 * record news:reject closures into data/news-rejected.yaml.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execFileSync } = require('child_process');

// Load .env from the repo root so the optional BRAVE_SEARCH_API_KEY works in
// local scheduled runs (same no-dependency pattern as auto-news-from-reddit.js).
(function loadDotenv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
})(path.join(__dirname, '..', '.env'));

const REPO_ROOT = path.join(__dirname, '..');
const WORK_DIR = path.join(REPO_ROOT, '.card-news-work');
const PROPOSED_DIR = path.join(WORK_DIR, 'proposed');
const TRIAGE_FILE = path.join(WORK_DIR, 'triage-prompt.md');
const CONTEXT_FILE = path.join(WORK_DIR, 'context.json');
const NEWS_DIR = path.join(REPO_ROOT, 'data', 'news');
const CARDS_JSON = path.join(REPO_ROOT, 'data', 'cards.json');
const REJECTED_NEWS_FILE = path.join(REPO_ROOT, 'data', 'news-rejected.yaml');

const TODAY = new Date().toISOString().slice(0, 10);

const VALID_TAGS = [
  'new-card',
  'discontinued',
  'bonus-change',
  'fee-change',
  'benefit-change',
  'limited-time',
  'policy-change',
  'rumor',
  'general',
];

// Our own properties are never a valid news source (the old pipeline once fed
// our own posts back to itself as "news").
const SELF_SOURCE_RE = /(?:^|\/\/|\.)creditodds\.com(?:[\/?#]|$)|(?:x|twitter|nitter)\.com\/creditodds(?:[\/?#]|$)/i;

const MAJOR_BANKS = [
  'Chase', 'American Express', 'Capital One', 'Citi', 'Bank of America',
  'Wells Fargo', 'Discover', 'Barclays', 'U.S. Bank',
];

// Per-source caps keep the triage prompt bounded no matter how noisy a day is.
const CAPS = {
  churningComments: 40,
  churningBodyChars: 1500,
  redditPosts: 25,
  redditBodyChars: 1200,
  docItems: 25,
  rssDescChars: 400,
  googleItemsPerQuery: 12,
  braveItemsPerQuery: 10,
  totalCandidates: 140,
};

// ── Shared loaders (same shapes as auto-news-from-reddit.js) ─────────────────

function loadExistingNews() {
  const files = fs.readdirSync(NEWS_DIR).filter((f) => /\.ya?ml$/.test(f));
  const items = [];
  for (const file of files) {
    try {
      const parsed = yaml.load(fs.readFileSync(path.join(NEWS_DIR, file), 'utf8'));
      if (parsed && parsed.id) items.push(parsed);
    } catch (err) {
      console.warn(`  Warning: could not parse ${file}: ${err.message}`);
    }
  }
  return items;
}

function loadRejectedNews() {
  try {
    if (!fs.existsSync(REJECTED_NEWS_FILE)) return [];
    const parsed = yaml.load(fs.readFileSync(REJECTED_NEWS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((n) => n && typeof n === 'object') : [];
  } catch {
    return [];
  }
}

function loadCards() {
  if (!fs.existsSync(CARDS_JSON)) {
    throw new Error('data/cards.json missing — run `npm run build:cards` first');
  }
  const data = JSON.parse(fs.readFileSync(CARDS_JSON, 'utf8'));
  return data.cards || [];
}

/**
 * Items sitting in open auto-news PRs are neither in data/news/ nor in the
 * rejected list, so without this the evening run re-proposes the morning
 * run's stories. Non-fatal: if gh is unavailable the run proceeds without it.
 */
function loadOpenPrProposals() {
  try {
    const out = execFileSync(
      'gh',
      ['pr', 'list', '--state', 'open', '--limit', '30', '--json', 'number,title,headRefName'],
      { encoding: 'utf8', cwd: REPO_ROOT }
    );
    const prs = JSON.parse(out).filter((p) => p.headRefName.startsWith('auto-news-'));
    const items = [];
    for (const pr of prs) {
      const diff = execFileSync('gh', ['pr', 'diff', String(pr.number), '--name-only'], {
        encoding: 'utf8',
        cwd: REPO_ROOT,
      });
      for (const f of diff.split('\n')) {
        const m = f.match(/^data\/news\/\d{4}-\d{2}-\d{2}-(.+)\.ya?ml$/);
        if (m) items.push({ id: m[1], pr: pr.number, prTitle: pr.title });
      }
    }
    return items;
  } catch (err) {
    console.warn(`  Warning: could not read open auto-news PRs (${err.message.split('\n')[0]})`);
    return [];
  }
}

// ── Source fetchers ──────────────────────────────────────────────────────────

function truncate(text, max) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Reddit access, mid-2026: the logged-out JSON API is login-walled (403/302
 * to /login?reason=lor2) even with a browser UA, but the RSS/Atom feeds still
 * serve — under an aggressive per-IP rate limit. So: Atom feeds only, browser
 * UA, 8s between requests, and one 61s backoff-retry on 429.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function redditRss(url, { retried = false } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/atom+xml,application/xml,text/xml,*/*' },
  });
  if (res.status === 429 && !retried) {
    console.warn(`  Reddit 429 on ${url} — backing off 61s and retrying once`);
    await sleep(61000);
    return redditRss(url, { retried: true });
  }
  if (!res.ok) throw new Error(`Reddit RSS ${url} -> ${res.status}`);
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

/** Parse a Reddit Atom feed into {title, link, content(plain text), author}. */
function parseAtom(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const e = match[1];
    const title = unescapeEntities(e.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').trim();
    const link = e.match(/<link[^>]*href="([^"]+)"/)?.[1] || '';
    const rawContent = e.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || '';
    // Content is XML-escaped HTML: unescape to HTML, strip tags, unescape again.
    const content = unescapeEntities(unescapeEntities(rawContent).replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    const author = e.match(/<name>\/?u?\/?([\s\S]*?)<\/name>/)?.[1]?.trim() || '';
    if (title || content) entries.push({ title, link: unescapeEntities(link), content, author });
  }
  return entries;
}

/** Minimal RSS <item> parser — same approach the old auto-news script used. */
function parseRss(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const pick = (tag) =>
      itemXml
        .match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1]
        ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        ?.replace(/<[^>]+>/g, ' ')
        .trim() || '';
    const title = pick('title');
    const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || '';
    if (title && link) {
      items.push({ title, url: link, description: pick('description'), pubDate: pick('pubDate') });
    }
  }
  return items;
}

function withinDays(pubDate, days) {
  if (!pubDate) return true; // keep undated items; the triage prompt enforces recency
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return true;
  return d.getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}

async function fetchChurningCandidates() {
  const listing = parseAtom(await redditRss('https://www.reddit.com/r/churning/new/.rss'));
  const threads = listing.filter((e) => /^news and updates thread\b/i.test(e.title));
  if (!threads.length) throw new Error('no "News and Updates Thread" in r/churning/new feed');

  const readThread = async (thread) => {
    await sleep(8000);
    const threadUrl = thread.link.replace(/\/$/, '');
    const entries = parseAtom(await redditRss(`${threadUrl}/.rss?sort=top&limit=100`));
    // First entry is the post itself; the rest are comments. The Atom feed
    // carries no scores, so the old score>=2 filter is gone — the triage
    // prompt is the quality gate now.
    return entries
      .slice(1)
      .filter((c) => {
        if (!c.content || c.content.length < 80) return false;
        if (/automatically|i am a bot/i.test(c.content)) return false;
        if (/a new referral thread is now live/i.test(c.content)) return false;
        if (/self[\s-]?promotion/i.test(c.content)) return false;
        return true;
      })
      .map((c) => ({
        source: 'r/churning',
        title: truncate(c.content, 120),
        text: truncate(c.content, CAPS.churningBodyChars),
        url: c.link || threadUrl,
      }));
  };

  // The newest thread is nearly empty for hours after it posts (the old JSON
  // script mined yesterday's settled thread for this reason). If it is still
  // sparse, mine the previous day's thread too.
  let candidates = await readThread(threads[0]);
  let label = `r/churning "${threads[0].title}"`;
  if (candidates.length < 5 && threads[1]) {
    candidates = candidates.concat(await readThread(threads[1]));
    label += ` + "${threads[1].title}"`;
  }

  return { label, candidates: candidates.slice(0, CAPS.churningComments) };
}

async function fetchCreditCardsSubreddit() {
  await sleep(8000); // space Reddit requests; the churning fetcher runs first
  const entries = parseAtom(await redditRss('https://www.reddit.com/r/CreditCards/top/.rss?t=day&limit=50'));
  const kept = entries
    .filter((p) => {
      const t = (p.title || '').toLowerCase();
      // RSS carries no flair or score; drop the recommendation-request noise
      // that dominates this subreddit by title shape.
      if (/which card|what card|should i (get|apply|close|cancel|keep)|help me|first credit card|recommend/i.test(t)) return false;
      return true;
    })
    .slice(0, CAPS.redditPosts);

  return {
    label: 'r/CreditCards top (day)',
    candidates: kept.map((p) => ({
      source: 'r/CreditCards',
      title: truncate(p.title, 200),
      text: truncate(p.content, CAPS.redditBodyChars),
      url: p.link,
    })),
  };
}

async function fetchDoctorOfCredit() {
  const res = await fetch('https://www.doctorofcredit.com/category/credit-cards/feed/', {
    headers: { 'User-Agent': 'CreditOdds-NewsBot/1.0' },
  });
  if (!res.ok) throw new Error(`Doctor of Credit feed -> ${res.status}`);
  const items = parseRss(await res.text())
    .filter((i) => withinDays(i.pubDate, 4))
    .slice(0, CAPS.docItems);

  return {
    label: 'Doctor of Credit (credit-cards feed)',
    candidates: items.map((i) => ({
      source: 'Doctor of Credit',
      title: i.title,
      text: truncate(i.description, CAPS.rssDescChars),
      url: i.url,
      pubDate: i.pubDate,
    })),
  };
}

async function fetchGoogleNews() {
  const now = new Date();
  const month = now.toLocaleString('default', { month: 'long' });
  const year = now.getFullYear();

  // No SUB-change query on purpose: sign-up-bonus moves are CardWire
  // territory, never news, so hunting for them only adds triage noise.
  const queries = [
    `credit card news ${month} ${year}`,
    `new credit card launch ${month} ${year}`,
    `credit card annual fee change ${month} ${year}`,
    'credit card site:nerdwallet.com',
    'credit card site:thepointsguy.com',
  ];
  const dayOfYear = Math.floor((now - new Date(year, 0, 0)) / 86400000);
  for (const offset of [0, 3, 6]) {
    queries.push(`${MAJOR_BANKS[(dayOfYear + offset) % MAJOR_BANKS.length]} credit card news`);
  }

  const candidates = [];
  const errors = [];
  for (const q of queries) {
    try {
      const params = new URLSearchParams({ q: `${q} when:7d`, hl: 'en-US', gl: 'US', ceid: 'US:en' });
      const res = await fetch(`https://news.google.com/rss/search?${params}`, {
        headers: { 'User-Agent': 'CreditOdds-NewsBot/1.0' },
      });
      if (!res.ok) throw new Error(`-> ${res.status}`);
      const items = parseRss(await res.text())
        .filter((i) => withinDays(i.pubDate, 7))
        .slice(0, CAPS.googleItemsPerQuery);
      for (const i of items) {
        candidates.push({
          source: 'Google News',
          title: i.title,
          text: truncate(i.description, CAPS.rssDescChars),
          url: i.url,
          pubDate: i.pubDate,
        });
      }
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      errors.push(`"${q}": ${err.message}`);
    }
  }
  return {
    label: `Google News RSS (${queries.length} queries${errors.length ? `, ${errors.length} failed` : ''})`,
    candidates,
  };
}

async function fetchBrave() {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return { label: 'Brave (skipped — no BRAVE_SEARCH_API_KEY)', candidates: [] };

  const queries = ['credit card news', 'new credit card launch', 'credit card benefit change'];
  const candidates = [];
  for (const q of queries) {
    try {
      const params = new URLSearchParams({ q, count: String(CAPS.braveItemsPerQuery), freshness: 'pw', text_decorations: 'false' });
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
      });
      if (!res.ok) throw new Error(`-> ${res.status}`);
      const data = await res.json();
      for (const r of data.web?.results || []) {
        candidates.push({
          source: 'Brave',
          title: r.title,
          text: truncate(r.description, CAPS.rssDescChars),
          url: r.url,
        });
      }
      await new Promise((r) => setTimeout(r, 1200));
    } catch (err) {
      console.warn(`  Warning: Brave "${q}" failed: ${err.message}`);
    }
  }
  return { label: 'Brave web search', candidates };
}

// ── Triage prompt assembly ───────────────────────────────────────────────────

function buildCardListSection(cards) {
  return cards
    .map((c) => {
      const flag = c.accepting_applications === false ? ' [not accepting applications]' : '';
      return `- ${c.name} (slug: ${c.slug}, bank: ${c.bank})${flag}`;
    })
    .join('\n');
}

function buildTriagePrompt({ candidates, cards, existingNews, rejectedNews, openPrItems }) {
  const currentMonthStart = `${TODAY.slice(0, 7)}-01`;
  const recentCutoff = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

  const thisMonth = existingNews
    .filter((n) => n.date >= currentMonthStart)
    .map((n) => `- [${n.date}] "${n.title}" (ID: ${n.id})\n  Summary: ${n.summary}`)
    .join('\n');
  const olderTitles = existingNews
    .filter((n) => n.date < currentMonthStart && n.date >= recentCutoff)
    .map((n) => `- [${n.date}] "${n.title}" (ID: ${n.id})`)
    .join('\n');
  const rejected = rejectedNews
    .slice(-50)
    .map((n) => `- [${n.date || n.date_rejected || '?'}] "${n.title || n.id}"${n.source_url ? ` (${n.source_url})` : ''}`)
    .join('\n');
  const openPr = openPrItems.map((i) => `- ${i.id} (already proposed in open PR #${i.pr})`).join('\n');

  // Google News redirect URLs run 200–600 chars each; inlining them tripled
  // the prompt's token count. Long URLs live only in candidates.json, keyed by
  // the same [N] — the session looks one up only for the story it selects.
  const numbered = candidates
    .map((c, i) => {
      const lines = [
        `[${i + 1}] (${c.source}${c.score != null ? `, score ${c.score}` : ''}${c.pubDate ? `, ${c.pubDate}` : ''}) ${c.title}`,
      ];
      lines.push(
        c.url && c.url.length <= 120
          ? `    URL: ${c.url}`
          : `    URL: (long — entry ${i + 1} in .card-news-work/candidates.json)`
      );
      if (c.externalUrl) lines.push(`    Linked URL: ${c.externalUrl}`);
      if (c.text && c.text !== c.title) lines.push(`    Text: ${c.text}`);
      return lines.join('\n');
    })
    .join('\n\n');

  return `# Card News Triage — ${TODAY}

You are a highly selective credit card news editor for CreditOdds. Identify ONLY high-impact, confirmed credit card news from the candidates below, verify it, and write it up. Most runs there is NO news worth publishing — proposing nothing is the expected outcome, not a failure. Never force a weak story.

## STRICT selection criteria (a story must meet ALL of these)
1. **High impact**: significantly affects cardholders — major fee changes, significant benefit additions/removals, card launches or discontinuations from major issuers, transfer-partner or policy changes.
2. **Confirmed**: officially announced or independently verifiable. You MUST verify every story against a primary source (issuer page, official press release) or a reliable secondary source (Doctor of Credit, The Points Guy, NerdWallet) by fetching it before writing. A story that only exists as a Reddit comment and cannot be corroborated is not publishable — unless it is high-impact and widely reported, in which case it MAY run with the \`rumor\` tag and explicit "unconfirmed" framing (use sparingly).
3. **Recent**: the underlying EVENT happened within the last 7 days. An old change covered by a new article is not news — check the event date, not the article date.
4. **Relevant to our catalog**: involves a card in the card database below, a major-issuer launch/discontinuation, or a network/issuer policy change that affects our users. Obscure cards we do not track are not news for us.
5. **Unique**: not already covered by existing news, rejected news, or an open PR (lists below) — compare topics, not just IDs.

## NEVER include
- **Sign-up bonus changes on existing cards** (elevated/reduced/returning offers, limited-time SUBs). CardWire and the weekly SUB posts cover every bonus move; a news item would duplicate them. A brand-new card LAUNCH is still news even when coverage leads with its launch bonus — the launch is the story.
- **Settlements, lawsuits, class actions, fines, or enforcement actions** where an issuer, bank, or network is the defendant or accused party — even if cardholders get payouts.
- **Political or politician-centered stories** — anything framed around a political figure, party, or administration, even if it mentions credit cards. Neutral macroeconomic data is fine only without political framing.
- "Best cards" listicles, generic advice, promotional/affiliate content, earnings reports, speculation about future changes, single-person data points ("I got approved/targeted"), manufactured-spending chatter.
- Anything sourced to creditodds.com or @creditodds — that is us.

## Card database (match card_slug exactly; [not accepting applications] cards are still valid subjects for discontinuation news)
${buildCardListSection(cards)}

## Already published this month (do NOT duplicate these topics)
${thisMonth || 'None yet this month.'}

## Published in the prior 60 days (titles)
${olderTitles || 'None.'}

## Rejected by the human reviewer (do NOT re-propose these topics, even reworded)
${rejected || 'None.'}

## Sitting in an open auto-news PR right now (do NOT re-propose)
${openPr || 'None.'}

## Candidates (${candidates.length})

${numbered}

## Your job
1. Triage the candidates against the criteria. Expect 0–2 keepers on a normal run; hard cap 3.
2. For each keeper, FETCH the best available source and verify the concrete facts (numbers, dates, which card). Candidates whose URL is marked "(long — entry N in .card-news-work/candidates.json)" have their full URL in that file — look it up only for stories you selected. Prefer official issuer pages/press releases, then Doctor of Credit / The Points Guy / NerdWallet, then Reddit as a last resort. If verification fails or facts stay fuzzy, drop the story or downgrade the claim to only what the source supports (no "increased/reduced" framing unless the change itself is confirmed).
3. Write each survivor as ONE YAML file at \`.card-news-work/proposed/<id>.yaml\` in exactly this schema:

\`\`\`yaml
id: "lowercase-hyphen-slug"            # unique, descriptive, no date prefix
date: "${TODAY}"                        # always today; the finish phase re-forces it
title: "Factual headline"               # aim for 35–47 chars (SEO budget); hard cap 200
summary: "1–3 sentences with concrete numbers/dates."   # max 500 chars
tags:                                   # 1+ of: ${VALID_TAGS.join(', ')}
  - "benefit-change"
bank: "Chase"                           # only if clearly one bank
card_slug: "chase-sapphire-preferred"   # only if it matches the database; card_slugs/card_names for multiple
card_name: "Chase Sapphire Preferred"
source: "Doctor of Credit"              # the source you verified against
source_url: "https://..."
body: |
  150–400 word markdown article. Lead with the facts: what changed, the exact
  numbers, when it takes effect. **Bold** key numbers and dates. Use ## headings
  only when there are genuinely distinct sections. No title heading, no images,
  no filler ("competitive credit card landscape"), no invented details. If the
  only confirmed facts are thin, write a SHORT article — short and factual beats
  long and fluffy.
\`\`\`

Style rules for title/summary/body: NO em dashes (—) anywhere — they read as AI copy; restructure the sentence instead. Plain factual tone. Do not reproduce sentences from source articles; write in your own words and keep any direct quote under 15 words.

If nothing qualifies, create no files — that is a successful run.
`;
}

// ── Validation (finish phase) ────────────────────────────────────────────────

function sanitizeNewsItem(item, cards) {
  const validSlugs = new Set(cards.map((c) => c.slug || c.card_id).filter(Boolean));

  if (item.card_slugs && Array.isArray(item.card_slugs)) {
    const keptIndices = [];
    item.card_slugs = item.card_slugs.filter((slug, i) => {
      const ok = validSlugs.has(slug);
      if (ok) keptIndices.push(i);
      return ok;
    });
    if (Array.isArray(item.card_names)) {
      item.card_names = keptIndices.map((i) => item.card_names[i]).filter(Boolean);
    }
    if (item.card_slugs.length === 0) {
      delete item.card_slugs;
      delete item.card_names;
    } else if (item.card_slugs.length === 1) {
      item.card_slug = item.card_slugs[0];
      if (item.card_names && item.card_names[0]) item.card_name = item.card_names[0];
      delete item.card_slugs;
      delete item.card_names;
    }
  }

  if (item.card_slug && !validSlugs.has(item.card_slug)) {
    delete item.card_slug;
    delete item.card_name;
  }

  if (typeof item.bank === 'string' && item.bank.includes(',')) {
    delete item.bank;
  }
}

function normalizeUrl(u) {
  return String(u).replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/\?.*$/, '');
}

function validateItem(item, { cards, existingIds, existingUrls, rejectedIds, rejectedUrls, openPrIds }) {
  const errors = [];
  const warnings = [];

  if (!item.id || !/^[a-z0-9-]+$/.test(item.id)) errors.push('invalid id (need lowercase-hyphen slug)');
  if (!item.title) errors.push('missing title');
  else if (item.title.length > 200) errors.push('title over 200 chars');
  else if (item.title.length > 47) warnings.push(`title is ${item.title.length} chars (SEO budget is ~47)`);
  if (!item.summary) errors.push('missing summary');
  else if (item.summary.length > 500) errors.push('summary over 500 chars');
  if (!item.tags || !Array.isArray(item.tags) || item.tags.length === 0) {
    errors.push('missing tags');
  } else {
    for (const tag of item.tags) {
      if (!VALID_TAGS.includes(tag)) errors.push(`invalid tag: ${tag}`);
    }
  }
  if (!item.body) warnings.push('no body — item will render as a summary-only card, not an article page');
  if (item.body && item.body.length > 15000) errors.push('body over 15000 chars');
  if (!item.source_url) warnings.push('no source_url');
  if (item.source_url && SELF_SOURCE_RE.test(item.source_url)) errors.push('self-sourced (creditodds)');

  for (const field of ['title', 'summary', 'body']) {
    if (item[field] && /—/.test(item[field])) errors.push(`em dash in ${field} (banned in user-facing copy)`);
  }

  sanitizeNewsItem(item, cards);
  item.date = TODAY;

  if (existingIds.has(item.id) || rejectedIds.has(item.id)) errors.push('duplicate id (existing or rejected news)');
  if (openPrIds.has(item.id)) errors.push('duplicate id (already in an open auto-news PR)');
  if (item.source_url) {
    const nu = normalizeUrl(item.source_url);
    if (existingUrls.has(nu) || rejectedUrls.has(nu)) errors.push('duplicate source_url (existing or rejected news)');
  }

  return { errors, warnings };
}

function writeNewsFile(item, outDir) {
  const filename = `${item.date}-${item.id.replace(`${item.date}-`, '')}.yaml`;
  const filepath = path.join(outDir, filename);
  if (fs.existsSync(filepath)) {
    console.log(`  Skipping ${filename} (already exists)`);
    return null;
  }
  const { body, ...rest } = item;
  let finalContent = yaml.dump(rest, { quotingType: '"', forceQuotes: true, lineWidth: -1 });
  if (body) {
    const indented = body.split('\n').map((l) => (l.trim() ? `  ${l}` : '')).join('\n');
    finalContent += `body: |\n${indented}\n`;
  }
  fs.writeFileSync(filepath, finalContent);
  console.log(`  Wrote ${filepath}`);
  return filename;
}

// ── Phases ───────────────────────────────────────────────────────────────────

async function phaseFetch() {
  console.log(`=== Card News Check — fetch phase (${TODAY}) ===\n`);

  const cards = loadCards();
  const existingNews = loadExistingNews();
  const rejectedNews = loadRejectedNews();
  const openPrItems = loadOpenPrProposals();

  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  fs.mkdirSync(PROPOSED_DIR, { recursive: true });

  const fetchers = [
    ['r/churning', fetchChurningCandidates],
    ['r/CreditCards', fetchCreditCardsSubreddit],
    ['Doctor of Credit', fetchDoctorOfCredit],
    ['Google News', fetchGoogleNews],
    ['Brave', fetchBrave],
  ];

  const all = [];
  const sourceStatus = [];
  for (const [name, fn] of fetchers) {
    try {
      const { label, candidates } = await fn();
      sourceStatus.push(`  ✓ ${label}: ${candidates.length} candidate(s)`);
      all.push(...candidates);
    } catch (err) {
      sourceStatus.push(`  ✗ ${name} FAILED: ${err.message.split('\n')[0]}`);
    }
  }
  console.log('Sources:');
  sourceStatus.forEach((s) => console.log(s));

  // Dedup by URL and by normalized headline (the same story syndicates across
  // a dozen outlets in Google News), drop self-references, cap the total.
  const seenUrls = new Set();
  const seenTitles = new Set();
  const candidates = [];
  for (const c of all) {
    const urlKey = normalizeUrl(c.url || c.title);
    // Strip a trailing " - Publisher" (Google News) before normalizing.
    const titleKey = (c.title || '')
      .replace(/\s+-\s+[^-]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .slice(0, 80);
    if (seenUrls.has(urlKey)) continue;
    if (titleKey.length > 20 && seenTitles.has(titleKey)) continue;
    if (c.url && SELF_SOURCE_RE.test(c.url)) continue;
    seenUrls.add(urlKey);
    if (titleKey.length > 20) seenTitles.add(titleKey);
    candidates.push(c);
    if (candidates.length >= CAPS.totalCandidates) break;
  }
  fs.writeFileSync(
    path.join(WORK_DIR, 'candidates.json'),
    JSON.stringify(candidates.map((c, i) => ({ n: i + 1, ...c })), null, 1)
  );

  const context = {
    generatedAt: new Date().toISOString(),
    existingIds: existingNews.map((n) => n.id),
    existingUrls: existingNews.map((n) => n.source_url).filter(Boolean).map(normalizeUrl),
    rejectedIds: rejectedNews.map((n) => n.id).filter(Boolean),
    rejectedUrls: rejectedNews.map((n) => n.source_url).filter(Boolean).map(normalizeUrl),
    openPrIds: openPrItems.map((i) => i.id),
  };
  fs.writeFileSync(CONTEXT_FILE, JSON.stringify(context, null, 2));

  const prompt = buildTriagePrompt({ candidates, cards, existingNews, rejectedNews, openPrItems });
  fs.writeFileSync(TRIAGE_FILE, prompt);

  console.log(`\nCandidates after dedup: ${candidates.length}`);
  console.log(`Triage prompt: ${path.relative(REPO_ROOT, TRIAGE_FILE)} (${(prompt.length / 1024).toFixed(0)} KB)`);
  console.log(`Write proposed items to: ${path.relative(REPO_ROOT, PROPOSED_DIR)}/<id>.yaml`);

  if (candidates.length === 0) {
    console.log('\nWARNING: zero candidates from every source — check network/blocking before treating this as a quiet news day.');
    process.exitCode = 2;
  }
}

function phaseFinish() {
  console.log(`=== Card News Check — finish phase (${TODAY}) ===\n`);

  if (!fs.existsSync(PROPOSED_DIR)) {
    console.error('No .card-news-work/proposed/ directory — run --phase=fetch first.');
    process.exit(1);
  }
  const context = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
  const cards = loadCards();
  // Re-read from disk so items merged since fetch still block duplicates.
  const existingNews = loadExistingNews();
  const ctx = {
    cards,
    existingIds: new Set([...context.existingIds, ...existingNews.map((n) => n.id)]),
    existingUrls: new Set([...context.existingUrls, ...existingNews.map((n) => n.source_url).filter(Boolean).map(normalizeUrl)]),
    rejectedIds: new Set(context.rejectedIds),
    rejectedUrls: new Set(context.rejectedUrls),
    openPrIds: new Set(context.openPrIds),
  };

  const files = fs.readdirSync(PROPOSED_DIR).filter((f) => /\.ya?ml$/.test(f));
  if (files.length === 0) {
    console.log('No proposed items — nothing to publish. (Most runs end here; that is success.)');
    return;
  }

  let passed = 0;
  let failed = 0;
  for (const file of files) {
    let item;
    try {
      item = yaml.load(fs.readFileSync(path.join(PROPOSED_DIR, file), 'utf8'));
    } catch (err) {
      console.log(`✗ ${file}: unparseable YAML (${err.message.split('\n')[0]})`);
      failed++;
      continue;
    }
    if (!item || typeof item !== 'object') {
      console.log(`✗ ${file}: empty or not a mapping`);
      failed++;
      continue;
    }
    const { errors, warnings } = validateItem(item, ctx);
    if (errors.length) {
      console.log(`✗ ${file}: ${errors.join('; ')}`);
      failed++;
      continue;
    }
    warnings.forEach((w) => console.log(`  ! ${file}: ${w}`));
    if (writeNewsFile(item, NEWS_DIR)) {
      ctx.existingIds.add(item.id); // block intra-batch duplicates too
      if (item.source_url) ctx.existingUrls.add(normalizeUrl(item.source_url));
      passed++;
    }
  }

  console.log(`\n${passed} item(s) written to data/news/, ${failed} rejected.`);
  if (failed > 0) {
    console.log('Fix the rejected files in .card-news-work/proposed/ and re-run --phase=finish, or drop them.');
  }
  if (passed === 0 && failed > 0) process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const phaseArg = process.argv.find((a) => a.startsWith('--phase='));
  const phase = phaseArg ? phaseArg.split('=')[1] : null;

  if (phase === 'fetch') return phaseFetch();
  if (phase === 'finish') return phaseFinish();

  console.error('Usage: node scripts/check-card-news.js --phase=fetch|finish');
  console.error('The triage step between the phases runs in the Claude Code session (see the card-news-local scheduled task).');
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
