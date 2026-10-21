# Location, rewards, approval comparisons, and content availability

This change implements review items 2–5. Merging to main triggers the existing web/API deployment workflows; database migrations remain manual.

## Behavior

- `Permissions-Policy` permits same-origin geolocation. Browser consent is still required; camera and microphone remain disabled.
- Compact reward headlines use ongoing rates that do not require omitted terms. Merchant gates, merchant-specific bonuses, caps, selectable/rotating categories, promotions with expiration dates, and prose notes are excluded from headline selection. Treating notes conservatively can select a lower headline rate; full rewards and terms remain on card detail pages. Home and Explore retain reward metadata across their server/client boundary.
- Approval comparisons require five valid observations **per field**. Missing and sparse fields return `null`, never a favorable comparison. Scores are raw counts out of the available fields, with partial data separated from complete three-field comparisons. Complete comparisons sort first. The UI displays each field's sample size, the latest reported approval application date, and the statistics refresh date. All historical approved reports are included; these are self-selected community submissions, not calibrated probabilities.
- Content catalog failures and malformed responses throw so failed regeneration can retain the last successful page. Only a successful catalog lookup or a single-card API 404 can establish a missing page. An error boundary offers retry for uncached failures. Supplemental news remains optional on card, profile, bank, and calculator pages. Sitemap failures propagate instead of publishing an incomplete sitemap.

## Deployment order

1. Deploy the web update first. It treats older API responses without per-field counts as unavailable, and can safely render null fields. The session cache key changes to discard old comparisons.
2. Apply `apps/api/migrations/058_add_card_stats_sample_counts.sql` once using the existing migration workflow. It adds nullable counts and the latest approved application date without changing existing columns. Prefer applying it before the API deployment. If deployments race ahead, the refresher falls back to the existing schema and logs that migration 058 is pending.
3. Deploy the API update, including `RefreshCardStatsFunction` and `CheckOddsFunction`. Invoke the refreshed statistics job or wait for its scheduled run. Until it completes, null counts display as insufficient data. Both the reader and statistics writer tolerate a pre-migration schema. The writer automatically starts populating the new columns on its first scheduled run after migration. Approval comparisons remain unavailable until those counts are populated.
4. Verify counts and medians for a fully populated card and a card with missing income/history. Verify same-origin geolocation on `/profile`, reward headlines on Home/Explore, and a genuine missing-card 404.

The added database columns are additive. Roll back application code if needed; do not drop columns while the updated statistics job is running. The legacy `has_enough_data` flag remains true only for complete comparisons, so older web clients hide partial rows instead of attempting to format null medians.

## Validation

Regression coverage includes merchant/promotion headlines and both card projections; missing/nonfinite/sparse approval statistics; legacy API payloads; partial-score grouping; zero-valued medians; desktop/mobile missing-data rendering; network, HTTP, JSON and catalog-shape failures; and confirmed-card 404 handling in both page and metadata generation.

Run the API Jest suite, web Vitest suite, TypeScript, SEO checks, and production build. The migration and MySQL upsert require a staging database check before deployment; no production migration is performed by this change.
