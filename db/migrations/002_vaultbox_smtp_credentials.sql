-- Migration: Dedicated SMTP Credentials for Vaultboxes
-- Separates vaultbox SMTP from regular motorblocks for clean architecture

-- Create dedicated table for vaultbox SMTP credentials
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
    security_type TEXT DEFAULT 'STARTTLS', -- STARTTLS, TLS, PLAIN
    
    -- Usage tracking (lightweight)
    messages_sent_count INTEGER DEFAULT 0,
    last_message_sent TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT unique_vaultbox_smtp_credentials UNIQUE(vaultbox_id),
    CONSTRAINT valid_security_type CHECK (security_type IN ('STARTTLS', 'TLS', 'PLAIN')),
    CONSTRAINT valid_port CHECK (port > 0 AND port <= 65535)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_vaultbox_smtp_credentials_vaultbox_id ON vaultbox_smtp_credentials(vaultbox_id);
CREATE INDEX IF NOT EXISTS idx_vaultbox_smtp_credentials_username ON vaultbox_smtp_credentials(username);
CREATE INDEX IF NOT EXISTS idx_vaultbox_smtp_credentials_enabled ON vaultbox_smtp_credentials(enabled);

-- Create function to generate unique vaultbox SMTP usernames
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
    
    -- Ensure uniqueness by adding suffix if needed
    WHILE EXISTS (SELECT 1 FROM vaultbox_smtp_credentials WHERE username = final_username) LOOP
        suffix_counter := suffix_counter + 1;
        final_username := base_username || '-' || suffix_counter;
    END LOOP;
    
    RETURN final_username;
END;
$$ LANGUAGE plpgsql;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_vaultbox_smtp_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER trigger_vaultbox_smtp_credentials_updated_at
    BEFORE UPDATE ON vaultbox_smtp_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_vaultbox_smtp_credentials_updated_at();

-- Add column to track SMTP capability in vaultboxes table
ALTER TABLE vaultboxes ADD COLUMN IF NOT EXISTS smtp_enabled BOOLEAN DEFAULT false;

-- Create index for SMTP-enabled vaultboxes
CREATE INDEX IF NOT EXISTS idx_vaultboxes_smtp_enabled ON vaultboxes(smtp_enabled);

-- Grant permissions to motorical user
GRANT ALL PRIVILEGES ON vaultbox_smtp_credentials TO motorical;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO motorical;
