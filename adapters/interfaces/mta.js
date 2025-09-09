/**
 * Mail Transfer Agent (MTA) Adapter Interface
 * 
 * Defines the contract for MTA integration adapters in the Motorical Encrypted IMAP system.
 * Adapters implementing this interface handle email routing configuration, domain management,
 * and mail server integration.
 * 
 * @author Motorical Platform Team
 * @version 1.0.0
 */

/**
 * Abstract base class for MTA integration adapters
 */
export class MTAAdapter {
  /**
   * Initialize the MTA adapter
   * @param {object} config - Adapter-specific configuration
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * Add domain routing to encrypted IMAP service
   * 
   * @param {string} domain - Domain to route to encrypted IMAP
   * @param {string} vaultboxId - Target vaultbox identifier
   * @param {object} [options] - Additional routing options
   * @returns {Promise<void>}
   * 
   * @example
   * await adapter.addDomainRoute('secure.example.com', 'vb-123', {
   *   priority: 10,
   *   backup_route: 'fallback.example.com'
   * });
   */
  async addDomainRoute(domain, vaultboxId, options = {}) {
    throw new Error('MTAAdapter.addDomainRoute must be implemented by subclass');
  }

  /**
   * Remove domain routing from encrypted IMAP service
   * 
   * @param {string} domain - Domain to remove routing for
   * @returns {Promise<void>}
   * 
   * @example
   * await adapter.removeDomainRoute('old.example.com');
   */
  async removeDomainRoute(domain) {
    throw new Error('MTAAdapter.removeDomainRoute must be implemented by subclass');
  }

  /**
   * Update domain routing configuration
   * 
   * @param {string} domain - Domain to update
   * @param {string} vaultboxId - New vaultbox identifier
   * @param {object} [options] - Updated routing options
   * @returns {Promise<void>}
   * 
   * @example
   * await adapter.updateDomainRoute('example.com', 'vb-456', {
   *   priority: 5
   * });
   */
  async updateDomainRoute(domain, vaultboxId, options = {}) {
    // Default implementation: remove and re-add
    await this.removeDomainRoute(domain);
    await this.addDomainRoute(domain, vaultboxId, options);
  }

  /**
   * Reload MTA configuration to apply changes
   * 
   * @returns {Promise<void>}
   * 
   * @example
   * await adapter.reloadConfiguration();
   */
  async reloadConfiguration() {
    throw new Error('MTAAdapter.reloadConfiguration must be implemented by subclass');
  }

  /**
   * Test domain routing configuration
   * 
   * @param {string} domain - Domain to test routing for
   * @param {object} [options] - Test options
   * @returns {Promise<TestResult>} Test result
   * 
   * @example
   * const result = await adapter.testRoute('example.com');
   * if (result.success) {
   *   console.log('Routing works, latency:', result.latency_ms + 'ms');
   * }
   */
  async testRoute(domain, options = {}) {
    throw new Error('MTAAdapter.testRoute must be implemented by subclass');
  }

  /**
   * Get routing statistics for domains
   * 
   * @param {string} [domain] - Specific domain (optional, null for all)
   * @param {object} [timeRange] - Time range for statistics
   * @returns {Promise<RoutingStats>} Routing statistics
   * 
   * @example
   * const stats = await adapter.getStats('example.com', {
   *   start: new Date('2025-01-01'),
   *   end: new Date('2025-01-31')
   * });
   */
  async getStats(domain = null, timeRange = {}) {
    throw new Error('MTAAdapter.getStats must be implemented by subclass');
  }

  /**
   * List all domains currently routed to encrypted IMAP
   * 
   * @returns {Promise<DomainRoute[]>} Array of domain routes
   * 
   * @example
   * const routes = await adapter.listRoutes();
   * for (const route of routes) {
   *   console.log(`${route.domain} -> ${route.vaultbox_id}`);
   * }
   */
  async listRoutes() {
    throw new Error('MTAAdapter.listRoutes must be implemented by subclass');
  }

  /**
   * Validate domain routing configuration
   * 
   * @param {string} domain - Domain to validate
   * @returns {Promise<ValidationResult>} Validation result
   * 
   * @example
   * const validation = await adapter.validateRoute('example.com');
   * if (!validation.valid) {
   *   console.log('Issues:', validation.issues);
   * }
   */
  async validateRoute(domain) {
    throw new Error('MTAAdapter.validateRoute must be implemented by subclass');
  }

  /**
   * Get MTA system information and status
   * 
   * @returns {Promise<MTAStatus>} MTA status information
   * 
   * @example
   * const status = await adapter.getStatus();
   * console.log('MTA Version:', status.version);
   * console.log('Queue Size:', status.queue_size);
   */
  async getStatus() {
    throw new Error('MTAAdapter.getStatus must be implemented by subclass');
  }

