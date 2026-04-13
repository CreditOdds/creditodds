#!/usr/bin/env node

/**
 * Auto News From Reddit
 *
 * Pulls candidate news items from the most recent r/churning
 * "News and Updates Thread - <date>" post, validates each against a first-party
 * source (either a URL cited in the comment, or a Brave/Web search the script
 * performs), and writes surviving items to data/news/ (or a preview dir in
 * --dry-run mode).
 *
 * Flags:
 *   --dry-run              Write YAML to /tmp/news-preview-<date>/ instead of data/news/
 *   --thread-id <id>       Use a specific Reddit post id instead of today's thread
 *   --max-items <n>        Cap on surviving items to write (default 5)
 *   --min-score <n>        Drop comments with score below this (default 2)
 *
 * Env:
 *   ANTHROPIC_API_KEY      Required
 *   BRAVE_SEARCH_API_KEY   Optional — enables tier-B corroboration via Brave web search
 *   REDDIT_USER_AGENT      Optional — custom UA for Reddit fetches
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { fetchChurningThread } = require('./fetch-churning-thread');

const NEWS_DIR = path.join(__dirname, '..', 'data', 'news');
const CARDS_JSON = path.join(__dirname, '..', 'data', 'cards.json');
const REJECTED_NEWS_FILE = path.join(__dirname, '..', 'data', 'news-rejected.yaml');

const VALID_TAGS = [
  'new-card',
  'discontinued',
  'bonus-change',
  'fee-change',
  'benefit-change',
  'limited-time',
  'policy-change',
  'general',
];

const TODAY = new Date().toISOString().slice(0, 10);

// ── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dryRun: false, threadId: null, maxItems: 5, minScore: 2 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--thread-id') opts.threadId = args[++i];
    else if (args[i] === '--max-items') opts.maxItems = parseInt(args[++i], 10);
    else if (args[i] === '--min-score') opts.minScore = parseInt(args[++i], 10);
  }
  return opts;
}

// ── Helpers shared with auto-news-update.js ─────────────────────────────────

function loadExistingNews() {
  try {
    const files = fs.readdirSync(NEWS_DIR).filter((f) => f.endsWith('.yaml'));
    const items = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(NEWS_DIR, file), 'utf8');
        const parsed = yaml.load(content);
        if (parsed && parsed.id) items.push(parsed);
      } catch (err) {
        console.warn(`  Warning: could not parse ${file}: ${err.message}`);
      }
    }
    return items;
  } catch {
    return [];
  }
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
  try {
    const data = JSON.parse(fs.readFileSync(CARDS_JSON, 'utf8'));
    return data.cards || [];
  } catch {
    return [];
  }
}

function validateNewsItem(item) {
  const errors = [];
  if (!item.id || !/^[a-z0-9-]+$/.test(item.id)) errors.push('invalid id');
  if (!item.title || item.title.length > 200) errors.push('invalid title');
  if (!item.summary || item.summary.length > 500) errors.push('invalid summary');
  if (!item.tags || !Array.isArray(item.tags) || item.tags.length === 0) {
    errors.push('missing tags');
  } else {
    for (const tag of item.tags) {
      if (!VALID_TAGS.includes(tag)) errors.push(`invalid tag: ${tag}`);
    }
  }
  item.date = TODAY;
  return errors;
}

function writeNewsFile(item, outDir) {
  const filename = `${item.date}-${item.id.replace(`${item.date}-`, '')}.yaml`;
  const filepath = path.join(outDir, filename);
  if (fs.existsSync(filepath)) {
    console.log(`  Skipping ${filename} (already exists in ${outDir})`);
    return null;
  }
  const { body, ...rest } = item;
  let finalContent = yaml.dump(rest, { quotingType: '"', forceQuotes: true, lineWidth: -1 });
  if (body) {
    const indented = body.split('\n').map((l) => `  ${l}`).join('\n');
    finalContent += `body: |\n${indented}\n`;
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(filepath, finalContent);
  console.log(`  Wrote ${filepath}`);
  return filename;
}

// ── Claude wrapper ───────────────────────────────────────────────────────────

async function callClaude(prompt, { maxTokens = 4096, model = 'claude-haiku-4-5-20251001' } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content[0]?.text || '';
}

// ── Comment filtering ────────────────────────────────────────────────────────

function filterComments(comments, { minScore }) {
  const topLevel = comments.filter((c) => c.depth === 0);
  return topLevel.filter((c) => {
    if (!c.body || c.body.length < 80) return false;
    if (c.score < minScore) return false;
    // Drop bot posts
    if (/automatically|i am a bot/i.test(c.body)) return false;
    // Drop moderator referral-thread announcements
    if (/^\s*a new referral thread is now live/i.test(c.body)) return false;
    // Drop obvious self-promo / "I built a thing"
    if (/self[\s-]?promotion/i.test(c.body)) return false;
    return true;
  });
}

// ── Tier 1: extract candidate news items from comments ───────────────────────

async function extractCandidatesFromComments(thread, comments) {
  const numbered = comments
    .map((c, i) => {
      return `[${i + 1}] score=${c.score} permalink=${c.permalink}\n${c.body}`;
    })
    .join('\n\n---\n\n');

  const prompt = `You are extracting credit-card news from the r/churning daily "News and Updates Thread".

Source thread: ${thread.threadUrl}
Source date: ${TODAY}

Below are top-level comments from today's thread. Your job is to identify which of them describe GENUINELY NEWSWORTHY credit-card news that would be valuable to a broad US credit-card consumer audience.

## NEWSWORTHY items (include)
- New card launches, relaunches, or discontinuations
- Sign-up bonus changes (elevated offer, reduced offer, public→targeted)
- Annual fee changes
- Benefit changes (lounge access, credits added/removed)
- Transfer partner changes, rate changes
- Policy changes (referral caps, application rules, approval logic)
- Time-limited offers that are broadly useful (expires in >=3 days, publicly available)

## NOT NEWSWORTHY (skip)
- Single-person data points ("I got approved for X", "I got a targeted offer")
- General questions, speculation, or subjective opinions
- Off-topic discussion, subreddit drama
- Self-promotion, tools, spreadsheets
- Manufactured spending chatter
- Anything that only applies to one user's situation

## COMMENTS TO ANALYZE

${numbered}

## OUTPUT FORMAT

Output a JSON array. For each newsworthy candidate, include:
{
  "comment_index": <the [N] number above>,
  "claim": "<one-sentence factual summary of the news, as stated in the comment>",
  "external_url": "<the most authoritative external URL cited in the comment, or null if none>",
  "bank": "<bank name if clearly stated, else null>",
  "card_hint": "<card name if one is named, else null>"
}

Return ONLY the JSON array, no prose. If nothing is newsworthy, return [].`;

  const raw = await callClaude(prompt, { maxTokens: 2000 });
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    console.warn(`  Warning: could not parse candidates JSON: ${err.message}`);
    return [];
  }
}

// ── Tier A verification: verify a linked URL confirms the claim ─────────────

async function fetchUrlText(url, { maxChars = 12000 } = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'creditodds-news-bot/0.1 (+https://creditodds.com)' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const text = await res.text();
    // Strip HTML tags crudely; Claude is robust to messy input
    return text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxChars);
  } catch {
    return null;
  }
}

const FIRST_PARTY_HINTS = [
  'americanexpress.com', 'chase.com', 'capitalone.com', 'citi.com', 'citicards.com',
  'bankofamerica.com', 'wellsfargo.com', 'discover.com', 'usbank.com', 'barclaycardus.com',
  'barclays.com', 'synchrony.com', 'cardkey.com', 'robinhood.com', 'apple.com',
  'delta.com', 'united.com', 'aa.com', 'southwest.com', 'alaskaair.com', 'jetblue.com',
  'ihg.com', 'marriott.com', 'hilton.com', 'hyatt.com', 'wyndhamhotels.com',
  'press.aboutamazon.com', 'prnewswire.com', 'businesswire.com', 'sec.gov',
  'singaporeair.com', 'krisflyer.com',
];

function isFirstParty(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return FIRST_PARTY_HINTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

async function verifyWithUrl(claim, url) {
  const pageText = await fetchUrlText(url);
  if (!pageText) return { verified: false, reason: `could not fetch ${url}` };

  const prompt = `You are verifying a credit-card news claim against a source page.

CLAIM: "${claim}"

SOURCE URL: ${url}
FIRST-PARTY (issuer / official press)? ${isFirstParty(url) ? 'yes' : 'no — this is a third-party page'}

SOURCE PAGE TEXT (truncated):
${pageText}

Does the page substantively CONFIRM the claim? Answer in exactly this format on one line:
VERIFIED — <brief reason>
UNVERIFIED — <brief reason>`;

  const res = await callClaude(prompt, { maxTokens: 200 });
  const line = res.trim().split('\n')[0] || '';
  if (/^VERIFIED/i.test(line)) {
    return { verified: true, reason: line.replace(/^VERIFIED\s*[—-]?\s*/i, '') };
  }
  return { verified: false, reason: line.replace(/^UNVERIFIED\s*[—-]?\s*/i, '') || 'claude marked unverified' };
}

