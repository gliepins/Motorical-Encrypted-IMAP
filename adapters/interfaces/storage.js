/**
 * Storage Adapter Interface
 * 
 * Defines the contract for storage adapters in the Motorical Encrypted IMAP system.
 * Adapters implementing this interface handle database operations, queries, and
 * data persistence across different database systems.
 * 
 * @author Motorical Platform Team
 * @version 1.0.0
 */

/**
 * Abstract base class for storage adapters
 */
export class StorageAdapter {
  /**
   * Initialize the storage adapter
   * @param {object} config - Adapter-specific configuration
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * Execute a query with parameters
   * 
   * @param {string} query - SQL query or equivalent for the storage system
   * @param {Array} [params] - Query parameters
   * @param {object} [options] - Query options
   * @returns {Promise<QueryResult>} Query result
   * 
   * @example
   * const result = await adapter.query(
   *   'SELECT * FROM vaultboxes WHERE user_id = $1',
   *   ['user-123']
   * );
   * console.log('Found', result.rowCount, 'vaultboxes');
   */
  async query(query, params = [], options = {}) {
    throw new Error('StorageAdapter.query must be implemented by subclass');
  }

  /**
   * Execute multiple queries in a transaction
   * 
   * @param {Function} callback - Transaction callback function
   * @param {object} [options] - Transaction options
   * @returns {Promise<any>} Result from callback
   * 
   * @example
   * const result = await adapter.transaction(async (tx) => {
   *   await tx.query('INSERT INTO vaultboxes ...');
   *   await tx.query('UPDATE users SET ...');
   *   return 'success';
   * });
   */
  async transaction(callback, options = {}) {
    throw new Error('StorageAdapter.transaction must be implemented by subclass');
  }

  /**
   * Insert a single record
   * 
   * @param {string} table - Table name
   * @param {object} data - Data to insert
   * @param {object} [options] - Insert options
   * @returns {Promise<InsertResult>} Insert result
   * 
   * @example
   * const result = await adapter.insert('vaultboxes', {
   *   id: 'vb-123',
   *   user_id: 'user-456',
   *   domain: 'example.com'
   * });
   * console.log('Inserted with ID:', result.id);
   */
  async insert(table, data, options = {}) {
    throw new Error('StorageAdapter.insert must be implemented by subclass');
  }

  /**
   * Update records matching criteria
   * 
   * @param {string} table - Table name
   * @param {object} data - Data to update
   * @param {object} where - Where conditions
   * @param {object} [options] - Update options
   * @returns {Promise<UpdateResult>} Update result
   * 
   * @example
   * const result = await adapter.update('vaultboxes', 
   *   { retention_days: 30 },
   *   { user_id: 'user-123' }
   * );
   * console.log('Updated', result.rowCount, 'records');
   */
  async update(table, data, where, options = {}) {
    throw new Error('StorageAdapter.update must be implemented by subclass');
  }

  /**
   * Delete records matching criteria
   * 
   * @param {string} table - Table name
   * @param {object} where - Where conditions
   * @param {object} [options] - Delete options
   * @returns {Promise<DeleteResult>} Delete result
   * 
   * @example
   * const result = await adapter.delete('messages', {
   *   created_at: { '<': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
   * });
   * console.log('Deleted', result.rowCount, 'old messages');
   */
  async delete(table, where, options = {}) {
    throw new Error('StorageAdapter.delete must be implemented by subclass');
  }

  /**
   * Find records matching criteria
   * 
   * @param {string} table - Table name
   * @param {object} [where] - Where conditions
   * @param {object} [options] - Query options (limit, offset, order)
   * @returns {Promise<FindResult>} Find result
   * 
   * @example
   * const result = await adapter.find('vaultboxes', 
   *   { user_id: 'user-123' },
   *   { limit: 10, order: 'created_at DESC' }
   * );
   */
  async find(table, where = {}, options = {}) {
    throw new Error('StorageAdapter.find must be implemented by subclass');
  }

