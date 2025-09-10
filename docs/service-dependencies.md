# Service Dependencies - Motorical Encrypted IMAP

## 🚀 **systemd Service Architecture**

The Motorical platform consists of multiple interconnected systemd services that work together to provide encrypted email functionality. This document details the service dependencies, communication patterns, startup sequences, and operational procedures.

## 📊 **Service Dependency Graph**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Service Dependency Tree                             │
└─────────────────────────────────────────────────────────────────────────────┘

postgresql.service (Foundation Layer)
│
├── motorical-backend-api.service (Core Platform)
│   │
│   ├── encimap-api.service (Encrypted IMAP Core)
│   │   │
│   │   ├── encimap-intake.service (Email Processing)
│   │   │   │
│   │   │   └── motorical-email-delivery.service (Email Delivery)
│   │   │
│   │   └── motorical-smtp-gateway.service (Customer SMTP)
│   │
│   └── nginx.service (Web Server & Proxy)
│
└── redis-server.service (Queue & Cache)

┌─────────────────────────────────────────────────────────────────────────────┐
│                         Network Communication                               │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend (Port 3000) ←→ nginx (Port 80/443) ←→ Backend API (Port 3001)
                                                       │
                                                       ↓
                                            Encrypted IMAP API (Port 4301)
                                                       │
                                    ┌──────────────────┼──────────────────┐
                                    │                  │                  │
                                    ↓                  ↓                  ↓
                            Intake Service    SMTP Gateway        Email Delivery
                           (Internal Comms)   (Port 2587)        (Port 25/587)
                                    │                  │                  │
                                    └──────────────────┼──────────────────┘
                                                       ↓
                                              PostgreSQL + Redis
```

## 🔧 **Service Definitions**

### **1. Foundation Services**

#### **postgresql.service**
```ini
# System service (managed by PostgreSQL package)
[Unit]
Description=PostgreSQL database server
After=network.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/lib/postgresql/14/bin/postgres -D /var/lib/postgresql/14/main
User=postgres

[Install]
WantedBy=multi-user.target
```
- **Purpose**: Database backend for both `motorical_db` and `motorical_encrypted_imap`
- **Dependencies**: None (foundation service)
- **Required By**: All application services

#### **redis-server.service**
```ini
# System service (managed by Redis package)
[Unit]
Description=Advanced key-value store
After=network.target

[Service]
Type=notify
ExecStart=/usr/bin/redis-server /etc/redis/redis.conf
User=redis

[Install]
WantedBy=multi-user.target
```
- **Purpose**: Email queue management, session storage, caching
- **Dependencies**: network.target
- **Used By**: Email delivery service, SMTP gateway

### **2. Core Platform Services**

#### **motorical-backend-api.service**
```ini
[Unit]
Description=Motorical Backend API Service
Documentation=https://github.com/motorical/backend-api
After=postgresql.service redis-server.service
Wants=postgresql.service redis-server.service
Requires=postgresql.service

[Service]
Type=simple
User=motorical
Group=motorical
WorkingDirectory=/root/motoric_smtp/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment
EnvironmentFile=/etc/motorical/backend.env

# Process management
TimeoutStartSec=30
TimeoutStopSec=15
KillMode=mixed
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
```

**Service Details:**
- **Port**: 3001
- **Purpose**: Main platform API, user authentication, billing, MotorBlock management
- **Database**: `motorical_db`
- **Dependencies**: PostgreSQL (required), Redis (wanted)
- **Environment**: `/etc/motorical/backend.env`

**Key Functions:**
```javascript
// Authentication & user management
// Billing & subscription management  
// Domain verification
// Traditional MotorBlock management
// Proxy routing to encrypted IMAP services
```

### **3. Encrypted IMAP Services**

#### **encimap-api.service**
```ini
[Unit]
Description=Motorical Encrypted IMAP API Service
Documentation=https://github.com/motorical/encrypted-imap
After=motorical-backend-api.service postgresql.service
Wants=motorical-backend-api.service
Requires=postgresql.service

[Service]
Type=simple
User=encimap
Group=encimap
WorkingDirectory=/root/encrypted-imap/services/api
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment
EnvironmentFile=/etc/motorical/encimap.env

