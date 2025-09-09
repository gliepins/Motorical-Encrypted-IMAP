/**
 * Adapter Interfaces Export
 * 
 * Central export point for all adapter interfaces in the Motorical Encrypted IMAP system.
 * This module provides easy access to all adapter base classes and type definitions.
 * 
 * @author Motorical Platform Team
 * @version 1.0.0
 */

// Import all adapter interfaces
export { AuthAdapter, ACTIONS, RESOURCES, TOKEN_TYPES } from './auth.js';
export { UserAdapter, FEATURES, PLANS, VERIFICATION_METHODS } from './user.js';
export { MTAAdapter, MTA_TYPES, ROUTE_PRIORITY, QUEUE_STATUS } from './mta.js';
export { StorageAdapter, DATABASE_TYPES, QUERY_OPTIONS, ISOLATION_LEVELS } from './storage.js';

/**
 * Validate that an object implements the required adapter interface
 * 
 * @param {object} adapter - Adapter instance to validate
 * @param {string} type - Expected adapter type ('auth', 'user', 'mta', 'storage')
 * @returns {boolean} True if adapter implements the interface correctly
 * 
 * @example
 * const adapter = new MyCustomAuthAdapter(config);
 * if (validateAdapter(adapter, 'auth')) {
 *   console.log('Adapter is valid');
 * }
 */
export function validateAdapter(adapter, type) {
  const requiredMethods = getRequiredMethods(type);
  
  for (const method of requiredMethods) {
    if (typeof adapter[method] !== 'function') {
      console.error(`Adapter missing required method: ${method}`);
      return false;
    }
  }
  
  return true;
}

/**
 * Get required methods for each adapter type
 * 
 * @param {string} type - Adapter type
 * @returns {string[]} Array of required method names
 */
function getRequiredMethods(type) {
  const methodMap = {
    auth: [
      'validateToken',
      'hasPermission',
      'getTokenInfo',
      'healthCheck'
    ],
    user: [
      'getUser',
      'getUserDomains',
      'getUserSubscription',
      'updateUsage',
      'hasFeature',
      'getUsage',
      'verifyDomain',
      'addDomain',
      'removeDomain',
      'healthCheck'
    ],
    mta: [
      'addDomainRoute',
      'removeDomainRoute',
      'reloadConfiguration',
      'testRoute',
      'getStats',
      'listRoutes',
      'validateRoute',
      'getStatus',
      'checkQueue',
      'flushQueue',
      'healthCheck'
    ],
    storage: [
      'query',
      'transaction',
      'insert',
      'update',
      'delete',
      'find',
      'findById',
      'count',
      'healthCheck',
      'getStats',
      'migrate',
      'getSchemaVersion'
    ]
  };
  
  return methodMap[type] || [];
}

/**
 * Create a mock adapter for testing purposes
 * 
 * @param {string} type - Adapter type to mock
 * @param {object} [overrides] - Method overrides for custom behavior
 * @returns {object} Mock adapter instance
 * 
 * @example
 * const mockAuth = createMockAdapter('auth', {
 *   validateToken: async () => ({ valid: true, user_id: 'test-user' })
 * });
 */
export function createMockAdapter(type, overrides = {}) {
  const requiredMethods = getRequiredMethods(type);
  const mock = {};
  
  // Create default implementations
  for (const method of requiredMethods) {
    mock[method] = overrides[method] || createDefaultMockMethod(type, method);
  }
  
  return mock;
}

/**
 * Create default mock implementations for adapter methods
 * 
 * @param {string} type - Adapter type
 * @param {string} method - Method name
 * @returns {Function} Mock function
 */
function createDefaultMockMethod(type, method) {
  const defaults = {
    auth: {
      validateToken: async () => ({ valid: true, user_id: 'mock-user', permissions: [] }),
      hasPermission: async () => true,
      getTokenInfo: async () => ({ valid: true, expires_at: new Date(Date.now() + 3600000) }),
      healthCheck: async () => ({ healthy: true, latency_ms: 0 })
    },
    user: {
      getUser: async () => ({ id: 'mock-user', email: 'test@example.com', verified: true, plan: 'professional' }),
      getUserDomains: async () => [{ domain: 'example.com', verified: true, dns_verified: true }],
      getUserSubscription: async () => ({ plan: 'professional', features: { encrypted_imap: true }, limits: {} }),
      updateUsage: async () => {},
      hasFeature: async () => true,
      getUsage: async () => ({ messages_received: 0, storage_used_bytes: 0 }),
      verifyDomain: async () => ({ verified: true, dns_configured: true }),
      addDomain: async (userId, domain) => ({ domain, verified: false, verification_token: 'mock-token' }),
      removeDomain: async () => true,
      healthCheck: async () => ({ healthy: true, latency_ms: 0 })
    },
    mta: {
      addDomainRoute: async () => {},
      removeDomainRoute: async () => {},
      reloadConfiguration: async () => {},
      testRoute: async () => ({ success: true, message: 'Mock test passed', latency_ms: 10 }),
      getStats: async () => ({ total_messages: 0, successful_routes: 0, failed_routes: 0 }),
      listRoutes: async () => [],
      validateRoute: async () => ({ valid: true, issues: [], warnings: [] }),
      getStatus: async () => ({ mta_type: 'mock', running: true, queue_size: 0 }),
      checkQueue: async () => ({ pending_count: 0, deferred_count: 0, active_count: 0 }),
      flushQueue: async () => ({ success: true, processed_count: 0, failed_count: 0 }),
      healthCheck: async () => ({ healthy: true, latency_ms: 0 })
    },
    storage: {
      query: async () => ({ rows: [], rowCount: 0 }),
      transaction: async (callback) => callback({ query: async () => ({ rows: [], rowCount: 0 }) }),
      insert: async () => ({ id: 'mock-id', rowCount: 1 }),
      update: async () => ({ rowCount: 1 }),
      delete: async () => ({ rowCount: 1 }),
      find: async () => ({ rows: [], total: 0, hasMore: false }),
      findById: async () => null,
      count: async () => 0,
      healthCheck: async () => ({ healthy: true, latency_ms: 0, connections: 1 }),
      getStats: async () => ({ total_connections: 1, active_connections: 1, database_size: '1MB', table_count: 5 }),
      migrate: async () => ({ success: true, from_version: '0', to_version: '1' }),
      getSchemaVersion: async () => '1'
    }
  };
  
  return defaults[type]?.[method] || (async () => {});
}

