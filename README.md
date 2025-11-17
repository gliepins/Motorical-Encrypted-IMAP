# Motorical Encrypted IMAP

**Universal Inbound Email Encryption** - Zero‑knowledge email encryption with adapter architecture

[![Production Ready](https://img.shields.io/badge/Status-Production%20Ready-green.svg)]()
[![Zero Knowledge](https://img.shields.io/badge/Security-Zero%20Knowledge-blue.svg)]()
[![Adapter Architecture](https://img.shields.io/badge/Architecture-Adapter%20Based-blue.svg)]()
[![Open Source](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 🎯 **Overview**

Motorical Encrypted IMAP provides **automatic server-side encryption** of ANY inbound email without requiring sender cooperation. Unlike existing solutions that need bilateral setup, this system encrypts emails from Gmail, Outlook, or any email provider automatically while maintaining true zero-knowledge storage.

> **Note**: This is a **module with adapter architecture** that is tightly integrated with Motorical in production, but the adapter system enables theoretical integration with other platforms. See [PLUGGABILITY_ASSESSMENT.md](PLUGGABILITY_ASSESSMENT.md) for detailed integration analysis.

## 📖 **Complete Documentation**

**👉 [Encrypted IMAP Complete Guide](./docs/ENCRYPTED_IMAP_COMPLETE_GUIDE.md)** - **Comprehensive system documentation**

**Quick References:**
- **[API Quick Reference](./docs/API_QUICK_REFERENCE.md)** - Fast API lookup
- **[Documentation Index](./docs/README.md)** - All documentation links

### **🚀 Key Innovation: Universal Inbound Email Encryption**

- ✅ **Automatic Encryption**: No sender setup required
- ✅ **Universal Compatibility**: Works with emails from any provider  
- ✅ **Zero-Knowledge**: Server never has decryption keys
- ✅ **Standard Clients**: Compatible with Thunderbird, Apple Mail, Outlook
- ✅ **Adapter Architecture**: Adapter-based system enables theoretical platform integration
- ✅ **Production Integration**: Tightly integrated with Motorical platform in production

## 🏗️ **Architecture**

```
Internet Email → MTA → Encrypted IMAP Service → Encrypted Storage → IMAP Client
                              ↓
                      Adapter System
                              ↓
              [Auth] [User] [MTA] [Storage]
```

### **Core Components**

- **Intake Engine**: S/MIME encryption of inbound emails (per‑address routing)
- **API Service**: Vaultbox/certificate management with adapter-based authentication
- **Storage Layer**: Encrypted Maildir storage with database abstraction
- **Adapter System**: Platform integration layer for universal compatibility

## 🔌 **Adapter Architecture**

The adapter system provides a **clean architecture** that enables theoretical integration with any platform, though the **production configuration** is tightly integrated with Motorical:

### **Adapter Types**
- **Authentication**: JWT (Motorical), API keys, OAuth2, custom auth systems
- **User Management**: Motorical database (production), External APIs, databases, LDAP
- **MTA Integration**: Postfix (production), Exim, webhooks, custom routing
- **Storage**: PostgreSQL (production), MySQL, SQLite, MongoDB

### **Production Configuration**
- **Default adapters** are configured for Motorical platform integration
- **Requires Motorical database** (`motorical_db`) for user/domain/subscription data
- **Uses Motorical backend API** for authentication and user management
- **Can be configured** for other platforms by implementing custom adapters

### **Platform Examples** (Theoretical)
- **WordPress**: Custom adapter implementation
- **Laravel/Django**: Custom adapter implementation
- **Enterprise**: Custom adapter implementations  
- **Standalone**: Self-hosted deployment with custom adapters

See `/adapters/README.md` for complete adapter documentation and [PLUGGABILITY_ASSESSMENT.md](PLUGGABILITY_ASSESSMENT.md) for integration analysis.

## 🚀 **Quick Start**

### **Production Deployment**

1. **Clone Repository**
```bash
git clone https://github.com/motorical/encrypted-imap.git
cd encrypted-imap
```

2. **Configure Adapters**
```bash
cp config/adapters.example.yaml config/adapters.yaml
# Edit config/adapters.yaml for your platform
```

3. **Deploy Services**
```bash
docker-compose up -d
# or
./deploy/install.sh
```

4. **Test Integration**
```bash
curl http://localhost:4301/api/v1/health
```

### **Platform Integration**

#### **Standalone (API Keys)**
```yaml
adapters:
  auth:
    type: "api_key"
    config:
      valid_keys: ["your-api-key-here"]
```

#### **WordPress Integration**
```yaml
adapters:
  auth:
    type: "custom"
    module: "./adapters/wordpress/auth.js"
    config:
      wp_url: "https://yoursite.com"
```

#### **Laravel Integration**  
```yaml
adapters:
  user:
    type: "database"
    config:
      url: "postgresql://user:pass@localhost/laravel_db"
      tables:
        users: "users"
        domains: "user_domains"
```

## 📁 **Project Structure**

```
encrypted-imap/
├── services/
│   ├── api/                 # Core API service (adapter-based)
│   ├── intake/              # Email intake and encryption
│   └── core/                # Core encryption functions
├── adapters/
│   ├── interfaces/          # Adapter interface definitions
│   ├── implementations/     # Built-in adapter implementations
│   └── examples/            # Platform-specific examples
├── config/
│   ├── adapters.yaml        # Adapter configuration
│   └── platforms/           # Platform-specific configs
├── db/
│   └── migrations/          # Database schema migrations
├── deploy/
│   ├── docker/              # Docker deployment
│   ├── kubernetes/          # K8s manifests
│   └── systemd/             # Systemd services
└── docs/                    # Comprehensive documentation
```

## 🔧 **Configuration**

### **Environment Variables**
```bash
# Core Configuration
DATABASE_URL=postgresql://encimap:***@localhost:5432/motorical_encrypted_imap
MAILDIR_ROOT=/var/mail/vaultboxes
API_PREFIX=/api/v1

# Platform Integration (examples)
PLATFORM_API_URL=https://yourplatform.com/api
JWT_PUBLIC_KEY=base64-encoded-public-key
API_TOKEN=your-platform-api-token
```

### **Adapter Configuration**
```yaml
api:
  prefix: "/api/v1"
  port: 4301

adapters:
  auth:
    type: "jwt"
    config:
      public_key_base64: "${JWT_PUBLIC_KEY}"
  
  user:
    type: "external_api"
    config:
      base_url: "${PLATFORM_API_URL}"
  
  mta:
    type: "postfix"
    config:
      transport_map: "/etc/postfix/transport" # per‑address encimap‑pipe routes only
  
  storage:
    type: "postgresql"
    config:
      url: "${DATABASE_URL}"
```

## 🛡️ **Security Model**

### **Zero-Knowledge Architecture**
- ✅ Server never possesses private decryption keys
- ✅ Messages encrypted with recipient's public key only
- ✅ Protected headers (subject/sender encrypted inside)
- ✅ Minimal metadata storage (timestamp, size, recipient alias)

### **S/MIME Encryption**
- **Standard**: RFC 5652 (CMS) and RFC 8551 (S/MIME)
- **Algorithm**: AES-256 symmetric encryption with RSA key wrapping
- **Certificates**: Self-signed or CA-issued X.509 certificates
- **Compatibility**: All major email clients support S/MIME

## 📊 **Use Cases**

### **Healthcare (HIPAA Compliance)**
Auto-encrypt patient emails from any medical provider:
```
patient@anyprovider.com → user@yourhealthcare.com → Encrypted Storage
```

### **Legal Services**
Secure client communications without client training:
```
client@gmail.com → attorney@lawfirm.com → Zero-Knowledge Storage
```

### **Platform Providers**
Add encryption to existing email hosting:
```yaml
# WordPress hosting with encrypted email
adapters:
  user:
    type: "wordpress"
    config:
      wp_database_url: "${WP_DB_URL}"
```

### **Enterprise Privacy**
Protect inbound emails from customers, partners, vendors without infrastructure changes.

## 🧪 **Testing**

### **Unit Tests**
```bash
npm test
```

### **Integration Tests**
```bash
npm run test:integration
```

### **Adapter Testing**
```bash
npm run test:adapters
```

## 📚 **Documentation**

- **[Adapter System](/adapters/README.md)**: Complete adapter documentation
- **[API Reference](/docs/api-reference.md)**: REST API documentation
- **[Deployment Guide](/docs/deployment.md)**: Production deployment guide
- **[Security Model](/docs/security.md)**: Detailed security analysis
- **[Platform Integration](/docs/platforms/)**: Platform-specific guides

## 🌍 **Community & Support**

### **Contributing**
1. Review adapter interfaces in `/adapters/interfaces/`
2. Implement adapters for new platforms
3. Submit PR with tests and documentation
4. Join community discussions

### **Platform Support**
- **Existing Platforms**: WordPress, Laravel, Django examples provided
- **Custom Platforms**: Implement adapters using our interfaces
- **Enterprise**: Professional services available

### **Getting Help**
- **Documentation**: Complete guides in `/docs/`
- **Examples**: Platform examples in `/adapters/examples/`
- **Issues**: Report bugs on GitHub
- **Discussions**: Community support forum

## 📈 **Roadmap**

### **Current Status: Production Ready**
- ✅ Core encryption engine
- ✅ Adapter architecture system
- ✅ Complete API implementation
- ✅ IMAP client integration
- ✅ Production deployment tools

### **Upcoming Features**
- 📅 Additional platform adapters
- 📅 Advanced retention policies
- 📅 Webhook integrations  
- 📅 Multi-tenant management
- 📅 Performance optimizations

## 📋 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🏆 **Why Motorical Encrypted IMAP?**

**Unique in the Market**: The only email encryption solution that automatically encrypts ANY inbound email without requiring sender cooperation, with an adapter architecture that enables platform integration.

**Proven Technology**: Production-ready with active customers, enterprise-grade security, and comprehensive documentation.

**Adapter Architecture**: Clean adapter system demonstrates extensibility patterns and enables theoretical integration with any technology stack through standardized interfaces.

**Transparency**: Open source codebase demonstrates the adapter architecture approach and integration patterns with the Motorical platform.

---

## 🔍 **Transparency & Openness**

This repository is **public** to demonstrate:

- **🏗️ Architecture Transparency**: See how adapter-based modules integrate with platforms
- **📚 Educational Value**: Learn from production-ready adapter architecture
- **🔌 Adapter Pattern**: Understand the adapter architecture and integration approach
- **🤝 Community Trust**: Open codebase shows commitment to transparency

**Note**: While this module is open-source, the main Motorical platform (backend API, frontend, SMTP gateway) remains closed-source for business reasons. This module serves as a **reference implementation** showing adapter architecture and integration patterns.

**Integration Depth**: This module uses an **excellent adapter architecture** that theoretically supports platform-agnostic integration, but the **production configuration is tightly integrated** with Motorical's database and backend API. See [PLUGGABILITY_ASSESSMENT.md](PLUGGABILITY_ASSESSMENT.md) for detailed analysis.

---

**Transform any platform into a zero-knowledge email encryption service with adapter architecture.**
