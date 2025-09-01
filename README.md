# Motorical Encrypted IMAP (skeleton)

Zero‑knowledge inbound email: messages are S/MIME‑encrypted at intake and served via IMAPS for client‑side decryption.

## Services
- intake: LMTP/pipe intake (stub)
- api: S2S management (vaultboxes, certs), health

## Database
- Postgres DB: motorical_encrypted_imap
- See db/migrations/001_base.sql

## Systemd
- deploy/systemd/*.service

## Env
DATABASE_URL=postgresql://encimap:***@localhost:5432/motorical_encrypted_imap
S2S_JWT_PUBLIC_BASE64=base64-encoded-RS256-public-key
MAILDIR_ROOT=/var/mail/vaultboxes

## Next
- Implement CMS encryption (S/MIME) in pkg/crypto
- LMTP listener in intake
- S2S endpoints for rules/webhooks
- Dovecot/transport wiring
