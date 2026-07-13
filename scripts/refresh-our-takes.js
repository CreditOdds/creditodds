#!/usr/bin/env node
'use strict';

/**
 * refresh-our-takes.js
 *
 * Regenerates the `our_take` editorial paragraph for every card in
 * data/cards/*.yaml using an OpenAI writer model. Runs twice a month (1st &
 * 15th, a few hours after the Best-pages re-rank) via
 * .github/workflows/refresh-our-takes.yml, which commits any changed takes
 * straight to main and then dispatches Build and Deploy Cards to push the new
 * cards.json to the CDN.
 *
 * For each card the writer is given everything we know about it:
 *   - the full card YAML (rewards, APR/intro offers, signup bonus, benefits,
 *     fees, tags, category)
 *   - recent CardWire changes for that card, so a take can note a move such as
 *     "recently trimmed from 24 to 21 months"
 *   - which /best pages currently feature the card, at what rank and badge
 *
 * House style is pinned in the prompt: no em dashes, one paragraph, lead with
 * the single strongest reason to carry the card, name the catch honestly, no
 * clickbait. The two hand-written takes (US Bank Shield, Wells Fargo Reflect)
 * ride along as few-shot voice exemplars.
 *
 * The whole card set is regenerated every run, but a file is only rewritten
 * when the take actually changed, so byte-identical output never churns the
 * diff.
 *
 * Env:
 *   OPENAI_API_KEY     (required)
 *   OPENAI_TAKE_MODEL  (optional, default: gpt-4o)
 *   CARD_WIRE_URL      (optional, default: CloudFront /card-wire endpoint)
 *   WIRE_WINDOW_DAYS   (optional, default: 120)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const CARDS_DIR = path.join(__dirname, '..', 'data', 'cards');
const BEST_FILE = path.join(__dirname, '..', 'data', 'best.json');

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_TAKE_MODEL || 'gpt-4o';
const CARD_WIRE_URL =
  process.env.CARD_WIRE_URL || 'https://d2ojrhbh2dincr.cloudfront.net/card-wire';
const WIRE_WINDOW_DAYS = Number(process.env.WIRE_WINDOW_DAYS || 120);
const WIRE_FETCH_LIMIT = 500;

// gpt-4o rate limits are tight, so keep concurrency low and let the request
// spacing + Retry-After handling below do the real pacing. Both overridable.
const CONCURRENCY = Number(process.env.OUR_TAKE_CONCURRENCY || 2);
const REQUEST_SPACING_MS = Number(process.env.OUR_TAKE_SPACING_MS || 350);
const WRAP_WIDTH = 76; // content columns; a 2-space indent lands near the 78 the YAML files use
const MIN_TAKE_LENGTH = 60; // guard against a truncated / empty generation

// Preview mode: generate every take but write NOTHING back to the YAML. Instead
// dump the results to our-takes-dryrun.json and print a few samples, so a run
// can be reviewed before any take goes live. Set OUR_TAKE_DRY_RUN=1.
const DRY_RUN = process.env.OUR_TAKE_DRY_RUN === '1';
const DRY_RUN_FILE = path.join(__dirname, '..', 'our-takes-dryrun.json');

// Cap the number of cards processed (0 = all). Handy for a quick sample preview.
const LIMIT = Number(process.env.OUR_TAKE_LIMIT || 0);

// CardWire stores raw field keys; translate to something the writer reads cleanly.
const WIRE_FIELD_LABELS = {
  accepting_applications: 'Accepting new applications',
  annual_fee: 'Annual fee',
  signup_bonus_value: 'Signup bonus value',
  apr_min: 'Regular APR (low end)',
  apr_max: 'Regular APR (high end)',
  intro_apr_purchase_months: 'Intro 0% APR on purchases (months)',
  intro_apr_bt_months: 'Intro 0% APR on balance transfers (months)',
};

const SYSTEM_PROMPT = `You are the senior credit-card editor for CreditOdds. You write the "Our take" paragraph shown on each card's detail page: a short, honest, plain-English verdict that helps a reader decide whether the card belongs in their wallet.

Voice and rules:
- One paragraph, roughly 4 to 6 sentences.
- Lead with the single strongest reason to carry the card, then name the real catch or tradeoff honestly.
- Plain text only: no markdown, no headings, no lists, no links, no surrounding quotes.
- NEVER use em dashes or en dashes. Use commas, colons, or separate sentences instead. This is a hard rule.
- No hype or clickbait ("game-changer", "must-have", "insane value"). Stay measured and specific.
- Anchor claims in the actual numbers from the card data (earn rates, intro APR length, annual fee, signup bonus) rather than vague praise.
- If the recent-changes list shows a material move (an intro APR window or signup bonus that just dropped or rose, a fee change, or the card no longer accepting applications), work it in naturally, e.g. "recently trimmed from 24 to 21 months".
- If the card tops a Best-of list, you may note that once and naturally, but never force it.
- Do not invent benefits, credits, categories, or numbers that are not in the data.

Return ONLY a JSON object of the exact shape {"our_take": "<the paragraph>"}.

Two examples of the target voice:

Example A (US Bank Shield):
"U.S. Bank recently trimmed the Shield's 0% intro APR from 24 months to 21, but even after the cut it remains one of the longest runways on the market, covering both purchases and balance transfers with no annual fee. That still makes it a strong pick if you're paying down existing debt or financing a large purchase over the next year and a half. The catch is the rewards are thin: outside of 4% cash back on prepaid travel booked through the U.S. Bank Travel Center, there's no everyday earn rate, so once the intro period ends the card has little reason to stay in your wallet. Treat the $20 annual statement credit and cell phone protection as minor extras."

Example B (Wells Fargo Reflect):
"The Reflect is a pure balance-transfer play: 21 months of 0% intro APR on purchases and qualifying balance transfers, with no annual fee. That long runway makes it a solid choice if your only goal is to pay down existing debt or float a big purchase interest-free for nearly two years. Just be clear-eyed about the tradeoff: this card earns no rewards at all, so there's no cash back or points to keep it relevant once the intro period ends. Cell phone protection when you pay your bill with the card is the lone ongoing perk. Open it for the 0% window, run your payoff plan, and don't expect a reason to keep using it after that."`;

// ─── helpers ──────────────────────────────────────────────────────────────

function normalizeName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeText(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Global request-start spacing so a pool of workers doesn't fire a burst that
// trips the rate limit on the very first round.
let nextSlot = 0;
async function rateGate(spacingMs) {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + spacingMs;
  if (wait > 0) await sleep(wait);
}

let loggedRetryReason = false;

async function fetchWithRetry(url, options = {}, { maxRetries = 6, baseDelay = 2000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status >= 500) {
        // Peek at the body to tell a transient rate limit apart from a terminal
        // quota/billing error, which no amount of retrying will fix.
        let snippet = '';
        try {
          snippet = (await res.clone().text()).slice(0, 300);
        } catch {
          /* body unreadable; treat as transient */
        }
        const terminal = /insufficient_quota|exceeded your current quota|billing_hard_limit|account_deactivated/i.test(snippet);
        if (terminal) {
          console.error(`Non-retryable ${res.status}: ${snippet}`);
          return res; // let the caller throw with the real message; don't burn retries
        }
        if (attempt < maxRetries) {
          if (!loggedRetryReason) {
            loggedRetryReason = true;
            console.warn(`  Rate limited (${res.status}); backing off and retrying. First body: ${snippet.slice(0, 160)}`);
          }
          const retryAfter = Number(res.headers.get('retry-after'));
          const wait =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000 + 250
              : Math.min(baseDelay * Math.pow(2, attempt), 20000);
          await sleep(wait + Math.floor(Math.random() * 500)); // jitter to desync workers
          continue;
        }
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt >= maxRetries) throw lastErr;
      await sleep(Math.min(baseDelay * Math.pow(2, attempt), 20000));
    }
  }
  throw lastErr || new Error('fetchWithRetry: retries exhausted');
}

