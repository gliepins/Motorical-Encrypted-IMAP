CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS vaultboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  domain TEXT NOT NULL,
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  limits JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vaultbox_certs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vaultbox_id UUID NOT NULL REFERENCES vaultboxes(id) ON DELETE CASCADE,
  label VARCHAR(100),
  public_cert_pem TEXT NOT NULL,
  fingerprint_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vaultbox_id UUID NOT NULL REFERENCES vaultboxes(id) ON DELETE CASCADE,
  message_id VARCHAR(255),
  from_domain VARCHAR(255),
  to_alias VARCHAR(255),
  size_bytes INTEGER,
  received_at TIMESTAMPTZ DEFAULT now(),
  storage JSONB NOT NULL,
  headers_meta JSONB,
  flags JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT ARRAY[]::TEXT[]
);
