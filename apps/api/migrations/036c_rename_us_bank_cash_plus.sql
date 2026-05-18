-- Searchability fix: "U.S. Bank" -> "US Bank" (Cash+)
UPDATE cards SET card_name = 'US Bank Cash+ Visa Signature' WHERE card_name = 'U.S. Bank Cash+ Visa Signature';
