-- Add metric snapshot columns to cards for change detection
ALTER TABLE cards
  ADD COLUMN signup_bonus_value INT DEFAULT NULL,
  ADD COLUMN signup_bonus_type VARCHAR(10) DEFAULT NULL,
  ADD COLUMN reward_top_rate DECIMAL(5,2) DEFAULT NULL,
  ADD COLUMN reward_top_unit VARCHAR(20) DEFAULT NULL,
  ADD COLUMN apr_min DECIMAL(5,2) DEFAULT NULL,
  ADD COLUMN apr_max DECIMAL(5,2) DEFAULT NULL;

-- Create card_wire changelog table
CREATE TABLE IF NOT EXISTS card_wire (
  id INT AUTO_INCREMENT PRIMARY KEY,
  card_id INT NOT NULL,
  field VARCHAR(50) NOT NULL,
  old_value VARCHAR(100) DEFAULT NULL,
  new_value VARCHAR(100) DEFAULT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_card_changed (card_id, changed_at DESC),
  CONSTRAINT fk_wire_card FOREIGN KEY (card_id) REFERENCES cards(card_id) ON DELETE CASCADE
);
