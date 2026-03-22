CREATE TABLE IF NOT EXISTS card_view_counts (
  card_id INT NOT NULL,
  view_date DATE NOT NULL,
  view_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (card_id, view_date),
  INDEX idx_view_date (view_date),
  CONSTRAINT fk_view_card FOREIGN KEY (card_id) REFERENCES cards(card_id) ON DELETE CASCADE
);