/**
 * Adapter registry for managing multiple adapter instances
 */
export class AdapterRegistry {
  constructor() {
    this.adapters = new Map();
    this.configs = new Map();
  }
  
  /**
   * Register an adapter instance
   * 
   * @param {string} name - Adapter name
   * @param {string} type - Adapter type
   * @param {object} adapter - Adapter instance
   * @param {object} config - Adapter configuration
   */
  register(name, type, adapter, config = {}) {
    if (!validateAdapter(adapter, type)) {
      throw new Error(`Invalid ${type} adapter: ${name}`);
    }
    
    this.adapters.set(name, { type, adapter, config });
    this.configs.set(name, config);
  }
  
  /**
   * Get an adapter by name
   * 
   * @param {string} name - Adapter name
   * @returns {object|null} Adapter instance or null
   */
  get(name) {
    const entry = this.adapters.get(name);
    return entry ? entry.adapter : null;
  }
  
  /**
   * Get all adapters of a specific type
   * 
   * @param {string} type - Adapter type
   * @returns {Map} Map of adapter names to instances
   */
  getByType(type) {
    const result = new Map();
    for (const [name, entry] of this.adapters) {
      if (entry.type === type) {
        result.set(name, entry.adapter);
      }
    }
    return result;
  }
  
  /**
   * Remove an adapter
   * 
   * @param {string} name - Adapter name
   * @returns {boolean} True if adapter was removed
   */
  remove(name) {
    const removed = this.adapters.delete(name);
    this.configs.delete(name);
    return removed;
  }
  
  /**
   * List all registered adapter names
   * 
   * @returns {string[]} Array of adapter names
   */
  list() {
    return Array.from(this.adapters.keys());
  }
  
  /**
   * Get health status of all adapters
   * 
   * @returns {Promise<object>} Health status map
   */
  async healthCheck() {
    const results = {};
    
    for (const [name, entry] of this.adapters) {
      try {
        results[name] = await entry.adapter.healthCheck();
      } catch (error) {
        results[name] = {
          healthy: false,
          latency_ms: 0,
          details: { error: error.message }
        };
      }
    }
    
    return results;
  }
  
  /**
   * Clear all adapters
   */
  clear() {
    this.adapters.clear();
    this.configs.clear();
  }
}

/**
 * Adapter factory for creating adapter instances from configuration
 */
export class AdapterFactory {
  constructor() {
    this.creators = new Map();
  }
  
  /**
   * Register an adapter creator function
   * 
   * @param {string} type - Adapter type
   * @param {string} name - Implementation name
   * @param {Function} creator - Creator function that takes config and returns adapter
   */
  register(type, name, creator) {
    const key = `${type}:${name}`;
    this.creators.set(key, creator);
  }
  
  /**
   * Create an adapter instance
   * 
   * @param {string} type - Adapter type
   * @param {string} name - Implementation name
   * @param {object} config - Adapter configuration
   * @returns {object} Adapter instance
   */
  create(type, name, config) {
    const key = `${type}:${name}`;
    const creator = this.creators.get(key);
    
    if (!creator) {
      throw new Error(`Unknown adapter: ${type}:${name}`);
    }
    
    return creator(config);
  }
  
  /**
   * List available adapter implementations
   * 
   * @param {string} [type] - Filter by adapter type
   * @returns {string[]} Array of available implementations
   */
  list(type = null) {
    const implementations = Array.from(this.creators.keys());
    
    if (type) {
      return implementations
        .filter(key => key.startsWith(`${type}:`))
        .map(key => key.split(':')[1]);
    }
    
    return implementations;
  }
}

/**
 * Global adapter factory instance
 */
export const adapterFactory = new AdapterFactory();
