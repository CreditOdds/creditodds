CREATE TABLE benefit_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  card_id INT NOT NULL,
  benefit_name VARCHAR(255) NOT NULL,
  frequency ENUM('monthly','quarterly','semi_annual','annual','multi_year') NOT NULL,
  period_start DATE NOT NULL,
  status ENUM('used','dismissed') NOT NULL DEFAULT 'used',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_usage (user_id, card_id, benefit_name, period_start),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (card_id) REFERENCES cards(card_id) ON DELETE CASCADE
);
