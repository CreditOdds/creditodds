-- fk_rating_card has no ON DELETE CASCADE, so any rating still pointing at a
-- loser row would hard-block 051r. Clear the (currently empty) remainder.
DELETE FROM card_ratings WHERE card_id IN (350,351,352);
