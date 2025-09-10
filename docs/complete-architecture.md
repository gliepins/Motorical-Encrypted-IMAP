# Motorical Encrypted IMAP - Complete Architecture Documentation

## 🏗️ **System Overview**

The Motorical Encrypted IMAP system implements a **clean separation architecture** that provides encrypted email services while maintaining complete independence from the main platform's SMTP MotorBlocks. This document describes the complete architecture including service connections, API flows, and database relationships.

## 📊 **Architecture Diagram**

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Frontend React    │    │  Motorical Backend  │    │ Encrypted IMAP API  │
│   (Port 3000)       │    │     API Service     │    │    (Port 4301)      │
│                     │    │    (Port 3001)      │    │                     │
│ • Vaultbox UI       │◄──►│ • Auth & Proxy      │◄──►│ • S/MIME Engine     │
│ • SMTP Creds UI     │    │ • User Management   │    │ • Storage Layer     │
│ • Certificate Mgmt  │    │ • Route Handling    │    │ • SMTP Auth Service │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
                                     │                           │
                                     ▼                           ▼
                        ┌─────────────────────┐    ┌─────────────────────┐
                        │   motorical_db      │    │motorical_encrypted  │
                        │   (PostgreSQL)      │    │    _imap (PgSQL)    │
                        │                     │    │                     │
                        │ • users             │    │ • vaultboxes        │
                        │ • motor_blocks      │    │ • vaultbox_smtp_    │
                        │ • billing           │    │   credentials       │
                        │ • domains           │    │ • imap_credentials  │
                        └─────────────────────┘    └─────────────────────┘

                                ┌─────────────────────┐
                                │  SMTP Auth Service  │
                                │   (Unified Layer)   │
                                │                     │
                                │ • MotorBlock Auth   │
                                │ • Vaultbox Auth     │
                                │ • Dual DB Access    │
                                └─────────────────────┘
                                          │
                        ┌─────────────────┼─────────────────┐
                        │                 │                 │
                        ▼                 ▼                 ▼
                ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                │   Postfix    │ │   Dovecot    │ │  Mail Flow   │
                │(SMTP Server) │ │(IMAP Server) │ │  Processing  │
                │              │ │              │ │              │
                │ • Port 25    │ │ • Port 993   │ │ • Encryption │
                │ • Port 587   │ │ • Port 143   │ │ • Storage    │
                │ • Port 2587  │ │ • Maildir    │ │ • Delivery   │
                └──────────────┘ └──────────────┘ └──────────────┘
```

## 🔄 **API Request Flow**

### **1. Frontend → Backend API → Encrypted IMAP API**

```
┌─────────────┐   GET /api/encrypted-imap/   ┌─────────────┐   GET /s2s/v1/   ┌─────────────┐
│   React     │   vaultboxes/123/smtp-      │  Backend    │   vaultboxes/    │ Encrypted   │
│   Frontend  │──────credentials─────────────►│   API       │───123/smtp──────►│ IMAP API    │
│             │                              │   Proxy     │   credentials    │             │
│             │◄─────── JSON Response ───────│             │◄─── Response ────│             │
└─────────────┘                              └─────────────┘                  └─────────────┘
      │                                              │                               │
      │                                              │                               │
   JWT Auth                                    JWT Validation                 S2S JWT Validation
   Headers                                     & Forwarding                   & Processing
```

### **2. Authentication Flow**

```
1. User Login → JWT Token (Backend API)
2. Frontend API Calls → JWT in Authorization Header
3. Backend API → Validates JWT → Extracts user_id
4. Backend API → Forwards to Encrypted IMAP API with S2S JWT
5. Encrypted IMAP API → Validates S2S JWT → Processes Request
6. Response → Backend API → Frontend (with user context)
```

### **3. SMTP Authentication Flow (Unified)**

```
┌─────────────┐    username/password     ┌─────────────┐    Database Lookup    ┌─────────────┐
│  Email      │───────────────────────────►│ SMTP Auth   │────(Both DBs)────────►│ PostgreSQL  │
│  Client     │                           │ Service     │                      │ Dual Access │
│  (Port 2587)│◄──────── Accept/Reject ───│ (Unified)   │◄─────────────────────│             │
└─────────────┘                           └─────────────┘                      └─────────────┘
                                                 │
                                    ┌────────────┼────────────┐
                                    │                         │
                                    ▼                         ▼
                        ┌─────────────────┐        ┌─────────────────┐
                        │  MotorBlock     │        │ Vaultbox SMTP   │
                        │  Credentials    │        │  Credentials    │
                        │ (motorical_db)  │        │ (encimap_db)    │
                        └─────────────────┘        └─────────────────┘
```

## 🗄️ **Database Architecture**

### **Dual Database Design**

The system uses **two completely separate PostgreSQL databases** to maintain clean separation:

#### **1. Primary Platform Database: `motorical_db`**
```sql
-- Connection: postgresql://motorical:password@localhost:5432/motorical_db
-- Purpose: Main platform functionality

