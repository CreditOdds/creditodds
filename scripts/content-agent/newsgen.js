/**
 * Generate a CreditOdds news item (data/news YAML) from a fact-checked signal.
 * This replaces the old naked-tweet path: every medium-size development becomes
 * a published news page, and build-news.yml handles the site publish, hero
 * image, and the social post that links to it.
 *
 * Output matches the existing news format exactly (see data/news/*.yaml and
 * writeNewsFile in auto-news-update.js): id, date, title, summary, tags,
 * card_slugs/card_names, source, source_url, body (literal block scalar).
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { chatJson } = require('../x-agent/llm');
const { MODELS } = require('./config');

const NEWS_DIR = path.join(__dirname, '..', '..', 'data', 'news');
const CARDS_PATH = path.join(__dirname, '..', '..', 'data', 'cards.json');

const VALID_TAGS = ['bonus-change', 'benefit-change', 'policy-change', 'new-card', 'limited-time', 'discontinued', 'general'];

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/** Map LLM-proposed card names to real slugs from cards.json (exact-ish match only). */
function resolveCards(proposedNames) {
  let cards = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(CARDS_PATH, 'utf8'));
    cards = Array.isArray(parsed) ? parsed : parsed.cards || [];
  } catch {
    return { card_slugs: [], card_names: [] };
  }
  const bySlug = new Map();
  for (const name of proposedNames || []) {
    const needle = String(name).toLowerCase();
    const hit = cards.find((c) => {
      const cn = String(c.card_name || '').toLowerCase();
      return cn === needle || cn.includes(needle) || needle.includes(cn);
    });
    if (hit && hit.card_id) bySlug.set(hit.card_id, hit.card_name);
  }
  return { card_slugs: [...bySlug.keys()], card_names: [...bySlug.values()] };
}

async function generateNewsItem(item, today) {
  const primary = item.factcheck.sources.find((s) => s.primary) || item.factcheck.sources[0] || {};
  const sourcesContext = item.factcheck.sources
    .map((s, i) => `[${i + 1}]${s.primary ? ' (primary)' : ''} ${s.title}\nURL: ${s.url}`)
    .join('\n');

  const result = await chatJson({
    model: MODELS.factcheck, // publishes with no human review; use the strong model
    temperature: 0.4,
    maxTokens: 1600,
    messages: [
      {
        role: 'system',
        content: `You write short news items for CreditOdds, a data-driven credit card site.
This item auto-publishes with no human review, so factual discipline is absolute:
every fact must come from the verified claim and fact-check notes below. Do NOT
invent numbers, dates, terms, or eligibility rules.

Body style (150-350 words, markdown):
- Get straight to the facts: what the offer/change is, the exact numbers, when it
  ends or takes effect.
- ALWAYS include a concrete "how to act" — where the reader finds/activates the
  offer (e.g. "the Amex Offers section of your account"), only if the mechanism is
  stated in the sources or is standard, well-known behavior for that program.
- **Bold** key numbers and dates. ## headings only if genuinely needed.
- No title heading, no images, no filler ("competitive landscape", "what this means
  for cardholders"), no speculation. Short and factual beats long and fluffy.

Title: plain and specific, like "New Amex Offer: $200 Back on Delta Vacations".
Summary: 1-2 sentences, the concrete terms.`,
      },
      {
        role: 'user',
        content: `Development: ${item.topic}
Verified claim: ${item.claim}
Fact-check notes: ${item.factcheck.notes}
Sources:
${sourcesContext}

Return JSON:
{"title":"<title>","summary":"<1-2 sentences>",
 "tags":["<one or two of: ${VALID_TAGS.join(', ')}>"],
 "card_names":["<official card names this applies to, only if confidently known>"],
 "body":"<markdown body>"}`,
      },
    ],
  });

  const tags = (result.tags || []).filter((t) => VALID_TAGS.includes(t));
  const { card_slugs, card_names } = resolveCards(result.card_names);
  const id = slugify(result.title || item.topic);

  return {
    id,
    date: today,
    title: result.title || item.topic,
    summary: result.summary || item.claim,
    tags: tags.length ? tags : ['general'],
    ...(card_slugs.length ? { card_slugs, card_names } : {}),
    source: primary.title ? primary.title.split(/[|–-]/)[0].trim() : 'Issuer announcement',
    source_url: primary.url || '',
    body: result.body || '',
  };
}

/** Write the news YAML exactly like auto-news-update.js does (body as literal block). */
function writeNewsYaml(item) {
  const filename = `${item.date}-${item.id}.yaml`;
  const filepath = path.join(NEWS_DIR, filename);
  if (fs.existsSync(filepath)) throw new Error(`news file already exists: ${filename}`);

  const { body, ...rest } = item;
  let content = yaml.dump(rest, { quotingType: '"', forceQuotes: true, lineWidth: -1 });
  if (body) {
    const indented = body.split('\n').map((l) => `  ${l}`).join('\n');
    content += `body: |\n${indented}\n`;
  }
  fs.writeFileSync(filepath, content);
  return { filename, filepath: path.relative(path.join(__dirname, '..', '..'), filepath) };
}

module.exports = { generateNewsItem, writeNewsYaml };
