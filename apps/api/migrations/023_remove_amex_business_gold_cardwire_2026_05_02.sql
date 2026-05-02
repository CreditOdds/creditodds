-- Remove the two spurious card_wire entries for American Express Business
-- Gold recorded on 2026-05-02:
--   id=55, reward_top_rate 4 -> 3 (auto PR #925 dropped the bogus 4 sitting
--   on everything_else; computed top rate fell from 4 to 3 as a result)
--   id=56, reward_top_rate 3 -> 4 (PR #1004 modeled the 4x correctly as
--   top_category, restoring the computed top rate from 3 to 4)
--
-- Both are data-correction artifacts — the card's actual earn rates never
-- changed. Targeted by composite match (card_id + field + old/new) so
-- re-running the migration is a no-op if either row was already removed.

DELETE FROM card_wire
WHERE card_id = 78
  AND field = 'reward_top_rate'
  AND ((old_value = '4' AND new_value = '3') OR (old_value = '3' AND new_value = '4'))
  AND DATE(changed_at) = '2026-05-02';
