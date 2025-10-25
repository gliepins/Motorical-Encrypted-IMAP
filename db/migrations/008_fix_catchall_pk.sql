-- Migration: Add primary key id to simple_domain_catchall and keep domain unique
-- Date: 2025-10-24
-- DB: motorical_encrypted_imap

BEGIN;

-- Drop existing primary key on domain
ALTER TABLE simple_domain_catchall DROP CONSTRAINT IF EXISTS simple_domain_catchall_pkey;

-- Add id column and backfill
ALTER TABLE simple_domain_catchall ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
UPDATE simple_domain_catchall SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE simple_domain_catchall ALTER COLUMN id SET NOT NULL;

-- Set new primary key
ALTER TABLE simple_domain_catchall ADD CONSTRAINT simple_domain_catchall_pk PRIMARY KEY (id);

-- Ensure domain remains unique
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'simple_domain_catchall_domain_key'
  ) THEN
    ALTER TABLE simple_domain_catchall ADD CONSTRAINT simple_domain_catchall_domain_key UNIQUE (domain);
  END IF;
END$$;

COMMIT;
