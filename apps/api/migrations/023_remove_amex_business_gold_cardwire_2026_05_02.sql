-- Remove the spurious card_wire entry for American Express Business Gold
-- recorded on 2026-05-02 (id=55, field=reward_top_rate, 4 -> 3).
--
-- Context: Auto PR #925 corrected the YAML where the 4x earn rate was
-- mistakenly placed on the everything_else line; fixing it to 1x dropped the
-- card's computed top rate from 4 to 3, which the sync logged as a
-- card_wire change. The card's actual earn rates never changed — the prior
-- YAML was wrong — so the wire entry is misleading and was posted publicly
-- in error.
--
-- Targeted by composite match (not just id) so re-running the migration is
-- a no-op if the row was already removed.

DELETE FROM card_wire
WHERE id = 55
  AND card_id = 78
  AND field = 'reward_top_rate'
  AND old_value = '4'
  AND new_value = '3';