async function mapPool(items, concurrency, fn) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
}

// Fold a take into a `>` block scalar, word-wrapped and 2-space indented to
// match the surrounding YAML.
function formatOurTakeBlock(text) {
  const words = normalizeText(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length > WRAP_WIDTH) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return ['our_take: >', ...lines.map(l => `  ${l}`)];
}

// Replace the existing our_take block in the raw YAML text, or insert one after
// apply_link when the card has none. Everything else stays byte-identical, so
// diffs stay tight.
function upsertOurTake(raw, newText) {
  const lines = raw.split('\n');
  const block = formatOurTakeBlock(newText);
  const idx = lines.findIndex(l => /^our_take\s*:/.test(l));

  if (idx !== -1) {
    // Consume the existing block: the key line plus every indented body line.
    let end = idx + 1;
    while (end < lines.length && /^\s+\S/.test(lines[end])) end++;
    lines.splice(idx, end - idx, ...block);
    return lines.join('\n');
  }

  const applyIdx = lines.findIndex(l => /^apply_link\s*:/.test(l));
  let insertAt = applyIdx !== -1 ? applyIdx + 1 : lines.length;
  // Don't slip the block below a trailing blank line at EOF.
  if (insertAt >= lines.length && lines[lines.length - 1] === '') {
    insertAt = lines.length - 1;
  }
  lines.splice(insertAt, 0, ...block);
  return lines.join('\n');
}

