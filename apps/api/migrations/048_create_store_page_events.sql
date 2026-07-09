-- Track daily engagement on the /best-card-for/{slug} store pages.
-- Two event types share one table:
--   'visit'          — a page view (fired once per client on mount)
--   'affiliate_click'— an outbound click on the store's affiliate CTA
-- Stores are file-based YAML (no numeric id), so rows key by store_slug.
-- The store-event handler also self-heals this table (CREATE TABLE IF NOT
-- EXISTS on first write), so it functions even before this migration runs.
CREATE TABLE IF NOT EXISTS store_page_events (
  event_type VARCHAR(24) NOT NULL,
  store_slug VARCHAR(191) NOT NULL,
  event_date DATE NOT NULL,
  event_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (event_type, store_slug, event_date),
  INDEX idx_store_event_date (event_date)
);
