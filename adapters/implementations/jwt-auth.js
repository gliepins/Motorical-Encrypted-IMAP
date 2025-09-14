/**
 * JWT Authentication Adapter Implementation
 * 
 * Concrete implementation of AuthAdapter for JWT token validation.
 * Integrates with Motorical's existing JWT authentication system.
 */

import jwt from 'jsonwebtoken';
import { AuthAdapter, ACTIONS, RESOURCES, TOKEN_TYPES } from '../interfaces/auth.js';

export class JWTAuthAdapter extends AuthAdapter {
  constructor(config) {
    super(config);
    this.publicKey = config.publicKey || config.public_key_base64 
      ? Buffer.from(config.public_key_base64, 'base64').toString('utf8')
      : null;
    this.algorithm = config.algorithm || 'RS256';
    this.audience = config.audience || 'encimap.svc';
    this.issuer = config.issuer || null;
    this.clockTolerance = config.clockTolerance || 10; // seconds
    
    if (!this.publicKey) {
      throw new Error('JWT public key is required for authentication');
    }
  }

  async validateToken(token, context = {}) {
    try {
      // Extract token from Bearer format if needed
      const cleanToken = token.startsWith('Bearer ') 
        ? token.slice(7).trim() 
        : token.trim();
      
      if (!cleanToken) {
        return {
          valid: false,
          error: 'Empty token provided'
        };
      }

      // Verify JWT token
      const options = {
        algorithms: [this.algorithm],
        clockTolerance: this.clockTolerance
      };
      
      if (this.audience) {
        options.audience = this.audience;
      }
      
      if (this.issuer) {
        options.issuer = this.issuer;
      }

      const payload = jwt.verify(cleanToken, this.publicKey, options);
      
      // Extract user information from payload
      const userId = payload.sub || payload.user_id || payload.id;
      const permissions = payload.permissions || payload.scope || [];
      const expires = payload.exp ? new Date(payload.exp * 1000) : null;
      
      if (!userId) {
        return {
          valid: false,
          error: 'Token does not contain user identifier'
        };
      }

      return {
        valid: true,
        user_id: userId,
        permissions: Array.isArray(permissions) ? permissions : 
                    typeof permissions === 'string' ? permissions.split(' ') : [],
        expires_at: expires,
        metadata: {
          service: payload.aud || this.audience,
          issued_at: payload.iat ? new Date(payload.iat * 1000) : null,
          token_type: TOKEN_TYPES.BEARER,
          context: {
            ip: context.ip,
            user_agent: context.userAgent
          }
        }
      };
    } catch (error) {
      // Handle specific JWT errors
      let errorMessage = 'Token validation failed';
      
      if (error.name === 'TokenExpiredError') {
        errorMessage = 'Token has expired';
      } else if (error.name === 'JsonWebTokenError') {
        errorMessage = 'Invalid token format';
      } else if (error.name === 'NotBeforeError') {
        errorMessage = 'Token not active yet';
      }
      
      return {
        valid: false,
        error: errorMessage,
        metadata: {
          error_type: error.name,
          context: {
            ip: context.ip,
            user_agent: context.userAgent
          }
        }
      };
    }
  }

