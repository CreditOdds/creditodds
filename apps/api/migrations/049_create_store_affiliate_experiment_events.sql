-- Track the affiliate CTA experiment separately from the legacy per-store
-- visit/click aggregates. The experiment dimensions would make the existing
-- primary key ambiguous, so this table keeps assignment views and clicks by
-- experiment, variant, placement, store, and day.
CREATE TABLE IF NOT EXISTS store_affiliate_experiment_events (
  event_type VARCHAR(16) NOT NULL,
  experiment_id VARCHAR(64) NOT NULL,
  variant VARCHAR(32) NOT NULL,
  placement VARCHAR(32) NOT NULL,
  store_slug VARCHAR(191) NOT NULL,
  event_date DATE NOT NULL,
  event_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (event_type, experiment_id, variant, placement, store_slug, event_date),
  INDEX idx_store_affiliate_experiment_date (experiment_id, event_date)
);
