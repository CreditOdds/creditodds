CREATE TABLE card_ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,
  card_id INT NOT NULL,
  rating TINYINT NOT NULL CHECK (rating >= 1 AND rating <= 4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_card (user_id, card_id),
  KEY idx_card_id (card_id),
  CONSTRAINT fk_rating_card FOREIGN KEY (card_id) REFERENCES cards(card_id)
);