Tables:
├── users (UUID primary keys)
├── motor_blocks (Traditional SMTP blocks)
├── domains (Domain management)  
├── billing (Stripe integration)
└── sessions (User sessions)
```

#### **2. Encrypted IMAP Database: `motorical_encrypted_imap`**
```sql
-- Connection: postgresql://encimap:password@localhost:5432/motorical_encrypted_imap
-- Purpose: Encrypted email functionality only

Tables:
├── vaultboxes (Email encryption boxes)
├── vaultbox_smtp_credentials (New clean SMTP system)
├── imap_credentials (IMAP access)
├── certificates (S/MIME certificates)
└── encrypted_emails (Encrypted message storage)
```

### **Database Connection Patterns**

```javascript
// Backend API Service (connects to motorical_db)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
  // → postgresql://motorical:password@localhost:5432/motorical_db
});

// Encrypted IMAP API Service (connects to encimap_db)  
const pool = new Pool({
  connectionString: process.env.ENCIMAP_DATABASE_URL
  // → postgresql://encimap:password@localhost:5432/motorical_encrypted_imap
});

// SMTP Auth Service (connects to BOTH databases)
const motoricalPool = new Pool({
  connectionString: process.env.MOTORICAL_DATABASE_URL
});
const encimapPool = new Pool({
  connectionString: process.env.ENCIMAP_DATABASE_URL  
});
```

## 🚀 **Service Architecture**

### **systemd Services Overview**

```bash
# Service Dependencies & Communication
┌─────────────────────────────────────────────────────────────┐
│                    Service Stack                            │
├─────────────────────────────────────────────────────────────┤
│ motorical-backend-api.service                               │
│ ├── Port: 3001                                              │
│ ├── Purpose: Main API, Auth, Billing, User Management       │
│ ├── Database: motorical_db                                  │
│ └── Dependencies: postgresql.service                        │
├─────────────────────────────────────────────────────────────┤
│ encimap-api.service                                         │
│ ├── Port: 4301                                              │
│ ├── Purpose: Encrypted IMAP API, S/MIME, Vaultboxes        │
│ ├── Database: motorical_encrypted_imap                      │
│ └── Dependencies: postgresql.service, motorical-backend-api │
├─────────────────────────────────────────────────────────────┤
│ encimap-intake.service                                      │
│ ├── Purpose: Email ingestion and encryption                 │
│ ├── Database: motorical_encrypted_imap                      │
│ └── Dependencies: encimap-api.service                       │
├─────────────────────────────────────────────────────────────┤
│ motorical-smtp-gateway.service                              │
│ ├── Port: 2587                                              │
│ ├── Purpose: Customer SMTP (MotorBlocks + Vaultbox Auth)    │
│ ├── Database: Both (via SMTP Auth Service)                  │
│ └── Dependencies: All above services                        │
└─────────────────────────────────────────────────────────────┘
```

### **Service Communication Flow**

```
Frontend (Port 3000)
│
├── Static Files: nginx (Port 80/443)
│
├── API Calls: Backend API (Port 3001)
    │
    ├── User Management: Direct to motorical_db
    │
    ├── Encrypted IMAP: Proxy to encimap-api (Port 4301)
        │
        ├── Vaultbox Operations: Direct to encimap_db
        │
        ├── SMTP Credentials: Via unified SMTP Auth Service
            │
            └── Dual Database Access: motorical_db + encimap_db

Email Flow (Port 2587)
│
├── SMTP Gateway: motorical-smtp-gateway.service
    │
    ├── Authentication: Unified SMTP Auth Service
        │
        ├── MotorBlock Auth: motorical_db lookup
        │
        └── Vaultbox Auth: encimap_db lookup
    │
    ├── Processing: encimap-intake.service
        │
        └── Storage: encimap_db (encrypted)

Delivery (Port 25/587)
│
└── Postfix → External delivery
```

## 🔐 **SMTP Credentials Architecture**

### **Clean Separation Model**

The new architecture maintains **complete separation** between traditional MotorBlocks and vaultbox SMTP credentials:

#### **Traditional MotorBlocks (Unchanged)**
```sql
-- Table: motor_blocks (in motorical_db)
-- Purpose: General SMTP sending for customers
-- Format: Customer-chosen usernames
-- Management: Full MotorBlocks UI
-- Use Case: Regular email sending, marketing, etc.
```

#### **Vaultbox SMTP Credentials (New Clean System)**
```sql  
-- Table: vaultbox_smtp_credentials (in encimap_db)
-- Purpose: SMTP sending ONLY for encrypted vaultboxes
-- Format: vaultbox-domain-com-{uuid} (auto-generated)
-- Management: Encrypted IMAP UI only
-- Use Case: Sending encrypted emails from vaultboxes
```

### **Unified SMTP Authentication**

The `SmtpAuthService` provides unified authentication without mixing concerns:

```javascript
class SmtpAuthService {
  constructor() {
    // Separate connection pools
    this.motoricalPool = new Pool({ connectionString: MOTORICAL_DATABASE_URL });
    this.encimapPool = new Pool({ connectionString: ENCIMAP_DATABASE_URL });
  }

