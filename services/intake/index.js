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

app.post('/intake/test', async (req, res) => {
  try {
    const vaultboxId = String(req.query.vaultbox_id || '').trim();
    if (!vaultboxId) {
      return res.status(400).json({ ok: false, error: 'missing vaultbox_id' });
    }

    const maildirNew = path.join(MAILDIR_ROOT, vaultboxId, 'Maildir', 'new');
    ensureDirectory(path.join(MAILDIR_ROOT, vaultboxId, 'Maildir'));
    ensureDirectory(maildirNew);

    const filename = generateMaildirFilename();
    const outPath = path.join(maildirNew, filename);
    const inputBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''), 'utf8');

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
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`[encimap-intake] listening on ${PORT}, maildir root ${MAILDIR_ROOT}`);
});

