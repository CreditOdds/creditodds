-- Backfill the /card-wire feed with BankAmericard's intro-APR extension:
-- 0% for 18 -> 21 billing cycles on both purchases and balance transfers
-- (Bank of America lengthened the promo; corrected in YAML on 2026-06-17, PR #1426).
--
-- Same gap as migration 043 (US Bank Shield): the intro-APR length columns were
-- added in migration 042 defaulting to NULL, so the first post-deploy sync to
-- populate BankAmericard's baseline saw old=NULL and skipped the row per the
-- "initial backfill" guard in update-cards-github.js (old is null = first time
-- populating metrics), recording the 18->21 change nowhere. This inserts the
-- historical rows so the feed reflects it. Idempotent via NOT EXISTS, single
-- INSERT so the RunMigration Lambda (no multipleStatements) applies it cleanly.
INSERT INTO card_wire (card_id, field, old_value, new_value, unit)
SELECT c.card_id, v.field, '18', '21', NULL
FROM cards c
JOIN (
  SELECT 'intro_apr_purchase_months' AS field
  UNION ALL
  SELECT 'intro_apr_bt_months'
) v
WHERE c.card_name = 'BankAmericard'
  AND NOT EXISTS (
    SELECT 1 FROM card_wire w
    WHERE w.card_id = c.card_id
      AND w.field = v.field
      AND w.old_value = '18'
      AND w.new_value = '21'
  );