  /**
   * Find a single record by ID
   * 
   * @param {string} table - Table name
   * @param {string} id - Record ID
   * @param {object} [options] - Query options
   * @returns {Promise<object|null>} Found record or null
   * 
   * @example
   * const vaultbox = await adapter.findById('vaultboxes', 'vb-123');
   * if (vaultbox) {
   *   console.log('Domain:', vaultbox.domain);
   * }
   */
  async findById(table, id, options = {}) {
    throw new Error('StorageAdapter.findById must be implemented by subclass');
  }

  /**
   * Count records matching criteria
   * 
   * @param {string} table - Table name
   * @param {object} [where] - Where conditions
   * @returns {Promise<number>} Record count
   * 
   * @example
   * const count = await adapter.count('messages', {
   *   vaultbox_id: 'vb-123',
   *   created_at: { '>': new Date('2025-01-01') }
   * });
   */
  async count(table, where = {}) {
    throw new Error('StorageAdapter.count must be implemented by subclass');
  }

  /**
   * Check if storage connection is healthy
   * 
   * @returns {Promise<HealthStatus>} Health status
   * 
   * @example
   * const health = await adapter.healthCheck();
   * if (!health.healthy) {
   *   console.log('Database issues:', health.details.error);
   * }
   */
  async healthCheck() {
    throw new Error('StorageAdapter.healthCheck must be implemented by subclass');
  }

  /**
   * Get storage system statistics
   * 
   * @returns {Promise<DatabaseStats>} Database statistics
   * 
   * @example
   * const stats = await adapter.getStats();
   * console.log('Database size:', stats.database_size);
   * console.log('Connection pool:', stats.active_connections);
   */
  async getStats() {
    throw new Error('StorageAdapter.getStats must be implemented by subclass');
  }

  /**
   * Execute schema migrations
   * 
   * @param {string} version - Target migration version
   * @param {object} [options] - Migration options
   * @returns {Promise<MigrationResult>} Migration result
   * 
   * @example
   * const result = await adapter.migrate('001_add_certificates_table');
   * console.log('Migration completed:', result.success);
   */
  async migrate(version, options = {}) {
    throw new Error('StorageAdapter.migrate must be implemented by subclass');
  }

  /**
   * Get current schema version
   * 
   * @returns {Promise<string>} Current schema version
   */
  async getSchemaVersion() {
    throw new Error('StorageAdapter.getSchemaVersion must be implemented by subclass');
  }

  /**
   * Backup data to a file or external storage
   * 
   * @param {object} options - Backup options
   * @returns {Promise<BackupResult>} Backup result
   * 
   * @example
   * const backup = await adapter.backup({
   *   tables: ['vaultboxes', 'messages'],
   *   format: 'sql',
   *   destination: '/backups/encimap-backup.sql'
   * });
   */
  async backup(options = {}) {
    throw new Error('StorageAdapter.backup must be implemented by subclass');
  }

  /**
   * Restore data from a backup
   * 
   * @param {object} options - Restore options
   * @returns {Promise<RestoreResult>} Restore result
   */
  async restore(options = {}) {
    throw new Error('StorageAdapter.restore must be implemented by subclass');
  }

  /**
   * Optimize/vacuum storage for better performance
   * 
   * @param {object} [options] - Optimization options
   * @returns {Promise<OptimizationResult>} Optimization result
   */
  async optimize(options = {}) {
    throw new Error('StorageAdapter.optimize must be implemented by subclass');
  }

  /**
   * Close storage connections and cleanup resources
   * 
   * @returns {Promise<void>}
   */
  async close() {
    // Default implementation does nothing
    // Override in subclass if cleanup is needed
  }
}

/**
 * Query result returned by query()
 * 
 * @typedef {object} QueryResult
 * @property {Array} rows - Result rows
 * @property {number} rowCount - Number of affected/returned rows
 * @property {Array} [fields] - Field definitions
 * @property {object} [metadata] - Additional query metadata
 */

/**
 * Insert result returned by insert()
 * 
 * @typedef {object} InsertResult
 * @property {string|number} id - Inserted record ID
 * @property {number} rowCount - Number of rows inserted (usually 1)
 * @property {object} [record] - Full inserted record (if requested)
 */

