/**
 * User Management Adapter Interface
 * 
 * Defines the contract for user management adapters in the Motorical Encrypted IMAP system.
 * Adapters implementing this interface handle user data retrieval, domain management,
 * and subscription/plan information.
 * 
 * @author Motorical Platform Team
 * @version 1.0.0
 */

/**
 * Abstract base class for user management adapters
 */
export class UserAdapter {
  /**
   * Initialize the user management adapter
   * @param {object} config - Adapter-specific configuration
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * Retrieve user information by user ID
   * 
   * @param {string} userId - User identifier
   * @returns {Promise<User>} User information
   * 
   * @example
   * const user = await adapter.getUser('user-123');
   * console.log(user.email, user.verified, user.plan);
   */
  async getUser(userId) {
    throw new Error('UserAdapter.getUser must be implemented by subclass');
  }

  /**
   * Get user's verified domains
   * 
   * @param {string} userId - User identifier
   * @returns {Promise<Domain[]>} Array of user domains
   * 
   * @example
   * const domains = await adapter.getUserDomains('user-123');
   * const verified = domains.filter(d => d.verified);
   */
  async getUserDomains(userId) {
    throw new Error('UserAdapter.getUserDomains must be implemented by subclass');
  }

  /**
   * Get user's subscription/plan information
   * 
   * @param {string} userId - User identifier
   * @returns {Promise<Subscription>} Subscription details
   * 
   * @example
   * const sub = await adapter.getUserSubscription('user-123');
   * if (sub.features.encrypted_imap) {
   *   // User has encrypted IMAP feature
   * }
   */
  async getUserSubscription(userId) {
    throw new Error('UserAdapter.getUserSubscription must be implemented by subclass');
  }

  /**
   * Update user's quota/usage statistics
   * 
   * @param {string} userId - User identifier
   * @param {UsageUpdate} usage - Usage statistics to update
   * @returns {Promise<void>}
   * 
   * @example
   * await adapter.updateUsage('user-123', {
   *   messages_received: 50,
   *   storage_used_bytes: 1024000,
   *   domains_used: 2
   * });
   */
  async updateUsage(userId, usage) {
    throw new Error('UserAdapter.updateUsage must be implemented by subclass');
  }

  /**
   * Check if user has access to a specific feature
   * 
   * @param {string} userId - User identifier
   * @param {string} feature - Feature name
   * @returns {Promise<boolean>} True if user has feature
   * 
   * @example
   * const hasFeature = await adapter.hasFeature('user-123', 'encrypted_imap');
   * const canAddDomains = await adapter.hasFeature('user-123', 'multiple_domains');
   */
  async hasFeature(userId, feature) {
    throw new Error('UserAdapter.hasFeature must be implemented by subclass');
  }

  /**
   * Get user's current usage statistics
   * 
   * @param {string} userId - User identifier
   * @returns {Promise<Usage>} Current usage statistics
   * 
   * @example
   * const usage = await adapter.getUsage('user-123');
   * if (usage.messages_received >= usage.limits.messages_per_month) {
   *   // User has reached message limit
   * }
   */
  async getUsage(userId) {
    throw new Error('UserAdapter.getUsage must be implemented by subclass');
  }

  /**
   * Verify domain ownership for a user
   * 
   * @param {string} userId - User identifier
   * @param {string} domain - Domain to verify
   * @returns {Promise<DomainVerification>} Verification result
   * 
   * @example
   * const verification = await adapter.verifyDomain('user-123', 'example.com');
   * if (verification.verified) {
   *   // Domain is verified and ready for encrypted IMAP
   * }
   */
  async verifyDomain(userId, domain) {
    throw new Error('UserAdapter.verifyDomain must be implemented by subclass');
  }

  /**
   * Add a new domain for a user
   * 
   * @param {string} userId - User identifier
   * @param {string} domain - Domain to add
   * @returns {Promise<Domain>} Added domain information
   * 
   * @example
   * const domain = await adapter.addDomain('user-123', 'newdomain.com');
   * console.log('Verification token:', domain.verification_token);
   */
  async addDomain(userId, domain) {
    throw new Error('UserAdapter.addDomain must be implemented by subclass');
  }

  /**
   * Remove a domain from a user
   * 
   * @param {string} userId - User identifier
   * @param {string} domain - Domain to remove
   * @returns {Promise<boolean>} True if successfully removed
   */
  async removeDomain(userId, domain) {
    throw new Error('UserAdapter.removeDomain must be implemented by subclass');
  }

