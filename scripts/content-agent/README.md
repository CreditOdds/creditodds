# CreditOdds Content-Intelligence Agent

Watches competitor accounts and turns notable card/points developments into **our own**
original articles and tweets. Compliant with X's no-programmatic-replies policy — it
only creates original content, never replies.

**Status: Phase 1 (shadow) built.** Decides + fact-checks + reports to Slack; posts and
publishes nothing.

## Pipeline (hourly)

```
monitor competitors -> triage -> dedup -> fact-check -> (Phase 1: report to Slack)
```

- **monitor** — reuses `x-agent/twitter.searchRecent` over the 20 competitor accounts.
- **triage.js** — LLM classifies each tweet: `article` / `tweet` / `skip`, extracts the
  topic + the factual claim. Applies the news avoid-rules (no legal/political/sensitive).
- **dedup.js** — checks the topic against existing `data/articles`, `data/news`, and the
  covered-topics ledger. Strict: same card + same change = duplicate; otherwise not.
- **factcheck.js** — searches the web (Brave) and grades the claim, weighting first-party
  issuer sources far above blogs. Competitors are the signal, never the source of truth.
- **run.js** — orchestrates; Phase 1 reports each candidate + its fact-check to Slack.

## Gates (used by Phase 2/3 to decide auto-post/publish)

- Tweet: fact-check confidence >= `minTweetConfidence` (0.7) and verdict verified/partly.
- Article: confidence >= `minArticleConfidence` (0.8) AND a primary source corroborates.
- Anything below the bar is HELD, not published.

## Run the brain locally (no Twitter/Slack needed)

Needs `OPENAI_API_KEY` + `BRAVE_SEARCH_API_KEY`:

```bash
node scripts/content-agent/demo.js
```

## Phases

- **Phase 1 (this):** shadow — triage + dedup + fact-check, Slack report only.
- **Phase 2:** auto-post the fact-checked, gated tweets (original posts) via
  `queue-social.js` -> social-posting-service.
- **Phase 3:** auto-publish high-confidence, adversarially-verified article drafts;
  `build-articles.yml` handles the auto-tweet about each new article.

## Controls

- `CONTENT_AGENT_MODE` (repo var) — `shadow` (default) / `live` (Phase 2/3).
- `CONTENT_AGENT_KILL=1` — halt.
- Workflow dispatch `reset=true` — fresh scan (ignore state).
