# Vaultbox-MotorBlock Architecture Decision

## 🚨 **Current Problem**

The current implementation mixes encrypted IMAP vaultboxes with regular SMTP motorblocks, creating complexity:

1. **Confusing User Experience**: Different types of motorblocks in same UI
2. **Complex Lifecycle Management**: Vaultbox creation/deletion affects motorblocks
3. **Mixed Concerns**: SMTP sending vs. encrypted storage are different use cases
4. **Identity Confusion**: Multiple IMAP users per vaultbox vs. single purpose

## 🎯 **Recommended Solution: Clean Separation**

### **Option A: Separate SMTP Credentials System (RECOMMENDED)**

Create a dedicated SMTP credentials system for vaultboxes that doesn't interfere with normal motorblocks:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Vaultboxes    │    │ SMTP Credentials│    │   MotorBlocks   │
│                 │    │                 │    │                 │
│ - Encrypted     │    │ - Simple auth   │    │ - Full features │
│   IMAP storage  │    │ - Per vaultbox  │    │ - Rate limiting │
│ - Zero knowledge│    │ - Send-only     │    │ - Analytics     │
│ - Certificate   │◄───┤ - No analytics  │    │ - Multi-user    │
│   management    │    │ - Basic config  │    │ - Complex auth  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### **Benefits:**
- ✅ **Clear Separation**: Different purposes, different systems
- ✅ **Simplified UX**: No mixed motorblock types in UI  
- ✅ **Independent Lifecycle**: Vaultbox SMTP doesn't affect main motorblocks
- ✅ **Single IMAP User**: One identity per vaultbox (clean design)
- ✅ **Focused Features**: Each system optimized for its purpose

### **Implementation:**

#### **1. Dedicated Vaultbox SMTP Credentials Table**
```sql
CREATE TABLE vaultbox_smtp_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vaultbox_id UUID NOT NULL REFERENCES vaultboxes(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used TIMESTAMPTZ,
  enabled BOOLEAN DEFAULT true
);
```

#### **2. Lightweight SMTP Service for Vaultboxes**
```javascript
// Dedicated endpoint for vaultbox SMTP
POST /encrypted-imap/vaultboxes/:id/smtp-credentials
DELETE /encrypted-imap/vaultboxes/:id/smtp-credentials
PUT /encrypted-imap/vaultboxes/:id/smtp-credentials/rotate
```

#### **3. Unified Authentication in SMTP Gateway**
```javascript
// SMTP gateway recognizes both types:
if (username.startsWith('vaultbox-')) {
  // Handle vaultbox SMTP credentials
  return validateVaultboxCredentials(username, password);
} else {
  // Handle regular motorblock credentials  
  return validateMotorBlockCredentials(username, password);
}
```

## 🔧 **Migration Path**

### **Phase 1: Create Parallel System**
1. Create `vaultbox_smtp_credentials` table
2. Add vaultbox SMTP endpoints to encrypted-imap API
3. Update SMTP gateway to handle both auth types
4. Update frontend to use new endpoints for vaultboxes

### **Phase 2: Migrate Existing Data**
1. Identify vaultbox-created motorblocks
2. Migrate credentials to new system
3. Update vaultbox records with new SMTP credential IDs
4. Clean up orphaned motorblocks

### **Phase 3: Update Frontend**
1. Remove motorblock creation from vaultbox flows
2. Use dedicated vaultbox SMTP credential management
3. Separate UI sections completely

## 🎨 **Frontend Changes Needed**

### **EncryptedImap.js Updates:**
```javascript
// Instead of creating motorblocks:
const handleCreateSmtpCredentials = async (vaultboxId) => {
  const response = await api.post(`/encrypted-imap/vaultboxes/${vaultboxId}/smtp-credentials`);
  setSmtpCredentials(response.data.credentials);
};

// Simple credentials display:
<Box>
  <Typography variant="subtitle2">SMTP Sending (Optional)</Typography>
  <Typography variant="body2">Host: mail.motorical.com:587</Typography>
  <Typography variant="body2">Username: {smtpCredentials?.username}</Typography>
  <Typography variant="body2">Password: {smtpCredentials?.password}</Typography>
  <Button onClick={() => regenerateSmtpPassword(vaultboxId)}>
    Regenerate Password
  </Button>
</Box>
```

### **MotorBlocks.js Simplification:**
```javascript
// Remove vaultbox-related logic:
// - No special handling for encrypted IMAP motorblocks
// - No mixed UI elements
// - Clean separation of concerns

// Show only true motorblocks with full features
const regularMotorBlocks = motorBlocks.filter(mb => !mb.managedByEncryptedImap);
```

## 🎯 **Clean User Experience**

### **Encrypted IMAP Page:**
- **Focus**: Email encryption and certificate management
- **SMTP**: Simple optional credentials for sending
- **Features**: Basic auth, no analytics, no complex rate limiting

### **Motor Blocks Page:**  
- **Focus**: Professional email sending infrastructure
- **SMTP**: Full feature set with analytics, rate limiting, multiple auth methods
- **Features**: Everything you've built for professional senders

## 🚀 **Next Steps**

1. **Agree on Architecture**: Confirm this separation approach
2. **Implement Vaultbox SMTP System**: Create dedicated credentials system
3. **Update SMTP Gateway**: Handle both auth types
4. **Migrate Existing Data**: Clean transition
5. **Update Frontend**: Separate UX completely

## 📊 **Impact Assessment**

### **Positive:**
- ✅ Cleaner architecture and user experience
- ✅ Easier maintenance and development
- ✅ Clear feature boundaries
- ✅ Single IMAP user per vaultbox

### **Considerations:**
- 🔄 Migration effort for existing vaultbox-motorblock relationships  
- 🔄 Frontend updates needed
- 🔄 Documentation updates

---

**Recommendation**: Implement Option A (Clean Separation) for long-term maintainability and user experience clarity.