  /**
   * Get user's API quota limits
   * 
   * @param {string} userId - User identifier
   * @returns {Promise<QuotaLimits>} Current quota limits
   */
  async getQuotaLimits(userId) {
    const subscription = await this.getUserSubscription(userId);
    return subscription.limits || {};
  }

  /**
   * Health check for the user management system
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
 * User information returned by getUser()
 * 
 * @typedef {object} User
 * @property {string} id - User identifier
 * @property {string} email - User email address
 * @property {boolean} verified - Whether user email is verified
 * @property {Date} created_at - Account creation date
 * @property {string} plan - Current subscription plan
 * @property {object} [metadata] - Additional user metadata
 * @property {string} [timezone] - User timezone
 * @property {object} [preferences] - User preferences
 */

/**
 * Domain information returned by getUserDomains()
 * 
 * @typedef {object} Domain
 * @property {string} domain - Domain name
 * @property {boolean} verified - Whether domain ownership is verified
 * @property {boolean} dns_verified - Whether DNS records are correctly configured
 * @property {string} [verification_token] - Token for domain verification
 * @property {Date} added_at - When domain was added
 * @property {Date} [verified_at] - When domain was verified
 * @property {object} [dns_records] - Required DNS records for verification
 */

/**
 * Subscription information returned by getUserSubscription()
 * 
 * @typedef {object} Subscription
 * @property {string} plan - Plan name (starter, professional, enterprise)
 * @property {object} features - Available features
 * @property {boolean} features.encrypted_imap - Encrypted IMAP access
 * @property {boolean} features.multiple_domains - Multiple domain support
 * @property {boolean} features.advanced_rules - Advanced filtering rules
 * @property {object} limits - Usage limits
 * @property {number} limits.domains_max - Maximum domains allowed
 * @property {number} limits.messages_per_month - Monthly message limit
 * @property {number} limits.storage_gb - Storage limit in GB
 * @property {object} usage - Current usage
 * @property {Date} [expires_at] - Subscription expiration
 * @property {string} [status] - Subscription status (active, cancelled, expired)
 */

/**
 * Usage update structure for updateUsage()
 * 
 * @typedef {object} UsageUpdate
 * @property {number} [messages_received] - Messages received count
 * @property {number} [storage_used_bytes] - Storage used in bytes
 * @property {number} [domains_used] - Number of domains in use
 * @property {number} [api_calls] - API calls made
 * @property {Date} [last_activity] - Last activity timestamp
 */

/**
 * Current usage returned by getUsage()
 * 
 * @typedef {object} Usage
 * @property {number} messages_received - Total messages received
 * @property {number} storage_used_bytes - Storage used in bytes
 * @property {number} domains_used - Number of domains configured
 * @property {number} api_calls_today - API calls made today
 * @property {Date} last_activity - Last activity timestamp
 * @property {object} limits - Current limits from subscription
 * @property {object} period_usage - Usage in current billing period
 */

/**
 * Domain verification result returned by verifyDomain()
 * 
 * @typedef {object} DomainVerification
 * @property {boolean} verified - Whether domain is verified
 * @property {boolean} dns_configured - Whether DNS is properly configured
 * @property {string[]} [missing_records] - Missing DNS records
 * @property {string} [verification_method] - Method used for verification
 * @property {Date} [verified_at] - When verification completed
 * @property {string} [error] - Error message if verification failed
 */

/**
 * Quota limits returned by getQuotaLimits()
 * 
 * @typedef {object} QuotaLimits
 * @property {number} domains_max - Maximum domains allowed
 * @property {number} messages_per_month - Monthly message limit
 * @property {number} storage_gb - Storage limit in GB
 * @property {number} retention_days_max - Maximum retention period
 * @property {number} api_calls_per_hour - API rate limit
 * @property {boolean} webhook_support - Webhook feature availability
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
 * Standard feature names
 */
export const FEATURES = {
  ENCRYPTED_IMAP: 'encrypted_imap',
  MULTIPLE_DOMAINS: 'multiple_domains',
  ADVANCED_RULES: 'advanced_rules',
  WEBHOOK_SUPPORT: 'webhook_support',
  CUSTOM_RETENTION: 'custom_retention',
  API_ACCESS: 'api_access',
  BULK_OPERATIONS: 'bulk_operations'
};

/**
 * Standard plan names
 */
export const PLANS = {
  FREE: 'free',
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise'
};

/**
 * Domain verification methods
 */
export const VERIFICATION_METHODS = {
  DNS_TXT: 'dns_txt',
  DNS_MX: 'dns_mx',
  HTTP_FILE: 'http_file',
  EMAIL: 'email'
};
