# Reddit data points

Approval/denial data points extracted from public r/CreditCards posts by the
daily `reddit-datapoints-local` scheduled task (via
`scripts/check-reddit-datapoints.js`). One YAML file per data point, named
`<date-proposed>-<reddit-fullname>.yaml`.

## Lifecycle

1. The daily task opens an `auto-datapoints-*` PR adding files here, one per
   extracted data point, with a review table in the PR body.
2. **Reject** a data point by deleting its file from the PR before merging;
   close the PR to reject the whole batch. Either way it is never re-proposed —
   `.github/reddit-datapoint-state.json` records every candidate the task has
   already looked at (pushed straight to main at propose time).
3. **Merging** the PR fires `.github/workflows/sync-datapoints.yml`, which
   sends the entire directory to the `creditodds-import-reddit-records` Lambda.
   Rows insert into `records` with `submitter_id: reddit:<source_id>`; already
   imported source_ids are skipped, so the sync is idempotent.

## Notes

- Files here are the review ledger, not the live data — deleting a file after
  its PR merged does NOT remove the DB row (archive via the admin panel instead).
- `permalink`, `posted`, and `evidence` are review context only and are not
  imported; the rest of the fields mirror the `records` table (see
  CONTRIBUTING.md).
- The leaderboard excludes `reddit:%` submitters; card stats and odds include
  them like any other record.
