-- Searchability fix: "U.S. Bank" -> "US Bank" (Altitude Reserve)
UPDATE cards SET card_name = 'US Bank Altitude Reserve Visa Infinite' WHERE card_name = 'U.S. Bank Altitude Reserve Visa Infinite';
