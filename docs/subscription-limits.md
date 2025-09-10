# Encrypted IMAP Subscription Limits

**Version**: 2.2  
**Last Updated**: September 10, 2025  
**Author**: Motorical Development Team

## 📊 **Overview**

The Motorical Encrypted IMAP platform integrates comprehensive subscription-based limits to ensure fair usage and provide clear upgrade paths for customers. This document outlines the limit structure, enforcement mechanisms, and management tools.

## 🎯 **Subscription Tiers**

### **Motorical Plan (€1/month)**
- **Target**: Entry-level users and testing
- **Vaultboxes**: 2 maximum
- **Domains**: 1 maximum  
- **Storage**: 0.5GB total (512MB)
- **SMTP**: ❌ Not available
- **Retention**: 90 days
- **Features**: Certificate generation only

### **Starter Plan (€3/month)**
- **Target**: Individual users and small projects
- **Vaultboxes**: 5 maximum
- **Domains**: 2 maximum
- **Storage**: 1GB total (1024MB)
- **SMTP**: ✅ 100 emails/day, 10/hour
- **Retention**: 180 days
- **Features**: Basic encrypted IMAP + SMTP companion

### **Business Plan (€7/month)**
- **Target**: Small businesses and power users
- **Vaultboxes**: 15 maximum
- **Domains**: 5 maximum
- **Storage**: 5GB total
- **SMTP**: ✅ 300 emails/day, 30/hour
- **Retention**: 365 days (1 year)
- **Features**: Bulk operations, API access, advanced management

### **Professional Plan (€11/month)**
- **Target**: Large businesses and enterprises
- **Vaultboxes**: 50 maximum
- **Domains**: Unlimited
- **Storage**: 20GB total
- **SMTP**: ✅ 1000 emails/day, 100/hour
- **Retention**: 1095 days (3 years)
- **Features**: All features, priority support, advanced analytics

## 🔧 **Limit Categories**

### **1. Vaultbox Limits**
```javascript
vaultboxLimits: {
  maxCount: 5,                    // Maximum vaultboxes per user
  maxDomainsPerUser: 2,           // Maximum unique domains
  maxVaultboxesPerDomain: 10      // Maximum vaultboxes per domain
}
```

### **2. Storage Limits**
```javascript
storageLimits: {
  maxStoragePerUser: 1073741824,      // Total storage per user (1GB)
  maxStoragePerVaultbox: 536870912,   // Maximum per vaultbox (512MB)
  retentionDays: 180,                 // Auto-delete after days
  maxMessageSizeBytes: 26214400       // Maximum message size (25MB)
}
```

### **3. Message Limits**
```javascript
messageLimits: {
  maxMessagesPerUserPerMonth: 5000,   // Monthly incoming limit
  maxIncomingPerDay: 50,              // Daily incoming limit
  maxIncomingPerHour: 10,             // Hourly incoming limit
  maxMessagesPerVaultbox: 2000        // Maximum per vaultbox
}
```

### **4. SMTP Companion Limits**
```javascript
smtpLimits: {
  enabled: true,                      // SMTP companion available
  dailyOutbound: 100,                 // Daily outgoing emails
  hourlyOutbound: 10,                 // Hourly outgoing emails
  burstLimit: 5,                      // Burst sending limit
  maxCredentialsPerVaultbox: 1        // One credential set per vaultbox
}
```

### **5. Feature Access**
```javascript
features: {
  certificateGeneration: true,        // S/MIME certificate generation
  bulkOperations: false,              // Bulk delete and management
  apiAccess: false,                   // Programmatic API access
  customDomains: true,                // Custom domain support
  smtpCompanion: true                 // SMTP sending capabilities
}
```

## 📡 **API Integration**

### **Get Subscription Limits**
```bash
GET /api/encrypted-imap/subscription/limits
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "limits": {
      "hasEncryptedImap": true,
      "vaultboxLimits": { "maxCount": 5, "maxDomainsPerUser": 2 },
      "storageLimits": { "maxStoragePerUser": 1073741824 },
      "smtpLimits": { "enabled": true, "dailyOutbound": 100 },
      "features": { "bulkOperations": false, "apiAccess": false }
    },
    "usage": {
      "vaultboxCount": 2,
      "domainsCount": 1,
      "storageUsedBytes": 256000000,
      "monthlyMessages": 1200
    },
    "compliance": {
      "vaultboxCount": {
        "current": 2, "limit": 5, "withinLimit": true, "percentage": 40
      }
    }
  }
}
```

### **Error Responses**
When limits are exceeded, the API returns detailed error information:

```json
{
  "success": false,
  "error": "Vaultbox limit exceeded",
  "details": "You have reached the maximum of 5 vaultboxes allowed in your Starter Plan",
  "upgradeMessage": "Upgrade to a higher plan to create more vaultboxes",
  "requiresUpgrade": true,
  "currentPlan": "Starter Plan",
  "currentUsage": 5,
  "limit": 5
}
```

## 🛠️ **Management Tools**

### **Plan Manager Script**
The `advanced-plan-manager.sh` script provides comprehensive encrypted IMAP limit management:

```bash
./advanced-plan-manager.sh
# Choose option 1 (Edit specific plan) -> option 6 (Encrypted IMAP)
# Or option 8 (Quick: Update encrypted IMAP features)
```

### **Configuration Options**
1. **Enable/disable encrypted IMAP**
2. **Vaultbox limits** (count/domains per user)
3. **Storage limits** (per user/retention)
4. **Message limits** (monthly/daily/hourly)
5. **SMTP companion settings**
6. **Feature access** (API/bulk operations/certificates)
7. **Complete configuration templates**

