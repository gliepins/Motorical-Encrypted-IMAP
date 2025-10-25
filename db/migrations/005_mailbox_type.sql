-- Add mailbox_type column to vaultboxes table
-- Supports unified mailbox system (encrypted + simple)

ALTER TABLE vaultboxes 
ADD COLUMN IF NOT EXISTS mailbox_type VARCHAR(20) DEFAULT 'encrypted' CHECK (mailbox_type IN ('encrypted', 'simple'));

-- Create index for mailbox type filtering
CREATE INDEX IF NOT EXISTS idx_vaultboxes_mailbox_type ON vaultboxes(mailbox_type);

-- Create index for filtering by user and type
CREATE INDEX IF NOT EXISTS idx_vaultboxes_user_type ON vaultboxes(user_id, mailbox_type);

-- Update existing vaultboxes to be 'encrypted' type
UPDATE vaultboxes SET mailbox_type = 'encrypted' WHERE mailbox_type IS NULL;

COMMENT ON COLUMN vaultboxes.mailbox_type IS 'Type of mailbox: encrypted (S/MIME with certs) or simple (standard IMAP)';

