CREATE TABLE IF NOT EXISTS approval_searches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  credit_score INT NOT NULL,
  income INT NOT NULL,
  length_credit INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  UNIQUE KEY unique_user_search (user_id, credit_score, income, length_credit)
);
