# CreditOdds X Reply Agent

An autonomous reply agent for @creditodds on X. It watches a tight list of
competitor / credit-card-culture accounts, drafts replies in the CreditOdds voice
(data-backed underdog), runs every draft through a double-judge safety+quality gate,
and posts the survivors under conservative rate limits.

**Status: brain built + demoed. Live plumbing (monitor/post/state/cron) is next.**

## How it works

```
monitor → filter → generate → judge (mechanical + safety + quality) → rails → post
```

- **generate.js** — writes N candidate replies per tweet from `persona.md` + few-shot.
  Never invents statistics: hard numbers must come from real supplied data.
- **judge.js** — three gates, any failure rejects:
  1. mechanical (deterministic): length, em dash, emoji count, hashtag, filler.
  2. safety (LLM): reuses the news avoid-rules — no legal/partisan/sensitive topics,
     no punching down, no hostility. Blocks the dangerous stuff cold.
  3. quality (LLM): tough critic, must score >= 7, on-voice, not cringe/hostile.
- **config.js** — targets, rails (rate limits), models, mode, kill switch.
- **persona.md** — the locked voice. Edit voice here, not in code.

## Safety design (why an autonomous agent on the brand account is OK)

- Default mode is `shadow` — nothing posts unless `X_AGENT_MODE=live` is explicitly set.
- Issuers (Amex/Chase/Cap One/Discover) are WATCH-ONLY in the trial; never auto-replied to.
- Rate rails: <=12 replies/day, >=20 min apart, <=1 per account/day, active hours only.
- Kill switch: `X_AGENT_KILL=1` halts everything.
- Novelty guard blocks near-duplicate replies (the #1 bot tell).

## Run the voice demo (no X credentials needed)

Only needs `OPENAI_API_KEY`. Runs the real generator + judge against sample tweets
and prints what the agent would say, without posting anything:

```bash
node scripts/x-agent/demo.js
```

## Still to build (next)

- `twitter.js` — X search/recent monitor + reply posting (twitter-api-v2, existing keys).
- `state.js` — S3-backed persistence (seen tweet IDs, posted log, per-account cooldowns).
- `run.js` — orchestrator honoring shadow/live mode + all rails.
- `digest.js` — daily summary of what posted + engagement.
- `.github/workflows/x-agent.yml` — hourly cron (shadow first, then live for the trial).