# Process management
TimeoutStartSec=30
TimeoutStopSec=15
KillMode=mixed
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
```

**Service Details:**
- **Port**: 4301
- **Purpose**: Encrypted email API, vaultbox management, S/MIME processing
- **Database**: `motorical_encrypted_imap`
- **Dependencies**: Backend API (wanted), PostgreSQL (required)
- **Environment**: `/etc/motorical/encimap.env`

**Key Functions:**
```javascript
// S2S API endpoints for vaultbox management
// SMTP credential management (new clean system)
// S/MIME certificate handling
// Encrypted email storage and retrieval
// Integration with adapter system
```

#### **encimap-intake.service**
```ini
[Unit]
Description=Motorical Encrypted IMAP Intake Service
Documentation=https://github.com/motorical/encrypted-imap
After=encimap-api.service postgresql.service
Wants=encimap-api.service
Requires=postgresql.service

[Service]
Type=simple
User=encimap
Group=encimap
WorkingDirectory=/root/encrypted-imap/services/intake
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment
EnvironmentFile=/etc/motorical/encimap.env

# Process management
TimeoutStartSec=30
TimeoutStopSec=15
KillMode=mixed
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
```

**Service Details:**
- **Purpose**: Email ingestion, S/MIME encryption, Maildir storage
- **Database**: `motorical_encrypted_imap`
- **Dependencies**: Encrypted IMAP API (wanted), PostgreSQL (required)
- **Communication**: Internal service-to-service calls

**Key Functions:**
```javascript
// Inbound email processing
// S/MIME encryption/decryption
// Maildir file management
// Integration with Postfix/Dovecot
// Email queue processing
```

### **4. Email Infrastructure Services**

#### **motorical-smtp-gateway.service**
```ini
[Unit]
Description=Motorical SMTP Gateway Service
Documentation=https://github.com/motorical/smtp-gateway
After=encimap-api.service motorical-backend-api.service redis-server.service
Wants=encimap-api.service motorical-backend-api.service redis-server.service
Requires=postgresql.service

[Service]
Type=simple
User=motorical
Group=motorical
WorkingDirectory=/root/motoric_smtp/smtp-gateway
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment
EnvironmentFile=/etc/motorical/smtp-gateway.env

# Process management
TimeoutStartSec=30
TimeoutStopSec=15
KillMode=mixed
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
```

**Service Details:**
- **Port**: 2587
- **Purpose**: Customer SMTP authentication and routing
- **Database**: Both `motorical_db` and `motorical_encrypted_imap` (via SMTP Auth Service)
- **Dependencies**: Both API services (wanted), PostgreSQL (required), Redis (wanted)

**Key Functions:**
```javascript
// Unified SMTP authentication (MotorBlocks + Vaultbox credentials)
// Rate limiting and quota enforcement
// Email queue management
// Integration with Postfix for delivery
```

#### **motorical-email-delivery.service**
```ini
[Unit]
Description=Motorical Email Delivery Service
Documentation=https://github.com/motorical/email-delivery
After=encimap-intake.service redis-server.service
Wants=encimap-intake.service redis-server.service
Requires=postgresql.service

[Service]
Type=simple
User=motorical
Group=motorical
WorkingDirectory=/root/motoric_smtp/email-delivery
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment
EnvironmentFile=/etc/motorical/email-delivery.env

# Process management
TimeoutStartSec=30
TimeoutStopSec=15
KillMode=mixed
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
```

**Service Details:**
- **Purpose**: Email queue processing and external delivery
- **Database**: Both databases for delivery tracking
- **Dependencies**: Intake service (wanted), Redis (wanted), PostgreSQL (required)

### **5. Web Server**

#### **nginx.service**
```ini
# System service (managed by nginx package)
[Unit]
Description=A high performance web server and a reverse proxy server
After=network.target
Wants=network-online.target

[Service]
Type=forking
ExecStartPre=/usr/sbin/nginx -t
ExecStart=/usr/sbin/nginx
ExecReload=/bin/kill -s HUP $MAINPID
KillMode=mixed

