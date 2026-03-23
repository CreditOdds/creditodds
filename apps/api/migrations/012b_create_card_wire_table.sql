CREATE TABLE IF NOT EXISTS card_wire (
  id INT AUTO_INCREMENT PRIMARY KEY,
  card_id INT NOT NULL,
  field VARCHAR(50) NOT NULL,
  old_value VARCHAR(100) DEFAULT NULL,
  new_value VARCHAR(100) DEFAULT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_card_changed (card_id, changed_at DESC),
  CONSTRAINT fk_wire_card FOREIGN KEY (card_id) REFERENCES cards(card_id) ON DELETE CASCADE
);