  /**
   * Check for pending mail queue items for encrypted domains
   * 
   * @param {string} [domain] - Specific domain (optional)
   * @returns {Promise<QueueInfo>} Queue information
   * 
   * @example
   * const queue = await adapter.checkQueue('example.com');
   * if (queue.pending_count > 0) {
   *   console.log('Messages pending:', queue.pending_count);
   * }
   */
  async checkQueue(domain = null) {
    throw new Error('MTAAdapter.checkQueue must be implemented by subclass');
  }

  /**
   * Flush/process pending queue items
   * 
   * @param {string} [domain] - Specific domain (optional)
   * @returns {Promise<FlushResult>} Flush operation result
   */
  async flushQueue(domain = null) {
    throw new Error('MTAAdapter.flushQueue must be implemented by subclass');
  }

  /**
   * Health check for the MTA system
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
 * Domain route configuration returned by listRoutes()
 * 
 * @typedef {object} DomainRoute
 * @property {string} domain - Domain name
 * @property {string} vaultbox_id - Target vaultbox identifier
 * @property {Date} created_at - When route was created
 * @property {Date} [updated_at] - When route was last updated
 * @property {number} [priority] - Route priority
 * @property {boolean} active - Whether route is active
 * @property {object} [options] - Additional route options
 */

/**
 * Test result returned by testRoute()
 * 
 * @typedef {object} TestResult
 * @property {boolean} success - Whether test was successful
 * @property {string} message - Human-readable test result
 * @property {number} latency_ms - Test latency in milliseconds
 * @property {object} details - Additional test details
 * @property {string} [route_target] - Actual route target found
 * @property {Date} tested_at - When test was performed
 */

/**
 * Routing statistics returned by getStats()
 * 
 * @typedef {object} RoutingStats
 * @property {number} total_messages - Total messages routed
 * @property {number} successful_routes - Successfully routed messages
 * @property {number} failed_routes - Failed routing attempts
 * @property {number} average_latency - Average routing latency in ms
 * @property {object} last_24h - Statistics for last 24 hours
 * @property {number} last_24h.messages - Messages in last 24h
 * @property {number} last_24h.errors - Errors in last 24h
 * @property {object} by_domain - Per-domain statistics (if domain not specified)
 * @property {Date} period_start - Statistics period start
 * @property {Date} period_end - Statistics period end
 */

/**
 * Validation result returned by validateRoute()
 * 
 * @typedef {object} ValidationResult
 * @property {boolean} valid - Whether route configuration is valid
 * @property {string[]} issues - List of validation issues
 * @property {string[]} warnings - List of warnings
 * @property {object} [suggestions] - Suggested fixes
 * @property {Date} validated_at - When validation was performed
 */

/**
 * MTA status returned by getStatus()
 * 
 * @typedef {object} MTAStatus
 * @property {string} mta_type - MTA type (postfix, exim, sendmail, etc.)
 * @property {string} version - MTA version
 * @property {boolean} running - Whether MTA is running
 * @property {number} queue_size - Current queue size
 * @property {number} active_connections - Active connections
 * @property {Date} last_reload - Last configuration reload
 * @property {object} [performance] - Performance metrics
 * @property {string[]} [warnings] - System warnings
 */

/**
 * Queue information returned by checkQueue()
 * 
 * @typedef {object} QueueInfo
 * @property {number} pending_count - Number of pending messages
 * @property {number} deferred_count - Number of deferred messages
 * @property {number} active_count - Number of messages being processed
 * @property {object[]} [oldest_messages] - Oldest messages in queue
 * @property {Date} last_checked - When queue was last checked
 * @property {string} [queue_status] - Overall queue status
 */

/**
 * Flush result returned by flushQueue()
 * 
 * @typedef {object} FlushResult
 * @property {boolean} success - Whether flush was successful
 * @property {number} processed_count - Number of messages processed
 * @property {number} failed_count - Number of messages that failed
 * @property {string[]} [errors] - Error messages encountered
 * @property {Date} completed_at - When flush completed
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
 * Standard MTA types
 */
export const MTA_TYPES = {
  POSTFIX: 'postfix',
  EXIM: 'exim',
  SENDMAIL: 'sendmail',
  QMAIL: 'qmail',
  WEBHOOK: 'webhook',
  CUSTOM: 'custom'
};

/**
 * Route priorities
 */
export const ROUTE_PRIORITY = {
  HIGHEST: 1,
  HIGH: 5,
  NORMAL: 10,
  LOW: 15,
  LOWEST: 20
};

/**
 * Queue status values
 */
export const QUEUE_STATUS = {
  EMPTY: 'empty',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical',
  BLOCKED: 'blocked'
};
