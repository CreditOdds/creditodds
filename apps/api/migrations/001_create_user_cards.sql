-- Create user_cards table for wallet feature
-- Run this in your MySQL client

CREATE TABLE IF NOT EXISTS user_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,           -- Firebase UID
  card_id INT NOT NULL,                     -- FK to cards table
  acquired_month TINYINT,                   -- 1-12, optional
  acquired_year SMALLINT,                   -- e.g. 2024, optional
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY unique_user_card (user_id, card_id),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (card_id) REFERENCES cards(card_id) ON DELETE CASCADE
);
