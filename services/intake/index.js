import { Pool } from 'pg';

// Placeholder pipe/LMTP intake skeleton.
// TODO: implement LMTP or pipe reader; for now, stub function encryptAndStore()

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function encryptAndStore(rawRfc822, vaultboxId) {
  // TODO: use pkg/crypto to CMS-encrypt and write to Maildir
  // Insert minimal DB metadata
  await pool.query(
    'INSERT INTO messages (vaultbox_id, message_id, from_domain, to_alias, size_bytes, storage) VALUES ($1,$2,$3,$4,$5,$6)',
    [vaultboxId, null, null, null, Buffer.byteLength(rawRfc822||''), { maildir_path: 'TODO', alg: 'CMS', recipients: [] }]
  );
}

console.log('[encimap-intake] skeleton ready');
