-- PK (card_id, click_date, click_source): sum the loser's rollup counts into
-- the winner, same reasoning as 051a.
INSERT INTO card_apply_click_counts (card_id, click_date, click_source, click_count) SELECT nid, click_date, click_source, click_count FROM (SELECT CASE card_id WHEN 350 THEN 114 WHEN 351 THEN 115 WHEN 352 THEN 116 END AS nid, click_date, click_source, click_count FROM card_apply_click_counts WHERE card_id IN (350,351,352)) x ON DUPLICATE KEY UPDATE click_count = card_apply_click_counts.click_count + VALUES(click_count);