[Install]
WantedBy=multi-user.target
```

**Configuration Highlights:**
```nginx
# /etc/nginx/sites-available/motorical
server {
    listen 80;
    listen 443 ssl;
    server_name motorical.com;

    # Frontend static files
    location / {
        root /var/www/motorical;
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🔄 **Service Communication Patterns**

### **1. Synchronous HTTP/HTTPS Communication**

```
Frontend ──HTTPS──► nginx ──HTTP──► Backend API ──HTTP──► Encrypted IMAP API
   │                                      │                        │
   │                                      │                        │
   └──────── User Authentication ─────────┘                        │
                                                                   │
                                   S2S JWT Authentication ─────────┘
```

#### **Authentication Flow**
```javascript
// 1. Frontend → Backend API (JWT Bearer token)
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// 2. Backend API → Encrypted IMAP API (S2S JWT)
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (different token)

// 3. SMTP Gateway → Both APIs (Dual database access)
```

### **2. Database Communication**

```
Backend API ────────► motorical_db (Primary connection)
                           │
Encrypted IMAP API ────► motorical_encrypted_imap (Primary connection)
                           │
SMTP Auth Service ─────► Both databases (Dual connection pools)
                           │
Email Services ────────► Context-appropriate database
```

### **3. Internal Service Communication**

```
SMTP Gateway ──HTTP──► Backend API (User verification)
     │
     └─────HTTP────► Encrypted IMAP API (Vaultbox verification)

Intake Service ──HTTP──► Encrypted IMAP API (Storage operations)

Email Delivery ──Redis──► Queue operations
     │
     └─────HTTP────► Both APIs (Delivery status updates)
```

## 🚀 **Startup and Shutdown Procedures**

### **Proper Startup Sequence**

```bash
#!/bin/bash
# /root/encrypted-imap/scripts/startup-sequence.sh

echo "🚀 Starting Motorical services in proper dependency order..."

# 1. Foundation services (should already be running)
sudo systemctl start postgresql.service
sudo systemctl start redis-server.service
echo "✅ Foundation services started"

# 2. Core platform service
sudo systemctl start motorical-backend-api.service
sleep 5  # Allow time for service to initialize
echo "✅ Backend API started"

# 3. Encrypted IMAP services
sudo systemctl start encimap-api.service
sleep 3
echo "✅ Encrypted IMAP API started"

sudo systemctl start encimap-intake.service
sleep 2
echo "✅ Intake service started"

# 4. Email infrastructure services
sudo systemctl start motorical-smtp-gateway.service
sleep 2
echo "✅ SMTP gateway started"

sudo systemctl start motorical-email-delivery.service
sleep 2
echo "✅ Email delivery started"

# 5. Web server (if not already running)
sudo systemctl start nginx.service
echo "✅ Nginx started"

echo "🎉 All services started successfully!"
```

### **Health Check After Startup**

```bash
#!/bin/bash
# /root/encrypted-imap/scripts/health-check.sh

echo "🔍 Checking service health..."

# Service status checks
services=(
    "postgresql.service"
    "redis-server.service"
    "motorical-backend-api.service"
    "encimap-api.service"
    "encimap-intake.service"
    "motorical-smtp-gateway.service"
    "motorical-email-delivery.service"
    "nginx.service"
)

for service in "${services[@]}"; do
    if systemctl is-active --quiet "$service"; then
        echo "✅ $service is running"
    else
        echo "❌ $service is not running"
    fi
done

# API endpoint checks
echo "🌐 Checking API endpoints..."

# Backend API
if curl -f -s http://localhost:3001/api/health > /dev/null; then
    echo "✅ Backend API responding"
else
    echo "❌ Backend API not responding"
fi

# Encrypted IMAP API  
if curl -f -s http://localhost:4301/s2s/v1/health > /dev/null; then
    echo "✅ Encrypted IMAP API responding"
else
    echo "❌ Encrypted IMAP API not responding"
fi

# Database connectivity
echo "🗄️ Checking database connectivity..."

if sudo -u motorical psql -d motorical_db -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ motorical_db accessible"
else
    echo "❌ motorical_db not accessible"
fi

if sudo -u encimap psql -d motorical_encrypted_imap -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✅ motorical_encrypted_imap accessible"
else
    echo "❌ motorical_encrypted_imap not accessible"
fi
```

### **Graceful Shutdown Sequence**

```bash
#!/bin/bash
# /root/encrypted-imap/scripts/shutdown-sequence.sh

echo "🛑 Gracefully shutting down Motorical services..."

# 1. Stop customer-facing services first
sudo systemctl stop nginx.service
echo "✅ Nginx stopped"

# 2. Stop email processing services
sudo systemctl stop motorical-email-delivery.service
sudo systemctl stop motorical-smtp-gateway.service
echo "✅ Email services stopped"

# 3. Stop internal services
sudo systemctl stop encimap-intake.service
sudo systemctl stop encimap-api.service
echo "✅ Encrypted IMAP services stopped"

# 4. Stop core platform
sudo systemctl stop motorical-backend-api.service
echo "✅ Backend API stopped"

# Note: PostgreSQL and Redis left running (system services)
echo "🎉 Application services stopped gracefully!"
echo "💡 Database and Redis services left running"
```

## 🔧 **Service Management Commands**

### **Individual Service Management**

```bash
# Start/stop individual services
sudo systemctl start motorical-backend-api.service
sudo systemctl stop encimap-api.service
sudo systemctl restart motorical-smtp-gateway.service

# Enable/disable services for automatic startup
sudo systemctl enable encimap-api.service
sudo systemctl disable motorical-email-delivery.service

# Check service status
sudo systemctl status motorical-backend-api.service
sudo systemctl is-active encimap-api.service
sudo systemctl is-enabled motorical-smtp-gateway.service
```

### **Bulk Service Management**

```bash
# Start all Motorical services
sudo systemctl start motorical-backend-api encimap-api encimap-intake motorical-smtp-gateway motorical-email-delivery

# Check status of all services
sudo systemctl status motorical-backend-api encimap-api encimap-intake motorical-smtp-gateway motorical-email-delivery --no-pager

# Enable all services for automatic startup
sudo systemctl enable motorical-backend-api encimap-api encimap-intake motorical-smtp-gateway motorical-email-delivery
```

### **Log Management**

```bash
# View logs for specific service
sudo journalctl -u motorical-backend-api.service

# Follow logs in real-time
sudo journalctl -u encimap-api.service -f

# View logs from specific time
sudo journalctl -u motorical-smtp-gateway.service --since "2025-09-10 10:00:00"

# View logs for all Motorical services
sudo journalctl -u motorical-backend-api -u encimap-api -u encimap-intake -u motorical-smtp-gateway -u motorical-email-delivery
```

## 🚨 **Troubleshooting Common Issues**

### **Service Won't Start**

```bash
# Check service status and logs
sudo systemctl status service-name.service
sudo journalctl -u service-name.service --no-pager -l

# Common issues:
# 1. Database connection failure
# 2. Port already in use
# 3. Permission issues
# 4. Environment file missing/incorrect
# 5. Dependency service not running
```

### **Database Connection Issues**

```bash
# Test database connectivity
sudo -u motorical psql -d motorical_db -c "SELECT version();"
sudo -u encimap psql -d motorical_encrypted_imap -c "SELECT version();"

# Check PostgreSQL service
sudo systemctl status postgresql.service
sudo journalctl -u postgresql.service
```

### **Port Conflicts**

```bash
# Check which services are using specific ports
sudo netstat -tlnp | grep :3001  # Backend API
sudo netstat -tlnp | grep :4301  # Encrypted IMAP API
sudo netstat -tlnp | grep :2587  # SMTP Gateway

# Kill processes using specific ports if needed
sudo fuser -k 3001/tcp
```

### **Dependency Issues**

```bash
# Check service dependencies
systemctl list-dependencies motorical-backend-api.service
systemctl list-dependencies encimap-api.service

# Verify dependency services are running
sudo systemctl status postgresql.service redis-server.service
```

## 📊 **Performance Monitoring**

### **Service Resource Usage**

```bash
# Monitor CPU and memory usage
sudo systemctl status motorical-backend-api.service | grep Memory
sudo systemctl status encimap-api.service | grep Memory

# Detailed process information
ps aux | grep -E "(node|postgres|redis)" | grep -v grep
```

### **Connection Monitoring**

```bash
# Monitor database connections
sudo -u postgres psql -c "SELECT datname, usename, count(*) FROM pg_stat_activity WHERE state = 'active' GROUP BY datname, usename;"

# Monitor network connections
sudo netstat -an | grep -E ":(3001|4301|2587|5432|6379)"
```

### **Log Analysis**

```bash
# Error count in logs
sudo journalctl -u encimap-api.service --since "1 hour ago" | grep -i error | wc -l

# Performance metrics from logs
sudo journalctl -u motorical-backend-api.service --since "1 hour ago" | grep "response time"
```

---

**🎯 This comprehensive service dependency documentation ensures reliable operation, proper startup/shutdown procedures, and effective troubleshooting of the complete Motorical encrypted email platform.**
