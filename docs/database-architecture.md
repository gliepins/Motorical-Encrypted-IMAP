# Database Architecture - Motorical Encrypted IMAP

## 🗄️ **Dual Database Architecture Overview**

The Motorical Encrypted IMAP system uses a **dual database architecture** to maintain clean separation between the main platform functionality and encrypted email services. This design ensures data isolation, security boundaries, and independent scaling capabilities.

**Last Updated**: September 10, 2025  
**Version**: 2.1 - Enhanced with alias support, unified credentials, and optimized schema

## 📊 **Database Structure Diagram**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PostgreSQL Instance                              │
│                         (localhost:5432)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────────┐ │
│  │     motorical_db        │    │    motorical_encrypted_imap             │ │
│  │  (Main Platform DB)     │    │      (Encrypted Email DB)              │ │
│  │                         │    │                                         │ │
│  │ User: motorical         │    │ User: encimap                           │ │
│  │ Purpose: Platform Core  │    │ Purpose: Encrypted Email Only           │ │
│  │                         │    │                                         │ │
│  │ Tables:                 │    │ Tables:                                 │ │
│  │ ├── users (UUID)        │    │ ├── vaultboxes (UUID)                  │ │
│  │ ├── motor_blocks        │    │ ├── vaultbox_smtp_credentials           │ │
│  │ ├── domains             │    │ ├── imap_credentials                    │ │
│  │ ├── billing             │    │ ├── certificates                       │ │
│  │ ├── subscriptions       │    │ ├── encrypted_emails                   │ │
│  │ └── sessions            │    │ └── email_processing_logs               │ │
│  │                         │    │                                         │ │
│  │ Connections:            │    │ Connections:                            │ │
│  │ ├── Backend API         │    │ ├── Encrypted IMAP API                 │ │
│  │ ├── SMTP Auth Service   │    │ ├── SMTP Auth Service                  │ │
│  │ └── Billing Service     │    │ ├── Intake Service                     │ │
│  │                         │    │ └── Delivery Engine                    │ │
│  └─────────────────────────┘    └─────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────┐
                    │        SMTP Auth Service            │
                    │       (Unified Access Layer)        │
                    │                                     │
                    │ ┌─────────────┐ ┌─────────────────┐ │
                    │ │MotorBlock   │ │ Vaultbox SMTP   │ │
                    │ │Auth Pool    │ │ Auth Pool       │ │
                    │ │             │ │                 │ │
                    │ │motorical_db │ │ encimap_db      │ │
                    │ └─────────────┘ └─────────────────┘ │
                    └─────────────────────────────────────┘
```

## 🎯 **Database Separation Rationale**

### **Why Dual Databases?**

#### **🔒 Security Isolation**
- **Credential Separation**: MotorBlock credentials physically separated from vaultbox credentials
- **Access Control**: Different database users with different permission levels
- **Attack Surface Reduction**: Compromise of one system doesn't affect the other

#### **📈 Performance Optimization**
- **Independent Scaling**: Each database can be optimized for its specific workload
- **Connection Pool Management**: Separate pools prevent resource contention
- **Query Optimization**: Database-specific indexes and configurations

#### **🧹 Clean Architecture**
- **Concern Separation**: Platform logic completely separate from encryption logic
- **Development Independence**: Teams can work on different systems without conflicts
- **Migration Safety**: Changes to one system don't risk affecting the other

## 📝 **Database Schema Details**

### **Primary Platform Database: `motorical_db`**

#### **Connection Information**
```sql
-- Database: motorical_db
-- User: motorical
-- Connection: postgresql://motorical:dhuy4532098uytvbGFFSE@localhost:5432/motorical_db
-- Purpose: Main platform functionality, billing, user management
```

#### **Core Tables**
```sql
-- Users table (Platform authentication and profiles)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Motor Blocks (Traditional SMTP sending blocks)
CREATE TABLE motor_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    smtp_enabled BOOLEAN DEFAULT true,
    rate_limit_per_hour INTEGER DEFAULT 100,
    domain VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Domains (Domain verification and management)
CREATE TABLE domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    verification_status VARCHAR(50) DEFAULT 'pending',
    dkim_public_key TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Billing and subscriptions
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    plan_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### **Access Patterns**
```javascript
// Backend API Service - Full access to platform data
const motoricalPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // → postgresql://motorical:password@localhost:5432/motorical_db
  max: 20,
  idleTimeoutMillis: 30000
});

// SMTP Auth Service - Read-only access for MotorBlock authentication
const motoricalAuthPool = new Pool({
  connectionString: process.env.MOTORICAL_DATABASE_URL,
  max: 10, // Smaller pool for auth only
  idleTimeoutMillis: 15000
});
```

