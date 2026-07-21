-- MUST RUN LAST. apply_outcomes, card_apply_clicks, card_apply_click_counts,
-- card_stats, card_view_counts and card_wire all FK to cards with ON DELETE
-- CASCADE, so running this before the repoints above would silently cascade
-- away the loser rows' clicks, outcomes and view history.
DELETE FROM cards WHERE card_id IN (350,351,352);
