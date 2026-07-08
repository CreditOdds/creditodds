-- Plaid integration decommissioned. user_settings itself stays (avatar_seed,
-- future toggles); only the beta gate column goes. Deploy the code that stops
-- selecting this column BEFORE running this migration.
ALTER TABLE user_settings DROP COLUMN plaid_beta_enabled;
