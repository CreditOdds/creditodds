-- The substantive move in this pass: orphan 15 (Citi Simplicity Card) holds 5
-- approval records while the live row 311 (Citi Simplicity) has none, so the
-- card page currently renders Citi Simplicity with no approval data. Repointing
-- restores it (PRIMARY(record_id) only, so no collision risk).
UPDATE records SET card_id = CASE card_id WHEN 15 THEN 311 WHEN 70 THEN 245 WHEN 71 THEN 251 WHEN 113 THEN 252 WHEN 306 THEN 18 WHEN 307 THEN 16 END WHERE card_id IN (15,70,71,113,306,307);
