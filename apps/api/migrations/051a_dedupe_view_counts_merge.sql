-- Dedupe the US Bank twin rows created by the #1237 rename landing without its
-- DB migration (350->114, 351->115, 352->116). card_view_counts PK is
-- (card_id, view_date), so a blind repoint collides on shared dates and would
-- lose data; sum the loser's counts into the winner instead.
INSERT INTO card_view_counts (card_id, view_date, view_count) SELECT nid, view_date, view_count FROM (SELECT CASE card_id WHEN 350 THEN 114 WHEN 351 THEN 115 WHEN 352 THEN 116 END AS nid, view_date, view_count FROM card_view_counts WHERE card_id IN (350,351,352)) x ON DUPLICATE KEY UPDATE view_count = card_view_counts.view_count + VALUES(view_count);
