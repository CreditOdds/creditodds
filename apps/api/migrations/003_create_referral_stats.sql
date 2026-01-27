-- Create referral_stats table to track impressions and clicks
CREATE TABLE IF NOT EXISTS referral_stats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  referral_id INT NOT NULL,
  event_type ENUM('impression', 'click') NOT NULL,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_referral_id (referral_id),
  INDEX idx_event_type (event_type),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (referral_id) REFERENCES referrals(referral_id) ON DELETE CASCADE
);
