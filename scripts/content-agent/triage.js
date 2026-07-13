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

WHAT WE MOST WANT TO COVER — durable CARD NEWS. Prioritize these; they are the point:
- A card being discontinued, shut down, killed off, or closed to new applicants.
- A new card launching, or a major refresh/relaunch of an existing card.
- Material changes to a card's ongoing benefits, earning/rewards structure, or annual fee.
- Major loyalty-program devaluations, award-chart changes, or transfer-partner changes
  (IN SCOPE — cardholders care about the points/miles ecosystem too).

WHAT WE WANT MUCH LESS OF — deprioritize hard:
- Limited-time / promotional sign-up bonus offers, elevated-offer alerts, and short-lived
  deals. These are NOT our focus. Default them to "skip". Only rescue one to "tweet" if it
  is genuinely exceptional AND broadly relevant (e.g. a record-high offer on a mainstream
  card), and even then keep it rare. A routine "bonus is up to X for a limited time" is skip.
- Small perks, single data points, one-off anecdotes.

decision:
- "tweet": a real, publishable development from the CARD NEWS list above (discontinuation,
  new card, benefit/rewards/fee change, major devaluation/transfer change). This becomes a
  published news page, so the bar is genuine notability — not a promo, not trivia.
- "article": reserved for broad, long-form explainer or roundup topics we would write as a
  full article. Use sparingly. For a concrete single development, prefer "tweet" over
  "article" so it actually gets published.
- "skip": not card/points relevant, off-brand, on the never-act list, OR a limited-time /
  promotional offer that isn't exceptional.

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
