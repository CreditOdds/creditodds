-- Add archived_at column to referrals table
-- When set, the referral link is inactive but stats are preserved
ALTER TABLE referrals ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL;
CREATE INDEX idx_referrals_archived_at ON referrals (archived_at);
