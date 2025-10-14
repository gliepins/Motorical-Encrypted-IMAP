-- Setup Script for Clean Vaultbox SMTP Architecture
-- Run this to set up the ENCRYPTED IMAP database for dedicated vaultbox SMTP credentials

-- IMPORTANT: This uses the ENCRYPTED IMAP database, NOT the main Motorical database
-- Connect as postgres user:
-- sudo -u postgres psql -d motorical_encrypted_imap -f setup-database.sql

\echo '🚀 Setting up Encrypted IMAP with Clean Vaultbox SMTP Architecture'
\echo '=================================================================='

-- Create vaultbox_smtp_credentials table with all features
CREATE TABLE IF NOT EXISTS vaultbox_smtp_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vaultbox_id UUID NOT NULL REFERENCES vaultboxes(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_used TIMESTAMPTZ,
    enabled BOOLEAN DEFAULT true,
    
    -- SMTP configuration
    host TEXT DEFAULT 'mail.motorical.com',
    port INTEGER DEFAULT 587,
    security_type TEXT DEFAULT 'STARTTLS',
    
    -- Usage tracking
    messages_sent_count INTEGER DEFAULT 0,
    last_message_sent TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT unique_vaultbox_smtp_credentials UNIQUE(vaultbox_id),
    CONSTRAINT valid_security_type CHECK (security_type IN ('STARTTLS', 'TLS', 'PLAIN')),
    CONSTRAINT valid_port CHECK (port > 0 AND port <= 65535)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vaultbox_smtp_credentials_vaultbox_id ON vaultbox_smtp_credentials(vaultbox_id);
CREATE INDEX IF NOT EXISTS idx_vaultbox_smtp_credentials_username ON vaultbox_smtp_credentials(username);
CREATE INDEX IF NOT EXISTS idx_vaultbox_smtp_credentials_enabled ON vaultbox_smtp_credentials(enabled);

-- Add smtp_enabled column to vaultboxes table
ALTER TABLE vaultboxes ADD COLUMN IF NOT EXISTS smtp_enabled BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_vaultboxes_smtp_enabled ON vaultboxes(smtp_enabled);

-- Create helper function for username generation
CREATE OR REPLACE FUNCTION generate_vaultbox_smtp_username(domain_name TEXT, vaultbox_uuid UUID)
RETURNS TEXT AS $$
DECLARE
    base_username TEXT;
    final_username TEXT;
    suffix_counter INTEGER := 0;
BEGIN
    -- Create base username: vaultbox-domain-shortid
    base_username := 'vaultbox-' || 
                     LOWER(REPLACE(domain_name, '.', '-')) || '-' ||
                     SUBSTRING(vaultbox_uuid::TEXT, 1, 8);
    
    final_username := base_username;
    
    -- Ensure uniqueness
    WHILE EXISTS (SELECT 1 FROM vaultbox_smtp_credentials WHERE username = final_username) LOOP
        suffix_counter := suffix_counter + 1;
        final_username := base_username || '-' || suffix_counter;
    END LOOP;
    
    RETURN final_username;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_vaultbox_smtp_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_vaultbox_smtp_credentials_updated_at ON vaultbox_smtp_credentials;
CREATE TRIGGER trigger_vaultbox_smtp_credentials_updated_at
    BEFORE UPDATE ON vaultbox_smtp_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_vaultbox_smtp_credentials_updated_at();

-- Grant permissions to encimap user (encrypted IMAP database user)
GRANT ALL PRIVILEGES ON vaultbox_smtp_credentials TO encimap;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO encimap;

-- Test the setup
\echo ''
\echo '🔍 Testing setup...'

-- Test function
SELECT generate_vaultbox_smtp_username('example.com', gen_random_uuid()) as sample_username;

-- Check table structure
\d vaultbox_smtp_credentials

-- Summary
\echo ''
\echo '✅ Database setup completed successfully!'
\echo ''
\echo '📋 What was created:'
\echo '   • vaultbox_smtp_credentials table with indexes'
\echo '   • smtp_enabled column in vaultboxes table'
\echo '   • Username generation function'
\echo '   • Automatic timestamp triggers'
\echo '   • Proper permissions for motorical user'
\echo ''
\echo '🚀 Ready for clean vaultbox-motorblock separation!'
