-- user_cards has no (user_id, card_id) unique key (dropped in 027 so a card can
-- be re-added after being closed), so a blind repoint could leave a user
-- holding the same card twice. Drop the loser row only when that user already
-- holds the PAIRED winner card (350<->114, 351<->115, 352<->116) -- never when
-- they merely hold some other card in the set.
DELETE uc FROM user_cards uc WHERE uc.card_id IN (350,351,352) AND EXISTS (SELECT 1 FROM (SELECT user_id, card_id FROM user_cards) w WHERE w.user_id = uc.user_id AND w.card_id = CASE uc.card_id WHEN 350 THEN 114 WHEN 351 THEN 115 WHEN 352 THEN 116 END);
