# Removed: "Approval rate by FICO score" bar chart (card pages)

Removed 2026-07-14. This note documents how the chart worked so it can be
restored if we bring it back. To restore, revert the removal PR (branch
`remove/fico-approval-bar-chart`) or reimplement from the description below.

## What it was

A horizontal stacked bar chart on every card page (`/card/[name]`, rendered by
`apps/web-next/src/app/card/[name]/CardClient.tsx`), shown in the "Charts" tab
of the approval-odds section, between the Median FICO / Median income / Credit
history stat strip and the scatter-plot tabs (Credit Score vs Income, etc.).

It grouped self-reported application records into six FICO buckets and showed,
per bucket, the approved vs denied split plus the approval percentage.

## Data source

No dedicated API. It reused `graphData[0]` (called `chartOne` in the
component), the same series that feeds the "Credit Score vs Income" scatter
plot:

- `chartOne[0]` = accepted applications, as `[creditScore, income]` pairs
- `chartOne[1]` = rejected applications, same shape

Only index `[0]` of each pair (the credit score) was used; income was ignored.
`graphData` comes into `CardClient` as a prop from the card page's server
fetch, so removing the chart required no backend or data-pipeline changes.

## Rendering logic (all in CardClient.tsx, removed in this change)

1. **Buckets** — module-level constant:

   ```ts
   const FICO_BUCKETS = [
     { label: "790+",    min: 790, max: 850 },
     { label: "760–789", min: 760, max: 789 },
     { label: "730–759", min: 730, max: 759 },
     { label: "700–729", min: 700, max: 729 },
     { label: "670–699", min: 670, max: 699 },
     { label: "< 670",   min: 0,   max: 669 },
   ];
   ```

2. **Bucketize helper** — counted pairs whose score fell in each bucket:

   ```ts
   function bucketize(pairs: [number, number][], buckets) {
     return buckets.map(
       (b) => pairs.filter((p) => p[0] >= b.min && p[0] <= b.max).length,
     );
   }
   ```

3. **Computed values** (in the component body's "Computed" section):
   `acceptedBuckets = bucketize(chartOne[0] || [], FICO_BUCKETS)`,
   `rejectedBuckets = bucketize(chartOne[1] || [], FICO_BUCKETS)`, and
   `maxBucketTotal = max(1, max over buckets of accepted + rejected)`.

4. **Bar math** — each row's approved segment width was
   `(accepted / maxBucketTotal) * 100`% and the denied segment
   `(rejected / maxBucketTotal) * 100`%, so bar length was proportional to
   sample size across rows (the fullest bucket set the scale) while the
   color split showed the approve/deny ratio within the bucket. The
   right-hand number was `round(accepted / total * 100)`% for the bucket, or
   an em dash for empty buckets ("no data" shown inside the empty track).

5. **Legend** — Approved swatch `var(--accent)` (purple), Denied swatch
   `var(--warn)` at 0.4 opacity, matching the scatter plots' accept/reject
   coloring.

6. **Visibility gate** — the whole odds section (this chart included) only
   rendered when `card.total_records >= 5` (`MIN_DATA_POINTS_FOR_CHARTS`) and
   `card.approved_count > 0`. Records missing a credit score simply fell out
   of every bucket.

## Markup and CSS

JSX used a `cj-table-label` heading ("Approval rate by FICO score") above a
`cj-bars` grid of `cj-bar-row`s (3-column grid: 88px label / flexible track /
52px percentage), each with a `cj-bar-track` containing `cj-bar-app` and
`cj-bar-den` spans, then a `cj-bar-legend`. The `.landing-v2 .cj-bar*` rules
lived in `apps/web-next/src/app/landing.css` (removed in this change;
`cj-table-label`, `cj-stat-strip`, etc. remain — they're shared).
