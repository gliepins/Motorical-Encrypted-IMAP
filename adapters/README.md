# Motorical Encrypted IMAP - Adapter System

This directory contains the pluggable adapter system that makes Motorical Encrypted IMAP compatible with any platform or infrastructure.

## 📁 Directory Structure

```
adapters/
├── interfaces/          # Abstract adapter definitions
│   ├── auth.js         # Authentication adapter interface
│   ├── user.js         # User management adapter interface
│   ├── mta.js          # Mail Transfer Agent adapter interface
│   ├── storage.js      # Storage/database adapter interface
│   └── index.js        # Central exports and utilities
├── implementations/     # Built-in adapter implementations
│   ├── jwt-auth.js     # JWT authentication adapter
│   ├── api-user.js     # External API user adapter
│   ├── postfix-mta.js  # Postfix MTA adapter
│   └── postgres-storage.js # PostgreSQL storage adapter
├── examples/           # Platform-specific example adapters
│   ├── wordpress/      # WordPress integration adapters
│   ├── laravel/        # Laravel integration adapters
│   ├── django/         # Django integration adapters
│   └── standalone/     # Standalone deployment adapters
└── README.md          # This file
```

## 🔌 Adapter Types

### 1. Authentication Adapter (`AuthAdapter`)

Handles user authentication and authorization.

**Key Methods:**
- `validateToken(token, context)` - Validate auth tokens
- `hasPermission(userId, action, resource)` - Check permissions
- `getTokenInfo(token)` - Get token metadata

**Use Cases:**
- JWT token validation
- API key authentication
- OAuth2 integration
- Custom authentication systems

### 2. User Management Adapter (`UserAdapter`)

Manages user data and platform integration.

**Key Methods:**
- `getUser(userId)` - Retrieve user information
- `getUserDomains(userId)` - Get user's domains
- `getUserSubscription(userId)` - Get subscription/plan info
- `hasFeature(userId, feature)` - Check feature access

**Use Cases:**
- External API integration
- Database user management
- LDAP/Active Directory
- Platform-specific user systems

### 3. MTA Integration Adapter (`MTAAdapter`)

Configures mail server routing for encrypted IMAP.

**Key Methods:**
- `addDomainRoute(domain, vaultboxId)` - Add email routing
- `removeDomainRoute(domain)` - Remove routing
- `testRoute(domain)` - Test routing configuration
- `getStats(domain)` - Get routing statistics

**Use Cases:**
- Postfix integration
- Exim configuration
- Sendmail setup
- Webhook-based routing

### 4. Storage Adapter (`StorageAdapter`)

Provides database abstraction layer.

**Key Methods:**
- `query(sql, params)` - Execute queries
- `transaction(callback)` - Run transactions
- `insert/update/delete` - CRUD operations
- `healthCheck()` - Check database health

**Use Cases:**
- PostgreSQL integration
- MySQL compatibility
- SQLite for development
- MongoDB for document storage

## 🚀 Quick Start

### Using Built-in Adapters

```javascript
import { AdapterRegistry } from './interfaces/index.js';
import { JWTAuthAdapter } from './implementations/jwt-auth.js';
import { PostgreSQLAdapter } from './implementations/postgres-storage.js';

const registry = new AdapterRegistry();

// Register adapters
registry.register('auth', 'auth', new JWTAuthAdapter({
  publicKey: process.env.JWT_PUBLIC_KEY,
  audience: 'encrypted-imap'
}));

registry.register('storage', 'storage', new PostgreSQLAdapter({
  url: process.env.DATABASE_URL
}));

// Use adapters
const user = await registry.get('auth').validateToken(token);
const data = await registry.get('storage').query('SELECT * FROM vaultboxes');
```

### Creating Custom Adapters

```javascript
import { AuthAdapter } from './interfaces/auth.js';

class CustomAuthAdapter extends AuthAdapter {
  async validateToken(token, context) {
    // Your authentication logic
    return {
      valid: true,
      user_id: 'extracted-from-token',
      permissions: ['read', 'write']
    };
  }

  async hasPermission(userId, action, resource) {
    // Your permission logic
    return true;
  }

  async getTokenInfo(token) {
    // Your token info logic
    return {
      valid: true,
      expires_at: new Date(Date.now() + 3600000)
    };
  }
}
```

## 📋 Configuration

Adapters are configured via YAML files:

```yaml
# config/adapters.yaml
adapters:
  auth:
    type: "jwt"
    config:
      public_key_base64: "${JWT_PUBLIC_KEY}"
      audience: "encrypted-imap"
  
  user:
    type: "external_api"
    config:
      base_url: "${PLATFORM_API_URL}"
      auth_header: "Authorization: Bearer ${API_TOKEN}"
  
  mta:
    type: "postfix"
    config:
      transport_map: "/etc/postfix/transport"
      reload_command: "sudo postfix reload"
  
  storage:
    type: "postgresql"
    config:
      url: "${DATABASE_URL}"
      pool_size: 10
```

