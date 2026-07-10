ALTER TABLE card_ratings ADD UNIQUE KEY unique_ip_card (ip_hash, card_id);
