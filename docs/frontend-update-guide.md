# Frontend Update Guide - Clean Vaultbox SMTP Separation

## 🎯 **Frontend Changes Required**

The current `EncryptedImap.js` component needs updates to use the new clean vaultbox SMTP credentials system instead of the old MotorBlock mixing.

## 📝 **Required Changes in EncryptedImap.js**

### **1. Remove Old SMTP State Variables**
```javascript
// ❌ REMOVE these old MotorBlock-related states:
const [createSmtp, setCreateSmtp] = useState(false);
const [smtpMode, setSmtpMode] = useState('mirror');
const [smtpCustomUsername, setSmtpCustomUsername] = useState('');
const [smtpCustomPassword, setSmtpCustomPassword] = useState('');
const [smtpByDomain, setSmtpByDomain] = useState({});

// ✅ REPLACE with clean vaultbox SMTP states:
const [vaultboxSmtpCredentials, setVaultboxSmtpCredentials] = useState({}); // { [vaultboxId]: credentials }
const [smtpCredentialsLoading, setSmtpCredentialsLoading] = useState({});   // { [vaultboxId]: boolean }
```

### **2. Update API Calls**

Replace old MotorBlock creation with new vaultbox SMTP endpoints:

```javascript
// ❌ OLD: Creating MotorBlocks for vaultboxes
const createSmtpCompanion = async (domain) => {
  // Old MotorBlock creation logic
};

// ✅ NEW: Creating vaultbox SMTP credentials
const createVaultboxSmtpCredentials = async (vaultboxId) => {
  try {
    setSmtpCredentialsLoading(prev => ({ ...prev, [vaultboxId]: true }));
    
    const response = await api.post(`/encrypted-imap/vaultboxes/${vaultboxId}/smtp-credentials`);
    
    if (response.data.success) {
      setVaultboxSmtpCredentials(prev => ({
        ...prev,
        [vaultboxId]: response.data.data.credentials
      }));
      setMessage({ type: 'success', text: 'SMTP credentials created successfully!' });
    }
  } catch (error) {
    setMessage({ type: 'error', text: `Failed to create SMTP credentials: ${error.response?.data?.error || error.message}` });
  } finally {
    setSmtpCredentialsLoading(prev => ({ ...prev, [vaultboxId]: false }));
  }
};
```

### **3. Update Vaultbox Display**

Change from domain-based SMTP to vaultbox-based SMTP:

```javascript
// ✅ NEW: Display SMTP credentials per vaultbox
const VaultboxSmtpSection = ({ vaultbox }) => {
  const credentials = vaultboxSmtpCredentials[vaultbox.id];
  const loading = smtpCredentialsLoading[vaultbox.id];

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="h6">SMTP Credentials</Typography>
        
        {!credentials ? (
          <Button 
            variant="contained" 
            onClick={() => createVaultboxSmtpCredentials(vaultbox.id)}
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create SMTP Credentials'}
          </Button>
        ) : (
          <Stack spacing={2}>
            <TextField label="SMTP Username" value={credentials.username} fullWidth disabled />
            <TextField label="SMTP Password" value={credentials.password || '••••••••'} fullWidth disabled />
            <TextField label="SMTP Host" value={credentials.host} fullWidth disabled />
            <TextField label="SMTP Port" value={credentials.port} fullWidth disabled />
            <TextField label="Security" value={credentials.security_type} fullWidth disabled />
            
            <Button onClick={() => regenerateVaultboxPassword(vaultbox.id)}>
              Regenerate Password
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};
```

### **4. Load SMTP Credentials**

Add function to load existing SMTP credentials:

```javascript
const loadVaultboxSmtpCredentials = async (vaultboxId) => {
  try {
    const response = await api.get(`/encrypted-imap/vaultboxes/${vaultboxId}/smtp-credentials`);
    
    if (response.data.success && response.data.data) {
      setVaultboxSmtpCredentials(prev => ({
        ...prev,
        [vaultboxId]: response.data.data
      }));
    }
  } catch (error) {
    // No credentials exist yet - that's fine
    console.log(`No SMTP credentials for vaultbox ${vaultboxId}`);
  }
};
```

### **5. Remove MotorBlock References**

```javascript
// ❌ REMOVE all references to:
- Motor blocks creation for vaultboxes
- smtpByDomain state management  
- createSmtp checkbox
- smtpMode radio buttons
- Any domain-level SMTP management

// ✅ FOCUS ON:
- Individual vaultbox SMTP credentials
- One set of credentials per vaultbox
- Clean separation from MotorBlocks
```

## 🔧 **Backend API Integration**

Update the API service calls to use the new endpoints:

```javascript
// In your api service file, add these endpoints:

// Create SMTP credentials for vaultbox
export const createVaultboxSmtpCredentials = (vaultboxId) => 
  api.post(`/encrypted-imap/vaultboxes/${vaultboxId}/smtp-credentials`);

// Get SMTP credentials for vaultbox  
export const getVaultboxSmtpCredentials = (vaultboxId) =>
  api.get(`/encrypted-imap/vaultboxes/${vaultboxId}/smtp-credentials`);

// Regenerate SMTP password
export const regenerateVaultboxSmtpPassword = (vaultboxId) =>
  api.post(`/encrypted-imap/vaultboxes/${vaultboxId}/smtp-credentials/regenerate`);

// Delete SMTP credentials
export const deleteVaultboxSmtpCredentials = (vaultboxId) =>
  api.delete(`/encrypted-imap/vaultboxes/${vaultboxId}/smtp-credentials`);
```

## 🎨 **UI/UX Improvements**

With clean separation, the UI becomes much simpler:

### **Before (Complex)**
- Checkboxes for "Create SMTP companion"
- Radio buttons for "Mirror" vs "Custom" modes  
- Mixed domain/vaultbox SMTP management
- Confusing MotorBlock relationships

### **After (Clean)**
- Simple "Create SMTP Credentials" button per vaultbox
- Clear vaultbox-specific SMTP settings
- No MotorBlock confusion
- One-to-one vaultbox-SMTP relationship

## 📋 **Migration Checklist**

- [ ] Remove old SMTP state variables
- [ ] Replace MotorBlock API calls with vaultbox SMTP endpoints
- [ ] Update vaultbox display to show per-vaultbox SMTP credentials
- [ ] Add SMTP credentials loading/creation functions
- [ ] Remove all MotorBlock creation references
- [ ] Test vaultbox SMTP credential creation
- [ ] Test password regeneration
- [ ] Test credential deletion
- [ ] Update user documentation

## 🚀 **Result After Update**

- **Clean UI**: No more confusing SMTP options
- **Clear Ownership**: Each vaultbox has its own SMTP credentials  
- **No MotorBlock Mixing**: Complete separation achieved
- **Better UX**: Simple, predictable SMTP credential management

---

**Next**: Update `EncryptedImap.js` with these changes to complete the clean separation!
