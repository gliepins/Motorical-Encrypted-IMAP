import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

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

app.post('/s2s/v1/vaultboxes', async (req, res) => {
  const { user_id, domain, name } = req.body || {};
  if (!user_id || !domain || !name) return res.status(400).json({ success: false, error: 'missing fields' });
  try {
    const r = await pool.query(
      'INSERT INTO vaultboxes (user_id, domain, name) VALUES ($1,$2,$3) RETURNING id',
      [user_id, String(domain || '').toLowerCase(), name]
    );
    res.json({ success: true, data: { id: r.rows[0].id } });
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

app.listen(PORT, () => console.log(`[encimap-api] listening on ${PORT}`));
