CREATE TABLE IF NOT EXISTS user_plaid_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  plaid_item_id VARCHAR(100) NOT NULL,
  access_token_encrypted VARBINARY(1024) NOT NULL,
  institution_id VARCHAR(50),
  institution_name VARCHAR(255),
  status ENUM('healthy','login_required','pending_expiration','revoked','error') NOT NULL DEFAULT 'healthy',
  last_synced_at TIMESTAMP NULL,
  transactions_cursor VARCHAR(256),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_plaid_item_id (plaid_item_id),
  INDEX idx_user_id (user_id)
);
