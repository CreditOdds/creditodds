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
)
