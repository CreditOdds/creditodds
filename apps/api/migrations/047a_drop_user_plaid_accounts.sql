-- Plaid integration decommissioned (never left sandbox beta). Drop child
-- table first: it holds the FK to user_plaid_items.
DROP TABLE IF EXISTS user_plaid_accounts;
