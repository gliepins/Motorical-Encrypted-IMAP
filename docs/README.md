# Motorical Encrypted IMAP - Documentation Index

## 📚 **Documentation Overview**

This directory contains comprehensive documentation for the Motorical Encrypted IMAP platform, featuring a clean separation architecture that eliminates MotorBlock-vaultbox confusion and provides robust encrypted email services.

## 🆕 **Latest Updates (v3.0 - September 14, 2025)**

### **🎯 NEW: Production-Ready Automated System**
- ✅ **Complete automation** - Zero manual intervention required for vaultbox lifecycle
- ✅ **Multi-customer support** - Unlimited customers, domains, and email addresses
- ✅ **Automated email routing** - Postfix transport maps managed automatically
- ✅ **Complete delete functionality** - Bulletproof data integrity with cascade cleanup
- ✅ **Unified credential management** - Synchronized IMAP/SMTP usernames
- ✅ **Real-time email delivery** - Individual vaultbox isolation with perfect routing

### **🎯 PRODUCTION FEATURES**
- ✅ **Plan-based limits enforcement** for vaultbox creation, domains, and storage
- ✅ **Real-time usage tracking** with compliance monitoring and percentage calculations
- ✅ **Clear error messages** with upgrade paths and current plan context
- ✅ **Advanced plan manager** script with encrypted IMAP configuration templates
- ✅ **API endpoints** for subscription limits and usage (`/subscription/limits`)

### **🏷️ Subscription Tiers**
- **Motorical Plan (€1)**: 2 vaultboxes, 1 domain, 0.5GB storage, no SMTP
- **Starter Plan (€3)**: 5 vaultboxes, 2 domains, 1GB storage, SMTP enabled  
- **Business Plan (€7)**: 15 vaultboxes, 5 domains, 5GB storage, bulk operations
- **Professional Plan (€11)**: 50 vaultboxes, unlimited domains, 20GB storage, all features

### **Latest Stability & Fixes (v2.2.1)**
- 🔧 **Manual subscription fix**: Resolved issue where manually assigned subscriptions (e.g., Motorical Plan) weren't properly recognized in frontend due to missing `user_products` table entries
- 📊 **Limit enforcement verification**: Confirmed subscription limits work correctly for all plan types
- 🏗️ **Database consistency**: Enhanced documentation for proper manual subscription assignment procedures
- ✅ **Customer subscription flow**: Verified that normal paying customers via Stripe automatically get proper table entries

### **Previous Updates (v2.1-v2.2)**
- ✅ **Subscription limits integration** with real-time frontend enforcement and proper error messaging
- ✅ **Bulk delete operations** with parallel processing and interactive UI
- ✅ **Unified credential management** (IMAP & SMTP username synchronization)
- ✅ **Enhanced alias support** for proper email display based on actual usernames
- ✅ **Performance optimizations** (eliminated infinite API loops, reduced logging)
- ✅ **Improved certificate downloads** with custom filenames: `{username}_{domain}_vault.zip`

*📋 See [CHANGELOG.md](./CHANGELOG.md) for complete release notes and migration instructions*

## 🎯 **Quick Start**

### **📖 COMPLETE SYSTEM GUIDE** ⭐ *NEW - Start Here*
**[Encrypted IMAP Complete Guide](./ENCRYPTED_IMAP_COMPLETE_GUIDE.md)** - **Comprehensive documentation covering concepts, vaultboxes, APIs, deployment, and operations**

### **New to the Project?**
1. **[Encrypted IMAP Complete Guide](./ENCRYPTED_IMAP_COMPLETE_GUIDE.md)** - ⭐ **Complete system documentation**
2. **[Architecture Summary](./architecture-summary.md)** - Project overview and accomplishments
3. **[Deployment Guide](./deployment-guide.md)** - Setup and deployment instructions
4. **[Complete Architecture](./complete-architecture.md)** - Detailed system architecture

### **Implementing or Troubleshooting?**
1. **[Encrypted IMAP Complete Guide](./ENCRYPTED_IMAP_COMPLETE_GUIDE.md)** - ⭐ **API reference and troubleshooting**
2. **[API Flow Documentation](./api-flow-documentation.md)** - Request flows and debugging
3. **[Database Architecture](./database-architecture.md)** - Dual database design
4. **[Service Dependencies](./service-dependencies.md)** - Service management and monitoring

## 📖 **Documentation Structure**

### **🏗️ Architecture Documents**

#### **[Architecture Summary](./architecture-summary.md)** ⭐ *Start Here*
- **Purpose**: Complete project overview and accomplishments
- **Audience**: Project managers, new developers, stakeholders
- **Contains**: Problem solved, implementation details, benefits, testing status

#### **[Complete Architecture](./complete-architecture.md)**
- **Purpose**: Comprehensive system architecture and service connections
- **Audience**: Architects, senior developers, operations teams
- **Contains**: Service diagrams, API flows, database relationships, scaling considerations

#### **[Vaultbox Architecture Decision](./vaultbox-architecture-decision.md)**
- **Purpose**: Design rationale for clean separation architecture
- **Audience**: Architects, technical decision makers
- **Contains**: Problem analysis, solution comparison, decision justification

### **🔧 Implementation Documents**

#### **[API Flow Documentation](./api-flow-documentation.md)**
- **Purpose**: Detailed API request flows and debugging information
- **Audience**: Frontend developers, API consumers, support teams
- **Contains**: Request examples, authentication flows, error handling, monitoring

#### **[Database Architecture](./database-architecture.md)**
- **Purpose**: Dual database design and connection patterns
- **Audience**: Database administrators, backend developers
- **Contains**: Schema details, connection management, query patterns, performance tuning

