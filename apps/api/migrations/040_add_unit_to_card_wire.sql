-- Add a `unit` column to card_wire so signup_bonus_value changes record the
-- bonus type (cash / points / miles / free_nights) in effect at the time of the
-- change. Without it, consumers can't tell that a card which switched its
-- welcome bonus from free nights to points (e.g. Marriott Bonvoy Boundless)
-- logged a meaningless "5 -> 125000" diff. New rows are stamped by
-- update-cards-github; legacy rows stay NULL and fall back to a magnitude
-- heuristic on the client.
ALTER TABLE card_wire ADD COLUMN unit VARCHAR(20) DEFAULT NULL;
