-- Merge duplicate cards created when CDN name changes ran before migration 006.
-- The update-cards-github sync creates a NEW card when it can't find an exact
-- card_name match, so after "Chase Sapphire Preferred Card" → "Chase Sapphire Preferred"
-- in the CDN, a second card row was inserted. Old records are orphaned under the
-- original card_id.
--
-- This migration handles TWO cases:
--   A) Old name still exists alongside new name (migration 006 didn't run or ran after sync)
--   B) Same name appears twice (migration 006 ran, then sync also created a new entry)

-- ============================================================
-- PHASE 1: Merge old-name cards into new-name cards
-- These are the pairs from migration 006 where the old name
-- may still exist as a separate row.
-- ============================================================

CREATE TEMPORARY TABLE name_mappings (
  old_name VARCHAR(255),
  new_name VARCHAR(255)
);

INSERT INTO name_mappings (old_name, new_name) VALUES
('Aer Lingus Visa Signature card', 'Aer Lingus Visa Signature'),
('Amazon Business Prime American Express Card', 'Amazon Business Prime American Express'),
('Amazon Prime Rewards Visa Signature Card', 'Amazon Prime Rewards Visa Signature'),
('American Express Business Gold Card', 'American Express Business Gold'),
('American Express Gold Card', 'American Express Gold'),
('American Express Green Card', 'American Express Green'),
('Amex Everyday Credit Card', 'Amex Everyday'),
('Amex Everyday Preferred Credit Card', 'Amex Everyday Preferred'),
('AT&T Access Card From Citi', 'AT&T Access from Citi'),
('Bank of America Cash Rewards Secured Credit Card', 'Bank of America Cash Rewards Secured'),
('Bank of America Customized Cash Rewards Credit Card', 'Bank of America Customized Cash Rewards'),
('Bank of America Premium Rewards Elite Credit Card', 'Bank of America Premium Rewards Elite'),
('Bank of America Premium Rewards Credit Card', 'Bank of America Premium Rewards'),
('Bank of America Travel Rewards Credit Card', 'Bank of America Travel Rewards'),
('Bank of America Unlimited Cash Rewards Credit Card', 'Bank of America Unlimited Cash Rewards'),
('BankAmericard Credit Card', 'BankAmericard'),
('Blue Business Cash Card from American Express', 'Blue Business Cash from American Express'),
('Blue Business Plus Credit Card from American Express', 'Blue Business Plus from American Express'),
('Blue Cash Everyday Card', 'Blue Cash Everyday'),
('Blue Cash Preferred Card', 'Blue Cash Preferred'),
('British Airways Visa Signature card', 'British Airways Visa Signature'),
('Capital One Platinum Secured Credit Card', 'Capital One Platinum Secured'),
('Capital One Platinum Credit Card', 'Capital One Platinum'),
('Capital One Quicksilver Secured Cash Rewards Credit Card', 'Capital One Quicksilver Secured Cash Rewards'),
('Capital One Quicksilver Cash Rewards Credit Card', 'Capital One Quicksilver Cash Rewards'),
('Capital One QuicksilverOne Cash Rewards Credit Card', 'Capital One QuicksilverOne Cash Rewards'),
('Capital One Savor Student Cash Rewards Credit Card', 'Capital One Savor Student Cash Rewards'),
('Capital One Savor Cash Rewards Credit Card', 'Capital One Savor Cash Rewards'),
('Capital One SavorOne Cash Rewards Credit Card', 'Capital One SavorOne Cash Rewards'),
('Capital One Venture Rewards Credit Card', 'Capital One Venture Rewards'),
('Capital One Venture X Rewards Credit Card', 'Capital One Venture X Rewards'),
('Capital One VentureOne Rewards Credit Card', 'Capital One VentureOne Rewards'),
('Cash Magnet Card', 'Cash Magnet'),
('IHG One Rewards Premier Business Credit Card', 'IHG One Rewards Premier Business'),
('Ink Business Cash Credit Card', 'Ink Business Cash'),
('Ink Business Preferred Credit Card', 'Ink Business Preferred'),
('Ink Business Unlimited Credit Card', 'Ink Business Unlimited'),
('Chase Sapphire Preferred Card', 'Chase Sapphire Preferred'),
('Citi Strata Elite Card', 'Citi Strata Elite'),
('Citi Strata Premier Card', 'Citi Strata Premier'),
('Citi Strata Card', 'Citi Strata'),
('Costco Anywhere Visa Business Card by Citi', 'Costco Anywhere Visa Business by Citi'),
('Costco Anywhere Visa Card by Citi', 'Costco Anywhere Visa by Citi'),
('Delta SkyMiles Blue American Express Card', 'Delta SkyMiles Blue American Express'),
('Delta SkyMiles Gold American Express Card', 'Delta SkyMiles Gold American Express'),
('Delta SkyMiles Platinum American Express Card', 'Delta SkyMiles Platinum American Express'),
('Delta SkyMiles Reserve American Express Card', 'Delta SkyMiles Reserve American Express'),
('Discover it for Students Card', 'Discover it for Students'),
('Discover it Secured Credit Card', 'Discover it Secured'),
('Discover it Student Chrome Card', 'Discover it Student Chrome'),
('Disney Inspire Visa Card', 'Disney Inspire Visa'),
('Disney Premier Visa Card', 'Disney Premier Visa'),
('Disney Visa Card', 'Disney Visa'),
('Expedia Rewards Card from Citi', 'Expedia Rewards from Citi'),
('Expedia Rewards Voyager Card from Citi', 'Expedia Rewards Voyager from Citi'),
('Hilton Honors American Express Aspire Card', 'Hilton Honors American Express Aspire'),
('Hilton Honors American Express Surpass Card', 'Hilton Honors American Express Surpass'),
('Hilton Honors Card', 'Hilton Honors'),
('Iberia Visa Signature card', 'Iberia Visa Signature'),
('IHG One Rewards Premier Credit Card', 'IHG One Rewards Premier'),
('IHG Rewards Club Traveler Credit Card', 'IHG Rewards Club Traveler'),
('JetBlue Business Card', 'JetBlue Business'),
('JetBlue Card', 'JetBlue'),
('JetBlue Plus Card', 'JetBlue Plus'),
('Marriott Bonvoy Bold Credit Card', 'Marriott Bonvoy Bold'),
('Marriott Bonvoy Boundless credit card', 'Marriott Bonvoy Boundless'),
('Princess Cruises Rewards Visa Card', 'Princess Cruises Rewards Visa'),
('Southwest Rapid Rewards Plus Credit Card', 'Southwest Rapid Rewards Plus'),
('Southwest Rapid Rewards Premier Credit Card', 'Southwest Rapid Rewards Premier'),
('Southwest Rapid Rewards Priority Credit Card', 'Southwest Rapid Rewards Priority'),
('Starbucks Rewards Visa Card', 'Starbucks Rewards Visa'),
('U.S. Bank Altitude Go Visa Signature Card', 'U.S. Bank Altitude Go Visa Signature'),
('U.S. Bank Altitude Reserve Visa Infinite Card', 'U.S. Bank Altitude Reserve Visa Infinite'),
('U.S. Bank Cash+ Visa Signature Card', 'U.S. Bank Cash+ Visa Signature'),
('Smartly Visa Signature Card', 'Smartly Visa Signature'),
('Wells Fargo Active Cash Card', 'Wells Fargo Active Cash'),
('Wells Fargo Attune Card', 'Wells Fargo Attune'),
('Wells Fargo Autograph Journey Card', 'Wells Fargo Autograph Journey'),
('Wells Fargo Autograph Card', 'Wells Fargo Autograph'),
('Wells Fargo Reflect Card', 'Wells Fargo Reflect'),
('Wells Fargo Signify Business Cash Card', 'Wells Fargo Signify Business Cash'),
('World of Hyatt Business Credit Card', 'World of Hyatt Business'),
('World of Hyatt Credit Card', 'World of Hyatt'),
('Wyndham Rewards Earner Business Card', 'Wyndham Rewards Earner Business'),
('Wyndham Rewards Earner Card', 'Wyndham Rewards Earner'),
('Wyndham Rewards Earner Plus Card', 'Wyndham Rewards Earner Plus');