## 🧪 Testing

### Unit Testing Adapters

```javascript
import { validateAdapter, createMockAdapter } from './interfaces/index.js';

// Test adapter implementation
const adapter = new MyCustomAdapter(config);
const isValid = validateAdapter(adapter, 'auth');

// Create mock for testing
const mockAuth = createMockAdapter('auth', {
  validateToken: async () => ({ valid: true, user_id: 'test' })
});
```

### Integration Testing

```javascript
import { AdapterTestSuite } from '../tests/adapters/adapter-test-suite.js';

const testSuite = new AdapterTestSuite(MyAdapter, config, testData);
await testSuite.runAuthAdapterTests();
```

## 📚 Platform Examples

### WordPress Integration

```php
// WordPress adapter for user management
class WordPressUserAdapter {
  public function getUser($userId) {
    $user = get_user_by('ID', $userId);
    return [
      'id' => $user->ID,
      'email' => $user->user_email,
      'verified' => true,
      'plan' => get_user_meta($userId, 'subscription_plan', true)
    ];
  }
}
```

### Laravel Integration

```php
// Laravel adapter for authentication
class LaravelAuthAdapter {
  public function validateToken($token) {
    try {
      $user = Auth::guard('api')->user();
      return [
        'valid' => true,
        'user_id' => $user->id,
        'permissions' => $user->permissions
      ];
    } catch (Exception $e) {
      return ['valid' => false];
    }
  }
}
```

### Django Integration

```python
# Django adapter for user management
class DjangoUserAdapter:
    def get_user(self, user_id):
        user = User.objects.get(id=user_id)
        return {
            'id': str(user.id),
            'email': user.email,
            'verified': user.is_verified,
            'plan': user.subscription.plan if hasattr(user, 'subscription') else 'free'
        }
```

## 🔧 Development

### Adding New Adapter Types

1. Create interface in `interfaces/{type}.js`
2. Add to `interfaces/index.js` exports
3. Create reference implementation
4. Add validation to `validateAdapter()`
5. Update documentation

### Contributing Adapters

1. Follow interface specifications exactly
2. Include comprehensive tests
3. Provide configuration examples
4. Document platform-specific requirements
5. Include error handling and edge cases

## 📖 API Reference

### Interface Methods

Each adapter type has required methods that must be implemented:

- **AuthAdapter**: `validateToken()`, `hasPermission()`, `getTokenInfo()`, `healthCheck()`
- **UserAdapter**: `getUser()`, `getUserDomains()`, `getUserSubscription()`, `updateUsage()`, `hasFeature()`
- **MTAAdapter**: `addDomainRoute()`, `removeDomainRoute()`, `reloadConfiguration()`, `testRoute()`
- **StorageAdapter**: `query()`, `transaction()`, `insert()`, `update()`, `delete()`, `find()`

### Utility Functions

- `validateAdapter(adapter, type)` - Validate adapter implementation
- `createMockAdapter(type, overrides)` - Create test mocks
- `AdapterRegistry` - Manage multiple adapters
- `AdapterFactory` - Create adapters from configuration

## 🛡️ Security Considerations

- **Token Validation**: Always validate tokens thoroughly
- **Permission Checking**: Implement granular permission controls
- **Input Sanitization**: Sanitize all external data
- **Error Handling**: Don't leak sensitive information in errors
- **Logging**: Log security events appropriately

## 🔍 Troubleshooting

### Common Issues

1. **Adapter Validation Fails**
   - Check that all required methods are implemented
   - Ensure method signatures match interface specifications

2. **Configuration Errors**
   - Validate YAML syntax
   - Check environment variable substitution
   - Verify file permissions

3. **Database Connection Issues**
   - Test connection strings
   - Check network connectivity
   - Verify credentials and permissions

4. **MTA Integration Problems**
   - Test mail routing manually
   - Check file permissions for config files
   - Verify reload commands work

### Debug Mode

Enable debug logging:

```javascript
process.env.DEBUG = 'encimap:adapters:*';
```

## 📞 Support

- **Documentation**: See `/docs/adapters/` for detailed guides
- **Examples**: Check `/examples/` for platform-specific implementations
- **Issues**: Report adapter issues on GitHub
- **Community**: Join discussions about adapter development

---

The adapter system makes Motorical Encrypted IMAP truly platform-agnostic, enabling integration with any existing infrastructure while maintaining security and functionality.
