/**
 * Generate an original @creditodds tweet from a fact-checked item, then gate it
 * with the mechanical rules + a safety/quality judge. These are ORIGINAL posts
 * (never replies/quotes/@mentions — X blocks those programmatically and
 * unsolicited @mentions are restricted), so the generator is told: no @handles.
 */

const { chat, chatJson } = require('../x-agent/llm');
const { mechanicalCheck } = require('../x-agent/judge');
const { MODELS } = require('./config');

async function generateTweet(item) {
  const src = item.factcheck.sources.find((s) => s.primary) || item.factcheck.sources[0];
  const raw = await chat({
    model: MODELS.factcheck, // stronger model; these go out with no human review
    temperature: 0.8,
    maxTokens: 300,
    json: true,
    messages: [
      {
        role: 'system',
        content: `You write original tweets for @creditodds, the data-driven credit card
site. Voice: sharp human, not a corporate account. Direct, punchy, a little wry.
Rules (hard):
- Max 240 characters.
- ONLY state facts consistent with the verified claim and fact-check notes below.
  Never embellish numbers or add details that are not in the claim.
- Do NOT @mention any account and do NOT use hashtags.
- No em dashes. 0-1 emoji. No corporate filler ("exciting news", "stay tuned").
- Frame it as OUR report of the development, optionally with a practical take
  (who benefits, what to check). Do not credit or reference other blogs/accounts.`,
      },
      {
        role: 'user',
        content: `Development: ${item.topic}
Verified claim: ${item.claim}
Fact-check notes: ${item.factcheck.notes}
${src ? `Primary basis: ${src.title}` : ''}

Return JSON: {"tweet":"<the tweet text>"}`,
      },
    ],
  });
  const parsed = JSON.parse(raw);
  return (parsed.tweet || '').trim();
}

async function judgeTweet(item, text) {
  const mech = mechanicalCheck(text);
  if (!mech.pass) return { pass: false, stage: 'mechanical', detail: mech.reasons.join('; ') };
  if (/@\w+/.test(text)) return { pass: false, stage: 'mechanical', detail: 'contains an @mention (not allowed in API posts)' };

  const v = await chatJson({
    model: MODELS.factcheck,
    temperature: 0,
    maxTokens: 250,
    messages: [
      {
        role: 'system',
        content: `You review an original tweet for the @creditodds brand account before it
auto-posts with no human review. Fail it if it: states anything beyond the verified
claim; touches legal/political/sensitive topics; is hostile or mocks anyone; sounds
corporate or spammy; or is factually fuzzy. Score quality 0-10 (7+ = postable).`,
      },
      {
        role: 'user',
        content: `Verified claim: "${item.claim}"
Fact-check notes: "${item.factcheck.notes}"
Proposed tweet: "${text}"

Return JSON: {"pass": true|false, "score": <0-10>, "reason": "<short>"}`,
      },
    ],
  });
  const pass = v.pass === true && typeof v.score === 'number' && v.score >= 7;
  return { pass, stage: pass ? 'passed' : 'quality', score: v.score, detail: v.reason || '' };
}

module.exports = { generateTweet, judgeTweet };