// ── Tier B verification: discover a source via Brave web search ──────────────

async function braveSearch(query, { count = 10 } = {}) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.web?.results || []).map((r) => ({ url: r.url, title: r.title, description: r.description }));
}

async function searchAndVerify(claim, hint) {
  const query = `${claim}${hint ? ' ' + hint : ''}`;
  const results = await braveSearch(query, { count: 12 });
  if (!results.length) return { verified: false, reason: 'no search results (Brave key missing or empty)' };

  // Prefer first-party hits
  const firstParty = results.filter((r) => isFirstParty(r.url));
  const ordered = [...firstParty, ...results.filter((r) => !firstParty.includes(r))];

  for (const r of ordered.slice(0, 4)) {
    const verdict = await verifyWithUrl(claim, r.url);
    if (verdict.verified) {
      return { verified: true, reason: verdict.reason, sourceUrl: r.url, sourceTitle: r.title };
    }
  }
  return { verified: false, reason: 'no searched source confirmed the claim' };
}

// ── Tier 2: turn a verified claim into a full news YAML ──────────────────────

async function generateNewsYaml({ claim, comment, verification, cards }) {
  const cardList = cards
    .slice(0, 120)
    .map((c) => `- ${c.name || c.card_name} (slug: ${c.slug || c.card_id})`)
    .join('\n');

  const verifiedSourceLine = verification.sourceUrl
    ? `Verified against: ${verification.sourceUrl} (${verification.sourceTitle || 'searched'})`
    : `Verified against: ${verification.sourceUrl || 'the comment\'s own linked URL'}`;

  const prompt = `You are turning a verified credit-card news claim into a structured news item.

## CLAIM
${claim}

## SOURCE COMMENT (r/churning)
Permalink: ${comment.permalink}
Body:
${comment.body}

## VERIFICATION
${verifiedSourceLine}
Verifier said: ${verification.reason}

## CARD DATABASE (match slugs exactly if the news affects a known card)
${cardList}

## VALID TAGS
${VALID_TAGS.join(', ')}

## OUTPUT
Return ONE YAML block inside \`\`\`yaml ... \`\`\`. Fields:
- id: lowercase-hyphen slug, unique, descriptive (no date prefix)
- title: <=200 chars, factual
- summary: 1–3 sentences with concrete numbers/dates, <=500 chars
- tags: 1+ from the valid list
- bank: if clearly one bank
- card_slug OR card_slugs (use card_slugs only if multiple cards apply)
- card_name OR card_names (must match slugs, same order)
- source: "r/churning"
- source_url: the comment permalink
- body: 150–400 word markdown article. Lead with the facts. Use **bold** for key numbers/dates. No title heading. No filler. If you only know what the comment says, write a SHORT article.

Do NOT invent details. If a field is uncertain, omit it.`;

  const raw = await callClaude(prompt, { maxTokens: 2500 });
  const match = raw.match(/```yaml\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = yaml.load(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    console.warn(`  Warning: could not parse generated YAML: ${err.message}`);
    return null;
  }
}

// ── Semantic duplicate check (same pattern as auto-news-update.js) ──────────

async function checkDuplicate(candidate, existing) {
  const list = existing.map((n) => `- [${n.id}] "${n.title}" — ${n.summary}`).join('\n');
  const prompt = `Is the CANDIDATE a duplicate of any EXISTING news (same underlying story)?

CANDIDATE:
Title: "${candidate.title}"
Summary: "${candidate.summary}"

EXISTING:
${list || 'None'}

Reply on one line:
DUPLICATE:<id> — if duplicate
UNIQUE — otherwise`;

  const res = await callClaude(prompt, { maxTokens: 50 });
  const line = (res || '').trim();
  if (line.startsWith('DUPLICATE:')) {
    return { isDuplicate: true, matchedId: line.replace('DUPLICATE:', '').trim() };
  }
  return { isDuplicate: false };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is required');
    process.exit(1);
  }

  console.log('=== Auto News From Reddit ===');
  console.log(`Mode: ${opts.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Today: ${TODAY}`);

  // 1. Fetch thread
  const thread = opts.threadId
    ? await fetchSpecificThread(opts.threadId)
    : await fetchChurningThread();
  console.log(`\nThread: ${thread.threadTitle}`);
  console.log(`URL:    ${thread.threadUrl}`);
  console.log(`Comments fetched: ${thread.comments.length}`);

  // 2. Filter comments
  const filtered = filterComments(thread.comments, { minScore: opts.minScore });
  console.log(`After filtering (score>=${opts.minScore}, not bot/promo): ${filtered.length}`);
  if (!filtered.length) {
    console.log('No comments passed the filter. Exiting.');
    return;
  }

  // 3. Extract candidates
  console.log('\nExtracting candidates via Claude...');
  const candidates = await extractCandidatesFromComments(thread, filtered);
  console.log(`Claude identified ${candidates.length} candidate(s)\n`);
  if (!candidates.length) {
    console.log('No candidates. Exiting.');
    return;
  }

  // 4. Verify each candidate
  const existing = [...loadExistingNews(), ...loadRejectedNews()];
  const cards = loadCards();
  const survivors = [];
  const skipped = [];

  for (const cand of candidates) {
    const comment = filtered[cand.comment_index - 1];
    if (!comment) {
      skipped.push({ ...cand, reason: 'comment_index out of range' });
      continue;
    }
    console.log(`— Candidate: ${cand.claim.slice(0, 120)}`);

    let verification;
    if (cand.external_url) {
      console.log(`  Tier A: verifying against cited URL ${cand.external_url}`);
      verification = await verifyWithUrl(cand.claim, cand.external_url);
      if (verification.verified) verification.sourceUrl = cand.external_url;
    } else {
      console.log(`  Tier B: no cited URL — searching for corroboration`);
      verification = await searchAndVerify(cand.claim, cand.card_hint || cand.bank);
    }

    if (!verification.verified) {
      console.log(`  ✗ UNVERIFIED — ${verification.reason}`);
      skipped.push({ ...cand, reason: verification.reason });
      continue;
    }
    console.log(`  ✓ VERIFIED via ${verification.sourceUrl} — ${verification.reason}`);

    const yamlItem = await generateNewsYaml({ claim: cand.claim, comment, verification, cards });
    if (!yamlItem) {
      skipped.push({ ...cand, reason: 'YAML generation failed' });
      continue;
    }

    const errors = validateNewsItem(yamlItem);
    if (errors.length) {
      console.log(`  ✗ validation errors: ${errors.join(', ')}`);
      skipped.push({ ...cand, reason: `validation: ${errors.join(', ')}` });
      continue;
    }

    // Dedup
    if (existing.some((e) => e.id === yamlItem.id)) {
      console.log(`  ✗ duplicate id`);
      skipped.push({ ...cand, reason: 'duplicate id' });
      continue;
    }
    const semantic = await checkDuplicate(yamlItem, existing);
    if (semantic.isDuplicate) {
      console.log(`  ✗ semantic duplicate of ${semantic.matchedId}`);
      skipped.push({ ...cand, reason: `duplicate of ${semantic.matchedId}` });
      continue;
    }

    survivors.push(yamlItem);
    if (survivors.length >= opts.maxItems) break;
  }

  // 5. Write files
  const outDir = opts.dryRun
    ? path.join('/tmp', `news-preview-${TODAY}`)
    : NEWS_DIR;

  console.log(`\n=== Survivors: ${survivors.length} ===`);
  for (const item of survivors) writeNewsFile(item, outDir);

  // Write skipped log in dry-run mode
  if (opts.dryRun) {
    const logPath = path.join(outDir, '_skipped.json');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify({ thread: thread.threadUrl, skipped }, null, 2));
    console.log(`\nSkipped log: ${logPath}`);
  }

  console.log(`\n=== Done ===`);
  console.log(`Wrote ${survivors.length} file(s) to ${outDir}`);
  console.log(`Dropped ${skipped.length} candidate(s).`);
}

async function fetchSpecificThread(id) {
  // Reuse the shared OAuth/proxy-aware helper from fetch-churning-thread.js.
  const { _redditJson } = require('./fetch-churning-thread');
  const j = await _redditJson(`/r/churning/comments/${id}.json?limit=500&raw_json=1`);
  const post = j[0].data.children[0].data;
  const flat = [];
  const walk = (children, depth = 0, parentId = null) => {
    for (const ch of children || []) {
      if (ch.kind !== 't1') continue;
      const c = ch.data;
      if (!c?.body) continue;
      flat.push({
        id: c.id, parentId, depth, author: c.author, body: c.body,
        score: c.score ?? 0, createdUtc: c.created_utc,
        permalink: `https://www.reddit.com${c.permalink}`,
      });
      const replies = c.replies?.data?.children;
      if (replies && depth < 1) walk(replies, depth + 1, c.id);
    }
  };
  walk(j[1].data.children);
  return {
    threadId: id,
    threadTitle: post.title,
    threadUrl: `https://www.reddit.com${post.permalink}`,
    threadCreatedUtc: post.created_utc,
    comments: flat,
  };
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
