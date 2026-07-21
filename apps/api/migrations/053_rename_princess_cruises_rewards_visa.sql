-- Barclays rebrand: Princess Cruises Rewards Visa -> Princess Rewards Visa.
-- The live apply page (cards.barclaycardus.com/credit-card/b2e0e09c-...) titles
-- the product "PRINCESS REWARDS VISA" and no longer contains the string
-- "Princess Cruises Rewards" anywhere.
--
-- Must run BEFORE the renamed cards.json reaches the sync: update-cards-github.js
-- links rows by card_name, so a rename that lands in the CDN first would create a
-- second row and strand this card's ratings, stats and CardWire history.
UPDATE cards SET card_name = 'Princess Rewards Visa' WHERE card_name = 'Princess Cruises Rewards Visa';
