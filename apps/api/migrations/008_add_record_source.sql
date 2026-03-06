-- Add source tracking to records table for Reddit listener and future integrations
-- source: 'user' (default, existing records), 'reddit', 'admin'
-- source_url: URL to the original Reddit post (or other source)

ALTER TABLE records ADD COLUMN source VARCHAR(20) DEFAULT 'user' AFTER admin_review;
ALTER TABLE records ADD COLUMN source_url VARCHAR(500) DEFAULT NULL AFTER source;

-- Index for filtering pending Reddit records in admin console
CREATE INDEX idx_records_source_review ON records (source, admin_review);