#### **[Service Dependencies](./service-dependencies.md)**
- **Purpose**: systemd service management and communication patterns
- **Audience**: DevOps, system administrators, operations teams
- **Contains**: Service definitions, startup procedures, troubleshooting, monitoring

### **🚀 Deployment & Operations**

#### **[Deployment Guide](./deployment-guide.md)**
- **Purpose**: Setup and deployment instructions for production
- **Audience**: DevOps engineers, system administrators
- **Contains**: Database setup, environment configuration, service management, verification

#### **[Clean Architecture Implementation](./clean-architecture-implementation.md)**
- **Purpose**: Backend implementation details and code organization
- **Audience**: Backend developers, code reviewers
- **Contains**: Service layer design, database integration, error handling, testing

#### **[Frontend Update Guide](./frontend-update-guide.md)**
- **Purpose**: Frontend changes and implementation approach
- **Audience**: Frontend developers, UI/UX teams
- **Contains**: Component changes, state management, user experience improvements

#### **[Frontend Implementation Complete](./frontend-implementation-complete.md)**
- **Purpose**: Final frontend implementation status and features
- **Audience**: Frontend developers, QA teams
- **Contains**: Completed features, testing results, user interface details

## 🎯 **Documentation by Use Case**

### **👨‍💼 Project Management**
- **Project Status**: [Architecture Summary](./architecture-summary.md)
- **Requirements Met**: [Vaultbox Architecture Decision](./vaultbox-architecture-decision.md)
- **Deliverables**: [Frontend Implementation Complete](./frontend-implementation-complete.md)

### **🏗️ System Architecture**
- **High-Level Design**: [Complete Architecture](./complete-architecture.md)
- **Database Design**: [Database Architecture](./database-architecture.md)
- **Service Design**: [Service Dependencies](./service-dependencies.md)

### **👨‍💻 Development**
- **Backend Development**: [Clean Architecture Implementation](./clean-architecture-implementation.md)
- **Frontend Development**: [Frontend Update Guide](./frontend-update-guide.md)
- **API Integration**: [API Flow Documentation](./api-flow-documentation.md)

### **🚀 Operations & Deployment**
- **Initial Deployment**: [Deployment Guide](./deployment-guide.md)
- **Service Management**: [Service Dependencies](./service-dependencies.md)
- **Troubleshooting**: [API Flow Documentation](./api-flow-documentation.md)

### **🐛 Debugging & Support**
- **API Issues**: [API Flow Documentation](./api-flow-documentation.md)
- **Database Issues**: [Database Architecture](./database-architecture.md)
- **Service Issues**: [Service Dependencies](./service-dependencies.md)

## 🔍 **Quick Reference**

### **Key Concepts**
- **Clean Separation**: Complete isolation between MotorBlocks and vaultbox SMTP credentials
- **Dual Database**: `motorical_db` (platform) + `motorical_encrypted_imap` (encryption)
- **Unified SMTP Auth**: Single authentication service handling both credential types
- **S2S Communication**: Backend API ↔ Encrypted IMAP API with JWT authentication

### **Important Files**
```
Frontend:    /root/motoric_smtp/frontend/src/pages/EncryptedImap.js
Backend:     /root/motoric_smtp/backend/src/routes/encryptedImap.js
IMAP API:    /root/encrypted-imap/services/api/server.js
Database:    /root/encrypted-imap/scripts/setup-database.sql
```

### **Service Commands**
```bash
# Status check
sudo systemctl status motorical-backend-api encimap-api encimap-intake motorical-smtp-gateway

# Restart in order
sudo systemctl restart motorical-backend-api encimap-api encimap-intake motorical-smtp-gateway

# Health check
curl http://localhost:3001/api/health && curl http://localhost:4301/s2s/v1/health
```

### **Database Access**
```bash
# Platform database
sudo -u motorical psql -d motorical_db

# Encrypted IMAP database  
sudo -u encimap psql -d motorical_encrypted_imap
```

## 📞 **Support & Maintenance**

### **Health Monitoring**
- **Service Status**: `sudo systemctl status motorical-backend-api encimap-api`
- **API Health**: `curl http://localhost:3001/api/health`
- **Database Health**: `sudo -u encimap psql -d motorical_encrypted_imap -c "SELECT 1;"`
- **Logs**: `sudo journalctl -u encimap-api -f`

### **Common Tasks**
- **Add Vaultbox**: Use Encrypted IMAP frontend section
- **Create SMTP Creds**: Click "Create SMTP Credentials" in vaultbox UI
- **Regenerate Password**: Use "Regenerate" button in vaultbox SMTP section
- **Service Restart**: Follow dependency order in [Service Dependencies](./service-dependencies.md)

### **Troubleshooting**
- **404 Errors**: Check [API Flow Documentation](./api-flow-documentation.md) § Error Handling
- **Database Issues**: See [Database Architecture](./database-architecture.md) § Connection Management
- **Service Issues**: See [Service Dependencies](./service-dependencies.md) § Troubleshooting

---

## 🏆 **Project Achievements**

✅ **Complete MotorBlock-Vaultbox Separation**  
✅ **Dual Database Architecture with Security Isolation**  
✅ **Clean Frontend UI with No Confusion**  
✅ **Unified SMTP Authentication (Transparent to Users)**  
✅ **Production-Ready Implementation with Full Testing**  
✅ **Comprehensive Documentation Suite**  

**🎉 The Motorical Encrypted IMAP platform now provides a robust, secure, and maintainable solution for encrypted email services with complete separation of concerns and production-ready reliability.**
