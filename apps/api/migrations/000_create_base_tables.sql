-- Bootstrap migration: create the core tables that predate the migration system
-- Run this FIRST on a fresh database before running any other migrations
--
-- Schema sourced from CONTRIBUTING.md

-- Cards table: master card data, synced from CDN via update-cards-github handler
CREATE TABLE IF NOT EXISTS cards (
  card_id INT AUTO_INCREMENT PRIMARY KEY,
  card_name VARCHAR(255) NOT NULL,
  bank VARCHAR(255),
  card_image_link VARCHAR(500),
  accepting_applications TINYINT DEFAULT 1,
  card_referral_link VARCHAR(500),
  slug VARCHAR(255),
  tags JSON,
  release_date VARCHAR(50),
  annual_fee VARCHAR(50),
  active TINYINT DEFAULT 1,
  INDEX idx_card_name (card_name),
  INDEX idx_slug (slug)
);

-- Records table: user-submitted credit card application results
CREATE TABLE IF NOT EXISTS records (
  record_id INT AUTO_INCREMENT PRIMARY KEY,
  card_id INT NOT NULL,
  submitter_id VARCHAR(255),
  credit_score INT,
  credit_score_source INT,
  result TINYINT NOT NULL,
  listed_income INT,
  length_credit INT,
  starting_credit_limit INT,
  reason_denied VARCHAR(255),
  date_applied DATE,
  bank_customer TINYINT,
  inquiries_3 INT,
  inquiries_12 INT,
  inquiries_24 INT,
  submitter_ip_address VARCHAR(45),
  submit_datetime DATETIME,
  admin_review TINYINT DEFAULT 0,
  active TINYINT DEFAULT 1,
  INDEX idx_card_id (card_id),
  INDEX idx_submitter_id (submitter_id),
  INDEX idx_submit_datetime (submit_datetime),
  FOREIGN KEY (card_id) REFERENCES cards(card_id)
);

-- Referrals table: user-submitted referral links
CREATE TABLE IF NOT EXISTS referrals (
  referral_id INT AUTO_INCREMENT PRIMARY KEY,
  card_id INT NOT NULL,
  referral_link VARCHAR(500),
  submitter_id VARCHAR(255),
  submitter_ip_address VARCHAR(45),
  submit_datetime DATETIME,
  admin_approved TINYINT DEFAULT 0,
  INDEX idx_card_id (card_id),
  INDEX idx_submitter_id (submitter_id),
  FOREIGN KEY (card_id) REFERENCES cards(card_id)
);
