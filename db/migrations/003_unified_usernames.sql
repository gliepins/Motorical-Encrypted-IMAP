-- Migration: Unified Username System for IMAP and SMTP Credentials
-- Date: 2025-09-10
-- Purpose: Add password_hash to imap_app_credentials for unified credential management

\c motorical_encrypted_imap;

-- Add password_hash column to imap_app_credentials table for secure password storage
ALTER TABLE imap_app_credentials 
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Add updated_at column for consistency with SMTP credentials
ALTER TABLE imap_app_credentials 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create index for efficient vaultbox-based lookups
CREATE INDEX IF NOT EXISTS idx_imap_app_credentials_vaultbox_id ON imap_app_credentials(vaultbox_id);

-- Update grants for encimap user
GRANT ALL PRIVILEGES ON TABLE imap_app_credentials TO encimap;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO encimap;

-- NOTE: This migration enables unified username generation where IMAP and SMTP 
-- credentials for the same vaultbox will use the same standardized format:
-- encimap-{domain-with-hyphens}-{random-suffix}