### **Template Presets**
- **Starter Template**: Basic encrypted IMAP (3 vaultboxes, 1GB, no SMTP)
- **Professional Template**: Enhanced (25 vaultboxes, 10GB, SMTP enabled)
- **Enterprise Template**: Unlimited (unlimited vaultboxes, SMTP, all features)
- **Security Template**: High security (limited vaultboxes, long retention)

### **Manual Subscription Assignment**

When manually assigning subscriptions to users (for testing or special cases), **both database tables must be updated** to ensure proper functionality:

```sql
-- 1. Add subscription record
INSERT INTO user_subscriptions (user_id, plan_id, status) 
VALUES ('user-uuid', 'plan-uuid', 'active');

-- 2. Add user_products record (REQUIRED for limits to work)
INSERT INTO user_products (user_id, product_id, status, quantity) 
VALUES ('user-uuid', 'plan-uuid', 'active', 1);
```

**⚠️ Critical Note**: The `SubscriptionService` requires entries in **both** `user_subscriptions` and `user_products` tables. Failing to update `user_products` will result in users falling back to the free plan with no encrypted IMAP features.

**Normal Customer Flow**: Paying customers automatically get both table entries via Stripe webhook processing - this issue only affects manual assignments.

## 🔍 **Enforcement Points**

### **Backend Validation**
Limits are enforced at multiple API endpoints:

- `POST /encrypted-imap/vaultboxes` - Vaultbox creation
- `POST /encrypted-imap/vaultboxes/:id/smtp-credentials` - SMTP creation
- Bulk operations require `bulkOperations` feature
- API access requires `apiAccess` feature

### **Frontend Integration**
The frontend can check limits before allowing operations:

```javascript
// Check limits before showing create button
const limitsResponse = await api.get('/encrypted-imap/subscription/limits');
const canCreateVaultbox = limitsResponse.data.compliance.vaultboxCount.withinLimit;

if (!canCreateVaultbox) {
  showUpgradePrompt(limitsResponse.data.limits.vaultboxLimits);
}
```

## 📈 **Usage Tracking**

### **Real-Time Monitoring**
Usage is tracked across multiple data points:

- **Vaultbox count**: Active vaultboxes per user
- **Domain count**: Unique domains per user  
- **Storage usage**: Total bytes across all vaultboxes
- **Monthly messages**: Incoming messages in current month
- **Daily/hourly rates**: SMTP sending rates

### **Compliance Calculation**
```javascript
// Example compliance calculation
const compliance = {
  vaultboxCount: {
    current: 3,
    limit: 5,
    withinLimit: 3 < 5,                    // true
    percentage: Math.round((3/5) * 100)    // 60%
  }
};
```

## 🚨 **Error Message Examples**

### **Vaultbox Limit Exceeded**
```
Error: "Vaultbox limit exceeded"
Details: "You have reached the maximum of 5 vaultboxes allowed in your Starter Plan"
Upgrade: "Upgrade to a higher plan to create more vaultboxes"
```

### **SMTP Not Available**
```
Error: "SMTP sending not available"
Details: "SMTP companion feature is not included in your Motorical Plan"
Upgrade: "Upgrade to Starter Plan or higher to send emails from your vaultboxes"
```

### **Storage Limit Exceeded**
```
Error: "Storage limit exceeded"
Details: "You have used 1.2GB of your 1GB storage limit in your Starter Plan"
Upgrade: "Upgrade to a higher plan for more storage capacity"
```

## 🔧 **Database Implementation**

### **Feature Storage**
Limits are stored in the `products` table's `features` JSONB column:

```sql
UPDATE products SET features = features || '{
  "encryptedImap": {
    "enabled": true,
    "vaultboxLimits": {"maxCount": 5, "maxDomainsPerUser": 2},
    "storageLimits": {"maxStoragePerUser": 1073741824},
    "smtpLimits": {"enabled": true, "dailyOutbound": 100},
    "features": {"bulkOperations": false, "apiAccess": false}
  }
}'::jsonb WHERE name = 'Starter Plan';
```

### **Usage Queries**
Real-time usage is calculated using efficient database queries:

```sql
-- Get current usage for user
SELECT 
  COUNT(DISTINCT v.id) as vaultbox_count,
  COUNT(DISTINCT v.domain) as domains_count,
  COALESCE(SUM(m.size_bytes), 0) as storage_used_bytes,
  COUNT(CASE WHEN m.received_at >= NOW() - INTERVAL '30 days' THEN 1 END) as monthly_messages
FROM vaultboxes v
LEFT JOIN messages m ON m.vaultbox_id = v.id
WHERE v.user_id = $1;
```

## 🎯 **Best Practices**

### **For Developers**
1. **Always check limits** before operations
2. **Provide clear error messages** with upgrade paths
3. **Use structured error responses** for frontend consumption
4. **Cache limit data** appropriately to avoid excessive queries

### **For Administrators**
1. **Monitor usage patterns** to adjust limits appropriately
2. **Use plan manager script** for consistent limit configuration
3. **Test limit enforcement** after changes
4. **Document custom limit changes** for compliance

### **For Operations**
1. **Monitor compliance** across all subscription tiers
2. **Track upgrade conversion** from limit violations
3. **Ensure database performance** with usage queries
4. **Backup before limit changes** for rollback capability

---

## 📞 **Support**

For questions about subscription limits or implementation details:
- **Technical Documentation**: [API Flow Documentation](./api-flow-documentation.md)
- **Database Schema**: [Database Architecture](./database-architecture.md)
- **Service Management**: [Service Dependencies](./service-dependencies.md)

**Production Environment**: `mail.motorical.com`  
**Status**: All subscription limit services operational