### **Encrypted IMAP Database: `motorical_encrypted_imap`**

#### **Connection Information**
```sql
-- Database: motorical_encrypted_imap  
-- User: encimap
-- Connection: postgresql://encimap:dhuy4532098uytvbGFFSE@localhost:5432/motorical_encrypted_imap
-- Purpose: Encrypted email services, vaultboxes, S/MIME processing
```

#### **Core Tables**
```sql
-- Vaultboxes (Encrypted email containers) - Updated v2.1
CREATE TABLE vaultboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References users.id from motorical_db (no FK constraint)
    domain VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL, -- Display name for the vaultbox
    alias VARCHAR(100), -- Username/local-part for proper email display (e.g., 'john' for john@domain.com)
    status VARCHAR(20) DEFAULT 'active',
    limits JSONB DEFAULT '{}',
    smtp_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    -- Indexes for performance
    INDEX idx_vaultboxes_alias (alias),
    INDEX idx_vaultboxes_smtp_enabled (smtp_enabled)
);

-- Vaultbox SMTP Credentials (New clean system)
CREATE TABLE vaultbox_smtp_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vaultbox_id UUID NOT NULL REFERENCES vaultboxes(id) ON DELETE CASCADE,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    host VARCHAR(255) DEFAULT 'mail.motorical.com',
    port INTEGER DEFAULT 2587,
    security_type VARCHAR(20) DEFAULT 'STARTTLS',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- IMAP App Credentials (Unified with SMTP credentials v2.1)
CREATE TABLE imap_app_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- References users.id from motorical_db (no FK constraint)
    username VARCHAR(255) UNIQUE NOT NULL, -- Uses unified format: encimap-{domain}-{suffix}
    vaultbox_id UUID, -- References vaultboxes.id (NULL for legacy credentials)
    password_hash VARCHAR(255), -- bcrypt hash for secure storage
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    revoked_at TIMESTAMP WITH TIME ZONE, -- For soft deletion
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_imap_app_credentials_vaultbox_id (vaultbox_id),
    UNIQUE CONSTRAINT imap_app_credentials_username_key (username)
);

-- S/MIME Certificates (Encryption/decryption keys)
CREATE TABLE certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vaultbox_id UUID NOT NULL REFERENCES vaultboxes(id) ON DELETE CASCADE,
    certificate_type VARCHAR(20) NOT NULL, -- 'private' or 'public'
    pem_content TEXT NOT NULL,
    friendly_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Encrypted Email Storage
CREATE TABLE encrypted_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vaultbox_id UUID NOT NULL REFERENCES vaultboxes(id) ON DELETE CASCADE,
    message_id VARCHAR(255) NOT NULL,
    sender VARCHAR(255) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject_encrypted TEXT,
    body_encrypted TEXT,
    encryption_method VARCHAR(50) DEFAULT 'S/MIME',
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### **Access Patterns**
```javascript
// Encrypted IMAP API Service - Full access to encrypted email data
const encimapPool = new Pool({
  connectionString: process.env.ENCIMAP_DATABASE_URL,
  // → postgresql://encimap:password@localhost:5432/motorical_encrypted_imap
  max: 15,
  idleTimeoutMillis: 30000
});

// SMTP Auth Service - Read-only access for vaultbox authentication
const encimapAuthPool = new Pool({
  connectionString: process.env.ENCIMAP_DATABASE_URL,
  max: 10, // Smaller pool for auth only
  idleTimeoutMillis: 15000
});
```

## 🔐 **Cross-Database Relationships**

### **Logical Foreign Keys (No Physical Constraints)**

Since the databases are separate, we use **logical foreign keys** without physical constraints:

```sql
-- vaultboxes.user_id → users.id (motorical_db)
-- This relationship is maintained in application logic, not database constraints

-- Example: Loading user's vaultboxes
-- 1. Get user_id from JWT token (authenticated via motorical_db)
-- 2. Query vaultboxes WHERE user_id = $1 (in encimap_db)
```

### **Application-Level Referential Integrity**

```javascript
// Service layer ensures data consistency across databases

