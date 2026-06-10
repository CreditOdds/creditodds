-- Delete duplicate card_wire rows that fired within a 60-second window
-- (same card_id, field, old_value, new_value). Keeps the lowest id from
-- each cluster. Triggered by today's near-simultaneous merges of PRs
-- #1358 and #1359, where two webhook-fired Lambda invocations both saw
-- the same CDN diff and same stale DB state and each wrote a full set
-- of wire rows. The lock added to update-cards-github.js prevents this
-- from recurring; this migration cleans up the already-written dupes.
DELETE w1 FROM card_wire w1
INNER JOIN card_wire w2
  ON w1.card_id = w2.card_id
  AND w1.field = w2.field
  AND w1.old_value <=> w2.old_value
  AND w1.new_value <=> w2.new_value
  AND w1.id > w2.id
  AND TIMESTAMPDIFF(SECOND, w2.changed_at, w1.changed_at) BETWEEN 0 AND 60;
