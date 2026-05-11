CREATE TABLE IF NOT EXISTS user_plaid_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plaid_item_row_id INT NOT NULL,
  plaid_account_id VARCHAR(100) NOT NULL,
  user_card_id INT NULL,
  account_name VARCHAR(255),
  account_official_name VARCHAR(255),
  mask VARCHAR(8),
  account_type VARCHAR(40),
  account_subtype VARCHAR(40),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_plaid_account_id (plaid_account_id),
  INDEX idx_plaid_item (plaid_item_row_id),
  INDEX idx_user_card (user_card_id),
  FOREIGN KEY (plaid_item_row_id) REFERENCES user_plaid_items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_card_id) REFERENCES user_cards(id) ON DELETE SET NULL
);
