-- Product changes sourced from r/CreditCards, kept OUT of wallet_card_events.
-- That table is a member's personal wallet history: user_id means a real
-- account, and every product_change row there is paired with an actual
-- user_cards row. Injecting synthetic reporters would leave a landmine for any
-- future query that forgets the per-user scope, and Reddit rows need
-- provenance columns (permalink, evidence) that would be null for 100% of real
-- wallet rows. The card-product-changes endpoint UNIONs the two and reports the
-- split, so the diagram can stay honest about where each report came from.
--
-- source_id carries an optional #N suffix because one post can describe several
-- hops ("AA Plat -> Mile Up -> Custom Cash"); each hop is its own row, and the
-- UNIQUE key is what makes re-importing the whole directory idempotent.
CREATE TABLE reddit_product_changes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_id VARCHAR(64) NOT NULL,
  old_card_id INT NOT NULL,
  new_card_id INT NOT NULL,
  change_month DATE NOT NULL,
  reason VARCHAR(16) NULL,
  evidence VARCHAR(500) NULL,
  permalink VARCHAR(500) NULL,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_reddit_pc_source (source_id),
  INDEX idx_reddit_pc_old_card (old_card_id),
  INDEX idx_reddit_pc_new_card (new_card_id)
);