  async authenticate(username, password) {
    // 1. Try MotorBlock authentication (motorical_db)
    const motorBlockAuth = await this.authenticateMotorBlock(username, password);
    if (motorBlockAuth.success) return motorBlockAuth;
    
    // 2. Try Vaultbox authentication (encimap_db)  
    const vaultboxAuth = await this.authenticateVaultbox(username, password);
    return vaultboxAuth;
  }
}
```

## 📁 **File Structure & Key Components**

### **Backend API Routes**
```
/root/motoric_smtp/backend/src/routes/encryptedImap.js
├── Traditional encrypted IMAP routes
├── NEW: Vaultbox SMTP credential routes
│   ├── POST   /vaultboxes/:id/smtp-credentials
│   ├── GET    /vaultboxes/:id/smtp-credentials  
│   ├── POST   /vaultboxes/:id/smtp-credentials/regenerate
│   └── DELETE /vaultboxes/:id/smtp-credentials
└── Proxy forwarding to encimap-api
```

### **Encrypted IMAP API**
```
/root/encrypted-imap/services/api/server.js
├── S2S JWT authentication
├── Vaultbox management
├── SMTP credential endpoints (NEW)
├── Certificate management
└── Database integration (encimap_db)
```

### **Frontend Components**
```
/root/motoric_smtp/frontend/src/pages/EncryptedImap.js
├── Vaultbox creation & management
├── SMTP credentials section (NEW - clean separation)
├── Certificate management
└── NO MotorBlock mixing (clean architecture)
```

### **Database Migrations**
```
/root/encrypted-imap/db/migrations/
├── 001_base.sql (Initial schema)
└── 002_vaultbox_smtp_credentials.sql (NEW clean SMTP system)
```

## 🔧 **Environment Configuration**

### **Required Environment Variables**

#### **Backend API Service** (`/etc/motorical/backend.env`)
```bash
# Primary database (main platform)
DATABASE_URL=postgresql://motorical:password@localhost:5432/motorical_db

# JWT & other configs
JWT_SECRET=your_jwt_secret
STRIPE_SECRET_KEY=sk_live_...
```

#### **Encrypted IMAP API Service** (`/etc/motorical/encimap.env`)
```bash
# Encrypted IMAP database
DATABASE_URL=postgresql://encimap:password@localhost:5432/motorical_encrypted_imap

# S2S communication
S2S_JWT_SECRET=your_s2s_secret
```

#### **SMTP Auth Service** (Embedded in services)
```bash
# Dual database access
MOTORICAL_DATABASE_URL=postgresql://motorical:password@localhost:5432/motorical_db
ENCIMAP_DATABASE_URL=postgresql://encimap:password@localhost:5432/motorical_encrypted_imap
```

## 🎯 **Key Benefits of This Architecture**

### **✅ Clean Separation**
- **No MotorBlock contamination** in encrypted IMAP system
- **Independent databases** for different concerns
- **Separate authentication** systems with unified access layer

### **✅ Scalability**  
- **Independent service scaling** based on load
- **Database optimization** per use case
- **Clear service boundaries** for maintenance

### **✅ Security**
- **Isolated credential systems** reduce attack surface
- **Separate database permissions** limit access scope
- **S2S JWT authentication** for internal communication

### **✅ Maintainability**
- **Clear responsibility boundaries** between services
- **Independent deployment** of components
- **Comprehensive documentation** and testing

## 🚀 **Deployment & Operations**

### **Service Restart Order**
```bash
# Proper dependency order
sudo systemctl restart postgresql.service
sudo systemctl restart motorical-backend-api.service  
sudo systemctl restart encimap-api.service
sudo systemctl restart encimap-intake.service
sudo systemctl restart motorical-smtp-gateway.service
```

### **Health Check Commands**
```bash
# Service status
sudo systemctl status motorical-backend-api encimap-api encimap-intake

# Database connectivity
psql -U motorical -d motorical_db -c "SELECT COUNT(*) FROM users;"
psql -U encimap -d motorical_encrypted_imap -c "SELECT COUNT(*) FROM vaultboxes;"

# API health
curl http://localhost:3001/api/health
curl http://localhost:4301/s2s/v1/health  
```

### **Log Monitoring**
```bash
# Real-time logs
sudo journalctl -u motorical-backend-api -f
sudo journalctl -u encimap-api -f
sudo journalctl -u encimap-intake -f
```

## 📚 **Related Documentation**

- **[Vaultbox Architecture Decision](./vaultbox-architecture-decision.md)** - Design rationale
- **[Deployment Guide](./deployment-guide.md)** - Setup instructions  
- **[Frontend Update Guide](./frontend-update-guide.md)** - UI implementation
- **[Clean Architecture Implementation](./clean-architecture-implementation.md)** - Technical details

---

**🎉 This architecture provides a robust, scalable, and maintainable solution for encrypted email services with complete separation of concerns and clean integration patterns.**
