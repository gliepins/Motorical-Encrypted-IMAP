import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import fs from 'fs';
import { execFile } from 'child_process';
import os from 'os';

const app = express();
app.use(express.json({ limit: '2mb' }));

// Config
const PORT = process.env.PORT || 4301;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_PUBLIC = process.env.S2S_JWT_PUBLIC_BASE64 ? Buffer.from(process.env.S2S_JWT_PUBLIC_BASE64, 'base64').toString('utf8') : null;

const pool = new Pool({ connectionString: DATABASE_URL });

function authenticateS2S(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'missing bearer' });
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_PUBLIC, { algorithms: ['RS256'], audience: 'encimap.svc' });
    req.svc = payload.sub || 'motorical-backend';
    next();
  } catch (e) {
    return res.status(403).json({ success: false, error: 'invalid token' });
  }
}

app.get('/s2s/v1/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ status: 'db_error' });
  }
});

app.use('/s2s/v1', authenticateS2S);

// List user's vaultboxes with domain and cert presence
app.get('/s2s/v1/vaultboxes', async (req, res) => {
  try {
    const userId = (req.query.user_id || '').toString();
    if (!userId) return res.status(400).json({ success: false, error: 'missing user_id' });
    const r = await pool.query(
      `SELECT v.id, v.domain, v.name, v.alias,
              EXISTS (SELECT 1 FROM vaultbox_certs c WHERE c.vaultbox_id = v.id) AS has_certs,
              (SELECT COUNT(*) FROM messages m WHERE m.vaultbox_id = v.id) AS messages
         FROM vaultboxes v
        WHERE v.user_id = $1
        ORDER BY v.created_at DESC`,
      [userId]
    );
    res.json({ success: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

async function ensureTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS imap_app_credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        username TEXT UNIQUE NOT NULL,
        vaultbox_id UUID,
        created_at TIMESTAMPTZ DEFAULT now(),
        revoked_at TIMESTAMPTZ
      );
    `);
    // Add column for mapping if upgrading from older schema
    await pool.query('ALTER TABLE imap_app_credentials ADD COLUMN IF NOT EXISTS vaultbox_id UUID');
  } catch (e) {
    // log only
    console.error('ensureTables failed', e);
  }
}

ensureTables().catch(()=>{});

app.post('/s2s/v1/vaultboxes', async (req, res) => {
  const { user_id, domain, name, alias } = req.body || {};
  if (!user_id || !domain || !name) return res.status(400).json({ success: false, error: 'missing fields' });
  try {
    const r = await pool.query(
      'INSERT INTO vaultboxes (user_id, domain, name, alias) VALUES ($1,$2,$3,$4) RETURNING id',
      [user_id, String(domain || '').toLowerCase(), name, alias || null]
    );
    const vbId = r.rows[0].id;

    // If alias provided, add per-recipient transport mapping: alias@domain -> encimap-pipe:vbId
    const normDomain = String(domain || '').toLowerCase();
    const local = String(alias || '').toLowerCase().replace(/[^a-z0-9._+-]/g, '');
    if (local) {
      const transportPath = '/etc/postfix/transport';
      if (!fs.existsSync(transportPath)) fs.writeFileSync(transportPath, '');
      const key = `${local}@${normDomain}`;
      const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      ensureLine(transportPath, re, `${key}\tencimap-pipe:${vbId}`);
      await run('postmap', [transportPath]);
      try { await run('systemctl', ['reload', 'postfix']); } catch { await run('systemctl', ['restart', 'postfix']); }
      try { console.log('[encimap-api] alias mapping added', { key, vbId }); } catch (_) {}
    }

    res.json({ success: true, data: { id: vbId } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'db insert failed' });
  }
});

app.post('/s2s/v1/vaultboxes/:id/certs', async (req, res) => {
  const { label, public_cert_pem } = req.body || {};
  if (!public_cert_pem) return res.status(400).json({ success: false, error: 'missing cert' });
  try {
    const fp = 'sha256:' + Buffer.from(public_cert_pem).toString('base64').slice(0,32); // placeholder; compute real fp in crypto pkg
    const r = await pool.query(
      'INSERT INTO vaultbox_certs (vaultbox_id, label, public_cert_pem, fingerprint_sha256) VALUES ($1,$2,$3,$4) RETURNING id',
      [req.params.id, label || null, public_cert_pem, fp]
    );
    res.json({ success: true, data: { id: r.rows[0].id, fingerprint: fp } });
  } catch (e) {
    res.status(500).json({ success: false, error: 'db insert failed' });
  }
});

// --- Domain management (transport + relay_domains) ---

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 15000, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.toString() || err.message));
      resolve({ stdout: stdout?.toString() || '', stderr: stderr?.toString() || '' });
    });
  });
}

async function ensureDovecotPassdb() {
  const passdbPath = '/etc/dovecot/encimap.passwd';
  const includePath = '/etc/dovecot/conf.d/99-encimap-passdb.conf';
  if (!fs.existsSync(passdbPath)) fs.writeFileSync(passdbPath, '', { mode: 0o640 });
  // Enforce config to use userdb prefetch so per-user fields from passwd-file are respected
  const conf = `passdb {\n  driver = passwd-file\n  args = scheme=SHA512-CRYPT /etc/dovecot/encimap.passwd\n}\n\nuserdb {\n  driver = prefetch\n}\n`;
  try {
    const current = fs.existsSync(includePath) ? fs.readFileSync(includePath, 'utf8') : '';
    if (current !== conf) {
      fs.writeFileSync(includePath, conf, { mode: 0o644 });
      try { await run('systemctl', ['reload', 'dovecot']); } catch (_) {}
    }
  } catch (_) {
    // best effort
  }
  return { passdbPath };
}

let encimapUid = null;
let encimapGid = null;
async function ensureEncimapUidGid() {
  if (encimapUid && encimapGid) return { uid: encimapUid, gid: encimapGid };
  try {
    const u = await run('id', ['-u', 'encimap']);
    const g = await run('id', ['-g', 'encimap']);
    encimapUid = String(u.stdout || '').trim() || '995';
    encimapGid = String(g.stdout || '').trim() || '986';
  } catch (_) {
    encimapUid = '995';
    encimapGid = '986';
  }
  return { uid: encimapUid, gid: encimapGid };
}

function randomPassword(len = 24) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%^&*_-';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function buildPassdbLine(username, hash, vaultboxId) {
  // Append per-user userdb overrides so arbitrary usernames can map to a specific vaultbox
  // Dovecot passwd-file supports extra key=value fields separated by tabs
  const home = vaultboxId ? `/var/mail/vaultboxes/${vaultboxId}` : null;
  const mail = vaultboxId ? `maildir:/var/mail/vaultboxes/${vaultboxId}/Maildir` : null;
  const fields = [];
  if (home) fields.push(`userdb_home=${home}`);
  if (mail) fields.push(`userdb_mail=${mail}`);
  if (encimapUid && encimapGid) {
    fields.push(`userdb_uid=${encimapUid}`);
    fields.push(`userdb_gid=${encimapGid}`);
  }
  return fields.length ? `${username}:${hash}\t${fields.join('\t')}` : `${username}:${hash}`;
}

// Create IMAP app credentials and load into Dovecot passwd-file
app.post('/s2s/v1/imap-credentials', async (req, res) => {
  const { user_id, vaultbox_id } = req.body || {};
  if (!user_id) return res.status(400).json({ success: false, error: 'missing user_id' });
  try {
    await ensureDovecotPassdb();
    await ensureEncimapUidGid();
    const username = `imap-${Math.random().toString(36).slice(2, 8)}`;
    const password = randomPassword(20);
    // Hash with Dovecot's tool
    const out = await run('doveadm', ['pw', '-s', 'SHA512-CRYPT', '-p', password]);
    const hash = out.stdout.trim(); // e.g., {SHA512-CRYPT}$6$...
    // Append to passwd-file with optional per-user mapping
    fs.appendFileSync('/etc/dovecot/encimap.passwd', buildPassdbLine(username, hash, vaultbox_id) + '\n');
    try { await run('systemctl', ['reload', 'dovecot']); } catch (_) {}
    // persist mapping (no plaintext)
    try { await pool.query('INSERT INTO imap_app_credentials (user_id, username, vaultbox_id) VALUES ($1,$2,$3)', [user_id, username, vaultbox_id || null]); } catch (_) {}
    return res.json({ success: true, data: { username, password, vaultbox_id: vaultbox_id || null } });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Get latest active IMAP app-credentials (username only)
app.get('/s2s/v1/imap-credentials', async (req, res) => {
  const userId = (req.query.user_id || '').toString();
  if (!userId) return res.status(400).json({ success: false, error: 'missing user_id' });
  try {
    const r = await pool.query(
      `SELECT username FROM imap_app_credentials 
         WHERE user_id = $1 AND revoked_at IS NULL 
         ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    const row = r.rows[0] || null;
    res.json({ success: true, data: row || null });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Rotate password for an existing IMAP username (keep username stable)
app.post('/s2s/v1/imap-credentials/:username/rotate', async (req, res) => {
  const username = (req.params.username || '').toString().trim();
  if (!username) return res.status(400).json({ success: false, error: 'missing username' });
  try {
    await ensureDovecotPassdb();
    await ensureEncimapUidGid();
    // Ensure username exists and is active
    const exists = await pool.query(
      'SELECT vaultbox_id FROM imap_app_credentials WHERE username = $1 AND revoked_at IS NULL LIMIT 1',
      [username]
    );
    if (!exists.rows.length) {
      return res.status(404).json({ success: false, error: 'username not found or revoked' });
    }
    const currentVb = exists.rows[0]?.vaultbox_id || null;

    const password = randomPassword(20);
    const out = await run('doveadm', ['pw', '-s', 'SHA512-CRYPT', '-p', password]);
    const hash = out.stdout.trim();

    // Replace the existing line in passwd-file; append if somehow missing
    const path = '/etc/dovecot/encimap.passwd';
    const lines = fs.existsSync(path) ? fs.readFileSync(path, 'utf8').split(/\r?\n/) : [];
    let replaced = false;
    const updated = lines.map(line => {
      if (line && line.startsWith(`${username}:`)) { replaced = true; return buildPassdbLine(username, hash, currentVb); }
      return line;
    });
    if (!replaced) updated.push(`${username}:${hash}`);
    fs.writeFileSync(path, updated.filter(Boolean).join('\n') + '\n');
    try { await run('systemctl', ['reload', 'dovecot']); } catch (_) {}
    // Flush Dovecot auth cache for this user to avoid stale password
    try { await run('doveadm', ['auth', 'cache', 'flush', '-u', username]); } catch (_) {}

    return res.json({ success: true, data: { username, password } });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Set password for an existing IMAP username to a specific value
app.post('/s2s/v1/imap-credentials/:username/set', async (req, res) => {
  const username = (req.params.username || '').toString().trim();
  const password = (req.body?.password || '').toString();
  const vaultboxId = (req.body?.vaultbox_id || '').toString().trim() || null;
  const userId = (req.body?.user_id || '').toString().trim() || null;
  if (!username || !password) return res.status(400).json({ success: false, error: 'missing username or password' });
  try {
    await ensureDovecotPassdb();
    await ensureEncimapUidGid();
    // Check if exists
    const exists = await pool.query('SELECT vaultbox_id FROM imap_app_credentials WHERE username = $1 AND revoked_at IS NULL LIMIT 1', [username]);
    const out = await run('doveadm', ['pw', '-s', 'SHA512-CRYPT', '-p', password]);
    const hash = out.stdout.trim();
    const path = '/etc/dovecot/encimap.passwd';
    const lines = fs.existsSync(path) ? fs.readFileSync(path, 'utf8').split(/\r?\n/) : [];
    let replaced = false;

    let effectiveVb = vaultboxId;
    if (exists.rows.length) {
      if (!effectiveVb) effectiveVb = exists.rows[0]?.vaultbox_id || null;
      const updated = lines.map(line => {
        if (line && line.startsWith(`${username}:`)) { replaced = true; return buildPassdbLine(username, hash, effectiveVb); }
        return line;
      });
      if (!replaced) updated.push(`${username}:${hash}`);
      fs.writeFileSync(path, updated.filter(Boolean).join('\n') + '\n');
      if (vaultboxId) {
        try { await pool.query('UPDATE imap_app_credentials SET vaultbox_id = $1 WHERE username = $2', [vaultboxId, username]); } catch (_) {}
      }
    } else {
      // Create new credential if not exists (requires user_id)
      if (!userId) return res.status(400).json({ success: false, error: 'missing user_id for new credential' });
      fs.appendFileSync(path, buildPassdbLine(username, hash, vaultboxId) + '\n');
      try { await pool.query('INSERT INTO imap_app_credentials (user_id, username, vaultbox_id) VALUES ($1,$2,$3)', [userId, username, vaultboxId || null]); } catch (_) {}
    }

    try { await run('systemctl', ['reload', 'dovecot']); } catch (_) {}
    try { await run('doveadm', ['auth', 'cache', 'flush', '-u', username]); } catch (_) {}
    return res.json({ success: true, data: { username, vaultbox_id: effectiveVb || vaultboxId || null } });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// List all IMAP credentials for a user
app.get('/s2s/v1/imap-credentials/list', async (req, res) => {
  const userId = (req.query.user_id || '').toString();
  if (!userId) return res.status(400).json({ success: false, error: 'missing user_id' });
  try {
    const r = await pool.query(
      `SELECT a.username, a.created_at, a.vaultbox_id, v.domain
         FROM imap_app_credentials a
         LEFT JOIN vaultboxes v ON v.id = a.vaultbox_id
        WHERE a.user_id = $1 AND a.revoked_at IS NULL
        ORDER BY a.created_at DESC`,
      [userId]
    );
    res.json({ success: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Build PKCS#12 using system OpenSSL from PEM key/cert
app.post('/s2s/v1/p12', async (req, res) => {
  const { pem_key, pem_cert, password, friendly_name } = req.body || {};
  if (!pem_key || !pem_cert || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'missing pem_key, pem_cert or password' });
  }
  try {
    const tmp = fs.mkdtempSync(os.tmpdir() + '/p12-');
    const keyPath = tmp + '/key.pem';
    const crtPath = tmp + '/cert.pem';
    const outPath = tmp + '/bundle.p12';
    fs.writeFileSync(keyPath, pem_key);
    fs.writeFileSync(crtPath, pem_cert);
    const name = friendly_name || 'Encrypted IMAP';
    await run('openssl', ['pkcs12', '-export', '-inkey', keyPath, '-in', crtPath, '-name', name, '-passout', `pass:${password}`, '-out', outPath]);
    const buf = fs.readFileSync(outPath);
    res.setHeader('Content-Type', 'application/x-pkcs12');
    res.setHeader('Content-Disposition', 'attachment; filename="encrypted-imap.p12"');
    res.end(buf);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch(_) {}
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Generate a new self-signed certificate using OpenSSL
app.post('/s2s/v1/generate-certificate', async (req, res) => {
  const { common_name, email, organization } = req.body || {};
  if (!common_name || !email) {
    return res.status(400).json({ success: false, error: 'missing common_name or email' });
  }
  try {
    const tmp = fs.mkdtempSync(os.tmpdir() + '/cert-gen-');
    const keyPath = tmp + '/private.key';
    const crtPath = tmp + '/certificate.crt';
    const configPath = tmp + '/cert.conf';
    
    // Create OpenSSL config for S/MIME certificate
    const config = `[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${common_name}
emailAddress = ${email}
O = ${organization || 'Motorical Encrypted IMAP (Self-signed)'}

[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment, dataEncipherment
extendedKeyUsage = emailProtection, clientAuth
subjectAltName = email:${email}
`;
    
    fs.writeFileSync(configPath, config);
    
    // Generate private key (2048-bit RSA)
    await run('openssl', ['genrsa', '-out', keyPath, '2048']);
    
    // Generate self-signed certificate
    await run('openssl', ['req', '-new', '-x509', '-key', keyPath, '-out', crtPath, '-days', '365', '-config', configPath]);
    
    // Read generated files
    const pemKey = fs.readFileSync(keyPath, 'utf8');
    const pemCert = fs.readFileSync(crtPath, 'utf8');
    
    // Cleanup
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch(_) {}
    
    res.json({
      success: true,
      data: {
        private_key: pemKey,
        certificate: pemCert,
        common_name,
        email
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Build ZIP bundle containing both P12 and PEM files
app.post('/s2s/v1/bundle', async (req, res) => {
  const { pem_key, pem_cert, password, friendly_name } = req.body || {};
  if (!pem_key || !pem_cert || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'missing pem_key, pem_cert or password' });
  }
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    
    const tmp = fs.mkdtempSync(os.tmpdir() + '/bundle-');
    const keyPath = tmp + '/key.pem';
    const crtPath = tmp + '/cert.pem';
    const outPath = tmp + '/bundle.p12';
    
    fs.writeFileSync(keyPath, pem_key);
    fs.writeFileSync(crtPath, pem_cert);
    
    const name = friendly_name || 'Encrypted IMAP';
    await run('openssl', ['pkcs12', '-export', '-inkey', keyPath, '-in', crtPath, '-name', name, '-passout', `pass:${password}`, '-out', outPath]);
    const p12Buffer = fs.readFileSync(outPath);
    
    // Add files to ZIP
    zip.file('encrypted-imap.p12', p12Buffer);
    zip.file('smime.crt', pem_cert);
    zip.file('README.txt', `Encrypted IMAP Certificate Bundle

Generated: ${new Date().toISOString()}
Password for P12: ${password}

Files included:
- encrypted-imap.p12: PKCS#12 bundle for mail client installation
- smime.crt: S/MIME certificate for encryption

Installation:
1. Install encrypted-imap.p12 in your mail client (iOS Mail, Apple Mail, Outlook, Thunderbird)
2. Import smime.crt for S/MIME encryption
3. Configure IMAP: mail.motorical.com:993 (SSL/TLS)

Support: https://motorical.com/docs/encrypted-imap
`);

    const zipBuffer = await zip.generateAsync({ 
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="encrypted-imap-bundle.zip"');
    res.end(zipBuffer);
    
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch(_) {}
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Revoke IMAP app credentials
app.delete('/s2s/v1/imap-credentials/:username', async (req, res) => {
  const { username } = req.params;
  if (!username) return res.status(400).json({ success: false, error: 'missing username' });
  try {
    await ensureDovecotPassdb();
    const path = '/etc/dovecot/encimap.passwd';
    const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
    const out = lines.filter(l => !l.startsWith(`${username}:`));
    fs.writeFileSync(path, out.join('\n') + '\n');
    try { await run('systemctl', ['reload', 'dovecot']); } catch (_) {}
    try { await pool.query('UPDATE imap_app_credentials SET revoked_at = now() WHERE username = $1', [username]); } catch (_) {}
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

function ensureLine(filepath, matchRe, line) {
  const exists = fs.existsSync(filepath) ? fs.readFileSync(filepath, 'utf8') : '';
  const filtered = exists
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(l => !matchRe.test(l));
  filtered.push(line);
  fs.writeFileSync(filepath, filtered.join('\n') + '\n');
}

function removeLine(filepath, matchRe) {
  if (!fs.existsSync(filepath)) return;
  const out = fs
    .readFileSync(filepath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(l => !matchRe.test(l));
  fs.writeFileSync(filepath, out.join('\n') + '\n');
}

function mergeRelayDomains(mainCfPath, domain, remove = false) {
  const content = fs.readFileSync(mainCfPath, 'utf8');
  const lines = content.split(/\r?\n/);
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('relay_domains')) {
      found = true;
      const parts = lines[i].split('=');
      const listStr = (parts[1] || '').trim();
      const set = new Set(
        listStr
          .split(/[\s,]+/)
          .map(s => s.trim())
          .filter(Boolean)
      );
      if (remove) set.delete(domain); else set.add(domain);
      const merged = Array.from(set).join(', ');
      lines[i] = `relay_domains = ${merged}`;
      break;
    }
  }
  if (!found && !remove) {
    lines.push(`relay_domains = ${domain}`);
  }
  fs.writeFileSync(mainCfPath, lines.join('\n') + '\n');
}

// Register a domain: create/link vaultbox, write transport map and relay_domains, reload Postfix
app.post('/s2s/v1/domains', async (req, res) => {
  const { user_id, domain, name, alias } = req.body || {};
  if (!user_id || !domain) return res.status(400).json({ success: false, error: 'missing user_id or domain' });
  const normDomain = String(domain).toLowerCase();
  try {
    // Create or find a vaultbox for this domain
    let vb;
    const existing = await pool.query('SELECT id FROM vaultboxes WHERE user_id = $1 AND domain = $2 LIMIT 1', [user_id, normDomain]);
    if (existing.rows.length) {
      vb = existing.rows[0].id;
    } else {
      const ins = await pool.query(
        'INSERT INTO vaultboxes (user_id, domain, name, alias) VALUES ($1,$2,$3,$4) RETURNING id',
        [user_id, normDomain, name || normDomain, alias || null]
      );
      vb = ins.rows[0].id;
    }

    // Ensure transport map
    const transportPath = '/etc/postfix/transport';
    if (!fs.existsSync(transportPath)) fs.writeFileSync(transportPath, '');
    const re = new RegExp(`^${normDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    ensureLine(transportPath, re, `${normDomain}\tencimap-pipe:${vb}`);
    await run('postmap', [transportPath]);

    // Merge relay_domains
    mergeRelayDomains('/etc/postfix/main.cf', normDomain, false);

    // Optional: per-recipient mapping if alias provided (overrides domain-level when matched)
    try {
      const local = String(alias || '').toLowerCase().replace(/[^a-z0-9._+-]/g, '');
      if (local) {
        const key = `${local}@${normDomain}`;
        const transportPath = '/etc/postfix/transport';
        if (!fs.existsSync(transportPath)) fs.writeFileSync(transportPath, '');
        const reAlias = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        ensureLine(transportPath, reAlias, `${key}\tencimap-pipe:${vb}`);
        await run('postmap', [transportPath]);
        try { console.log('[encimap-api] alias mapping added', { key, vb }); } catch (_) {}
      }
    } catch (_) {}

    // Reload postfix
    try { await run('systemctl', ['reload', 'postfix']); } catch { await run('systemctl', ['restart', 'postfix']); }

    res.json({ success: true, data: { vaultbox_id: vb, domain: normDomain } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Unregister a domain: remove transport and relay_domains entry; does not delete vaultbox
app.delete('/s2s/v1/domains/:domain', async (req, res) => {
  const normDomain = String(req.params.domain || '').toLowerCase();
  try {
    const transportPath = '/etc/postfix/transport';
    removeLine(transportPath, new RegExp(`^${normDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
    // Remove any per-recipient lines for this domain that route to encimap-pipe
    if (fs.existsSync(transportPath)) {
      const content = fs.readFileSync(transportPath, 'utf8').split(/\r?\n/).filter(Boolean);
      const filtered = content.filter(l => !l.match(new RegExp(`@${normDomain}\\s+encimap-pipe:`)));
      fs.writeFileSync(transportPath, filtered.join('\n') + '\n');
    }
    if (fs.existsSync(transportPath)) await run('postmap', [transportPath]);
    mergeRelayDomains('/etc/postfix/main.cf', normDomain, true);
    try { await run('systemctl', ['reload', 'postfix']); } catch { await run('systemctl', ['restart', 'postfix']); }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete a vaultbox: remove transport/relay_domains, delete Maildir, drop DB row (cascades certs/messages)
app.delete('/s2s/v1/vaultboxes/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ success: false, error: 'missing id' });
  try {
    // Lookup domain
    const r = await pool.query('SELECT domain FROM vaultboxes WHERE id = $1 LIMIT 1', [id]);
    const domain = r.rows[0]?.domain || null;
    // Remove Postfix mappings if domain known
    try {
      if (domain) {
        const transportPath = '/etc/postfix/transport';
        const reDomain = new RegExp(`^${domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        removeLine(transportPath, reDomain);
        // Also remove any alias lines pointing to this specific vaultbox id
        if (fs.existsSync(transportPath)) {
          const content = fs.readFileSync(transportPath, 'utf8').split(/\r?\n/).filter(Boolean);
          const filtered = content.filter(l => !l.includes(`encimap-pipe:${id}`));
          fs.writeFileSync(transportPath, filtered.join('\n') + '\n');
        }
        if (fs.existsSync(transportPath)) await run('postmap', [transportPath]);
        mergeRelayDomains('/etc/postfix/main.cf', domain, true);
        try { await run('systemctl', ['reload', 'postfix']); } catch { await run('systemctl', ['restart', 'postfix']); }
      }
    } catch (_) {}
    // Delete Maildir
    try { fs.rmSync(`/var/mail/vaultboxes/${id}`, { recursive: true, force: true }); } catch (_) {}
    // Delete DB row
    await pool.query('DELETE FROM vaultboxes WHERE id = $1', [id]);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ====================================================================
// VAULTBOX SMTP CREDENTIALS ENDPOINTS (NEW CLEAN SYSTEM)
// ====================================================================

// Helper function to generate secure passwords
function generateSecurePassword(length = 24) {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%^&*_-';
  let password = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

// Helper function removed - now uses unified username generation

// Create SMTP credentials for vaultbox
app.post('/s2s/v1/vaultboxes/:id/smtp-credentials', async (req, res) => {
  try {
    const vaultboxId = req.params.id;
    const { host, port, security_type } = req.body || {};

    // Verify vaultbox exists
    const vaultboxResult = await pool.query('SELECT domain FROM vaultboxes WHERE id = $1', [vaultboxId]);
    if (vaultboxResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'vaultbox not found' });
    }

    const domain = vaultboxResult.rows[0].domain;

    // Check if credentials already exist
    const existingResult = await pool.query('SELECT id FROM vaultbox_smtp_credentials WHERE vaultbox_id = $1', [vaultboxId]);
    if (existingResult.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'SMTP credentials already exist for this vaultbox' });
    }

    // Check if IMAP credentials already exist to use the same username
    let username;
    const existingImapResult = await pool.query('SELECT username FROM imap_app_credentials WHERE vaultbox_id = $1', [vaultboxId]);
    
    if (existingImapResult.rows.length > 0) {
      // Use existing IMAP username for SMTP to ensure they match
      username = existingImapResult.rows[0].username;
      console.log(`[encimap-api] Using existing IMAP username for SMTP: ${username}`);
    } else {
      // Generate new unified username
      username = await generateVaultboxSmtpUsername(domain, vaultboxId);
    }
    
    const password = generateSecurePassword();
    
    // Hash password using bcrypt - for now use a simple approach
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 12);

    // Create credentials
    const credentialsData = {
      vaultbox_id: vaultboxId,
      username,
      password_hash: passwordHash,
      host: host || 'mail.motorical.com',
      port: port || 587,
      security_type: security_type || 'STARTTLS',
      enabled: true
    };

    const result = await pool.query(`
      INSERT INTO vaultbox_smtp_credentials (vaultbox_id, username, password_hash, host, port, security_type, enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `, [credentialsData.vaultbox_id, credentialsData.username, credentialsData.password_hash, 
        credentialsData.host, credentialsData.port, credentialsData.security_type, credentialsData.enabled]);

    // Update vaultbox to mark SMTP as enabled
    await pool.query('UPDATE vaultboxes SET smtp_enabled = true WHERE id = $1', [vaultboxId]);

    console.log(`[encimap-api] Created SMTP credentials for vaultbox ${vaultboxId}: ${username}`);

    res.json({
      success: true,
      data: {
        credentials: {
          id: result.rows[0].id,
          vaultbox_id: vaultboxId,
          username,
          password, // Return plaintext password only on creation
          host: credentialsData.host,
          port: credentialsData.port,
          security_type: credentialsData.security_type,
          created_at: result.rows[0].created_at
        }
      }
    });
  } catch (error) {
    console.error('[encimap-api] Error creating SMTP credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get SMTP credentials for vaultbox (without password)
app.get('/s2s/v1/vaultboxes/:id/smtp-credentials', async (req, res) => {
  try {
    const vaultboxId = req.params.id;

    const result = await pool.query(`
      SELECT id, vaultbox_id, username, host, port, security_type, created_at, updated_at, 
             last_used, messages_sent_count, last_message_sent, enabled
      FROM vaultbox_smtp_credentials 
      WHERE vaultbox_id = $1 AND enabled = true
    `, [vaultboxId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'no SMTP credentials found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[encimap-api] Error getting SMTP credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Regenerate SMTP password
app.post('/s2s/v1/vaultboxes/:id/smtp-credentials/regenerate', async (req, res) => {
  try {
    const vaultboxId = req.params.id;

    const existingResult = await pool.query(`
      SELECT id, username, host, port, security_type 
      FROM vaultbox_smtp_credentials 
      WHERE vaultbox_id = $1 AND enabled = true
    `, [vaultboxId]);

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'no SMTP credentials found' });
    }

    const newPassword = generateSecurePassword();
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(newPassword, 12);

    await pool.query(`
      UPDATE vaultbox_smtp_credentials 
      SET password_hash = $1, updated_at = now() 
      WHERE vaultbox_id = $2
    `, [passwordHash, vaultboxId]);

    const creds = existingResult.rows[0];
    console.log(`[encimap-api] Regenerated password for ${creds.username}`);

    res.json({
      success: true,
      data: {
        credentials: {
          vaultbox_id: vaultboxId,
          username: creds.username,
          password: newPassword, // Return new plaintext password
          host: creds.host,
          port: creds.port,
          security_type: creds.security_type
        }
      }
    });
  } catch (error) {
    console.error('[encimap-api] Error regenerating password:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete SMTP credentials
app.delete('/s2s/v1/vaultboxes/:id/smtp-credentials', async (req, res) => {
  try {
    const vaultboxId = req.params.id;

    const result = await pool.query('DELETE FROM vaultbox_smtp_credentials WHERE vaultbox_id = $1', [vaultboxId]);

    if (result.rowCount > 0) {
      // Update vaultbox to mark SMTP as disabled
      await pool.query('UPDATE vaultboxes SET smtp_enabled = false WHERE id = $1', [vaultboxId]);
      console.log(`[encimap-api] Deleted SMTP credentials for vaultbox ${vaultboxId}`);
      res.json({ success: true, message: 'SMTP credentials deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'no SMTP credentials found' });
    }
  } catch (error) {
    console.error('[encimap-api] Error deleting SMTP credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// UNIFIED IMAP CREDENTIALS ENDPOINTS (SAME USERNAME AS SMTP)
// ====================================================================

// Create or get IMAP credentials for vaultbox (matches SMTP username)
app.post('/s2s/v1/vaultboxes/:id/imap-credentials', async (req, res) => {
  try {
    const vaultboxId = req.params.id;

    // Verify vaultbox exists and get user_id
    const vaultboxResult = await pool.query('SELECT domain, user_id FROM vaultboxes WHERE id = $1', [vaultboxId]);
    if (vaultboxResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vaultbox not found' });
    }

    const { domain, user_id } = vaultboxResult.rows[0];

    // Check if IMAP credentials already exist
    const existingResult = await pool.query('SELECT * FROM imap_app_credentials WHERE vaultbox_id = $1', [vaultboxId]);
    if (existingResult.rows.length > 0) {
      // Return existing credentials (without password)
      const existing = existingResult.rows[0];
      return res.json({
        success: true,
        data: {
          username: existing.username,
          vaultbox_id: vaultboxId,
          created_at: existing.created_at
        }
      });
    }

    // Check if SMTP credentials already exist to use the same username
    let username;
    const existingSmtpResult = await pool.query('SELECT username FROM vaultbox_smtp_credentials WHERE vaultbox_id = $1', [vaultboxId]);
    
    if (existingSmtpResult.rows.length > 0) {
      // Use existing SMTP username for IMAP to ensure they match
      username = existingSmtpResult.rows[0].username;
      console.log(`[encimap-api] Using existing SMTP username for IMAP: ${username}`);
    } else {
      // Generate new unified username
      username = await generateUnifiedUsername(domain, vaultboxId);
    }
    
    const password = generateSecurePassword();
    
    // Hash password using bcrypt
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 12);

    // Create IMAP credentials
    const result = await pool.query(`
      INSERT INTO imap_app_credentials (user_id, vaultbox_id, username, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id, created_at
    `, [user_id, vaultboxId, username, passwordHash]);

    console.log(`[encimap-api] Created IMAP credentials for vaultbox ${vaultboxId}: ${username}`);

    res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        vaultbox_id: vaultboxId,
        username,
        password, // Return plaintext password only on creation
        created_at: result.rows[0].created_at
      }
    });
  } catch (error) {
    console.error('[encimap-api] Error creating IMAP credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get IMAP credentials for vaultbox (without password)
app.get('/s2s/v1/vaultboxes/:id/imap-credentials', async (req, res) => {
  try {
    const vaultboxId = req.params.id;

    const result = await pool.query(`
      SELECT username, created_at 
      FROM imap_app_credentials 
      WHERE vaultbox_id = $1
    `, [vaultboxId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'IMAP credentials not found' });
    }

    res.json({
      success: true,
      data: {
        username: result.rows[0].username,
        vaultbox_id: vaultboxId,
        created_at: result.rows[0].created_at
      }
    });
  } catch (error) {
    console.error('[encimap-api] Error retrieving IMAP credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Regenerate IMAP password (keep same username)
app.post('/s2s/v1/vaultboxes/:id/imap-credentials/regenerate', async (req, res) => {
  try {
    const vaultboxId = req.params.id;

    // Check if credentials exist
    const existingResult = await pool.query('SELECT username FROM imap_app_credentials WHERE vaultbox_id = $1', [vaultboxId]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'IMAP credentials not found' });
    }

    const newPassword = generateSecurePassword();
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(newPassword, 12);

    await pool.query(`
      UPDATE imap_app_credentials 
      SET password_hash = $1, updated_at = now() 
      WHERE vaultbox_id = $2
    `, [passwordHash, vaultboxId]);

    const creds = existingResult.rows[0];
    console.log(`[encimap-api] Regenerated IMAP password for ${creds.username}`);

    res.json({
      success: true,
      data: {
        vaultbox_id: vaultboxId,
        username: creds.username,
        password: newPassword // Return new plaintext password
      }
    });
  } catch (error) {
    console.error('[encimap-api] Error regenerating IMAP password:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// HELPER FUNCTIONS FOR UNIFIED USERNAME GENERATION
// ====================================================================

/**
 * Generate a unified username for both IMAP and SMTP credentials
 * Format: encimap-{domain-with-hyphens}-{random-suffix}
 * This ensures both IMAP and SMTP use the same standardized format
 */
async function generateUnifiedUsername(domain, vaultboxId) {
  // Normalize domain (replace dots with hyphens, remove special chars)
  const normalizedDomain = domain
    .toLowerCase()
    .replace(/\./g, '-')
    .replace(/[^a-z0-9\-]/g, '');
  
  // Generate a short random suffix for uniqueness
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  
  // Create unified username format
  const username = `encimap-${normalizedDomain}-${randomSuffix}`;
  
  console.log(`[encimap-api] Generated unified username: ${username} for domain: ${domain}`);
  return username;
}

/**
 * Legacy function for SMTP (now uses unified generation)
 */
async function generateVaultboxSmtpUsername(domain, vaultboxId) {
  return await generateUnifiedUsername(domain, vaultboxId);
}

// Password generation function already defined above

app.listen(PORT, () => console.log(`[encimap-api] listening on ${PORT}`));
