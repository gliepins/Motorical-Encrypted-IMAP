# Changelog - Motorical Encrypted IMAP

## Version 2.2.1 - September 10, 2025

### 🔧 **FIXED: Manual Subscription Database Consistency**

#### **Critical Issue Resolution**
- 🔧 **Manual subscription recognition**: Fixed issue where manually assigned subscriptions (e.g., Motorical Plan) weren't properly recognized in frontend
- 🏗️ **Database consistency**: Manual subscriptions were only recorded in `user_subscriptions` table but missing from `user_products` table
- ✅ **SubscriptionService fix**: Backend now properly reads plan features for manually assigned subscriptions
- 📊 **Frontend limits display**: Resolved "0/0 ❌" display and incorrect button states for manual subscriptions

#### **Documentation Updates**
- 📋 **Manual assignment guide**: Added proper procedures for manually assigning subscriptions
- ⚠️ **Critical warnings**: Documented requirement for both database table entries
- ✅ **Customer flow verification**: Confirmed normal paying customers are unaffected

#### **Affected Users**
- Users with manually assigned "Motorical Plan" subscriptions
- Test accounts and special case assignments
- **Normal paying customers**: No impact - automatic webhook processing works correctly

#### **Migration Applied**
```sql
-- Fixed missing user_products entries for manually assigned subscriptions
INSERT INTO user_products (user_id, product_id, status, quantity) 
VALUES 
  ('2862bb55-a9c0-45a2-a784-fe9d2d863a45', '764b1857-87e8-4b99-b440-aca0999d7858', 'active', 1),
  ('0d1a3d72-8761-424a-be57-1358d28c6336', '764b1857-87e8-4b99-b440-aca0999d7858', 'active', 1);
```

---

## Version 2.2 - September 10, 2025

### 🎯 **NEW: Subscription Limits Integration**

#### **Plan-Based Access Control**
- ✅ **Vaultbox creation limits** enforced based on subscription tier
- ✅ **Domain limits** per user based on plan (1-unlimited)
- ✅ **Storage quotas** with real-time usage tracking (0.5GB-20GB)
- ✅ **Feature gates** for SMTP, bulk operations, and API access
- ✅ **Message limits** for monthly incoming emails and storage retention

#### **Advanced Plan Management**
- ✅ **Plan manager script** extended with encrypted IMAP configuration
- ✅ **Template-based setup** for different subscription tiers
- ✅ **Real-time limit adjustments** through admin interface
- ✅ **Database feature integration** with existing Stripe billing

#### **Enhanced Error Handling**
- ✅ **Clear error messages** with specific plan context and usage details
- ✅ **Actionable upgrade paths** with specific plan recommendations
- ✅ **Structured error responses** for frontend integration
- ✅ **Current usage tracking** in all error responses

#### **API Integration**
- ✅ **New endpoint**: `GET /encrypted-imap/subscription/limits`
- ✅ **Usage tracking**: Real-time vaultbox, domain, and storage monitoring
- ✅ **Compliance checking**: Percentage calculations and limit warnings
- ✅ **Backend validation**: All operations checked against subscription limits

#### **Subscription Tiers Applied**
- **Motorical Plan (€1)**: 2 vaultboxes, 1 domain, 0.5GB, no SMTP
- **Starter Plan (€3)**: 5 vaultboxes, 2 domains, 1GB, SMTP enabled
- **Business Plan (€7)**: 15 vaultboxes, 5 domains, 5GB, bulk operations
- **Professional Plan (€11)**: 50 vaultboxes, unlimited domains, 20GB, all features

### **🔧 Technical Implementation**
- **SubscriptionService**: New methods `getEncryptedImapLimits()` and `validateEncryptedImapLimits()`
- **Database features**: Applied to all existing subscription plans with appropriate limits
- **Plan manager**: New option 6 in edit submenu and option 8 in main menu
- **Error responses**: Enhanced with details, upgrade messages, and current plan context
- **Real-time usage**: Direct queries to encrypted IMAP database for accurate usage data

---

## Version 2.1 - September 10, 2025

### 🆕 **New Features**

#### **Bulk Operations**
- **Bulk delete vaultboxes** with parallel processing for improved performance
- **Interactive selection** with checkboxes and "Select All" functionality
- **Confirmation dialog** showing detailed information about selected vaultboxes
- **Smart UI** that only shows bulk actions when multiple vaultboxes exist

#### **Unified Credential Management**
- **Synchronized usernames** between IMAP and SMTP credentials for the same vaultbox
- **Standardized username format**: `encimap-{domain-with-hyphens}-{random-suffix}`
- **Automatic credential creation** when creating new vaultboxes
- **Password visibility** immediately after creation (no need to regenerate)

#### **Enhanced User Experience**
- **Alias support** for proper email display based on actual username input
- **Persistent credentials** that survive page reloads
- **Improved certificate download** with customizable filenames: `{username}_{domain}_vault.zip`
- **ZIP bundle as default** download option for certificates

### 🔧 **Technical Improvements**

