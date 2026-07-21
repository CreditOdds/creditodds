-- MUST RUN LAST. Six FKs to cards are ON DELETE CASCADE, so running this before
-- the repoints above would cascade away the rows they just moved (notably the
-- five Citi Simplicity approval records handed to 311 by 052l).
DELETE FROM cards WHERE card_id IN (15,70,71,113,306,307);
