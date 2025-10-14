import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { Pool } from 'pg';

const app = express();
const PORT = process.env.INTAKE_PORT || 4321;
const MAILDIR_ROOT = process.env.MAILDIR_ROOT || '/var/mail/vaultboxes';
const DATABASE_URL = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: DATABASE_URL });

// Accept raw RFC822 payloads
app.use(express.raw({ type: '*/*', limit: '25mb' }));

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o755 });
  }
}

function generateMaildirFilename() {
  const now = Date.now();
  const rand = Math.floor(Math.random() * 1e9);
  return `${now}.${rand}.encimap:2,`;
}

function parseMetaFromRfc822(buffer) {
  try {
    const text = buffer.toString('utf8');
    const headerPart = text.split(/\r?\n\r?\n/, 1)[0] || '';
    const lines = headerPart.split(/\r?\n/);
    let fromDomain = null;
    let toAlias = null;
    for (const l of lines) {
      const low = l.toLowerCase();
      if (low.startsWith('from:')) {
        const m = l.match(/[\w.+-]+@([A-Za-z0-9.-]+)/);
        if (m && m[1]) fromDomain = m[1].toLowerCase();
      }
      if (low.startsWith('to:')) {
        const m = l.match(/([\w.+-]+)@/);
        if (m && m[1]) toAlias = m[1].toLowerCase();
      }
    }
    return { fromDomain, toAlias };
  } catch (_) {
    return { fromDomain: null, toAlias: null };
  }
}

function writeTempFile(prefix, content) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  const file = path.join(tmp, 'data.pem');
  fs.writeFileSync(file, content);
  return { dir: tmp, file };
}

function runOpenSSLEncrypt(inputBuffer, certPaths) {
  return new Promise((resolve, reject) => {
    const args = ['smime', '-encrypt', '-aes256', '-binary', '-outform', 'SMIME', ...certPaths];
    const proc = execFile('openssl', args, { maxBuffer: 15 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.toString() || err.message));
      resolve(Buffer.from(stdout));
    });
    proc.stdin.on('error', () => {});
    proc.stdin.end(inputBuffer);
  });
}

async function getVaultboxCerts(vaultboxId) {
  const r = await pool.query('SELECT public_cert_pem FROM vaultbox_certs WHERE vaultbox_id = $1 ORDER BY created_at ASC', [vaultboxId]);
  return r.rows.map(x => x.public_cert_pem);
}

async function getCertFingerprints(pems) {
  const fps = [];
  for (const pem of pems) {
    await new Promise((resolve) => setImmediate(resolve));
    const { file, dir } = writeTempFile('encimap-cert', pem);
    try {
      await new Promise((resolve, reject) => {
        execFile('openssl', ['x509', '-in', file, '-noout', '-fingerprint', '-sha256'], (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr?.toString() || err.message));
          const line = String(stdout || '').trim();
          const val = line.split('=')[1]?.replace(/:/g, '') || '';
          fps.push(`sha256:${val}`);
          resolve();
        });
      });
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  }
  return fps;
}

