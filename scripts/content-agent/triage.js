/**
 * Triage: classify a competitor tweet into skip / tweet / article, and extract
 * the underlying topic + factual claim to investigate. Reuses the CreditOdds
 * news avoid-rules so sensitive/off-brand topics are dropped up front.
 */

const { chatJson } = require('../x-agent/llm');
const { MODELS } = require('./config');

const AVOID_RULES = `
NEVER act on (decision must be "skip"):
- Lawsuits, settlements, class actions, regulatory fines, or enforcement actions
  involving any card issuer, bank, or network. We partner with these companies.
- Anything political or partisan (politicians, parties, elections, administrations).
- Layoffs, data breaches, deaths, tragedies, or sensitive human events.
- Pure affiliate/referral spam, giveaways, or a competitor promoting their own product.
- Personal anecdotes with no generalizable card development.
`.trim();

async function triage(tweet) {
  const result = await chatJson({
    model: MODELS.triage,
    temperature: 0,
    maxTokens: 350,
    messages: [
      {
        role: 'system',
        content: `You are an editor for CreditOdds, a data-driven credit card site. You
watch competitor accounts to spot card developments worth covering with our OWN
original content. Classify each tweet.

CreditOdds covers credit cards AND the surrounding points/miles ecosystem that card
holders care about: transfer partners, and airline/hotel loyalty program changes
(especially DEVALUATIONS and award-chart changes) are IN SCOPE — treat them as tweet
or article material, not skip.

decision:
- "article": a substantial, evergreen development where we can add real value (new card
  launch, meaningful sign-up bonus change, benefit/earning change, an award-program
  DEVALUATION, transfer-partner change, major policy/rule change). Medium bar: genuinely
  notable, not trivial.
- "tweet": timely and notable but thin (a limited-time offer, a small perk, a smaller
  devaluation, a single data point) — worth an original post but not a full article.
- "skip": not card/points relevant, off-brand, or on the never-act list.

${AVOID_RULES}

Extract the underlying TOPIC (short, generic, e.g. "Amex Gold 2026 refresh") and the
specific factual CLAIM to verify (one sentence).`,
      },
      {
        role: 'user',
        content: `Tweet by @${tweet.author}:
"${tweet.text}"

Return JSON:
{"decision":"skip|tweet|article","topic":"<short>","claim":"<one sentence>","reason":"<short>"}`,
      },
    ],
  });
  return {
    decision: ['skip', 'tweet', 'article'].includes(result.decision) ? result.decision : 'skip',
    topic: result.topic || '',
    claim: result.claim || '',
    reason: result.reason || '',
  };
}

module.exports = { triage };
