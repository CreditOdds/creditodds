-- Rename Robinhood cards to include "Robinhood" prefix
UPDATE cards SET card_name = 'Robinhood Gold' WHERE card_name = 'Gold';
UPDATE cards SET card_name = 'Robinhood Platinum' WHERE card_name = 'Platinum';
