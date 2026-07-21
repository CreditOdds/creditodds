-- unique (card_id, identity_key): IGNORE skips any row whose identity already
-- exists on the winner. 051g clears the skipped leftovers.
UPDATE IGNORE apply_outcomes SET card_id = CASE card_id WHEN 350 THEN 114 WHEN 351 THEN 115 WHEN 352 THEN 116 END WHERE card_id IN (350,351,352);
