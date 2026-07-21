-- Loser view rows were summed into the winner by 051a; drop the originals.
DELETE FROM card_view_counts WHERE card_id IN (350,351,352);
