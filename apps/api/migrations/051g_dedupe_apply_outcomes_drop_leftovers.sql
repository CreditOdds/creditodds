-- Rows 051f could not move (winner already has that identity_key) are redundant.
DELETE FROM apply_outcomes WHERE card_id IN (350,351,352);
