-- Fix typo: AAdvantage MileU -> AAdvantage MileUp
UPDATE cards SET card_name = 'American Airlines AAdvantage MileUp Mastercard' WHERE card_name = 'American Airlines AAdvantage MileU Mastercard';
