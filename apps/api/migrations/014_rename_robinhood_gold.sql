-- Rename "Gold Card" to "Gold" for Robinhood (consistent with Platinum naming)
UPDATE cards SET card_name = 'Gold' WHERE card_name = 'Gold Card';
