-- Per-row event log for outbound apply clicks. Replaces card_apply_click_counts
-- as the source of truth going forward; card_apply_click_counts is kept for
-- historical totals only (no per-user info, no uniqueness possible).
CREATE TABLE IF NOT EXISTS card_apply_clicks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  card_id INT NOT NULL,
  click_source ENUM('direct', 'referral') NOT NULL DEFAULT 'direct',
  user_id VARCHAR(128) NULL,
  ip_hash CHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_card_id_created_at (card_id, created_at),
  INDEX idx_created_at (created_at),
  INDEX idx_click_source (click_source),
  INDEX idx_user_id (user_id),
  INDEX idx_ip_hash (ip_hash),
  CONSTRAINT fk_card_apply_clicks_card FOREIGN KEY (card_id) REFERENCES cards(card_id) ON DELETE CASCADE
);
