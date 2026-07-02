/**
 * Configuration for the CreditOdds content-intelligence agent.
 *
 * Watches competitor accounts and turns notable card developments into our OWN
 * articles/tweets (original posts — compliant with X's no-programmatic-replies
 * policy). Phase 1 runs in shadow: it triages, dedups, and fact-checks, and
 * reports to Slack, but posts/publishes nothing.
 */

const { TARGETS, REPLYABLE_TIERS } = require('../x-agent/config');

// Phase gate. 'shadow' = decide + fact-check + report only (never posts/publishes).
// 'live' is introduced in Phase 2/3; Phase 1 ignores it for any posting.
const MODE = process.env.CONTENT_AGENT_MODE === 'live' ? 'live' : 'shadow';

// The competitor accounts to monitor (reuse the verified x-agent target list).
const MONITOR_HANDLES = TARGETS
  .filter((t) => REPLYABLE_TIERS.includes(t.tier))
  .map((t) => t.handle);

const RAILS = {
  maxTweetsPerRun: 12,        // bound LLM cost per hourly run
  maxTweetAgeMinutes: 720,    // ignore stale backlog (12h)
  maxArticlesPerDay: 3,
  maxTweetsPerDay: 8,
  // Fact-check gates (used by Phase 2/3 to decide auto-post/publish).
  minTweetConfidence: 0.7,    // don't tweet a claim below this confidence
  minArticleConfidence: 0.8,  // auto-publish an article only above this
  requirePrimarySourceForArticle: true, // article needs first-party corroboration
};

const MODELS = {
  triage: 'gpt-4o-mini',
  dedup: 'gpt-4o-mini',
  factcheck: 'gpt-4o',   // stronger model for the truth gate
  editor: 'gpt-4o',      // adversarial article verifier (Phase 3)
};

const KILL_SWITCH = ['1', 'true', 'yes'].includes(
  String(process.env.CONTENT_AGENT_KILL || '').toLowerCase()
);

// Ignore saved state and re-scan (manual dispatch, for testing).
const RESET = ['1', 'true', 'yes'].includes(
  String(process.env.CONTENT_AGENT_RESET || '').toLowerCase()
);

module.exports = { MODE, MONITOR_HANDLES, RAILS, MODELS, KILL_SWITCH, RESET };
