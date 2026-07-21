-- user_cards has no (user_id, card_id) unique (dropped in 027), so drop the
-- orphan's row only when that user already holds the PAIRED live card.
DELETE uc FROM user_cards uc WHERE uc.card_id IN (15,70,71,113,306,307) AND EXISTS (SELECT 1 FROM (SELECT user_id, card_id FROM user_cards) w WHERE w.user_id = uc.user_id AND w.card_id = CASE uc.card_id WHEN 15 THEN 311 WHEN 70 THEN 245 WHEN 71 THEN 251 WHEN 113 THEN 252 WHEN 306 THEN 18 WHEN 307 THEN 16 END);
