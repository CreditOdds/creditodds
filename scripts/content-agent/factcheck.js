/**
 * Fact-check a claim before we ever publish/tweet it. Competitors are the SIGNAL,
 * never the source of truth: we search the open web, and a claim only earns a high
 * verdict if it's corroborated by a first-party / primary source (issuer's own site),
 * not just a blog echoing the same rumor.
 */

const { chatJson } = require('../x-agent/llm');
const { braveSearch, isPrimarySource } = require('./search');
const { MODELS } = require('./config');

async function factCheck(topic, claim) {
  // Two searches: the claim itself, and the claim scoped to primary sources.
  let results = [];
  try {
    const a = await braveSearch(claim, { count: 8, freshness: 'pm' }); // past month
    const b = await braveSearch(`${topic} official`, { count: 5 });
    results = [...a, ...b];
  } catch (err) {
    return { verdict: 'unverified', confidence: 0, primarySource: false, sources: [], notes: `search failed: ${err.message}` };
  }

  // De-dup by URL and tag primary sources.
  const seen = new Set();
  const evidence = [];
  for (const r of results) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    evidence.push({ ...r, primary: isPrimarySource(r.url) });
  }
  const hasPrimary = evidence.some((e) => e.primary);

  const verdict = await chatJson({
    model: MODELS.factcheck,
    temperature: 0,
    maxTokens: 500,
    messages: [
      {
        role: 'system',
        content: `You are a rigorous fact-checker for CreditOdds. Assess whether a claim
about a credit card is TRUE, using the search evidence. Weight FIRST-PARTY / primary
sources (the issuer's own website, marked primary:true) far above blogs and forums.
Blogs can be wrong, lag, or misreport limited-time offers. If the only support is
blogs echoing each other, confidence must stay moderate at best. If nothing
corroborates it, say so. Be conservative — a wrong published fact damages the brand.`,
      },
      {
        role: 'user',
        content: `Claim: "${claim}"
Topic: "${topic}"
Primary source present in evidence: ${hasPrimary}

Evidence:
${evidence.map((e, i) => `[${i + 1}]${e.primary ? ' (PRIMARY)' : ''} ${e.title} — ${e.url}\n   ${e.description}`).join('\n')}

Return JSON:
{"verdict":"verified|partly|unverified|false",
 "confidence":<0.0-1.0>,
 "primarySource":${hasPrimary},
 "sourceIndexes":[<indexes of the evidence items that actually support the claim>],
 "notes":"<one or two sentences>"}`,
      },
    ],
  });

  const idxs = Array.isArray(verdict.sourceIndexes) ? verdict.sourceIndexes : [];
  const sources = idxs
    .map((i) => evidence[i - 1])
    .filter(Boolean)
    .map((e) => ({ title: e.title, url: e.url, primary: e.primary }));

  return {
    verdict: verdict.verdict || 'unverified',
    confidence: typeof verdict.confidence === 'number' ? verdict.confidence : 0,
    primarySource: hasPrimary,
    sources,
    notes: verdict.notes || '',
  };
}

module.exports = { factCheck };