-- Move records from old-name card to new-name card (only where both exist)
UPDATE records r
INNER JOIN cards c_old ON r.card_id = c_old.card_id
INNER JOIN name_mappings nm ON c_old.card_name = nm.old_name
INNER JOIN cards c_new ON c_new.card_name = nm.new_name
SET r.card_id = c_new.card_id;

-- Move referrals from old-name card to new-name card
UPDATE referrals ref
INNER JOIN cards c_old ON ref.card_id = c_old.card_id
INNER JOIN name_mappings nm ON c_old.card_name = nm.old_name
INNER JOIN cards c_new ON c_new.card_name = nm.new_name
SET ref.card_id = c_new.card_id;

-- Handle user_cards: delete old entries where user already has the new card
DELETE uc_old FROM user_cards uc_old
INNER JOIN cards c_old ON uc_old.card_id = c_old.card_id
INNER JOIN name_mappings nm ON c_old.card_name = nm.old_name
INNER JOIN cards c_new ON c_new.card_name = nm.new_name
INNER JOIN user_cards uc_new ON uc_old.user_id = uc_new.user_id AND uc_new.card_id = c_new.card_id;

-- Move remaining user_cards from old to new
UPDATE user_cards uc
INNER JOIN cards c_old ON uc.card_id = c_old.card_id
INNER JOIN name_mappings nm ON c_old.card_name = nm.old_name
INNER JOIN cards c_new ON c_new.card_name = nm.new_name
SET uc.card_id = c_new.card_id;

