/**
 * Dedup: don't cover a topic we've already covered. Checks the proposed topic
 * against existing articles (data/articles), recent news (data/news), and the
 * agent's own covered-topics ledger, using a cheap semantic match.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { chatJson } = require('../x-agent/llm');
const { MODELS } = require('./config');

const REPO = path.join(__dirname, '..', '..');

function loadYamlTitles(dir) {
  const out = [];
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  } catch {
    return out;
  }
  for (const f of files) {
    try {
      const doc = yaml.load(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (doc && (doc.title || doc.slug)) out.push({ title: doc.title || doc.slug, slug: doc.slug || f });
    } catch {
      // ignore unparseable file
    }
  }
  return out;
}

/** Existing coverage: article titles + recent news titles. */
function loadExistingCoverage() {
  const articles = loadYamlTitles(path.join(REPO, 'data', 'articles'));
  const drafts = loadYamlTitles(path.join(REPO, 'data', 'articles', 'drafts'));
  const news = loadYamlTitles(path.join(REPO, 'data', 'news'));
  return { articles: [...articles, ...drafts], news };
}

/**
 * @returns {Promise<{duplicate: boolean, matched: string|null}>}
 */
async function checkDuplicate(topic, claim, coveredTopics = []) {
  const { articles, news } = loadExistingCoverage();
  const existing = [
    ...articles.map((a) => `ARTICLE: ${a.title}`),
    ...news.map((n) => `NEWS: ${n.title}`),
    ...coveredTopics.map((t) => `RECENT: ${t}`),
  ];
  if (!existing.length) return { duplicate: false, matched: null };

  const result = await chatJson({
    model: MODELS.dedup,
    temperature: 0,
    maxTokens: 200,
    messages: [
      {
        role: 'system',
        content: `You decide whether a proposed credit-card topic is ALREADY COVERED by
existing content. It is a duplicate ONLY if BOTH the SAME card/program AND the SAME
type of development match. Be strict:
- Different card (e.g. Sapphire Preferred vs Sapphire Reserve) = NOT a duplicate.
- Same card but a different change (a sign-up bonus change vs an annual-fee change vs a
  benefit change) = NOT a duplicate.
- A different angle on the exact same event (same card + same change) = duplicate.
When unsure, answer duplicate:false.`,
      },
      {
        role: 'user',
        content: `Proposed topic: "${topic}"
Claim: "${claim}"

Existing coverage:
${existing.join('\n')}

Return JSON: {"duplicate": true|false, "matched": "<the existing title, or null>"}`,
      },
    ],
  });
  return { duplicate: result.duplicate === true, matched: result.matched || null };
}

module.exports = { checkDuplicate, loadExistingCoverage };
