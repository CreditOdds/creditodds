-- Searchability fix: "U.S. Bank" -> "US Bank" (Altitude Go)
UPDATE cards SET card_name = 'US Bank Altitude Go Visa Signature' WHERE card_name = 'U.S. Bank Altitude Go Visa Signature';
