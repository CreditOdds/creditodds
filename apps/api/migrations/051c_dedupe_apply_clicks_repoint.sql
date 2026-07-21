-- PK(id) with no card-scoped unique key, so a plain repoint is safe.
UPDATE card_apply_clicks SET card_id = CASE card_id WHEN 350 THEN 114 WHEN 351 THEN 115 WHEN 352 THEN 116 END WHERE card_id IN (350,351,352);
