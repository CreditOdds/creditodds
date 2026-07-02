/**
 * Double-judge gate. A candidate reply must clear THREE checks to be postable:
 *   1. Mechanical rules (deterministic, no LLM): length, em dash, emoji, hashtag.
 *   2. Safety judge (LLM): reuses the CreditOdds news avoid-rules verbatim.
 *   3. Quality judge (LLM): is it actually good, on-voice, and not cringe / hostile?
 *
 * Any single failure rejects the candidate. Nothing posts unless all pass.
 */

const { chatJson } = require('./llm');
const { MODELS, RAILS } = require('./config');

// --- 1. Mechanical rules (deterministic) ---------------------------------

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const CORPORATE_FILLER = [
  'great question', "we're excited", 'we are excited', 'stay tuned',
  'at creditodds we believe', 'thrilled to', 'delighted to',
];

function mechanicalCheck(text) {
  const reasons = [];
  if (text.length > 260) reasons.push('too long (>260 chars)');
  if (text.includes('—') || text.includes('–')) reasons.push('contains an em/en dash');
  const emojis = (text.match(EMOJI_RE) || []).length;
  if (emojis > 1) reasons.push(`too many emoji (${emojis})`);
  if (text.includes('#')) reasons.push('contains a hashtag');
  const lower = text.toLowerCase();
  for (const phrase of CORPORATE_FILLER) {
    if (lower.includes(phrase)) reasons.push(`corporate filler: "${phrase}"`);
  }
  return { pass: reasons.length === 0, reasons };
}

// --- 2. Safety judge (reuses the news avoid-rules) ------------------------

const SAFETY_RULES = `
NEVER-ALLOW rules for a reply from the @creditodds brand account. Reject a
candidate only if it actually trips one of these:

1. Lawsuits, settlements, class actions, regulatory fines, or enforcement actions
   involving ANY credit card issuer, bank, or network (Visa/Mastercard/Amex/Discover).
   We partner with these companies. Reject even if consumers benefit.

2. Anything political or partisan: politicians, parties, administrations, elections,
   campaign framing, or partisan critique. Neutral macro data (rates, inflation,
   consumer debt) is fine ONLY as neutral data with no political framing.

3. Layoffs, data breaches, deaths, tragedies, or any genuinely sensitive human event.

4. Punching DOWN, narrowly defined: mocking an identifiable person's personal debt,
   financial hardship, or misfortune. This does NOT include general commentary about
   the market or about typical consumer behavior.

5. Genuinely hostile or insulting language, or a reply that clearly wants to start a
   real fight (name-calling, contempt). Sharp disagreement and light ribbing are FINE.

6. A reply directed AT an issuer's own account that is not friendly. Applies ONLY when
   the reply is to an issuer account.

## EXPLICITLY ALLOWED (do NOT reject these — they are the core product):
- Discussing approval odds, denial rates, credit scores, and how hard a card is to get.
  Saying "plenty of 720s get denied" is our PRODUCT, not punching down.
- Saying people overestimate how much they'll use perks/credits, or won't break even.
  This is normal, allowed market commentary.
- Disagreeing with, correcting, or gently ribbing a COMPETITOR/blog (that is who this
  reply is to unless stated otherwise). Critiquing a card's value in that reply is fine.
- Break-even math, fee-worth-it verdicts, and "the honest version of this list" jokes.

The reply below is to a COMPETITOR or a regular user, never to an issuer, unless the
author is explicitly an issuer. Judge accordingly.
`.trim();

async function safetyJudge(tweet, candidateText) {
  const result = await chatJson({
    model: MODELS.judgeSafety,
    temperature: 0,
    maxTokens: 200,
    messages: [
      {
        role: 'system',
        content: `You are a brand-safety reviewer for @creditodds on X. Reject a reply
only if it genuinely trips a NEVER-ALLOW rule. Do NOT reject normal, on-brand credit
card commentary. The account's whole value is candid talk about approval odds and card
value, so that content is allowed. Reserve rejection for real risks: legal/partisan/
sensitive topics, hostility, or mocking a specific person's hardship.

${SAFETY_RULES}

The account being replied to is @${tweet.author}, tier: ${tweet.tier}.`,
      },
      {
        role: 'user',
        content: `The original tweet being replied to (by @${tweet.author}):
"${tweet.text}"

The proposed reply:
"${candidateText}"

Judge BOTH the topic being engaged and the reply text. Return JSON:
{"safe": true|false, "reason": "<short reason>"}`,
      },
    ],
  });
  return { pass: result.safe === true, reason: result.reason || '' };
}

// --- 3. Quality judge -----------------------------------------------------

async function qualityJudge(tweet, candidateText) {
  const result = await chatJson({
    model: MODELS.judgeQuality,
    temperature: 0,
    maxTokens: 220,
    messages: [
      {
        role: 'system',
        content: `You judge whether a reply is good enough to post from @creditodds,
the data-backed-underdog credit card account. A good reply is short, sounds like a
sharp human (not a brand), is genuinely funny OR genuinely useful, and never cringe,
try-hard, or hostile. It must not invent a fake statistic. Be a tough critic: most
mediocre replies should score below 7.`,
      },
      {
        role: 'user',
        content: `Original tweet (@${tweet.author}): "${tweet.text}"
Proposed reply: "${candidateText}"

Return JSON:
{"score": <0-10>, "onVoice": true|false, "cringe": true|false,
 "hostile": true|false, "inventedStat": true|false, "reason": "<short>"}`,
      },
    ],
  });
  const pass =
    typeof result.score === 'number' &&
    result.score >= 7 &&
    result.onVoice === true &&
    result.cringe !== true &&
    result.hostile !== true &&
    result.inventedStat !== true;
  return { pass, score: result.score, reason: result.reason || '', raw: result };
}

// --- Orchestrated gate ----------------------------------------------------

async function judgeCandidate(tweet, candidateText) {
  const mech = mechanicalCheck(candidateText);
  if (!mech.pass) {
    return { pass: false, stage: 'mechanical', detail: mech.reasons.join('; ') };
  }
  const safety = await safetyJudge(tweet, candidateText);
  if (!safety.pass) {
    return { pass: false, stage: 'safety', detail: safety.reason };
  }
  const quality = await qualityJudge(tweet, candidateText);
  if (!quality.pass && RAILS.requireBothJudgePasses) {
    return { pass: false, stage: 'quality', detail: quality.reason, score: quality.score };
  }
  return { pass: true, stage: 'passed', score: quality.score, detail: quality.reason };
}

module.exports = { judgeCandidate, mechanicalCheck, safetyJudge, qualityJudge };