-- Delete old-name card entries (only where new-name card also exists)
DELETE c_old FROM cards c_old
INNER JOIN name_mappings nm ON c_old.card_name = nm.old_name
INNER JOIN cards c_new ON c_new.card_name = nm.new_name AND c_new.card_id != c_old.card_id;

-- If old name exists but new name doesn't, just rename the card
UPDATE cards c
INNER JOIN name_mappings nm ON c.card_name = nm.old_name
LEFT JOIN cards c2 ON c2.card_name = nm.new_name
SET c.card_name = nm.new_name
WHERE c2.card_id IS NULL;

DROP TEMPORARY TABLE name_mappings;

-- ============================================================
-- PHASE 2: Merge exact-name duplicates
-- If migration 006 ran AND the sync also created a new entry,
-- there will be two rows with the same card_name. Keep the one
-- with more records and merge the other into it.
-- ============================================================

-- Find duplicate card_names and merge records to the card_id with the most records.
-- We keep the card_id with the highest record count (the "primary").

DROP TABLE IF EXISTS _migration010_dup_cards;
DROP TABLE IF EXISTS _migration010_dup_primary;

CREATE TABLE _migration010_dup_cards AS
SELECT c.card_id, c.card_name,
  COALESCE((SELECT COUNT(*) FROM records r WHERE r.card_id = c.card_id), 0) AS rec_count
FROM cards c
WHERE c.card_name IN (
  SELECT card_name FROM cards GROUP BY card_name HAVING COUNT(*) > 1
);

-- For each duplicate group, identify the primary (most records, ties broken by lowest card_id)
CREATE TABLE _migration010_dup_primary AS
SELECT d1.card_id, d1.card_name
FROM _migration010_dup_cards d1
WHERE d1.rec_count = (
  SELECT MAX(d2.rec_count) FROM _migration010_dup_cards d2 WHERE d2.card_name = d1.card_name
)
AND d1.card_id = (
  SELECT MIN(d3.card_id) FROM _migration010_dup_cards d3
  WHERE d3.card_name = d1.card_name AND d3.rec_count = d1.rec_count
);

-- Move records from non-primary duplicates to primary
UPDATE records r
INNER JOIN _migration010_dup_cards dc ON r.card_id = dc.card_id
INNER JOIN _migration010_dup_primary dp ON dc.card_name = dp.card_name AND dc.card_id != dp.card_id
SET r.card_id = dp.card_id;

-- Move referrals from non-primary duplicates to primary
UPDATE referrals ref
INNER JOIN _migration010_dup_cards dc ON ref.card_id = dc.card_id
INNER JOIN _migration010_dup_primary dp ON dc.card_name = dp.card_name AND dc.card_id != dp.card_id
SET ref.card_id = dp.card_id;

-- Handle user_cards duplicates
DELETE uc_old FROM user_cards uc_old
INNER JOIN _migration010_dup_cards dc ON uc_old.card_id = dc.card_id
INNER JOIN _migration010_dup_primary dp ON dc.card_name = dp.card_name AND dc.card_id != dp.card_id
INNER JOIN user_cards uc_new ON uc_old.user_id = uc_new.user_id AND uc_new.card_id = dp.card_id;

UPDATE user_cards uc
INNER JOIN _migration010_dup_cards dc ON uc.card_id = dc.card_id
INNER JOIN _migration010_dup_primary dp ON dc.card_name = dp.card_name AND dc.card_id != dp.card_id
SET uc.card_id = dp.card_id;

-- Delete non-primary duplicate card entries
DELETE c FROM cards c
INNER JOIN _migration010_dup_cards dc ON c.card_id = dc.card_id
INNER JOIN _migration010_dup_primary dp ON dc.card_name = dp.card_name AND dc.card_id != dp.card_id;

DROP TABLE _migration010_dup_cards;
DROP TABLE _migration010_dup_primary;
