-- One-off: re-queue referrals 36, 38, 44 for the validator.
--
-- The smoke run on 2026-06-05 flagged these three as expired (Amex Gold,
-- Chase Freedom Unlimited via HTTP 404, Hilton Honors) and set
-- validation_consecutive_failures = 1 each. Owner confirmed all three
-- truly dead. Auto-archive trips on the second consecutive failed check,
-- but the List Lambda filters out anything validated in the last 7 days,
-- so they would not surface again until Monday's cron.
--
-- Resetting last_validated_at to NULL puts them back at the front of the
-- NULLs-first queue so the next workflow_dispatch can confirm + archive
-- them now. Counter stays at 1 — the next failed check pushes it to 2
-- and triggers archived_at = NOW(), archived_reason = 'auto: expired'.
UPDATE referrals
SET last_validated_at = NULL
WHERE referral_id IN (36, 38, 44);
