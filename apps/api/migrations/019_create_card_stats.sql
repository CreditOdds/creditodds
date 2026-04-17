-- Precomputed per-card stats to avoid window-function computation on every card page request.
-- Populated by the RefreshCardStats Lambda (scheduled every 5 minutes).

CREATE TABLE IF NOT EXISTS card_stats (
  card_id INT NOT NULL PRIMARY KEY,
  total_records INT NOT NULL DEFAULT 0,
  approved_count INT NOT NULL DEFAULT 0,
  rejected_count INT NOT NULL DEFAULT 0,
  approved_median_credit_score INT NULL,
  approved_median_income INT NULL,
  approved_median_length_credit INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_card_stats_card FOREIGN KEY (card_id) REFERENCES cards(card_id) ON DELETE CASCADE
);

-- Supports the refresh job's per-card aggregates and the approved-only median subqueries.
-- Guarded so the migration is idempotent if the index already exists.
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'records'
    AND index_name = 'idx_records_card_review_result'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_records_card_review_result ON records (card_id, admin_review, result)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
