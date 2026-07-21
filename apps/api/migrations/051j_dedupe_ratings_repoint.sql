-- unique (user_id, card_id) and (ip_hash, card_id). A no-op today (the loser
-- rows hold no ratings), but keeps the merge correct if one lands first.
UPDATE IGNORE card_ratings SET card_id = CASE card_id WHEN 350 THEN 114 WHEN 351 THEN 115 WHEN 352 THEN 116 END WHERE card_id IN (350,351,352);
