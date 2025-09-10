# API Flow Documentation - Motorical Encrypted IMAP

## 🔄 **Complete API Request Flow**

This document provides detailed documentation of how API requests flow through the system, from frontend interaction to database operations and back.

**Last Updated**: September 10, 2025  
**Version**: 2.1 - Added bulk operations, unified credentials, and alias support

## 🎯 **Request Flow Overview**

```
┌─────────────┐    HTTP/HTTPS     ┌─────────────┐    S2S HTTP    ┌─────────────┐    SQL      ┌─────────────┐
│   React     │ ────────────────► │  Backend    │ ─────────────► │ Encrypted   │ ──────────► │ PostgreSQL  │
│   Frontend  │                   │   API       │                │ IMAP API    │             │ Databases   │
│  (Port 3000)│ ◄──────────────── │ (Port 3001) │ ◄───────────── │ (Port 4301) │ ◄────────── │             │
└─────────────┘    JSON Response  └─────────────┘    JSON        └─────────────┘    Results  └─────────────┘
```

## 🆕 **Recent API Improvements (v2.1)**

### **Unified Credential Management**
- **IMAP and SMTP credentials** now use the same standardized username format: `encimap-{domain-with-hyphens}-{random-suffix}`
- **Automatic synchronization** ensures both credential types use identical usernames for the same vaultbox
- **Alias support** allows proper email display based on actual username input rather than display names

### **Enhanced Vaultbox Management**
- **Bulk delete operations** with parallel processing for improved performance
- **Frontend optimization** eliminates infinite API call loops during credential loading
- **Graceful error handling** for service unavailability (e.g., communications tenant 500 errors)

### **Database Schema Enhancements**
- **Added `alias` column** to vaultboxes table for proper username storage
- **Enhanced `password_hash` storage** for IMAP credentials using bcrypt
- **Improved indexing** for better query performance

## 📝 **Detailed Request Examples**

### **1. Create Vaultbox SMTP Credentials (Updated)**

#### **Frontend Request** 
```javascript
// Location: /root/motoric_smtp/frontend/src/pages/EncryptedImap.js
// Function: createVaultboxSmtpCredentials()

const response = await api.post(
  `/encrypted-imap/vaultboxes/${vaultboxId}/smtp-credentials`,
  {
    host: 'mail.motorical.com',
    port: 2587,
    security_type: 'STARTTLS'
  }
);
```

#### **Backend API Processing**
```javascript
// Location: /root/motoric_smtp/backend/src/routes/encryptedImap.js
// Route: POST /encrypted-imap/vaultboxes/:id/smtp-credentials

router.post('/vaultboxes/:id/smtp-credentials', async (req, res) => {
  try {
    // 1. Extract JWT and validate user
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
    
    // 2. Extract and validate parameters
    const vaultboxId = String(req.params.id || '').trim();
    const { host, port, security_type } = req.body || {};
    
    // 3. Forward to Encrypted IMAP API with S2S authentication
    const r = await encimapFetch(`/s2s/v1/vaultboxes/${encodeURIComponent(vaultboxId)}/smtp-credentials`, {
      method: 'POST',
      body: JSON.stringify({ host, port, security_type })
    });
    
    // 4. Return response to frontend
    res.json({ success: true, data: r.data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.body?.error || e.message });
  }
});
```

