# Valuation Data

Each YAML file in this directory holds historical published valuations for one points/miles program. The files power the multi-source valuation chart on the corresponding `/tools/[slug]` page.

## Adding a new data point

To add a citation (e.g. a new monthly TPG valuation), open the relevant YAML file and append an entry to `data_points`:

```yaml
- year: 2026
  source: TPG
  cpp: 1.35
  url: https://thepointsguy.com/loyalty-programs/monthly-valuations/
```

Open a PR. The chart picks up the new point on next deploy.

## Rules

- **Only directly cited values.** No inferred or rough estimates. Each entry must have a `url` pointing to the source's actual published article showing that number for that year.
- **`cpp` is in cents** (e.g. `1.35` means 1.35¢ per mile).
- **`source`** should match the publisher name as users know it (e.g. `TPG`, `NerdWallet`, `Frequent Miler`, `Bankrate`, `One Mile at a Time`, `WalletHub`).
- **`year`** is the year the source published the value. If TPG publishes monthly, pick the latest publication for that year; multiple monthly snapshots within one year are fine — they just become multiple points stacked on the chart.

## Schema

```yaml
slug: united-mileageplus           # matches the filename
program: United MileagePlus        # human-readable program name
unit: mile                         # 'mile' or 'point'
data_points:
  - year: 2023
    source: TPG
    cpp: 1.35
    url: https://...
```
