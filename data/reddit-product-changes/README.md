# Reddit product changes

Human-reviewed product-change reports extracted from r/CreditCards. One YAML
file per change, named `<change_month>-<source_id>.yaml`.

Merging a change here triggers `.github/workflows/sync-product-changes.yml`,
which sends the **whole directory** to the `creditodds-import-reddit-product-changes`
Lambda. The Lambda skips `source_id`s it already holds, so the sync is
declarative and idempotent: whatever is merged here is what ends up in the
`reddit_product_changes` table.

Rejecting a proposed change means deleting its file or closing the PR. Nothing
re-proposes it, because the sweep's seen-state is committed separately.

## Pipeline

```
node scripts/sweep-reddit-product-changes.js               # collect candidates
node scripts/sweep-reddit-product-changes.js --phase=extract  # write the prompt
#   ... session reads .reddit-pc-work/extract-prompt.md and writes
#       .reddit-pc-work/proposed/<source_id>.json ...
node scripts/sweep-reddit-product-changes.js --phase=finish   # validate -> YAML
```

## Why these rows are not in `wallet_card_events`

That table is a member's personal wallet history: `user_id` means a real
account, and every `product_change` row there is paired with a `user_cards`
row. Reddit reports have no account behind them and need provenance columns
(`permalink`, `evidence`) that would be null for every real wallet row. The
`/card-product-changes` endpoint UNIONs the two sources and reports the split,
so the card page can say where its numbers came from.

## Fields

| Field | Required | Notes |
|---|---|---|
| `source_id` | yes | `t3_…`/`t1_…`, optional `#N` suffix when one post describes several hops |
| `from_card` | yes | Exact catalog name |
| `to_card` | yes | Exact catalog name, **same issuer as `from_card`** |
| `change_month` | yes | `YYYY-MM`, never in the future |
| `reason` | no | `voluntary` or `forced`; omitted when the post does not say |
| `evidence` | no | Paraphrase, never a quote, ≤500 chars |
| `permalink` | no | Audit trail for a row no user can vouch for |
| `posted` | no | Review context only; not imported |

A product change never crosses issuers — that is what makes it a change rather
than a new application. The finish phase rejects cross-issuer pairs outright,
since they mean the post was misread.
