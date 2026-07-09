-- A 'card_closed' event has no target card, so new_card_id must be nullable.
-- Existing 'product_change' rows always set it, so relaxing the constraint is
-- backward-compatible. The events query LEFT JOINs the new card and already
-- tolerates a null match.
ALTER TABLE wallet_card_events MODIFY COLUMN new_card_id INT NULL;
