UPDATE card_ratings SET rating = CASE rating WHEN 1 THEN 0 WHEN 2 THEN 2 WHEN 3 THEN 4 WHEN 4 THEN 5 END WHERE rating IN (1, 2, 3, 4)
