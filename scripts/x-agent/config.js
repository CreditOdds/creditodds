/**
 * Configuration for the CreditOdds X reply agent.
 *
 * Everything tunable about who we watch, how often we reply, and how the
 * safety rails behave lives here. Change behavior here, not scattered in code.
 */

// --- Operating mode -------------------------------------------------------
// 'shadow' = monitor + generate + judge + log, but DO NOT post anything.
// 'live'   = actually post approved replies to X.
// Default is shadow. Flip to 'live' only via the X_AGENT_MODE env var so a
// stray default can never post to the brand account.
const MODE = process.env.X_AGENT_MODE === 'live' ? 'live' : 'shadow';

// --- Target accounts ------------------------------------------------------
// tier: 'competitor' accounts are eligible for auto-replies in the trial.
//       'issuer' accounts are WATCH-ONLY in the trial (never auto-replied to).
// Kept deliberately tight because the Basic API tier makes reads the scarce
// resource. Quality of targets over quantity.
const TARGETS = [
  // Competitors / blogs — auto-reply eligible. All handles verified real & active.
  { handle: 'thepointsguy', tier: 'competitor' },
  { handle: 'nerdwallet', tier: 'competitor' },
  { handle: 'onemileatatime', tier: 'competitor' },
  { handle: 'milestomemories', tier: 'competitor' },
  { handle: 'frugalflyer', tier: 'competitor' },
  { handle: 'upgradedpoints', tier: 'competitor' },
  { handle: 'drofcredit', tier: 'competitor' },
  { handle: 'godsavethepoint', tier: 'competitor' },

  // Issuers — WATCH ONLY in the trial. Never auto-replied to.
  { handle: 'AmericanExpress', tier: 'issuer' },
  { handle: 'Chase', tier: 'issuer' },
  { handle: 'CapitalOne', tier: 'issuer' },
  { handle: 'Discover', tier: 'issuer' },
];

// Which tiers may receive an auto-reply. Issuers are intentionally excluded
// for the trial (asymmetric downside: C&Ds, affiliate relationships).
const REPLYABLE_TIERS = ['competitor'];

// --- Rails (safety + rate discipline) ------------------------------------
// These limits are what keep the account off X's spam radar. Conservative on
// purpose. Loosen only after the trial proves the voice.
const RAILS = {
  // Hard daily ceiling on posted replies.
  maxRepliesPerDay: 12,
  // Minimum minutes between two posted replies (spacing looks human).
  minMinutesBetweenReplies: 20,
  // At most one reply to any single target account per day.
  maxRepliesPerAccountPerDay: 1,
  // Only consider tweets newer than this (a reply to a stale tweet is pointless
  // and reads as a bot trawling history).
  maxTweetAgeMinutes: 90,
  // Only operate during these ET hours (inclusive start, exclusive end).
  // Keeps us out of the overnight window and conserves the read budget.
  activeHoursET: { start: 8, end: 23 },
  // Both judge passes must clear a candidate before it can post.
  requireBothJudgePasses: true,
  // Reject a candidate if it is too similar to any of the last N posted replies
  // (novelty guard — repetition is the #1 bot tell). 0..1, higher = stricter.
  noveltySimilarityThreshold: 0.8,
  noveltyHistorySize: 40,
};

// --- Models ---------------------------------------------------------------
// Generation quality matters for voice, so use the stronger model there.
// The safety judge also uses the stronger model. The quality judge can use mini.
const MODELS = {
  generate: 'gpt-4o',
  judgeSafety: 'gpt-4o',
  judgeQuality: 'gpt-4o-mini',
};

// How many candidate replies to generate per eligible tweet.
const CANDIDATES_PER_TWEET = 3;

// Kill switch: if this env var is set to '1'/'true', the agent halts before
// doing anything. A one-flag emergency stop.
const KILL_SWITCH = ['1', 'true', 'yes'].includes(
  String(process.env.X_AGENT_KILL || '').toLowerCase()
);

// Force flag: bypass the active-hours gate for this run. Set by manual dispatch
// so an operator can trigger an off-hours run on demand. Scheduled runs leave it
// unset and keep respecting active hours.
const FORCE = ['1', 'true', 'yes'].includes(
  String(process.env.X_AGENT_FORCE || '').toLowerCase()
);

module.exports = {
  MODE,
  TARGETS,
  REPLYABLE_TIERS,
  RAILS,
  MODELS,
  CANDIDATES_PER_TWEET,
  KILL_SWITCH,
  FORCE,
};
