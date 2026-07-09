-- Closing a card is distinct from removing it from the wallet. A closed card
-- is kept in user_cards (so the credit-history span is preserved: acquired_month
-- /acquired_year is the open date, closed_date the close date) but drops out of
-- the active wallet — GET /wallet and the ranker filter on closed_date IS NULL.
-- The closure itself is logged in wallet_card_events (event_type = 'card_closed').
ALTER TABLE user_cards ADD COLUMN closed_date DATE NULL DEFAULT NULL;
