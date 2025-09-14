/**
 * PostgreSQL Storage Adapter Implementation
 * 
 * Concrete implementation of StorageAdapter for PostgreSQL databases.
 * Integrates with existing Motorical database infrastructure.
 */

import { Pool } from 'pg';
import { StorageAdapter, DATABASE_TYPES, ISOLATION_LEVELS } from '../interfaces/storage.js';

export class PostgreSQLStorageAdapter extends StorageAdapter {
  constructor(config) {
    super(config);
    this.pool = new Pool({
      connectionString: config.url || config.connectionString,
      max: config.poolSize || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    this.databaseType = DATABASE_TYPES.POSTGRESQL;
  }

  async query(sql, params = [], options = {}) {
    const client = options.client || this.pool;
    const startTime = Date.now();
    
    try {
      const result = await client.query(sql, params);
      return {
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields,
        metadata: {
          duration_ms: Date.now() - startTime,
          command: result.command
        }
      };
    } catch (error) {
      throw new Error(`PostgreSQL query failed: ${error.message}`);
    }
  }

  async transaction(callback, options = {}) {
    const client = await this.pool.connect();
    const isolationLevel = options.isolationLevel || ISOLATION_LEVELS.READ_COMMITTED;
    
    try {
      await client.query('BEGIN');
      if (isolationLevel !== ISOLATION_LEVELS.READ_COMMITTED) {
        await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel.toUpperCase().replace('_', ' ')}`);
      }
      
      // Create transaction object with query method
      const tx = {
        query: (sql, params) => this.query(sql, params, { client }),
        insert: (table, data, opts) => this.insert(table, data, { ...opts, client }),
        update: (table, data, where, opts) => this.update(table, data, where, { ...opts, client }),
        delete: (table, where, opts) => this.delete(table, where, { ...opts, client }),
        find: (table, where, opts) => this.find(table, where, { ...opts, client }),
        findById: (table, id, opts) => this.findById(table, id, { ...opts, client }),
        count: (table, where) => this.count(table, where, { client })
      };
      
      const result = await callback(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async insert(table, data, options = {}) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    
    const returning = options.returning || ['id'];
    const returningClause = returning.length > 0 ? `RETURNING ${returning.join(', ')}` : '';
    
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ${returningClause}`;
    
    try {
      const result = await this.query(sql, values, options);
      return {
        id: result.rows[0]?.id,
        rowCount: result.rowCount,
        record: returning.length > 0 ? result.rows[0] : null
      };
    } catch (error) {
      throw new Error(`Insert failed: ${error.message}`);
    }
  }

  async update(table, data, where, options = {}) {
    const { whereClause, whereValues } = this._buildWhereClause(where);
    const setClauses = [];
    const setValues = [];
    
    let paramIndex = whereValues.length + 1;
    for (const [key, value] of Object.entries(data)) {
      setClauses.push(`${key} = $${paramIndex}`);
      setValues.push(value);
      paramIndex++;
    }
    
    const returning = options.returning || [];
    const returningClause = returning.length > 0 ? `RETURNING ${returning.join(', ')}` : '';
    
    const sql = `UPDATE ${table} SET ${setClauses.join(', ')} ${whereClause} ${returningClause}`;
    const params = [...whereValues, ...setValues];
    
    try {
      const result = await this.query(sql, params, options);
      return {
        rowCount: result.rowCount,
        records: returning.length > 0 ? result.rows : []
      };
    } catch (error) {
      throw new Error(`Update failed: ${error.message}`);
    }
  }

  async delete(table, where, options = {}) {
    const { whereClause, whereValues } = this._buildWhereClause(where);
    
    const returning = options.returning || [];
    const returningClause = returning.length > 0 ? `RETURNING ${returning.join(', ')}` : '';
    
    const sql = `DELETE FROM ${table} ${whereClause} ${returningClause}`;
    
    try {
      const result = await this.query(sql, whereValues, options);
      return {
        rowCount: result.rowCount,
        deletedIds: returning.length > 0 ? result.rows.map(r => r.id) : []
      };
    } catch (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  async find(table, where = {}, options = {}) {
    const { whereClause, whereValues } = this._buildWhereClause(where);
    
    let sql = `SELECT * FROM ${table} ${whereClause}`;
    
    if (options.order) {
      sql += ` ORDER BY ${options.order}`;
    }
    
    if (options.limit) {
      sql += ` LIMIT ${parseInt(options.limit)}`;
    }
    
    if (options.offset) {
      sql += ` OFFSET ${parseInt(options.offset)}`;
    }
    
    try {
      const result = await this.query(sql, whereValues, options);
      
      let total = result.rowCount;
      if (options.count) {
        const countResult = await this.count(table, where, options);
        total = countResult;
      }
      
      return {
        rows: result.rows,
        total,
        hasMore: options.limit ? result.rows.length === options.limit : false,
        pagination: options.limit ? {
          limit: options.limit,
          offset: options.offset || 0,
          total
        } : null
      };
    } catch (error) {
      throw new Error(`Find failed: ${error.message}`);
    }
  }

  async findById(table, id, options = {}) {
    const result = await this.find(table, { id }, { ...options, limit: 1 });
    return result.rows[0] || null;
  }

  async count(table, where = {}, options = {}) {
    const { whereClause, whereValues } = this._buildWhereClause(where);
    const sql = `SELECT COUNT(*) as count FROM ${table} ${whereClause}`;
    
    try {
      const result = await this.query(sql, whereValues, options);
      return parseInt(result.rows[0].count);
    } catch (error) {
      throw new Error(`Count failed: ${error.message}`);
    }
  }

  async healthCheck() {
    const startTime = Date.now();
    
    try {
      await this.query('SELECT 1');
      const stats = await this.getStats();
      
      return {
        healthy: true,
        latency_ms: Date.now() - startTime,
        connections: stats.active_connections,
        details: {
          adapter_type: 'PostgreSQLStorageAdapter',
          database_type: this.databaseType,
          pool_size: this.pool.options.max,
          database_size: stats.database_size
        }
      };
    } catch (error) {
      return {
        healthy: false,
        latency_ms: Date.now() - startTime,
        connections: 0,
        details: {
          adapter_type: 'PostgreSQLStorageAdapter',
          error: error.message
        }
      };
    }
  }

  async getStats() {
    try {
      const dbSizeResult = await this.query(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `);
      
      const tableCountResult = await this.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      
      const connectionsResult = await this.query(`
        SELECT count(*) as active_connections
        FROM pg_stat_activity 
        WHERE state = 'active'
      `);
      
      return {
        total_connections: this.pool.totalCount,
        active_connections: parseInt(connectionsResult.rows[0].active_connections),
        database_size: dbSizeResult.rows[0].size,
        table_count: parseInt(tableCountResult.rows[0].count),
        performance_metrics: {
          pool_size: this.pool.options.max,
          idle_count: this.pool.idleCount,
          waiting_count: this.pool.waitingCount
        },
        last_backup: null // Could be implemented based on backup strategy
      };
    } catch (error) {
      throw new Error(`Stats query failed: ${error.message}`);
    }
  }

  async migrate(version, options = {}) {
    // Implementation depends on your migration strategy
    // This is a basic example
    try {
      const startTime = Date.now();
      
      // Check current schema version
      const currentVersion = await this.getSchemaVersion();
      
      if (currentVersion === version) {
        return {
          success: true,
          from_version: currentVersion,
          to_version: version,
          applied_migrations: [],
          duration_ms: Date.now() - startTime
        };
      }
      
      // Apply migrations (this would load and execute migration files)
      // For now, just update the schema version
      await this.query(`
        INSERT INTO schema_migrations (version, applied_at) 
        VALUES ($1, NOW()) 
        ON CONFLICT (version) DO NOTHING
      `, [version]);
      
      return {
        success: true,
        from_version: currentVersion,
        to_version: version,
        applied_migrations: [version],
        duration_ms: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        from_version: await this.getSchemaVersion(),
        to_version: version,
        applied_migrations: [],
        duration_ms: Date.now() - Date.now(),
        error: error.message
      };
    }
  }

  async getSchemaVersion() {
    try {
      // Ensure schema_migrations table exists
      await this.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      const result = await this.query(`
        SELECT version FROM schema_migrations 
        ORDER BY applied_at DESC LIMIT 1
      `);
      
      return result.rows[0]?.version || '0';
    } catch (error) {
      return '0';
    }
  }

  async backup(options = {}) {
    // This would typically use pg_dump
    throw new Error('Backup functionality not implemented - use pg_dump externally');
  }

  async restore(options = {}) {
    // This would typically use pg_restore
    throw new Error('Restore functionality not implemented - use pg_restore externally');
  }

  async optimize(options = {}) {
    try {
      const startTime = Date.now();
      const beforeStats = await this.getStats();
      
      // Run VACUUM ANALYZE on specified tables or all tables
      const tables = options.tables || await this._getAllTables();
      
      for (const table of tables) {
        await this.query(`VACUUM ANALYZE ${table}`);
      }
      
      const afterStats = await this.getStats();
      
      return {
        success: true,
        before: beforeStats,
        after: afterStats,
        space_saved_bytes: 0, // Would need more detailed analysis
        duration_ms: Date.now() - startTime,
        optimized_tables: tables
      };
    } catch (error) {
      throw new Error(`Optimization failed: ${error.message}`);
    }
  }

  async close() {
    await this.pool.end();
  }

  // Private helper methods
  _buildWhereClause(where) {
    if (!where || Object.keys(where).length === 0) {
      return { whereClause: '', whereValues: [] };
    }
    
    const conditions = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(where)) {
      if (value === null) {
        conditions.push(`${key} IS NULL`);
      } else if (value === undefined) {
        continue; // Skip undefined values
      } else if (typeof value === 'object' && value !== null) {
        // Handle operators like { '>': 100 }, { 'in': [1, 2, 3] }
        for (const [op, opValue] of Object.entries(value)) {
          switch (op.toLowerCase()) {
            case '>':
              conditions.push(`${key} > $${paramIndex}`);
              values.push(opValue);
              paramIndex++;
              break;
            case '>=':
              conditions.push(`${key} >= $${paramIndex}`);
              values.push(opValue);
              paramIndex++;
              break;
            case '<':
              conditions.push(`${key} < $${paramIndex}`);
              values.push(opValue);
              paramIndex++;
              break;
            case '<=':
              conditions.push(`${key} <= $${paramIndex}`);
              values.push(opValue);
              paramIndex++;
              break;
            case '!=':
            case '<>':
              conditions.push(`${key} != $${paramIndex}`);
              values.push(opValue);
              paramIndex++;
              break;
            case 'in':
              if (Array.isArray(opValue) && opValue.length > 0) {
                const placeholders = opValue.map(() => `$${paramIndex++}`).join(', ');
                conditions.push(`${key} IN (${placeholders})`);
                values.push(...opValue);
              }
              break;
            case 'like':
              conditions.push(`${key} LIKE $${paramIndex}`);
              values.push(opValue);
              paramIndex++;
              break;
            case 'ilike':
              conditions.push(`${key} ILIKE $${paramIndex}`);
              values.push(opValue);
              paramIndex++;
              break;
          }
        }
      } else {
        conditions.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    return {
      whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      whereValues: values
    };
  }

  async _getAllTables() {
    const result = await this.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `);
    return result.rows.map(row => row.tablename);
  }
}

export default PostgreSQLStorageAdapter;