  async hasPermission(userId, action, resource, resourceContext = {}) {
    try {
      // For encrypted IMAP, implement role-based permission checking
      // This could be extended to check against external systems
      
      // Basic permission mapping for encrypted IMAP operations
      const permissionMap = {
        [RESOURCES.VAULTBOX]: {
          [ACTIONS.CREATE]: ['encrypted_imap:create', 'admin'],
          [ACTIONS.READ]: ['encrypted_imap:read', 'encrypted_imap:create', 'admin'],
          [ACTIONS.UPDATE]: ['encrypted_imap:update', 'encrypted_imap:create', 'admin'],
          [ACTIONS.DELETE]: ['encrypted_imap:delete', 'admin'],
          [ACTIONS.LIST]: ['encrypted_imap:read', 'encrypted_imap:create', 'admin']
        },
        [RESOURCES.DOMAIN]: {
          [ACTIONS.CREATE]: ['domains:create', 'admin'],
          [ACTIONS.READ]: ['domains:read', 'admin'],
          [ACTIONS.UPDATE]: ['domains:update', 'admin'],
          [ACTIONS.DELETE]: ['domains:delete', 'admin'],
          [ACTIONS.MANAGE]: ['domains:manage', 'admin']
        },
        [RESOURCES.CERTIFICATE]: {
          [ACTIONS.CREATE]: ['certificates:create', 'encrypted_imap:create', 'admin'],
          [ACTIONS.READ]: ['certificates:read', 'encrypted_imap:read', 'admin'],
          [ACTIONS.UPDATE]: ['certificates:update', 'admin'],
          [ACTIONS.DELETE]: ['certificates:delete', 'admin']
        },
        [RESOURCES.MESSAGE]: {
          [ACTIONS.READ]: ['messages:read', 'encrypted_imap:read', 'admin'],
          [ACTIONS.DELETE]: ['messages:delete', 'admin']
        },
        [RESOURCES.CREDENTIALS]: {
          [ACTIONS.CREATE]: ['credentials:create', 'encrypted_imap:create', 'admin'],
          [ACTIONS.READ]: ['credentials:read', 'admin'],
          [ACTIONS.UPDATE]: ['credentials:update', 'admin'],
          [ACTIONS.DELETE]: ['credentials:delete', 'admin']
        },
        [RESOURCES.SYSTEM]: {
          [ACTIONS.READ]: ['system:read', 'admin'],
          [ACTIONS.MANAGE]: ['system:manage', 'admin']
        }
      };

      // Get required permissions for this action/resource
      const requiredPermissions = permissionMap[resource]?.[action] || [];
      
      if (requiredPermissions.length === 0) {
        // If no specific permissions defined, allow (fail open for undefined resources)
        return true;
      }

      // For resource-specific permissions, we'd need to validate ownership
      // This is a simplified implementation - extend based on your needs
      if (resourceContext.vaultbox_id || resourceContext.domain_id) {
        // Check if user owns the resource (would require storage adapter integration)
        // For now, assume ownership is valid if user has any relevant permission
      }

      // Check if user has any of the required permissions
      // This would typically be retrieved from the JWT token or external system
      const userPermissions = await this._getUserPermissions(userId);
      
      return requiredPermissions.some(permission => 
        userPermissions.includes(permission)
      );
    } catch (error) {
      // Log error and fail secure
      console.error('Permission check failed:', error);
      return false;
    }
  }

  async getTokenInfo(token) {
    try {
      const cleanToken = token.startsWith('Bearer ') 
        ? token.slice(7).trim() 
        : token.trim();
      
      // Decode without verification to get metadata
      const decoded = jwt.decode(cleanToken, { complete: true });
      
      if (!decoded) {
        return {
          valid: false,
          error: 'Invalid token format'
        };
      }

      const payload = decoded.payload;
      
      return {
        valid: true,
        expires_at: payload.exp ? new Date(payload.exp * 1000) : null,
        scope: payload.scope || payload.permissions || [],
        issuer: payload.iss,
        subject: payload.sub,
        audience: payload.aud,
        claims: {
          issued_at: payload.iat ? new Date(payload.iat * 1000) : null,
          not_before: payload.nbf ? new Date(payload.nbf * 1000) : null,
          jti: payload.jti,
          algorithm: decoded.header.alg,
          type: decoded.header.typ
        }
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Failed to decode token',
        details: error.message
      };
    }
  }

  async refreshToken(token) {
    // JWT tokens are typically stateless and cannot be refreshed
    // This would require integration with the token issuing service
    return null;
  }

  async invalidateToken(token) {
    // JWT tokens are stateless - invalidation would require:
    // 1. Blacklist/revocation list
    // 2. Short expiry times
    // 3. Integration with token issuing service
    return false;
  }

  async healthCheck() {
    const startTime = Date.now();
    
    try {
      // Verify we can decode our public key
      if (!this.publicKey) {
        throw new Error('Public key not configured');
      }
      
      // Test with a simple token structure validation
      const testToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJ0ZXN0IjoidHJ1ZSJ9.test';
      const info = await this.getTokenInfo(testToken);
      
      return {
        healthy: true,
        latency_ms: Date.now() - startTime,
        details: {
          adapter_type: 'JWTAuthAdapter',
          algorithm: this.algorithm,
          audience: this.audience,
          public_key_configured: !!this.publicKey,
          test_decode_works: info.valid === false // Expected for test token
        }
      };
    } catch (error) {
      return {
        healthy: false,
        latency_ms: Date.now() - startTime,
        details: {
          adapter_type: 'JWTAuthAdapter',
          error: error.message,
          public_key_configured: !!this.publicKey
        }
      };
    }
  }

  // Private helper methods
  async _getUserPermissions(userId) {
    // This would typically:
    // 1. Query user role from database
    // 2. Map role to permissions
    // 3. Return permission array
    
    // For now, return basic permissions based on system integration
    // This should be implemented based on your user management system
    
    try {
      // Basic role-based permissions
      // This could integrate with your storage adapter to check user roles
      const defaultPermissions = [
        'encrypted_imap:read',
        'encrypted_imap:create',
        'domains:read',
        'certificates:read',
        'certificates:create',
        'credentials:create',
        'credentials:read'
      ];
      
      return defaultPermissions;
    } catch (error) {
      console.error('Failed to get user permissions:', error);
      return [];
    }
  }
}

export default JWTAuthAdapter;
