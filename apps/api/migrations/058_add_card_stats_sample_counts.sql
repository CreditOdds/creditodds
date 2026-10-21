-- Prefer applying before API deployment, then invoke RefreshCardStatsFunction.
-- The refresher supports the old schema until this migration is applied.
-- NULL means not yet recomputed; check-odds treats it as insufficient data.
ALTER TABLE card_stats
  ADD COLUMN approved_credit_score_count INT NULL,
  ADD COLUMN approved_income_count INT NULL,
  ADD COLUMN approved_length_credit_count INT NULL,
  ADD COLUMN latest_approved_application DATE NULL;
