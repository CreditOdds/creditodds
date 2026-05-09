CREATE TABLE IF NOT EXISTS user_card_selections (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_card_id INT NOT NULL,
  reward_category VARCHAR(80) NOT NULL,
  reward_rate DECIMAL(5,2) NOT NULL,
  selected_category VARCHAR(80) NOT NULL,
  valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valid_to TIMESTAMP NULL,
  source ENUM('user_pick','auto_renew','rotation') NOT NULL DEFAULT 'user_pick',
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_card_active (user_card_id, valid_to),
  FOREIGN KEY (user_card_id) REFERENCES user_cards(id) ON DELETE CASCADE
);
