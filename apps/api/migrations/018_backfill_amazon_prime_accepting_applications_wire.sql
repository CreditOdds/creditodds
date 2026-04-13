-- Backfill a card_wire entry for the Amazon Business Prime American Express
-- card's accepting_applications change (1 -> 0).
--
-- Context: PR #389 flipped accepting_applications to false when Amazon
-- announced US Bank as the new issuer for its business card portfolio.
-- The sync ran, but PR #390 (which added accepting_applications tracking
-- to update-cards-github.js) hadn't been deployed yet, so no card_wire
-- row was written. This inserts the retroactive row so the change shows
-- up on /card-wire.
--
-- card_id 77 = Amazon Business Prime American Express (verified via
-- /cards API: db_card_id=77).

INSERT INTO card_wire (card_id, field, old_value, new_value, changed_at)
SELECT 77, 'accepting_applications', '1', '0', '2026-04-13 13:14:00'
WHERE NOT EXISTS (
  SELECT 1 FROM card_wire
  WHERE card_id = 77
    AND field = 'accepting_applications'
    AND old_value = '1'
    AND new_value = '0'
);