// ─── external data: CardWire + Best-of ──────────────────────────────────────

async function loadWireChanges() {
  const byCard = new Map(); // normalizedName -> [change rows within the window]
  try {
    const url = `${CARD_WIRE_URL}?limit=${WIRE_FETCH_LIMIT}&_=${Date.now()}`;
    const res = await fetchWithRetry(url);
    if (!res.ok) throw new Error(`card-wire ${res.status}`);
    const { changes = [] } = await res.json();
    const cutoff = Date.now() - WIRE_WINDOW_DAYS * 86400000;
    for (const change of changes) {
      if (new Date(change.changed_at).getTime() < cutoff) continue;
      const key = normalizeName(change.card_name);
      if (!byCard.has(key)) byCard.set(key, []);
      byCard.get(key).push(change);
    }
    console.log(
      `CardWire: ${changes.length} rows fetched, ${byCard.size} cards changed in the last ${WIRE_WINDOW_DAYS} days.`
    );
    if (changes.length >= WIRE_FETCH_LIMIT) {
      console.warn(`  Warning: hit the ${WIRE_FETCH_LIMIT}-row fetch cap; the oldest changes may be missing.`);
    }
  } catch (err) {
    console.warn(`Warning: could not load CardWire changes (${err.message}). Proceeding without change history.`);
  }
  return byCard;
}

function loadFeaturedIn() {
  const bySlug = new Map(); // slug -> [{ title, rank, badge }]
  if (!fs.existsSync(BEST_FILE)) {
    console.warn('Warning: data/best.json not found; skipping Best-of enrichment.');
    return bySlug;
  }
  try {
    const best = JSON.parse(fs.readFileSync(BEST_FILE, 'utf8'));
    for (const page of best.pages || []) {
      (page.cards || []).forEach((card, i) => {
        if (!card.slug) return;
        if (!bySlug.has(card.slug)) bySlug.set(card.slug, []);
        bySlug.get(card.slug).push({ title: page.title, rank: i + 1, badge: card.badge || null });
      });
    }
    console.log(`Best-of: ${bySlug.size} cards featured across ${(best.pages || []).length} pages.`);
  } catch (err) {
    console.warn(`Warning: could not parse best.json (${err.message}).`);
  }
  return bySlug;
}

// ─── prompt + generation ─────────────────────────────────────────────────────

function buildUserPrompt(card, wire, featured) {
  const { our_take, ...rest } = card;
  const cardYaml = yaml.dump(rest, { lineWidth: 100 }).trim();

  let wireBlock;
  if (!wire.length) {
    wireBlock = `None in the last ${WIRE_WINDOW_DAYS} days.`;
  } else {
    wireBlock = wire
      .slice()
      .sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at))
      .map(c => {
        const label = WIRE_FIELD_LABELS[c.field] || c.field;
        const unit = c.unit ? ` ${c.unit}` : '';
        const date = new Date(c.changed_at).toISOString().slice(0, 10);
        return `- ${label}: ${c.old_value} -> ${c.new_value}${unit} (changed ${date})`;
      })
      .join('\n');
  }

  const featBlock = featured.length
    ? featured
        .map(f => `- ${f.title}: ranked #${f.rank}${f.badge ? `, badge "${f.badge}"` : ''}`)
        .join('\n')
    : 'Not currently featured on any Best-of list.';

  return [
    'Write the "Our take" paragraph for this card.',
    '',
    'CARD DATA (YAML):',
    cardYaml,
    '',
    `RECENT CHANGES (last ${WIRE_WINDOW_DAYS} days, from CardWire):`,
    wireBlock,
    '',
    'FEATURED IN (current Best-of lists):',
    featBlock,
  ].join('\n');
}

