-- Remove two misleading card_wire entries. The Wyndham Rewards Earner Plus and
-- the base Wyndham Rewards Earner existed in our data as bare stubs flagged
-- accepting_applications=false. PR #1431 corrected them to true (the live
-- Barclays pages show them as current, open products) and filled in real data.
-- The sync diffed accepting_applications 0->1 and logged a wire row for each,
-- which reads on the public feed as if Barclays reopened applications. That was
-- a stale-data correction on our side, not a real-world reopening, so drop the
-- two rows. Single statement; the subquery reads from `cards`, not `card_wire`,
-- so the self-reference restriction does not apply. The date + value bounds keep
-- it surgical (a genuine future reopen would not be touched).
DELETE FROM card_wire
WHERE field = 'accepting_applications'
  AND old_value = '0'
  AND new_value = '1'
  AND changed_at >= '2026-06-18 00:00:00'
  AND card_id IN (
    SELECT card_id FROM cards
    WHERE card_name IN ('Wyndham Rewards Earner Plus', 'Wyndham Rewards Earner')
  );
