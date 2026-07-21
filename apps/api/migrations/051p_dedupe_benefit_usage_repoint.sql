-- unique (user_id, card_id, benefit_name, period_start).
UPDATE IGNORE benefit_usage SET card_id = CASE card_id WHEN 350 THEN 114 WHEN 351 THEN 115 WHEN 352 THEN 116 END WHERE card_id IN (350,351,352);