async function generateTake(prompt) {
  await rateGate(REQUEST_SPACING_MS);
  const res = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 600,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);

  let take = normalizeText(parsed.our_take || '');
  // Defensive: strip any em/en dashes the model slips in, since they are a hard
  // house-style violation in user-facing copy.
  take = take.replace(/\s*[—–]\s*/g, ', ');
  return take;
}

// ─── main ─────────────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    console.error('OPENAI_API_KEY is required.');
    process.exit(1);
  }

  const [wireByName, featuredBySlug] = [await loadWireChanges(), loadFeaturedIn()];

  const cards = fs
    .readdirSync(CARDS_DIR)
    .filter(f => f.endsWith('.yaml'))
    .map(file => {
      const filepath = path.join(CARDS_DIR, file);
      const raw = fs.readFileSync(filepath, 'utf8');
      let data;
      try {
        data = yaml.load(raw);
      } catch (err) {
        console.error(`Skip ${file}: YAML parse error (${err.message}).`);
        return null;
      }
      if (!data || !data.name) {
        console.error(`Skip ${file}: no card name.`);
        return null;
      }
      return { file, filepath, raw, data };
    })
    .filter(Boolean);

  const queue = LIMIT > 0 ? cards.slice(0, LIMIT) : cards;
  const total = queue.length;

  console.log(
    `\nRegenerating our_take for ${total}${LIMIT > 0 ? ` of ${cards.length}` : ''} cards with ${MODEL}${DRY_RUN ? ' (dry run, no writes)' : ''}...\n`
  );

  let changed = 0;
  let unchanged = 0;
  let failed = 0;
  let processed = 0;
  const previews = [];

  await mapPool(queue, CONCURRENCY, async card => {
    const wire = wireByName.get(normalizeName(card.data.name)) || [];
    const featured = featuredBySlug.get(card.data.slug) || [];
    const prompt = buildUserPrompt(card.data, wire, featured);

    let take;
    try {
      take = await generateTake(prompt);
    } catch (err) {
      console.error(`  [${++processed}/${total}] FAIL ${card.data.name}: ${err.message}`);
      failed++;
      return;
    }

    if (!take || take.length < MIN_TAKE_LENGTH) {
      console.error(`  [${++processed}/${total}] FAIL ${card.data.name}: empty or too-short take.`);
      failed++;
      return;
    }

    const isChanged = normalizeText(take) !== normalizeText(card.data.our_take);
    console.log(`  [${++processed}/${total}] ${isChanged ? 'CHANGED ' : 'same    '} ${card.data.name}`);

    if (DRY_RUN) {
      previews.push({
        slug: card.data.slug,
        name: card.data.name,
        changed: isChanged,
        old_take: card.data.our_take || null,
        new_take: take,
      });
      isChanged ? changed++ : unchanged++;
      return;
    }

    if (!isChanged) {
      unchanged++;
      return;
    }

    fs.writeFileSync(card.filepath, upsertOurTake(card.raw, take));
    changed++;
  });

  console.log(
    `\nDone. ${changed} ${DRY_RUN ? 'would change' : 'updated'}, ${unchanged} unchanged, ${failed} failed (${total} total).`
  );

  if (DRY_RUN) {
    previews.sort((a, b) => a.name.localeCompare(b.name));
    fs.writeFileSync(DRY_RUN_FILE, JSON.stringify(previews, null, 2));
    console.log(`\n[dry run] Wrote ${previews.length} takes to ${DRY_RUN_FILE}. No YAML modified.`);

    const samples = previews.filter(p => p.changed).slice(0, 8);
    console.log(`\n===== SAMPLE TAKES (${samples.length} of ${changed} changed) =====`);
    for (const s of samples) {
      console.log(`\n### ${s.name} (${s.slug})`);
      console.log(s.new_take);
    }
    console.log('\n===== END SAMPLES =====');
  }

  // A large failure rate usually means a bad key or a rate-limit wall; don't
  // ship a half-refreshed batch. In dry run we still want the artifact, so we
  // report but never hard-fail.
  if (!DRY_RUN && failed > cards.length / 2) {
    console.error('More than half the cards failed to generate; failing the run.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  normalizeName,
  normalizeText,
  formatOurTakeBlock,
  upsertOurTake,
  buildUserPrompt,
  loadFeaturedIn,
};
