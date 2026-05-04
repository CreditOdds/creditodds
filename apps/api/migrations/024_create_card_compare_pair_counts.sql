CREATE TABLE IF NOT EXISTS card_compare_pair_counts (
  slug_a VARCHAR(190) NOT NULL,
  slug_b VARCHAR(190) NOT NULL,
  compare_count INT NOT NULL DEFAULT 0,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (slug_a, slug_b),
  INDEX idx_compare_slug_a (slug_a, compare_count DESC),
  INDEX idx_compare_slug_b (slug_b, compare_count DESC),
  CONSTRAINT chk_compare_pair_ordered CHECK (slug_a < slug_b)
)
