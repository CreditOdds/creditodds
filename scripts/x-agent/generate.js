/**
 * Reply generator. Given a target tweet, produces N candidate replies in the
 * locked CreditOdds voice, using the persona doc as the system prompt.
 *
 * IMPORTANT: the generator never invents statistics. If an odds/data flex is
 * warranted, it may reference the kind of data CreditOdds has in general terms,
 * but any hard number must come from `context.dataPoint` (supplied by the caller
 * from real data) — otherwise the reply uses a non-data register.
 */

const fs = require('fs');
const path = require('path');
const { chat } = require('./llm');
const { MODELS, CANDIDATES_PER_TWEET } = require('./config');

const PERSONA = fs.readFileSync(path.join(__dirname, 'persona.md'), 'utf8');

// Few-shot examples steer register and length. Kept in the code (not persona.md)
// so we can tune them without touching the human-facing voice doc.
const FEW_SHOT = `
Examples of good replies (study the length, tone, and how data lands):

TWEET (@thepointsguy): "The Amex Gold is the best card for foodies, period."
REPLY: "great card, but 'best for foodies' assumes you get in. plenty of 700s with
thin files get denied for the gold. worth checking your odds before you fall in love."

TWEET (@nerdwallet): "5 cards with no annual fee you should consider in 2026"
REPLY: "the honest version of this list is 2 cards and 3 you'll forget you have by march."

TWEET (@onemileatatime): "Is the Venture X still worth it after the changes?"
REPLY: "for anyone who actually uses the $300 travel credit, yes, easily. for everyone
who 'means to,' it's a $395 membership to a lounge they visit once. we ran both cases."

TWEET (@milestomemories): "What's the easiest premium card to get approved for?"
REPLY: "depends entirely on your profile, which is the answer nobody wants. our approval
data says the ranking flips hard based on recent inquiries. happy to point you to it."
`.trim();

function buildSystemPrompt() {
  return `You are the reply-writer for @creditodds on X. Your entire voice is defined
by the persona document below. Follow it exactly.

${PERSONA}

${FEW_SHOT}`;
}

function buildUserPrompt(tweet, context) {
  const dataLine = context && context.dataPoint
    ? `\nReal data you MAY use (only if it fits naturally; do not force it):\n"${context.dataPoint}"`
    : `\nNo specific verified statistic is available for this one. Do NOT invent a
number. Use the witty or helpful register instead, or a soft data reference without
a made-up figure.`;

  return `Write ${CANDIDATES_PER_TWEET} distinct candidate replies to this tweet.
Vary the register across them (aim for a mix of data-flex, witty one-liner, and
helpful-with-a-wink where appropriate).

TWEET by @${tweet.author} (${tweet.tier}):
"${tweet.text}"
${dataLine}

Return ONLY a JSON object of the exact shape:
{"candidates": [{"register": "data-flex|witty|helpful", "text": "..."}, ...]}
Each "text" must obey every rule in the persona (no em dashes, <= 1 emoji, no
hashtags, short). Do not include a URL unless it genuinely adds value.`;
}

async function generateCandidates(tweet, context = {}) {
  const raw = await chat({
    model: MODELS.generate,
    temperature: 0.85,
    maxTokens: 500,
    json: true,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(tweet, context) },
    ],
  });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Generator returned non-JSON: ${raw.slice(0, 200)}`);
  }
  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  return candidates
    .filter((c) => c && typeof c.text === 'string' && c.text.trim())
    .map((c) => ({ register: c.register || 'unknown', text: c.text.trim() }));
}

module.exports = { generateCandidates, buildSystemPrompt };
