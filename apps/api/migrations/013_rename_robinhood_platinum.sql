-- Rename "Robinhood Platinum" to "Platinum" (bank field provides "Robinhood" context)
UPDATE cards SET card_name = 'Platinum' WHERE card_name = 'Robinhood Platinum';
