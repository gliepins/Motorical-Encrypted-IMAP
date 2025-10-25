-- Migration: Simple IMAP Aliases and Catch‑All (Receiving Only)
-- Date: 2025-10-24
-- DB: motorical_encrypted_imap

BEGIN;

-- Ensure citext extension exists for case-insensitive emails/domains
CREATE EXTENSION IF NOT EXISTS citext;

-- 1) Receive-only aliases per simple mailbox (vaultbox)
CREATE TABLE IF NOT EXISTS simple_mailbox_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vaultbox_id UUID NOT NULL REFERENCES vaultboxes(id) ON DELETE CASCADE,
    alias_email CITEXT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_simple_mailbox_aliases_vaultbox_id
    ON simple_mailbox_aliases(vaultbox_id);

-- 2) Per-domain catch-all binding (simple mailbox only)
CREATE TABLE IF NOT EXISTS simple_domain_catchall (
    domain CITEXT PRIMARY KEY,
    vaultbox_id UUID NOT NULL UNIQUE REFERENCES vaultboxes(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL
);

-- 3) Views for Postfix pgsql maps
--    Map exact aliases to the primary email (alias@domain) of the bound simple vaultbox
CREATE OR REPLACE VIEW virtual_aliases_map AS
SELECT 
    a.alias_email::citext AS alias_email,
    (v.alias || '@' || v.domain)::citext AS primary_email,
    a.active
FROM simple_mailbox_aliases a
JOIN vaultboxes v ON v.id = a.vaultbox_id
WHERE v.mailbox_type = 'simple' AND a.active = TRUE;

--    Map domain catch-all to the primary email of the bound simple vaultbox
CREATE OR REPLACE VIEW virtual_catchall_map AS
SELECT 
    c.domain::citext AS domain,
    (v.alias || '@' || v.domain)::citext AS primary_email,
    c.enabled
FROM simple_domain_catchall c
JOIN vaultboxes v ON v.id = c.vaultbox_id
WHERE v.mailbox_type = 'simple' AND c.enabled = TRUE;

-- 4) Grants (read-only for map user)
-- Adjust role if your Postfix connects as another DB user
DO $$
BEGIN
  -- Grant to encimap service role if exists
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'encimap') THEN
    GRANT USAGE ON SCHEMA public TO encimap;
    GRANT SELECT ON virtual_aliases_map TO encimap;
    GRANT SELECT ON virtual_catchall_map TO encimap;
  END IF;
END$$;

COMMIT;
