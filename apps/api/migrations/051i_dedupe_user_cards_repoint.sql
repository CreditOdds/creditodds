-- Remaining wallet rows (users who held only the loser) move to the winner.
UPDATE user_cards SET card_id = CASE card_id WHEN 350 THEN 114 WHEN 351 THEN 115 WHEN 352 THEN 116 END WHERE card_id IN (350,351,352);
