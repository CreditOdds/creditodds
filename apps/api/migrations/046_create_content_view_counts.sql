-- Track daily page views for editorial content (articles + news).
-- Articles/news are file-based (no cards-style numeric id), so rows are keyed
-- by content_type ('article' | 'news') + content_key (slug / news id).
CREATE TABLE IF NOT EXISTS content_view_counts (
  content_type VARCHAR(16) NOT NULL,
  content_key VARCHAR(191) NOT NULL,
  view_date DATE NOT NULL,
  view_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (content_type, content_key, view_date),
  INDEX idx_content_view_date (view_date)
);