#### **Database Schema Enhancements**
- **Added `alias` column** to vaultboxes table for proper username storage
- **Enhanced `password_hash` storage** in imap_app_credentials using bcrypt
- **Improved indexing** for better query performance
- **Migration scripts** for seamless upgrades

#### **API Optimizations**
- **Eliminated infinite loops** in frontend credential loading
- **Reduced excessive logging** for cleaner console output
- **Graceful error handling** for service unavailability (500 errors)
- **Parallel processing** for bulk operations

#### **Frontend Performance**
- **Optimized useEffect hooks** to prevent unnecessary API calls
- **Better state management** for credential persistence
- **Improved error handling** with user-friendly messages
- **Clean UI patterns** following Material-UI best practices

### 🐛 **Bug Fixes**

#### **Credential Management**
- **Fixed IMAP password visibility** on initial vaultbox creation
- **Fixed credential persistence** after page reloads
- **Fixed username synchronization** between IMAP and SMTP credentials
- **Fixed email display** using correct alias field instead of display name

#### **API & Performance**
- **Eliminated 500 errors** from communications tenant endpoint
- **Fixed infinite API call loops** during page loads
- **Optimized credential loading** to prevent unnecessary requests
- **Fixed database constraint violations** in IMAP credential creation

#### **User Interface**
- **Fixed certificate filename generation** to use actual username and domain
- **Improved bulk selection UX** with proper state management
- **Fixed accordion expansion** conflicts with checkbox selection
- **Enhanced confirmation dialogs** with detailed information

### 📚 **Documentation Updates**

#### **New Documentation**
- **Enhanced API flow documentation** with v2.1 features
- **Updated database architecture** reflecting new schema
- **Comprehensive changelog** tracking all improvements
- **Migration guides** for schema updates

#### **Updated Guides**
- **API endpoint reference** with new bulk operations
- **Database setup instructions** including new migrations
- **Monitoring and debugging** with improved tracing
- **Service management** with updated restart procedures

### 🗃️ **Database Migrations**

#### **Migration 003: Unified Usernames**
```sql
-- Added password_hash and updated_at columns to imap_app_credentials
ALTER TABLE imap_app_credentials 
ADD COLUMN password_hash VARCHAR(255),
ADD COLUMN updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP;
```

#### **Migration 004: Alias Support**
```sql
-- Added alias column to vaultboxes for proper username storage
ALTER TABLE vaultboxes 
ADD COLUMN alias VARCHAR(100);

-- Added index for alias lookups
CREATE INDEX IF NOT EXISTS idx_vaultboxes_alias ON vaultboxes(alias);
```

### 🔄 **Migration Instructions**

#### **For Existing Installations**
```bash
# Apply new migrations
sudo -u postgres psql -d motorical_encrypted_imap -f /root/encrypted-imap/db/migrations/003_unified_usernames.sql
sudo -u postgres psql -d motorical_encrypted_imap -f /root/encrypted-imap/db/migrations/004_add_alias_column.sql

# Grant permissions
sudo -u postgres psql -d motorical_encrypted_imap -c "GRANT ALL PRIVILEGES ON vaultboxes TO encimap;"
sudo -u postgres psql -d motorical_encrypted_imap -c "GRANT ALL PRIVILEGES ON imap_app_credentials TO encimap;"

# Restart services
sudo systemctl restart encimap-api motorical-backend-api
```

#### **Username Synchronization Script**
```bash
# Optional: Sync existing IMAP usernames to unified format
node /root/encrypted-imap/scripts/sync-usernames.js
```

### 🎯 **Breaking Changes**
- **Certificate filenames** now use format `{username}_{domain}_vault.zip` instead of `encrypted-imap-user-domain-bundle.zip`
- **IMAP credentials** now require user_id in database (handled by migration)
- **Vaultbox email display** now uses alias field instead of name field

### 🚀 **Performance Improvements**
- **50% reduction** in initial page load API calls
- **Parallel bulk operations** for faster multi-vaultbox management
- **Optimized database queries** with improved indexing
- **Cleaner console output** with reduced logging noise

---

## Version 2.0 - Previous Release

### **Initial Features**
- Encrypted IMAP vaultbox system
- S/MIME certificate management
- Basic SMTP credential support
- Domain verification system
- Initial UI implementation

---

## 📋 **Upgrade Notes**

### **From v2.0 to v2.1**
1. **Database migrations** are required - follow migration instructions above
2. **Service restart** needed to apply backend changes
3. **Frontend cache** should be cleared for new features
4. **Certificate downloads** will use new filename format
5. **Existing credentials** remain functional with gradual migration to unified format

### **Compatibility**
- **✅ Backward compatible** with existing vaultboxes and credentials
- **✅ Graceful degradation** for services that may be temporarily unavailable
- **✅ Progressive enhancement** with new features available immediately after upgrade
- **✅ Database integrity** maintained through careful migration scripts

---

*For technical support or questions about this release, refer to the updated documentation in `/root/encrypted-imap/docs/`*
