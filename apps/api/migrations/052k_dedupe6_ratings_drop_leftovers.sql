-- fk_rating_card has no ON DELETE CASCADE, so a stray rating would block 052s.
DELETE FROM card_ratings WHERE card_id IN (15,70,71,113,306,307);
