-- Self-reported application outcomes from the post-apply check-in prompt.
-- One row per (card, identity): identity_key is the Firebase uid when the
-- visitor was signed in, else the peppered ip_hash (same scheme as
-- card_apply_clicks). Re-answering updates the row in place, so a
-- "pending" can later resolve to "approved" without creating duplicates.
-- These are anonymous tier-1 signals for funnel analytics; they do NOT
-- feed the public odds charts (those come from the records table).
CREATE TABLE IF NOT EXISTS apply_outcomes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  card_id INT NOT NULL,
  outcome ENUM('approved', 'denied', 'pending', 'just_looking') NOT NULL,
  user_id VARCHAR(128) NULL,
  ip_hash CHAR(64) NULL,
  identity_key VARCHAR(128) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_card_identity (card_id, identity_key),
  INDEX idx_card_id_created_at (card_id, created_at),
  INDEX idx_created_at (created_at),
  INDEX idx_outcome (outcome),
  INDEX idx_user_id (user_id),
  CONSTRAINT fk_apply_outcomes_card FOREIGN KEY (card_id) REFERENCES cards(card_id) ON DELETE CASCADE
)