// Dynamic vaultbox provisioning endpoint
app.post('/intake/dynamic', async (req, res) => {
  try {
    const emailAddress = String(req.query.email || '').trim().toLowerCase();
    if (!emailAddress) {
      return res.status(400).json({ ok: false, error: 'missing email address' });
    }

    // Parse email address
    const [localPart, domain] = emailAddress.split('@');
    if (!localPart || !domain) {
      return res.status(400).json({ ok: false, error: 'invalid email format' });
    }

    // Find or create vaultbox for this email address
    let vaultboxId = await findOrCreateVaultbox(localPart, domain);
    
    return await processEmailToVaultbox(vaultboxId, req.body, res);
  } catch (error) {
    console.error('[encimap-intake] Dynamic processing error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/intake/test', async (req, res) => {
  try {
    const vaultboxId = String(req.query.vaultbox_id || '').trim();
    if (!vaultboxId) {
      return res.status(400).json({ ok: false, error: 'missing vaultbox_id' });
    }

    return await processEmailToVaultbox(vaultboxId, req.body, res);
  } catch (error) {
    console.error('[encimap-intake] Processing error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// Helper function to find or create vaultbox
async function findOrCreateVaultbox(localPart, domain) {
  try {
    // First, try to find existing vaultbox with this exact alias
    const existing = await pool.query(
      'SELECT id FROM vaultboxes WHERE domain = $1 AND alias = $2',
      [domain, localPart]
    );
    
    if (existing.rows.length > 0) {
      console.log(`[encimap-intake] Found existing vaultbox for ${localPart}@${domain}: ${existing.rows[0].id}`);
      return existing.rows[0].id;
    }

    // Get the user_id from any existing vaultbox for this domain
    const domainVaultbox = await pool.query(
      'SELECT user_id FROM vaultboxes WHERE domain = $1 LIMIT 1',
      [domain]
    );
    
    if (domainVaultbox.rows.length === 0) {
      throw new Error(`No user found for domain ${domain}`);
    }
    
    const userId = domainVaultbox.rows[0].user_id;
    
    // Create new vaultbox for this specific email address
    const newVaultbox = await pool.query(
      'INSERT INTO vaultboxes (user_id, domain, name, alias) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, domain, `${localPart.charAt(0).toUpperCase() + localPart.slice(1)} Encrypted Mailbox`, localPart]
    );
    
    const newVaultboxId = newVaultbox.rows[0].id;
    console.log(`[encimap-intake] Created new vaultbox for ${localPart}@${domain}: ${newVaultboxId}`);
    
    // Generate certificate for this specific email identity
    await generateVaultboxCertificate(localPart, domain, newVaultboxId);
    
    // Update transport mapping
    await updateTransportMapping(localPart, domain, newVaultboxId);
    
    return newVaultboxId;
  } catch (error) {
    console.error('[encimap-intake] Error in findOrCreateVaultbox:', error);
    throw error;
  }
}

// Helper function to update Postfix transport mapping
async function updateTransportMapping(localPart, domain, vaultboxId) {
  try {
    const { execFile } = require('child_process');
    const { promisify } = require('util');
    const run = promisify(execFile);
    
    const transportEntry = `${localPart}@${domain}\tencimap-pipe:${vaultboxId}`;
    
    // Add the new mapping to transport file
    await run('bash', ['-c', `echo "${transportEntry}" >> /etc/postfix/transport`]);
    
    // Rebuild transport map
    await run('postmap', ['/etc/postfix/transport']);
    
    // Reload Postfix
    await run('systemctl', ['reload', 'postfix']);
    
    console.log(`[encimap-intake] Updated transport mapping: ${transportEntry}`);
  } catch (error) {
    console.error('[encimap-intake] Error updating transport mapping:', error);
    // Don't throw - email can still be processed even if transport update fails
  }
}

// Extract email processing logic into reusable function  
async function processEmailToVaultbox(vaultboxId, emailBody, res) {
  try {
    const maildirNew = path.join(MAILDIR_ROOT, vaultboxId, 'Maildir', 'new');
    ensureDirectory(path.join(MAILDIR_ROOT, vaultboxId, 'Maildir'));
    ensureDirectory(maildirNew);

    const filename = generateMaildirFilename();
    const outPath = path.join(maildirNew, filename);
    const inputBuf = Buffer.isBuffer(emailBody) ? emailBody : Buffer.from(String(emailBody || ''), 'utf8');

    // Fetch certs; require at least one
    const pems = await getVaultboxCerts(vaultboxId);
    if (pems.length === 0) {
      return res.status(400).json({ ok: false, error: 'no_certificates' });
    }

    // Write certs to temp files for openssl
    const tmpDirs = [];
    const certPaths = [];
    try {
      for (const pem of pems) {
        const { dir, file } = writeTempFile('encimap-cert', pem);
        tmpDirs.push(dir);
        certPaths.push(file);
      }

      const encBuf = await runOpenSSLEncrypt(inputBuf, certPaths);
      fs.writeFileSync(outPath, encBuf, { mode: 0o644 });

      // Parse metadata and insert DB row
      const { fromDomain, toAlias } = parseMetaFromRfc822(inputBuf);
      const fps = await getCertFingerprints(pems);
      const storage = {
        maildir_path: outPath,
        bytes: encBuf.length,
        alg: 'smime-aes256',
        recipients: fps,
      };
      await pool.query(
        'INSERT INTO messages (vaultbox_id, from_domain, to_alias, size_bytes, storage) VALUES ($1,$2,$3,$4,$5)',
        [vaultboxId, fromDomain, toAlias, encBuf.length, storage]
      );

      return res.json({ ok: true, path: outPath, bytes: encBuf.length });
    } finally {
      for (const d of tmpDirs) {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
      }
    }
  } catch (error) {
    console.error('[encimap-intake] Error processing email to vaultbox:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// PORT already defined at the top of the file
app.listen(PORT, () => {
  console.log(`[encimap-intake] listening on ${PORT}, maildir root ${MAILDIR_ROOT}`);
});

