-- Backfill the /card-wire feed with U.S. Bank Shield's intro-APR shortening:
-- 0% for 24 -> 21 billing cycles on both purchases and balance transfers
-- (U.S. Bank made the cut ~March 2026; corrected in YAML on 2026-06-16, PR #1423).
--
-- The sync handler only logs a card_wire row when it has a prior tracked value
-- to diff against. Intro-APR tracking did not exist when this change merged, so
-- the first post-deploy sync just sets the baseline (old=null, skipped) instead
-- of recording the drop. This inserts the historical rows so the feed reflects
-- it. Idempotent via NOT EXISTS, and a single INSERT statement so the
-- RunMigration Lambda (no multipleStatements) applies it cleanly.
INSERT INTO card_wire (card_id, field, old_value, new_value, unit)
SELECT c.card_id, v.field, '24', '21', NULL
FROM cards c
JOIN (
  SELECT 'intro_apr_purchase_months' AS field
  UNION ALL
  SELECT 'intro_apr_bt_months'
) v
WHERE c.card_name = 'US Bank Shield'
  AND NOT EXISTS (
    SELECT 1 FROM card_wire w
    WHERE w.card_id = c.card_id
      AND w.field = v.field
      AND w.old_value = '24'
      AND w.new_value = '21'
  );
