-- Allow multiple instances of the same card in a user's wallet (e.g. two Citi Custom Cash
-- with different acquired dates, or a downgrade where the source card is also retained).
-- Per-card identity is provided by user_cards.id (auto-increment PK); ratings remain
-- one-per-(user_id, card_id) via card_ratings, which is the desired behavior.
ALTER TABLE user_cards DROP INDEX unique_user_card;
