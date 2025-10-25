-- Migration: Create mta_routes table for PostfixMTA logging
-- Date: 2025-10-24
-- DB: motorical_encrypted_imap

BEGIN;

CREATE TABLE IF NOT EXISTS mta_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain CITEXT,
    email_address CITEXT,
    vaultbox_id UUID,
    route_type TEXT,
    priority INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    options JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ,
    removed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mta_routes_domain ON mta_routes(domain);
CREATE INDEX IF NOT EXISTS idx_mta_routes_email ON mta_routes(email_address);
CREATE INDEX IF NOT EXISTS idx_mta_routes_active ON mta_routes(active);

-- optional FK, keep loose coupling to avoid failures if vaultbox removed first
-- ALTER TABLE mta_routes
--   ADD CONSTRAINT fk_mta_routes_vaultbox
--   FOREIGN KEY (vaultbox_id) REFERENCES vaultboxes(id) ON DELETE SET NULL;

-- Grants for encimap role if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encimap') THEN
    GRANT USAGE ON SCHEMA public TO encimap;
    GRANT SELECT, INSERT, UPDATE ON mta_routes TO encimap;
  END IF;
END$$;

COMMIT;