/**
 * Update result returned by update()
 * 
 * @typedef {object} UpdateResult
 * @property {number} rowCount - Number of rows updated
 * @property {Array} [records] - Updated records (if requested)
 */

/**
 * Delete result returned by delete()
 * 
 * @typedef {object} DeleteResult
 * @property {number} rowCount - Number of rows deleted
 * @property {Array} [deletedIds] - IDs of deleted records (if requested)
 */

/**
 * Find result returned by find()
 * 
 * @typedef {object} FindResult
 * @property {Array} rows - Found records
 * @property {number} total - Total count (if count requested)
 * @property {boolean} hasMore - Whether more records exist
 * @property {object} [pagination] - Pagination information
 */

/**
 * Health status returned by healthCheck()
 * 
 * @typedef {object} HealthStatus
 * @property {boolean} healthy - Whether storage is healthy
 * @property {number} latency_ms - Response latency in milliseconds
 * @property {number} connections - Active connection count
 * @property {object} details - Additional health details
 * @property {string} [error] - Error message if unhealthy
 */

/**
 * Database statistics returned by getStats()
 * 
 * @typedef {object} DatabaseStats
 * @property {number} total_connections - Total connection count
 * @property {number} active_connections - Active connection count
 * @property {string} database_size - Database size (human readable)
 * @property {number} table_count - Number of tables
 * @property {object} performance_metrics - Performance metrics
 * @property {object} [table_sizes] - Individual table sizes
 * @property {Date} last_backup - Last backup timestamp
 */

/**
 * Migration result returned by migrate()
 * 
 * @typedef {object} MigrationResult
 * @property {boolean} success - Whether migration succeeded
 * @property {string} from_version - Starting schema version
 * @property {string} to_version - Target schema version
 * @property {string[]} applied_migrations - List of applied migrations
 * @property {number} duration_ms - Migration duration
 * @property {string} [error] - Error message if failed
 */

/**
 * Backup result returned by backup()
 * 
 * @typedef {object} BackupResult
 * @property {boolean} success - Whether backup succeeded
 * @property {string} backup_id - Unique backup identifier
 * @property {string} location - Backup file location
 * @property {number} size_bytes - Backup file size
 * @property {Date} created_at - Backup creation time
 * @property {string[]} tables - Tables included in backup
 * @property {string} [error] - Error message if failed
 */

/**
 * Restore result returned by restore()
 * 
 * @typedef {object} RestoreResult
 * @property {boolean} success - Whether restore succeeded
 * @property {string} backup_id - Restored backup identifier
 * @property {number} records_restored - Number of records restored
 * @property {string[]} tables_restored - Tables that were restored
 * @property {number} duration_ms - Restore duration
 * @property {string} [error] - Error message if failed
 */

/**
 * Optimization result returned by optimize()
 * 
 * @typedef {object} OptimizationResult
 * @property {boolean} success - Whether optimization succeeded
 * @property {object} before - Stats before optimization
 * @property {object} after - Stats after optimization
 * @property {number} space_saved_bytes - Space saved
 * @property {number} duration_ms - Optimization duration
 * @property {string[]} optimized_tables - Tables that were optimized
 */

/**
 * Standard database types
 */
export const DATABASE_TYPES = {
  POSTGRESQL: 'postgresql',
  MYSQL: 'mysql',
  SQLITE: 'sqlite',
  MONGODB: 'mongodb',
  REDIS: 'redis',
  CUSTOM: 'custom'
};

/**
 * Query options
 */
export const QUERY_OPTIONS = {
  RETURNING: 'returning',
  ON_CONFLICT: 'on_conflict',
  UPSERT: 'upsert',
  IGNORE: 'ignore'
};

/**
 * Transaction isolation levels
 */
export const ISOLATION_LEVELS = {
  READ_UNCOMMITTED: 'read_uncommitted',
  READ_COMMITTED: 'read_committed',
  REPEATABLE_READ: 'repeatable_read',
  SERIALIZABLE: 'serializable'
};
