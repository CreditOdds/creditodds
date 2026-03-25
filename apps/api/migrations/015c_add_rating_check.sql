ALTER TABLE card_ratings ADD CONSTRAINT card_ratings_chk_1 CHECK (rating >= 0 AND rating <= 5)
