-- Second dedupe pass: six more twin pairs from the same forgotten-migration
-- cause as 051, but still carrying MISMATCHED names (so GROUP BY card_name
-- missed them; found by diffing DB names against cards.json).
-- orphan -> live: 15->311, 70->245, 71->251, 113->252, 306->18, 307->16.
-- The LIVE row (the one cards.json matches) is canonical in every pair: keeping
-- the orphan would re-orphan it and let update-cards-github.js insert a fresh
-- duplicate on the next sync.
-- PK (card_id, view_date): sum overlaps rather than blind-repointing.
INSERT INTO card_view_counts (card_id, view_date, view_count) SELECT nid, view_date, view_count FROM (SELECT CASE card_id WHEN 15 THEN 311 WHEN 70 THEN 245 WHEN 71 THEN 251 WHEN 113 THEN 252 WHEN 306 THEN 18 WHEN 307 THEN 16 END AS nid, view_date, view_count FROM card_view_counts WHERE card_id IN (15,70,71,113,306,307)) x ON DUPLICATE KEY UPDATE view_count = card_view_counts.view_count + VALUES(view_count);