#### **Encrypted IMAP API Processing**
```javascript
// Location: /root/encrypted-imap/services/api/server.js
// Route: POST /s2s/v1/vaultboxes/:id/smtp-credentials

app.post('/s2s/v1/vaultboxes/:id/smtp-credentials', async (req, res) => {
  try {
    // 1. Validate S2S JWT authentication
    const authResult = await validateS2SToken(req);
    if (!authResult.valid) {
      return res.status(401).json({ success: false, error: 'Invalid S2S token' });
    }

    // 2. Extract parameters
    const vaultboxId = req.params.id;
    const { host = 'mail.motorical.com', port = 2587, security_type = 'STARTTLS' } = req.body;

    // 3. Generate unique SMTP credentials
    const password = generateSecurePassword();
    const username = await generateVaultboxSmtpUsername(vaultboxId);
    const hashedPassword = await bcrypt.hash(password, 12);

    // 4. Database operations
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Insert SMTP credentials
      await client.query(`
        INSERT INTO vaultbox_smtp_credentials 
        (vaultbox_id, username, password_hash, host, port, security_type) 
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [vaultboxId, username, hashedPassword, host, port, security_type]);
      
      // Update vaultbox smtp_enabled flag
      await client.query(`
        UPDATE vaultboxes SET smtp_enabled = true WHERE id = $1
      `, [vaultboxId]);
      
      await client.query('COMMIT');
      
      // 5. Return credentials (with plaintext password for initial display)
      res.json({
        success: true,
        data: {
          username,
          password, // Only returned on creation
          host,
          port,
          security_type,
          created_at: new Date().toISOString()
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### **2. Load Vaultbox SMTP Credentials**

#### **Frontend Request**
```javascript
// Location: /root/motoric_smtp/frontend/src/pages/EncryptedImap.js
// Function: loadVaultboxSmtpCredentials()

const response = await api.get(`/encrypted-imap/vaultboxes/${vaultboxId}/smtp-credentials`);
```

#### **Backend API Processing**
```javascript
// Route: GET /encrypted-imap/vaultboxes/:id/smtp-credentials
// Simply forwards to Encrypted IMAP API with user context
```

#### **Encrypted IMAP API Processing**
```javascript
// Route: GET /s2s/v1/vaultboxes/:id/smtp-credentials

app.get('/s2s/v1/vaultboxes/:id/smtp-credentials', async (req, res) => {
  try {
    const vaultboxId = req.params.id;
    
    const result = await pool.query(`
      SELECT username, host, port, security_type, created_at 
      FROM vaultbox_smtp_credentials 
      WHERE vaultbox_id = $1
    `, [vaultboxId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'SMTP credentials not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

## 🔐 **Authentication Flow**

### **Frontend JWT Authentication**
```javascript
// 1. User login generates JWT token
const loginResponse = await api.post('/auth/login', { email, password });
const token = loginResponse.data.token;

// 2. Store token in localStorage/context
localStorage.setItem('token', token);

// 3. Include in all API requests
axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
```

### **Backend JWT Validation**
```javascript
// Middleware: authenticateToken (applies to all encrypted-imap routes)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user; // Contains user.id for database queries
    next();
  });
};
```

### **S2S Authentication (Backend → Encrypted IMAP)**
```javascript
// Function: encimapFetch() - creates S2S JWT for internal communication
const createS2SToken = () => {
  return jwt.sign(
    { service: 'backend-api', timestamp: Date.now() },
    process.env.S2S_JWT_SECRET,
    { expiresIn: '1h' }
  );
};

