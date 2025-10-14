# Encrypted IMAP API - Quick Reference

## 🚀 **Base URL**
```
Production: https://motorical.com/api/encrypted-imap
Development: http://localhost:4301/s2s/v1
```

## 🔐 **Authentication**
```http
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

## 📮 **Vaultbox Operations**

### Create Vaultbox
```http
POST /vaultboxes
{
    "user_id": "uuid",
    "domain": "call.autoroad.lv", 
    "name": "Cat Mailbox",
    "alias": "cat"
}
```

### List Vaultboxes
```http
GET /vaultboxes
```

### Delete Vaultbox
```http
DELETE /vaultboxes/{id}
```

## 🔑 **Credential Management**

### Create IMAP Credentials
```http
POST /vaultboxes/{id}/imap-credentials
```

### Create SMTP Credentials  
```http
POST /vaultboxes/{id}/smtp-credentials
{
    "host": "mail.motorical.com",
    "port": 587,
    "security_type": "STARTTLS"
}
```

### Regenerate Passwords
```http
POST /vaultboxes/{id}/imap-credentials/regenerate
POST /vaultboxes/{id}/smtp-credentials/regenerate
```

### Get Credentials
```http
GET /vaultboxes/{id}/imap-credentials
GET /imap-credentials
GET /imap-credentials/list
```

## 🔐 **Certificate Management**

### Generate Certificate
```http
POST /generate-certificate
{
    "email": "cat@call.autoroad.lv",
    "days": 365
}
```

### Download P12 Bundle
```http
POST /p12
{
    "vaultbox_id": "uuid",
    "password": "bundle-password"
}
```

### Download Complete Bundle (ZIP)
```http
POST /bundle
{
    "vaultbox_id": "uuid", 
    "password": "bundle-password"
}
```

## 📊 **System Information**

### Usage Statistics
```http
GET /usage
```

### Health Check
```http
GET /health
```

## 🔧 **Common Response Formats**

### Success Response
```json
{
    "success": true,
    "data": { ... }
}
```

### Error Response  
```json
{
    "success": false,
    "error": "Error message",
    "details": "Additional details"
}
```

## ⚡ **Quick Examples**

### Complete Vaultbox Setup
```bash
# 1. Create vaultbox
curl -X POST "https://motorical.com/api/encrypted-imap/vaultboxes" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"domain":"call.autoroad.lv","name":"Cat","alias":"cat"}'

# 2. Create IMAP credentials
curl -X POST "https://motorical.com/api/encrypted-imap/vaultboxes/{id}/imap-credentials" \
  -H "Authorization: Bearer {token}"

# 3. Create SMTP credentials  
curl -X POST "https://motorical.com/api/encrypted-imap/vaultboxes/{id}/smtp-credentials" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"host":"mail.motorical.com","port":587,"security_type":"STARTTLS"}'

# 4. Download certificate bundle
curl -X POST "https://motorical.com/api/encrypted-imap/bundle" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"vaultbox_id":"{id}","password":"secret"}' \
  --output certificate_bundle.zip
```

### Check System Status
```bash
# Health check
curl "https://motorical.com/api/encrypted-imap/health"

# Usage statistics
curl -H "Authorization: Bearer {token}" \
  "https://motorical.com/api/encrypted-imap/usage"
```

## 🎯 **Automated Actions**

### On Vaultbox Creation:
- ✅ S/MIME certificate generated
- ✅ Email route added: `alias@domain → vaultbox-id`
- ✅ Postfix configuration updated

### On Vaultbox Deletion:
- ✅ Email route removed
- ✅ All credentials deleted (CASCADE)
- ✅ All certificates deleted (CASCADE)  
- ✅ All messages deleted (CASCADE)
- ✅ Maildir folder cleaned up
- ✅ Postfix configuration updated

## 📞 **Support**

For complete documentation: [Encrypted IMAP Complete Guide](./ENCRYPTED_IMAP_COMPLETE_GUIDE.md)

**Service Status:** Production Ready ✅  
**Multi-Tenant:** Unlimited customers/domains ✅  
**Automation:** Zero manual intervention ✅
