/**
 * Adapter Configuration Loader
 * 
 * Loads and initializes adapters based on YAML configuration.
 * Handles environment variables, adapter registration, and dependency injection.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

// Import adapter interfaces and registry  
import { AdapterRegistry, adapterFactory } from '../adapters/interfaces/index.js';

// Import concrete adapter implementations
import { PostgreSQLStorageAdapter } from '../adapters/implementations/postgresql-storage.js';
import { JWTAuthAdapter } from '../adapters/implementations/jwt-auth.js';
import { MotoricaUserAdapter } from '../adapters/implementations/motorical-user.js';
import { PostfixMTAAdapter } from '../adapters/implementations/postfix-mta.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AdapterLoader {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(__dirname, 'adapters.yaml');
    this.fallbackConfigPath = path.join(__dirname, 'adapters.example.yaml');
    this.registry = new AdapterRegistry();
    this.config = null;
    this.adapters = {};
    
    // Register built-in adapter factories
    this._registerBuiltinAdapters();
  }

  /**
   * Load configuration and initialize all adapters
   */
  async load() {
    try {
      // Load configuration
      this.config = await this._loadConfiguration();
      
      // Initialize adapters in dependency order
      await this._initializeAdapters();
      
      // Validate all adapters
      await this._validateAdapters();
      
      console.log('[AdapterLoader] All adapters loaded successfully');
      return this.adapters;
    } catch (error) {
      console.error('[AdapterLoader] Failed to load adapters:', error.message);
      throw error;
    }
  }

  /**
   * Get a specific adapter by name
   */
  getAdapter(name) {
    return this.adapters[name] || null;
  }

  /**
   * Get all adapters
   */
  getAllAdapters() {
    return { ...this.adapters };
  }

  /**
   * Get adapter registry for advanced usage
   */
  getRegistry() {
    return this.registry;
  }

  /**
   * Health check all adapters
   */
  async healthCheck() {
    const results = {};
    const promises = Object.entries(this.adapters).map(async ([name, adapter]) => {
      try {
        results[name] = await adapter.healthCheck();
      } catch (error) {
        results[name] = {
          healthy: false,
          latency_ms: 0,
          details: { error: error.message }
        };
      }
    });
    
    await Promise.all(promises);
    return results;
  }

  /**
   * Reload configuration and adapters
   */
  async reload() {
    console.log('[AdapterLoader] Reloading adapters...');
    
    // Clear existing adapters
    this.registry.clear();
    this.adapters = {};
    
    // Re-register built-in adapters
    this._registerBuiltinAdapters();
    
    // Load fresh configuration
    await this.load();
  }

  // Private methods
  async _loadConfiguration() {
    let configContent;
    
    try {
      // Try to load the main config file
      if (fs.existsSync(this.configPath)) {
        configContent = fs.readFileSync(this.configPath, 'utf8');
        console.log(`[AdapterLoader] Loaded config from ${this.configPath}`);
      } else {
        // Fall back to example config
        configContent = fs.readFileSync(this.fallbackConfigPath, 'utf8');
        console.log(`[AdapterLoader] Using example config from ${this.fallbackConfigPath}`);
        console.warn(`[AdapterLoader] Create ${this.configPath} to customize configuration`);
      }
    } catch (error) {
      throw new Error(`Failed to read configuration file: ${error.message}`);
    }

    try {
      // Parse YAML and substitute environment variables
      const rawConfig = yaml.load(configContent);
      const config = this._substituteEnvironmentVariables(rawConfig);
      
      // Apply environment-specific overrides
      const environment = process.env.NODE_ENV || 'development';
      if (config.environments && config.environments[environment]) {
        this._mergeConfig(config, config.environments[environment]);
      }
      
      return config;
    } catch (error) {
      throw new Error(`Failed to parse configuration: ${error.message}`);
    }
  }

  _substituteEnvironmentVariables(obj) {
    if (typeof obj === 'string') {
      // Replace ${VAR_NAME} with environment variable values
      return obj.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        const value = process.env[varName];
        if (value === undefined) {
          console.warn(`[AdapterLoader] Environment variable ${varName} not set, using empty string`);
          return '';
        }
        return value;
      });
    } else if (Array.isArray(obj)) {
      return obj.map(item => this._substituteEnvironmentVariables(item));
    } else if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this._substituteEnvironmentVariables(value);
      }
      return result;
    }
    
    return obj;
  }

  _mergeConfig(target, source) {
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && target[key]) {
        this._mergeConfig(target[key], value);
      } else {
        target[key] = value;
      }
    }
  }

  _registerBuiltinAdapters() {
    // Register storage adapters
    adapterFactory.register('storage', 'postgresql', (config) => {
      return new PostgreSQLStorageAdapter(config);
    });

    // Register auth adapters
    adapterFactory.register('auth', 'jwt', (config) => {
      return new JWTAuthAdapter(config);
    });

    // Register user adapters
    adapterFactory.register('user', 'motorical', (config) => {
      // Create separate storage adapter for Motorical database access
      config.motoricalStorageAdapter = new PostgreSQLStorageAdapter({
        url: config.database_url,
        pool_size: 5,
        idle_timeout: 30000,
        connection_timeout: 2000
      });
      config.storageAdapter = this.adapters.storage; // For encrypted IMAP data
      config.authAdapter = this.adapters.auth;
      return new MotoricaUserAdapter(config);
    });

    // Register MTA adapters
    adapterFactory.register('mta', 'postfix', (config) => {
      // Inject storage adapter dependency for logging
      config.storageAdapter = this.adapters.storage;
      return new PostfixMTAAdapter(config);
    });
  }

  async _initializeAdapters() {
    if (!this.config.adapters) {
      throw new Error('No adapters configuration found');
    }

    // Initialize in dependency order: storage -> auth -> user/mta
    const initOrder = ['storage', 'auth', 'user', 'mta'];
    
    for (const adapterType of initOrder) {
      if (this.config.adapters[adapterType]) {
        await this._initializeAdapter(adapterType, this.config.adapters[adapterType]);
      }
    }
  }

  async _initializeAdapter(name, config) {
    try {
      console.log(`[AdapterLoader] Initializing ${name} adapter (${config.type})`);
      
      let adapter;
      
      if (config.module) {
        // Load custom adapter module
        const modulePath = path.resolve(__dirname, '..', config.module);
        const AdapterClass = (await import(modulePath)).default;
        adapter = new AdapterClass(config.config || {});
      } else {
        // Use factory to create built-in adapter
        adapter = adapterFactory.create(name, config.type, config.config || {});
      }
      
      // Register with registry
      this.registry.register(name, name, adapter, config.config || {});
      
      // Store for easy access
      this.adapters[name] = adapter;
      
      console.log(`[AdapterLoader] ${name} adapter initialized successfully`);
    } catch (error) {
      throw new Error(`Failed to initialize ${name} adapter: ${error.message}`);
    }
  }

  async _validateAdapters() {
    const healthResults = await this.healthCheck();
    const unhealthyAdapters = Object.entries(healthResults)
      .filter(([name, health]) => !health.healthy)
      .map(([name, health]) => ({ name, error: health.details?.error }));
    
    if (unhealthyAdapters.length > 0) {
      const errors = unhealthyAdapters.map(a => `${a.name}: ${a.error}`).join(', ');
      throw new Error(`Unhealthy adapters: ${errors}`);
    }
    
    console.log('[AdapterLoader] All adapters passed health checks');
  }
}

/**
 * Global adapter loader instance
 */
let globalLoader = null;

/**
 * Get or create the global adapter loader
 */
export function getAdapterLoader(configPath = null) {
  if (!globalLoader) {
    globalLoader = new AdapterLoader(configPath);
  }
  return globalLoader;
}

/**
 * Load adapters using the global loader
 */
export async function loadAdapters(configPath = null) {
  const loader = getAdapterLoader(configPath);
  return await loader.load();
}

/**
 * Get a specific adapter from the global loader
 */
export function getAdapter(name) {
  if (!globalLoader) {
    throw new Error('Adapters not loaded. Call loadAdapters() first.');
  }
  return globalLoader.getAdapter(name);
}

/**
 * Health check all adapters
 */
export async function healthCheckAdapters() {
  if (!globalLoader) {
    throw new Error('Adapters not loaded. Call loadAdapters() first.');
  }
  return await globalLoader.healthCheck();
}

export default AdapterLoader;
