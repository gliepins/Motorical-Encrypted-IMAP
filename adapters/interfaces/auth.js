/**
 * Authentication Adapter Interface
 * 
 * Defines the contract for authentication adapters in the Motorical Encrypted IMAP system.
 * Adapters implementing this interface handle token validation and permission checking.
 * 
 * @author Motorical Platform Team
 * @version 1.0.0
 */

/**
 * Abstract base class for authentication adapters
 */
export class AuthAdapter {
  /**
   * Initialize the authentication adapter
   * @param {object} config - Adapter-specific configuration
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * Validate an authentication token and extract user context
   * 
   * @param {string} token - The authentication token (Bearer, API key, etc.)
   * @param {object} context - Request context (headers, IP, user agent, etc.)
   * @param {string} context.ip - Client IP address
   * @param {string} context.userAgent - Client user agent
   * @param {object} context.headers - Request headers
   * @returns {Promise<AuthResult>} Authentication result
   * 
   * @example
   * const result = await adapter.validateToken('Bearer jwt-token', {
   *   ip: '192.168.1.1',
   *   userAgent: 'Mozilla/5.0...',
   *   headers: { 'x-forwarded-for': '...' }
   * });
   */
  async validateToken(token, context = {}) {
    throw new Error('AuthAdapter.validateToken must be implemented by subclass');
  }

  /**
   * Check if a user has permission to perform an action on a resource
   * 
   * @param {string} userId - User identifier
   * @param {string} action - Action being performed (create, read, update, delete)
   * @param {string} resource - Resource type (vaultbox, domain, certificate)
   * @param {object} resourceContext - Additional resource context
   * @returns {Promise<boolean>} True if user has permission
   * 
   * @example
   * const canRead = await adapter.hasPermission('user-123', 'read', 'vaultbox', {
   *   vaultbox_id: 'vb-456'
   * });
   */
  async hasPermission(userId, action, resource, resourceContext = {}) {
    throw new Error('AuthAdapter.hasPermission must be implemented by subclass');
  }

  /**
   * Get token information without full validation (for metadata, expiration checking)
   * 
   * @param {string} token - The authentication token
   * @returns {Promise<TokenInfo>} Token metadata
   * 
   * @example
   * const info = await adapter.getTokenInfo('Bearer jwt-token');
   * if (info.expires_at < new Date()) {
   *   // Token expired
   * }
   */
  async getTokenInfo(token) {
    throw new Error('AuthAdapter.getTokenInfo must be implemented by subclass');
  }

  /**
   * Optional: Refresh or renew a token (if supported by auth system)
   * 
   * @param {string} token - The authentication token to refresh
   * @returns {Promise<string|null>} New token or null if refresh not supported
   */
  async refreshToken(token) {
    return null; // Default: no refresh support
  }

  /**
   * Optional: Invalidate/logout a token (if supported by auth system)
   * 
   * @param {string} token - The authentication token to invalidate
   * @returns {Promise<boolean>} True if successfully invalidated
   */
  async invalidateToken(token) {
    return false; // Default: no invalidation support
  }

  /**
   * Health check for the authentication system
   * 
   * @returns {Promise<HealthStatus>} Health status
   */
  async healthCheck() {
    return {
      healthy: true,
      latency_ms: 0,
      details: { adapter_type: this.constructor.name }
    };
  }
}

/**
 * Authentication result returned by validateToken()
 * 
 * @typedef {object} AuthResult
 * @property {boolean} valid - Whether the token is valid
 * @property {string} [user_id] - User identifier (if valid)
 * @property {string[]} [permissions] - List of user permissions
 * @property {Date} [expires_at] - Token expiration time
 * @property {object} [metadata] - Additional token metadata
 * @property {string} [error] - Error message (if invalid)
 */

/**
 * Token information returned by getTokenInfo()
 * 
 * @typedef {object} TokenInfo
 * @property {boolean} valid - Whether the token is structurally valid
 * @property {Date} [expires_at] - Token expiration time
 * @property {string[]} [scope] - Token scope/permissions
 * @property {string} [issuer] - Token issuer
 * @property {string} [subject] - Token subject (user ID)
 * @property {object} [claims] - Additional token claims
 */

/**
 * Health status returned by healthCheck()
 * 
 * @typedef {object} HealthStatus
 * @property {boolean} healthy - Whether the adapter is healthy
 * @property {number} latency_ms - Response latency in milliseconds
 * @property {object} [details] - Additional health details
 */

/**
 * Standard permission actions
 */
export const ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  MANAGE: 'manage'
};

/**
 * Standard resource types
 */
export const RESOURCES = {
  VAULTBOX: 'vaultbox',
  DOMAIN: 'domain',
  CERTIFICATE: 'certificate',
  MESSAGE: 'message',
  CREDENTIALS: 'credentials',
  SYSTEM: 'system'
};

/**
 * Common token types
 */
export const TOKEN_TYPES = {
  BEARER: 'Bearer',
  API_KEY: 'ApiKey',
  BASIC: 'Basic'
};
