CREATE TABLE IF NOT EXISTS card_apply_click_counts (
  card_id INT NOT NULL,
  click_date DATE NOT NULL,
  click_source ENUM('direct', 'referral') NOT NULL DEFAULT 'direct',
  click_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (card_id, click_date, click_source),
  INDEX idx_click_date (click_date),
  INDEX idx_click_source (click_source),
  CONSTRAINT fk_card_apply_click_card FOREIGN KEY (card_id) REFERENCES cards(card_id) ON DELETE CASCADE
);
