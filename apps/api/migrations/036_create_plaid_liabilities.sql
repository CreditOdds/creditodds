CREATE TABLE IF NOT EXISTS user_plaid_liabilities (
  plaid_account_row_id INT NOT NULL PRIMARY KEY,
  last_statement_issue_date DATE NULL,
  last_statement_balance DECIMAL(12,2) NULL,
  minimum_payment_amount DECIMAL(12,2) NULL,
  next_payment_due_date DATE NULL,
  last_payment_date DATE NULL,
  last_payment_amount DECIMAL(12,2) NULL,
  is_overdue BOOLEAN NULL,
  aprs JSON NULL,
  last_synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (plaid_account_row_id) REFERENCES user_plaid_accounts(id) ON DELETE CASCADE
);
