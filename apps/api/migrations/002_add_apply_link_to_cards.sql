-- Add apply_link column to cards table for direct application links
ALTER TABLE cards ADD COLUMN apply_link VARCHAR(500) NULL AFTER accepting_applications;
