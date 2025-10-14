-- Migration: Add alias column to vaultboxes table
-- This stores the username/local-part for proper email display

ALTER TABLE vaultboxes 
ADD COLUMN alias VARCHAR(100);

-- Add index for alias lookups
CREATE INDEX IF NOT EXISTS idx_vaultboxes_alias ON vaultboxes(alias);

-- Update existing vaultboxes to have a default alias based on name
-- This is a one-time migration for existing data
UPDATE vaultboxes 
SET alias = 'user' 
WHERE alias IS NULL;
