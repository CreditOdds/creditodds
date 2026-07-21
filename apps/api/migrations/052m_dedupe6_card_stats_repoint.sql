-- PK(card_id). Repointed rather than dropped (unlike 051l) so the live row is
-- not left statless until RefreshCardStatsFunction next runs; the figures stay
-- valid because 052l moved the underlying records with them. IGNORE covers the
-- case where the live row already has a stats row.
UPDATE IGNORE card_stats SET card_id = CASE card_id WHEN 15 THEN 311 WHEN 70 THEN 245 WHEN 71 THEN 251 WHEN 113 THEN 252 WHEN 306 THEN 18 WHEN 307 THEN 16 END WHERE card_id IN (15,70,71,113,306,307);