const encimapFetch = async (endpoint, options = {}) => {
  const s2sToken = createS2SToken();
  return fetch(`http://localhost:4301${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${s2sToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
};
```

## 🗄️ **Database Query Patterns**

### **Encrypted IMAP Database Queries**
```sql
-- Connection: postgresql://encimap:password@localhost:5432/motorical_encrypted_imap

-- Create SMTP credentials
INSERT INTO vaultbox_smtp_credentials 
(vaultbox_id, username, password_hash, host, port, security_type) 
VALUES ($1, $2, $3, $4, $5, $6);

-- Update vaultbox smtp flag
UPDATE vaultboxes SET smtp_enabled = true WHERE id = $1;

-- Load SMTP credentials (no password)
SELECT username, host, port, security_type, created_at 
FROM vaultbox_smtp_credentials 
WHERE vaultbox_id = $1;

-- Regenerate password
UPDATE vaultbox_smtp_credentials 
SET password_hash = $2, updated_at = CURRENT_TIMESTAMP 
WHERE vaultbox_id = $1;
```

### **SMTP Authentication Queries (Dual Database)**
```javascript
// SMTP Auth Service queries both databases

// 1. Try MotorBlock authentication (motorical_db)
const motorBlockResult = await this.motoricalPool.query(`
  SELECT id, username, password_hash, user_id, smtp_enabled 
  FROM motor_blocks 
  WHERE username = $1 AND smtp_enabled = true
`, [username]);

// 2. Try Vaultbox authentication (encimap_db)  
const vaultboxResult = await this.encimapPool.query(`
  SELECT vsc.username, vsc.password_hash, v.user_id, v.domain
  FROM vaultbox_smtp_credentials vsc
  JOIN vaultboxes v ON vsc.vaultbox_id = v.id
  WHERE vsc.username = $1
`, [username]);
```

## 📊 **Response Flow & Error Handling**

### **Success Response Flow**
```
Database Result → Encrypted IMAP API → Backend API → Frontend
     ↓                    ↓                ↓           ↓
  Raw Data         { success: true,    { success:   setState()
                     data: {...} }      true, ...}   + UI Update
```

### **Error Response Flow**
```
Error Source → Encrypted IMAP API → Backend API → Frontend
     ↓                    ↓                ↓           ↓
  Exception         { success: false,  { success:   Error Alert
                      error: "..." }    false, ...}  + UI Message
```

### **Error Handling Patterns**

#### **Frontend Error Handling**
```javascript
try {
  const response = await api.post('/encrypted-imap/vaultboxes/.../smtp-credentials', data);
  if (response.data.success) {
    setVaultboxSmtpCredentials(prev => ({ ...prev, [vaultboxId]: response.data.data }));
    alert('SMTP credentials created successfully!');
  }
} catch (error) {
  console.error('Failed to create SMTP credentials:', error);
  alert(`Error: ${error.response?.data?.error || error.message}`);
}
```

#### **Backend Error Propagation**
```javascript
try {
  const r = await encimapFetch(`/s2s/v1/vaultboxes/${vaultboxId}/smtp-credentials`, {...});
  res.json({ success: true, data: r.data });
} catch (e) {
  // Propagate status code and error message from Encrypted IMAP API
  res.status(e.status || 500).json({ 
    success: false, 
    error: e.body?.error || e.message 
  });
}
```

#### **API Error Response Standards**
```javascript
// Success Response Format
{
  "success": true,
  "data": {
    "username": "vaultbox-example-com-abc123",
    "host": "mail.motorical.com",
    "port": 2587,
    "security_type": "STARTTLS"
  }
}

// Error Response Format  
{
  "success": false,
  "error": "Vaultbox not found",
  "details": {...} // Optional additional context
}
```

## 🚀 **Performance Considerations**

### **Connection Pooling**
```javascript
// Each service maintains its own connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Maximum connections
  idleTimeoutMillis: 30000,   // Close idle connections
  connectionTimeoutMillis: 2000
});
```

### **Request Optimization**
- **Parallel Loading**: Frontend loads SMTP credentials for all vaultboxes simultaneously
- **Connection Reuse**: Backend maintains persistent connections to Encrypted IMAP API
- **Database Transactions**: Multi-step operations use transactions for consistency

### **Caching Strategy**
```javascript
// Frontend: Cache SMTP credentials in component state
const [vaultboxSmtpCredentials, setVaultboxSmtpCredentials] = useState({});

// Backend: No caching (always fresh data for security)
// Database: PostgreSQL query plan caching handles optimization
```

### **6. Bulk Delete Vaultboxes (New in v2.1)**

#### **Frontend Request**
```javascript
// Location: /root/motoric_smtp/frontend/src/pages/EncryptedImap.js
// Function: handleBulkDelete()

// Delete multiple vaultboxes in parallel for improved performance
await Promise.all(
  Array.from(selectedVaultboxes).map(vaultboxId =>
    api.delete(`/encrypted-imap/vaultboxes/${encodeURIComponent(vaultboxId)}`, { 
      params: { t: Date.now() } 
    })
  )
);

// Refresh vaultbox list and clear selection
const r = await api.get('/encrypted-imap/vaultboxes/full', { params: { t: Date.now() } });
setVaultboxes(r.data?.data || []);
setSelectedVaultboxes(new Set());
```

#### **Backend Processing**
```javascript
// Each DELETE request is proxied to encrypted IMAP API
// Parallel processing for bulk operations improves UX
router.delete('/vaultboxes/:id', authenticateToken, async (req, res) => {
  const vaultboxId = req.params.id;
  await encimapFetch(`/s2s/v1/vaultboxes/${vaultboxId}`, { method: 'DELETE' });
});
```

#### **Database Operations**
```sql
-- Cascading deletes handle related data cleanup
DELETE FROM vaultboxes WHERE id = $1; 
-- Auto-deletes from messages, vaultbox_certs, vaultbox_smtp_credentials, imap_app_credentials
```

### **7. Unified IMAP Credential Creation (New in v2.1)**

#### **Frontend Request**
```javascript
// Auto-creates IMAP credentials after vaultbox creation
const imapResponse = await api.post(`/encrypted-imap/vaultboxes/${vb}/imap-credentials`);
// Password is immediately visible for initial creation
setImapPasswordsVisible(prev => ({ ...prev, [vb]: true }));
```

#### **Backend Processing** 
```javascript
// Checks for existing SMTP credentials to ensure username synchronization
const existingSmtpResult = await pool.query(
  'SELECT username FROM vaultbox_smtp_credentials WHERE vaultbox_id = $1', [vaultboxId]
);

if (existingSmtpResult.rows.length > 0) {
  username = existingSmtpResult.rows[0].username; // Use existing SMTP username
} else {
  username = generateUnifiedUsername(domain, vaultboxId); // Generate new unified username
}
```

## 🔧 **Monitoring & Debugging**

### **Request Tracing**
```javascript
// Add request IDs for tracing
const requestId = crypto.randomUUID();
console.log(`[${requestId}] Frontend request: POST /encrypted-imap/vaultboxes/${id}/smtp-credentials`);
console.log(`[${requestId}] Backend proxy: POST /s2s/v1/vaultboxes/${id}/smtp-credentials`);
console.log(`[${requestId}] Database operation: INSERT vaultbox_smtp_credentials`);
```

### **Health Check Endpoints**
```javascript
// Backend API Health Check
GET /api/health
→ { "status": "healthy", "database": "connected", "timestamp": "..." }

// Encrypted IMAP API Health Check  
GET /s2s/v1/health
→ { "status": "healthy", "database": "connected", "adapters": "loaded" }
```

### **Common Debug Commands**
```bash
# Check service status
sudo systemctl status motorical-backend-api encimap-api

# Monitor real-time logs
sudo journalctl -u motorical-backend-api -f | grep "encrypted-imap"
sudo journalctl -u encimap-api -f | grep "smtp-credentials"

# Test direct API calls
curl -H "Authorization: Bearer $JWT_TOKEN" \
     http://localhost:3001/api/encrypted-imap/vaultboxes/123/smtp-credentials

curl -H "Authorization: Bearer $S2S_TOKEN" \
     http://localhost:4301/s2s/v1/vaultboxes/123/smtp-credentials
```

## 📚 **Related API Documentation**

### **Frontend API Functions**
- `createVaultboxSmtpCredentials(vaultboxId, config)` - Create new SMTP credentials
- `loadVaultboxSmtpCredentials(vaultboxId)` - Load existing credentials
- `regenerateVaultboxPassword(vaultboxId)` - Generate new password
- `deleteVaultboxSmtpCredentials(vaultboxId)` - Remove credentials

### **Backend Routes**
- `POST /encrypted-imap/vaultboxes/:id/smtp-credentials` - Create credentials
- `GET /encrypted-imap/vaultboxes/:id/smtp-credentials` - Get credentials
- `POST /encrypted-imap/vaultboxes/:id/smtp-credentials/regenerate` - Regenerate password
- `DELETE /encrypted-imap/vaultboxes/:id/smtp-credentials` - Delete credentials

### **Encrypted IMAP API Endpoints**
- `POST /s2s/v1/vaultboxes/:id/smtp-credentials` - Internal creation
- `GET /s2s/v1/vaultboxes/:id/smtp-credentials` - Internal retrieval
- `POST /s2s/v1/vaultboxes/:id/smtp-credentials/regenerate` - Internal regeneration
- `DELETE /s2s/v1/vaultboxes/:id/smtp-credentials` - Internal deletion

---

**🎯 This comprehensive API flow documentation provides complete visibility into how requests move through the system, enabling effective debugging, monitoring, and maintenance of the encrypted email platform.**