class VaultboxService {
  async createVaultbox(userId, domain, emailAddress) {
    // 1. Verify user exists in motorical_db
    const userCheck = await this.motoricalPool.query(
      'SELECT id FROM users WHERE id = $1', [userId]
    );
    if (userCheck.rows.length === 0) {
      throw new Error('User not found');
    }

    // 2. Create vaultbox in encimap_db
    const vaultbox = await this.encimapPool.query(`
      INSERT INTO vaultboxes (user_id, domain, email_address)
      VALUES ($1, $2, $3) RETURNING *
    `, [userId, domain, emailAddress]);
    
    return vaultbox.rows[0];
  }
}
```

## 🚀 **Connection Management**

### **Service-Specific Connection Pools**

#### **Backend API Service** (`motorical-backend-api`)
```javascript
// Primary connection to motorical_db
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  application_name: 'motorical-backend-api'
});
```

#### **Encrypted IMAP API Service** (`encimap-api`)
```javascript
// Primary connection to encimap_db
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  application_name: 'encimap-api'
});
```

#### **SMTP Auth Service** (Unified)
```javascript
// Dual connections for unified authentication
class SmtpAuthService {
  constructor() {
    // MotorBlock authentication pool
    this.motoricalPool = new Pool({
      connectionString: process.env.MOTORICAL_DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 15000,
      application_name: 'smtp-auth-motorical'
    });

    // Vaultbox authentication pool  
    this.encimapPool = new Pool({
      connectionString: process.env.ENCIMAP_DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 15000,
      application_name: 'smtp-auth-encimap'
    });
  }
}
```

### **Connection Health Monitoring**

```javascript
// Health check queries for both databases
const healthChecks = {
  async motoricalDb() {
    try {
      const result = await motoricalPool.query('SELECT COUNT(*) FROM users');
      return { status: 'healthy', userCount: result.rows[0].count };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  },

  async encimapDb() {
    try {
      const result = await encimapPool.query('SELECT COUNT(*) FROM vaultboxes');
      return { status: 'healthy', vaultboxCount: result.rows[0].count };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
};
```

## 📊 **Query Patterns & Best Practices**

### **Single Database Operations** (Preferred)
```javascript
// Simple vaultbox creation (single database)
const createVaultbox = async (userId, domain, emailAddress) => {
  const client = await encimapPool.connect();
  try {
    await client.query('BEGIN');
    
    const vaultbox = await client.query(`
      INSERT INTO vaultboxes (user_id, domain, email_address)
      VALUES ($1, $2, $3) RETURNING *
    `, [userId, domain, emailAddress]);
    
    await client.query('COMMIT');
    return vaultbox.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
```

### **Cross-Database Operations** (Use Sparingly)
```javascript
// User data enrichment (both databases)
const getUserWithVaultboxes = async (userId) => {
  // 1. Get user from motorical_db
  const user = await motoricalPool.query(
    'SELECT id, email, email_verified FROM users WHERE id = $1', 
    [userId]
  );
  
  if (user.rows.length === 0) return null;
  
  // 2. Get vaultboxes from encimap_db
  const vaultboxes = await encimapPool.query(
    'SELECT * FROM vaultboxes WHERE user_id = $1 ORDER BY created_at',
    [userId]
  );
  
  return {
    ...user.rows[0],
    vaultboxes: vaultboxes.rows
  };
};
```

### **Bulk Operations**
```javascript
// Efficient bulk loading with prepared statements
const loadUserVaultboxes = async (userIds) => {
  const query = `
    SELECT v.*, vsc.username as smtp_username, vsc.host as smtp_host
    FROM vaultboxes v
    LEFT JOIN vaultbox_smtp_credentials vsc ON v.id = vsc.vaultbox_id
    WHERE v.user_id = ANY($1::uuid[])
    ORDER BY v.created_at
  `;
  
  const result = await encimapPool.query(query, [userIds]);
  return result.rows;
};
```

## 🔧 **Database Maintenance**

### **Migration Strategy**

#### **Separate Migration Scripts**
```bash
# Motorical DB migrations
/root/motoric_smtp/backend/migrations/
├── 001_initial_schema.sql
├── 002_add_motor_blocks.sql
└── 003_billing_integration.sql

# Encrypted IMAP DB migrations  
/root/encrypted-imap/db/migrations/
├── 001_base.sql
├── 002_vaultbox_smtp_credentials.sql
└── 003_certificate_management.sql
```

#### **Database Setup Commands**
```bash
# Setup motorical_db
sudo -u postgres psql -c "CREATE DATABASE motorical_db;"
sudo -u postgres psql -c "CREATE USER motorical WITH PASSWORD 'dhuy4532098uytvbGFFSE';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE motorical_db TO motorical;"

# Setup motorical_encrypted_imap
sudo -u postgres psql -c "CREATE DATABASE motorical_encrypted_imap;"
sudo -u postgres psql -c "CREATE USER encimap WITH PASSWORD 'dhuy4532098uytvbGFFSE';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE motorical_encrypted_imap TO encimap;"

# Apply migrations (including recent v2.1 updates)
sudo -u postgres psql -d motorical_db -f /root/motoric_smtp/backend/migrations/latest.sql
sudo -u postgres psql -d motorical_encrypted_imap -f /root/encrypted-imap/db/migrations/002_vaultbox_smtp_credentials.sql
sudo -u postgres psql -d motorical_encrypted_imap -f /root/encrypted-imap/db/migrations/003_unified_usernames.sql
sudo -u postgres psql -d motorical_encrypted_imap -f /root/encrypted-imap/db/migrations/004_add_alias_column.sql

# Grant permissions after schema changes
sudo -u postgres psql -d motorical_encrypted_imap -c "GRANT ALL PRIVILEGES ON vaultboxes TO encimap;"
sudo -u postgres psql -d motorical_encrypted_imap -c "GRANT ALL PRIVILEGES ON imap_app_credentials TO encimap;"
```

### **Backup Strategy**
```bash
#!/bin/bash
# Backup both databases independently

BACKUP_DIR="/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup motorical_db
pg_dump -U motorical -h localhost motorical_db > "$BACKUP_DIR/motorical_db.sql"

# Backup motorical_encrypted_imap
pg_dump -U encimap -h localhost motorical_encrypted_imap > "$BACKUP_DIR/encimap_db.sql"

echo "Backups completed in $BACKUP_DIR"
```

### **Performance Monitoring**
```sql
-- Monitor connection counts by database
SELECT datname, usename, count(*) as connections
FROM pg_stat_activity 
WHERE state = 'active'
GROUP BY datname, usename
ORDER BY connections DESC;

-- Monitor query performance per database
SELECT datname, calls, mean_time, total_time
FROM pg_stat_statements pss
JOIN pg_database pd ON pss.dbid = pd.oid
WHERE calls > 100
ORDER BY total_time DESC;
```

## 🛡️ **Security Considerations**

### **Database User Permissions**
```sql
-- motorical user (Backend API)
GRANT CONNECT ON DATABASE motorical_db TO motorical;
GRANT USAGE ON SCHEMA public TO motorical;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO motorical;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO motorical;

-- encimap user (Encrypted IMAP API)
GRANT CONNECT ON DATABASE motorical_encrypted_imap TO encimap;
GRANT USAGE ON SCHEMA public TO encimap;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO encimap;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO encimap;

-- No cross-database permissions (isolation enforced)
```

### **Connection Security**
```javascript
// SSL/TLS configuration for production
const sslConfig = {
  ssl: {
    rejectUnauthorized: false, // Adjust for production certificates
    ca: fs.readFileSync('/path/to/ca-certificate.crt'),
    cert: fs.readFileSync('/path/to/client-certificate.crt'),
    key: fs.readFileSync('/path/to/client-key.key')
  }
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...sslConfig
});
```

### **Data Isolation Verification**
```bash
# Verify no cross-database access
sudo -u postgres psql -d motorical_db -c "\dt" | grep -v vaultbox
sudo -u postgres psql -d motorical_encrypted_imap -c "\dt" | grep -v motor_block

# Verify user permissions
sudo -u postgres psql -c "\du motorical"
sudo -u postgres psql -c "\du encimap"
```

## 📈 **Scaling Considerations**

### **Independent Scaling**
- **Read Replicas**: Can create separate read replicas for each database based on load
- **Connection Pooling**: Each service can tune its connection pool independently
- **Resource Allocation**: Different databases can have different hardware allocations

### **Partitioning Strategy**
```sql
-- Future partitioning for encrypted_emails (by date)
CREATE TABLE encrypted_emails_2025_09 PARTITION OF encrypted_emails
FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

-- Index optimization per database use case
CREATE INDEX idx_vaultboxes_user_domain ON vaultboxes(user_id, domain);
CREATE INDEX idx_motor_blocks_username ON motor_blocks(username) WHERE smtp_enabled = true;
```

---

**🎯 This dual database architecture provides robust data separation, security isolation, and independent scaling capabilities while maintaining clean architectural boundaries between platform and encrypted email functionality.**
