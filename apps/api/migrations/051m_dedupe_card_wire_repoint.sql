-- Empty on the loser rows today; included so the merge stays correct if a wire
-- entry is written before this runs.
UPDATE card_wire SET card_id = CASE card_id WHEN 350 THEN 114 WHEN 351 THEN 115 WHEN 352 THEN 116 END WHERE card_id IN (350,351,352);
