CREATE TABLE wallet_card_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  user_card_id INT NULL,
  event_type VARCHAR(32) NOT NULL DEFAULT 'product_change',
  old_card_id INT NOT NULL,
  new_card_id INT NOT NULL,
  change_date DATE NOT NULL,
  reason VARCHAR(16) NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_user_card_id (user_card_id),
  INDEX idx_change_date (change_date)
);
