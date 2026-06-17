-- Snapshot the 0% intro APR window length (in months / billing cycles) for both
-- purchases and balance transfers, so update-cards-github can diff it on each
-- sync and surface shortened or extended promo periods on /card-wire. Mirrors
-- how apr_min / apr_max snapshot the regular APR. NULL for cards with no intro
-- offer. Single ALTER (one statement) so the RunMigration Lambda — which runs
-- each file without multipleStatements — applies it cleanly.
ALTER TABLE cards
  ADD COLUMN intro_apr_purchase_months INT DEFAULT NULL,
  ADD COLUMN intro_apr_bt_months INT DEFAULT NULL;
