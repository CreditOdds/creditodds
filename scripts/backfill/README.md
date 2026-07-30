# Reddit data-point backfill

One-off tooling for sweeping r/CreditCards **history** for approval/denial data
points. The daily `reddit-datapoints-local` routine reads `/new`, which reaches
back a few days; this reaches back years.

Used on 2026-07-30 to take `data/reddit-datapoints/` from 3 rows to 112. Kept
because the candidate cache below cost roughly four hours of heavily throttled
scraping, and throwing it away would mean paying that again.

Nothing here runs on a schedule. The daily routine does not import or touch it.

## What Reddit actually allows

Two limits shape all of this, both measured on 2026-07-30:

1. **Search returns ~250 results per query, whatever the time range.** `t=all`
   does not help. There is no pagination past that depth.
2. **`syntax=cloudsearch&q=timestamp:a..b` is gone.** It used to allow
   exhaustive time-window slicing; it now returns 0 entries. Verified directly.

So a subreddit's history cannot be enumerated. The only way back is to
**partition the query space** until each slice fits under the depth cap. One
query per catalog card name works, because most individual cards have well under
250 mentions in a year.

**The popular cards have the worst historical coverage.** Chase Freedom
Unlimited, the Amex Platinum and similar stay depth-capped and reach back only
weeks, while a niche card reaches years. Any analysis of this cache should
assume the old years are a thin, non-representative sample rather than a census.

## Scripts

### `sweep.js`
Sweeps candidates into `candidate-cache.json`. Phase 1 pages the
`flair:Data-Point` search; phase 2 runs one query per card in `data/cards/`.

- Resumes from the existing cache, so it can be stopped and restarted, and the
  cache only ever grows.
- 12s between requests, 61s backoff on 429. Expect ~44% of requests to be
  throttled; a full run is several hours.
- Logs any card whose own slice is depth-capped, so coverage gaps are visible
  rather than assumed away.
- **Marks nothing as seen.** That is deliberate — see below.

```bash
node scripts/backfill/sweep.js          # hours; safe to kill and rerun
```

### `stage-batch.js`
Stages cached candidates into `.reddit-dp-work/` in exactly the shape the normal
routine expects, so `check-reddit-datapoints.js --phase=finish` and
`check-reddit-datapoints-publish.sh` then work unchanged.

```bash
node scripts/backfill/stage-batch.js --months            # histogram, stages nothing
node scripts/backfill/stage-batch.js --month=2026-03     # one month
node scripts/backfill/stage-batch.js --since=2025-01-01  # everything since a date
node scripts/backfill/stage-batch.js --all               # everything unseen
```

Candidates are ordered by likely yield, then recency. That matters more than it
sounds: the sweep's outcome gate matches the word "approved" anywhere, and the
subreddit's recommendation-request template contains the line *"Cards approved
in the past 6 months"*. About **42% of raw candidates are advice posts that can
never produce a data point**. The ranking strips those template lines out before
testing for a first-person outcome phrase, and sorts the rest last — it is a
sort, not a filter, so nothing is discarded on a regex's say-so.

## The seen-state rule, which is the easy thing to get wrong

The routine never re-proposes a `source_id` once it is in
`.github/reddit-datapoint-state.json`, and the publish script marks **every**
candidate in `candidates.json` as seen.

So a batch must be trimmed to the candidates actually extracted **before**
publishing. Staging 500 candidates, reading 50, and publishing burns the other
450 permanently.

```js
// after extraction, before finish/publish
const all = JSON.parse(fs.readFileSync('.reddit-dp-work/candidates.json'));
const kept = all.slice(0, N_ACTUALLY_READ);
fs.writeFileSync('.reddit-dp-work/candidates.json', JSON.stringify(kept, null, 1));
const st = JSON.parse(fs.readFileSync('.reddit-dp-work/state-updated.json'));
for (const c of all.slice(N_ACTUALLY_READ)) delete st.seen[c.id];
fs.writeFileSync('.reddit-dp-work/state-updated.json', JSON.stringify(st, null, 2) + '\n');
```

This is why the cache is kept separate from the seen-state: it is what made it
possible to recover rows after the score-range rule changed mid-session.

## `candidate-cache.json`

1,282 candidates spanning 2020-08 to 2026-07; 938 never evaluated. Each entry
already passed both sweep gates (a stated outcome **and** a number in FICO
range).

**Reddit usernames are stripped.** The routine deliberately stores none — only
permalinks and paraphrased evidence reach `data/reddit-datapoints/`.

The sweep stopped at card 156 of 199, so the cache is incomplete by design.
Rerunning `sweep.js` resumes from it.
