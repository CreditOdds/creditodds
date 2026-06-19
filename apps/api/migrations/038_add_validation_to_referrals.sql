ALTER TABLE referrals
  ADD COLUMN last_validated_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN validation_status VARCHAR(16) NULL DEFAULT NULL,
  ADD COLUMN validation_consecutive_failures INT NOT NULL DEFAULT 0,
  ADD INDEX idx_referrals_validation_due (admin_approved, archived_at, last_validated_at);
