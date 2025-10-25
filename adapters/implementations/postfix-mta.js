/**
 * Postfix MTA Integration Adapter Implementation
 * 
 * Concrete implementation of MTAAdapter for Postfix mail server integration.
 * Manages transport maps, relay domains, and mail routing configuration.
 */

import fs from 'fs';
import { execFile } from 'child_process';
import { MTAAdapter, MTA_TYPES, ROUTE_PRIORITY, QUEUE_STATUS } from '../interfaces/mta.js';

export class PostfixMTAAdapter extends MTAAdapter {
  constructor(config) {
    super(config);
    this.transportMapPath = config.transportMapPath || config.transport_map || '/etc/postfix/transport';
    this.mainConfigPath = config.mainConfigPath || config.main_config || '/etc/postfix/main.cf';
    this.reloadCommand = config.reloadCommand || config.reload_command || ['systemctl', 'reload', 'postfix'];
    this.restartCommand = config.restartCommand || config.restart_command || ['systemctl', 'restart', 'postfix'];
    this.statusCommand = config.statusCommand || config.status_command || ['systemctl', 'status', 'postfix'];
    this.encimapPipePrefix = config.encimapPipePrefix || 'encimap-pipe';
    this.storageAdapter = config.storageAdapter; // For logging routes
    
    this.mtaType = MTA_TYPES.POSTFIX;
  }

  async addDomainRoute(domain, vaultboxId, options = {}) {
    try {
      const normalizedDomain = domain.toLowerCase().trim();
      const priority = options.priority || ROUTE_PRIORITY.NORMAL;
      
      // Ensure transport map file exists
      this._ensureTransportMapExists();
      
      // Remove any existing routes for this domain
      await this.removeDomainRoute(normalizedDomain);
      
      // Add new route
      const transportEntry = `${normalizedDomain}\t${this.encimapPipePrefix}:${vaultboxId}`;
      this._addLineToFile(this.transportMapPath, transportEntry);
      
      // Update transport map database
      await this._runCommand('postmap', [this.transportMapPath]);
      
      // Add to virtual mailbox domains (for local delivery)
      await this._addVirtualMailboxDomain(normalizedDomain);
      
      // Log route addition if storage adapter available
      if (this.storageAdapter) {
        try {
          await this.storageAdapter.insert('mta_routes', {
            domain: normalizedDomain,
            vaultbox_id: vaultboxId,
            priority: priority,
            active: true,
            created_at: new Date(),
            route_type: 'encrypted_imap',
            options: JSON.stringify(options)
          });
        } catch (error) {
          console.warn('Failed to log route addition:', error.message);
        }
      }
      
      console.log(`[PostfixMTA] Added route: ${normalizedDomain} -> ${this.encimapPipePrefix}:${vaultboxId}`);
    } catch (error) {
      throw new Error(`Failed to add domain route: ${error.message}`);
    }
  }

  async addEmailRoute(emailAddress, vaultboxId, options = {}) {
    try {
      const normalizedEmail = emailAddress.toLowerCase().trim();
      const priority = options.priority || ROUTE_PRIORITY.NORMAL;
      
      // Ensure transport map file exists
      this._ensureTransportMapExists();
      
      // Remove any existing routes for this specific email
      await this.removeEmailRoute(normalizedEmail);
      
      // Decide transport based on route_type
      let transportEntry;
      if (options.route_type === 'simple_imap' && options.username) {
        // Route to simple Maildir delivery using IMAP username
        transportEntry = `${normalizedEmail}\tsimple-maildir:${options.username}`;
      } else {
        // Default: encrypted intake pipe routed by vaultboxId
        transportEntry = `${normalizedEmail}\t${this.encimapPipePrefix}:${vaultboxId}`;
      }
      this._addLineToFile(this.transportMapPath, transportEntry);
      
      // Update transport map database
      await this._runCommand('postmap', [this.transportMapPath]);
      
      // Add domain to virtual mailbox domains if not already there
      const domain = normalizedEmail.split('@')[1];
      await this._addVirtualMailboxDomain(domain);
      
      // Log route addition if storage adapter available
      if (this.storageAdapter) {
        try {
          await this.storageAdapter.insert('mta_routes', {
            email_address: normalizedEmail,
            domain: domain,
            vaultbox_id: vaultboxId,
            priority: priority,
            active: true,
            created_at: new Date(),
            route_type: options.route_type === 'simple_imap' ? 'simple_imap_email' : 'encrypted_imap_email',
            options: JSON.stringify(options)
          });
        } catch (error) {
          console.warn('Failed to log email route addition:', error.message);
        }
      }
      
      console.log(`[PostfixMTA] Added email route: ${normalizedEmail} -> ${transportEntry.split('\t')[1]}`);
    } catch (error) {
      throw new Error(`Failed to add email route: ${error.message}`);
    }
  }

  // Explicit helper for simple mailbox routing
  async addSimpleEmailRoute(emailAddress, username, options = {}) {
    return this.addEmailRoute(emailAddress, null, { ...options, route_type: 'simple_imap', username });
  }

  async removeDomainRoute(domain) {
    try {
      const normalizedDomain = domain.toLowerCase().trim();
      
      // Remove from transport map
      this._removeLineFromFile(this.transportMapPath, new RegExp(`^${this._escapeRegex(normalizedDomain)}\\s+`));
      
      // Update transport map database
      await this._runCommand('postmap', [this.transportMapPath]);
      
      // Remove from virtual mailbox domains
      await this._removeVirtualMailboxDomain(normalizedDomain);
      
      // Log route removal if storage adapter available
      if (this.storageAdapter) {
        try {
          await this.storageAdapter.update('mta_routes', 
            { active: false, removed_at: new Date() },
            { domain: normalizedDomain, active: true }
          );
        } catch (error) {
          console.warn('Failed to log route removal:', error.message);
        }
      }
      
      console.log(`[PostfixMTA] Removed route: ${normalizedDomain}`);
    } catch (error) {
      throw new Error(`Failed to remove domain route: ${error.message}`);
    }
  }

  async removeEmailRoute(emailAddress) {
    try {
      const normalizedEmail = emailAddress.toLowerCase().trim();
      
      // Remove specific email route from transport map
      this._removeLineFromFile(this.transportMapPath, new RegExp(`^${this._escapeRegex(normalizedEmail)}\\s+`));
      
      // Update transport map database
      await this._runCommand('postmap', [this.transportMapPath]);
      
      // Log route removal if storage adapter available
      if (this.storageAdapter) {
        try {
          await this.storageAdapter.update('mta_routes', 
            { active: false, removed_at: new Date() },
            { email_address: normalizedEmail, active: true }
          );
        } catch (error) {
          console.warn('Failed to log email route removal:', error.message);
        }
      }
      
      console.log(`[PostfixMTA] Removed email route: ${normalizedEmail}`);
    } catch (error) {
      throw new Error(`Failed to remove email route: ${error.message}`);
    }
  }

  async reloadConfiguration() {
    try {
      console.log('[PostfixMTA] Reloading Postfix configuration...');
      
      try {
        await this._runCommand(this.reloadCommand[0], this.reloadCommand.slice(1));
        console.log('[PostfixMTA] Configuration reloaded successfully');
      } catch (reloadError) {
        console.warn('[PostfixMTA] Reload failed, attempting restart...', reloadError.message);
        await this._runCommand(this.restartCommand[0], this.restartCommand.slice(1));
        console.log('[PostfixMTA] Configuration restarted successfully');
      }
    } catch (error) {
      throw new Error(`Failed to reload configuration: ${error.message}`);
    }
  }

  async testRoute(domain, options = {}) {
    const startTime = Date.now();
    
    try {
      const normalizedDomain = domain.toLowerCase().trim();
      
      // Check if route exists in transport map
      const transportContent = this._readFile(this.transportMapPath);
      const routeRegex = new RegExp(`^${this._escapeRegex(normalizedDomain)}\\s+(.+)$`, 'm');
      const routeMatch = transportContent.match(routeRegex);
      
      if (!routeMatch) {
        return {
          success: false,
          message: `No route found for domain ${normalizedDomain}`,
          latency_ms: Date.now() - startTime,
          details: {
            domain: normalizedDomain,
            route_target: null,
            transport_map_checked: true
          },
          tested_at: new Date()
        };
      }
      
      const routeTarget = routeMatch[1].trim();
      
      // Test if route target is valid encrypted IMAP pipe
      if (!routeTarget.startsWith(this.encimapPipePrefix)) {
        return {
          success: false,
          message: `Route exists but not for encrypted IMAP: ${routeTarget}`,
          latency_ms: Date.now() - startTime,
          details: {
            domain: normalizedDomain,
            route_target: routeTarget,
            expected_prefix: this.encimapPipePrefix
          },
          tested_at: new Date()
        };
      }
      
      // Extract vaultbox ID
      const vaultboxId = routeTarget.split(':')[1];
      
      // Test if virtual mailbox domain is configured
      const virtualDomains = await this._getVirtualMailboxDomains();
      const isVirtualDomain = virtualDomains.includes(normalizedDomain);
      
      if (!isVirtualDomain) {
        return {
          success: false,
          message: `Domain not in virtual_mailbox_domains configuration`,
          latency_ms: Date.now() - startTime,
          details: {
            domain: normalizedDomain,
            route_target: routeTarget,
            vaultbox_id: vaultboxId,
            in_virtual_mailbox_domains: false
          },
          tested_at: new Date()
        };
      }
      
      return {
        success: true,
        message: `Route configured correctly for encrypted IMAP`,
        latency_ms: Date.now() - startTime,
          details: {
            domain: normalizedDomain,
            route_target: routeTarget,
            vaultbox_id: vaultboxId,
            in_virtual_mailbox_domains: true,
            transport_map_valid: true
          },
        tested_at: new Date()
      };
    } catch (error) {
      return {
        success: false,
        message: `Route test failed: ${error.message}`,
        latency_ms: Date.now() - startTime,
        details: {
          domain: domain,
          error: error.message
        },
        tested_at: new Date()
      };
    }
  }

  async getStats(domain = null, timeRange = {}) {
    try {
      const stats = {
        total_messages: 0,
        successful_routes: 0,
        failed_routes: 0,
        average_latency: 0,
        last_24h: {
          messages: 0,
          errors: 0
        },
        period_start: timeRange.start || new Date(Date.now() - 24 * 60 * 60 * 1000),
        period_end: timeRange.end || new Date()
      };

      // Get stats from storage adapter if available
      if (this.storageAdapter) {
        try {
          let whereClause = 'received_at >= $1 AND received_at <= $2';
          const params = [stats.period_start, stats.period_end];
          
          if (domain) {
            whereClause += ' AND v.domain = $3';
            params.push(domain.toLowerCase());
          }
          
          const result = await this.storageAdapter.query(`
            SELECT 
              COUNT(*) as total_messages,
              SUM(CASE WHEN m.storage IS NOT NULL THEN 1 ELSE 0 END) as successful_routes,
              COUNT(*) - SUM(CASE WHEN m.storage IS NOT NULL THEN 1 ELSE 0 END) as failed_routes
            FROM messages m
            JOIN vaultboxes v ON m.vaultbox_id = v.id
            WHERE ${whereClause}
          `, params);
          
          if (result.rows.length > 0) {
            const row = result.rows[0];
            stats.total_messages = parseInt(row.total_messages || 0);
            stats.successful_routes = parseInt(row.successful_routes || 0);
            stats.failed_routes = parseInt(row.failed_routes || 0);
          }
          
          // Get last 24h stats
          const last24h = await this.storageAdapter.query(`
            SELECT 
              COUNT(*) as messages,
              COUNT(*) - SUM(CASE WHEN m.storage IS NOT NULL THEN 1 ELSE 0 END) as errors
            FROM messages m
            JOIN vaultboxes v ON m.vaultbox_id = v.id
            WHERE received_at >= $1 ${domain ? 'AND v.domain = $2' : ''}
          `, domain ? [new Date(Date.now() - 24 * 60 * 60 * 1000), domain.toLowerCase()] 
                    : [new Date(Date.now() - 24 * 60 * 60 * 1000)]);
          
          if (last24h.rows.length > 0) {
            stats.last_24h.messages = parseInt(last24h.rows[0].messages || 0);
            stats.last_24h.errors = parseInt(last24h.rows[0].errors || 0);
          }
        } catch (error) {
          console.warn('Failed to get stats from storage:', error.message);
        }
      }

      // Add per-domain breakdown if no specific domain requested
      if (!domain && this.storageAdapter) {
        try {
          const domainStats = await this.storageAdapter.query(`
            SELECT 
              v.domain,
              COUNT(*) as messages,
              SUM(CASE WHEN m.storage IS NOT NULL THEN 1 ELSE 0 END) as successful
            FROM messages m
            JOIN vaultboxes v ON m.vaultbox_id = v.id
            WHERE received_at >= $1 AND received_at <= $2
            GROUP BY v.domain
            ORDER BY messages DESC
          `, [stats.period_start, stats.period_end]);
          
          stats.by_domain = {};
          domainStats.rows.forEach(row => {
            stats.by_domain[row.domain] = {
              messages: parseInt(row.messages),
              successful: parseInt(row.successful),
              failed: parseInt(row.messages) - parseInt(row.successful)
            };
          });
        } catch (error) {
          console.warn('Failed to get per-domain stats:', error.message);
        }
      }

      return stats;
    } catch (error) {
      throw new Error(`Failed to get routing stats: ${error.message}`);
    }
  }

  async listRoutes() {
    try {
      const routes = [];
      
      // Parse transport map file
      const transportContent = this._readFile(this.transportMapPath);
      const lines = transportContent.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        const match = trimmed.match(/^([^\s]+)\s+(.+)$/);
        if (match && match[2].includes(this.encimapPipePrefix)) {
          const domain = match[1];
          const target = match[2];
          const vaultboxId = target.split(':')[1] || null;
          
          routes.push({
            domain,
            vaultbox_id: vaultboxId,
            created_at: null, // Would need to get from storage
            updated_at: null,
            priority: ROUTE_PRIORITY.NORMAL,
            active: true,
            options: {}
          });
        }
      }
      
      // Enhance with storage data if available
      if (this.storageAdapter && routes.length > 0) {
        try {
          const domains = routes.map(r => r.domain);
          const storageRoutes = await this.storageAdapter.find('mta_routes', {
            domain: { in: domains },
            active: true
          });
          
          // Merge storage data with transport map data
          routes.forEach(route => {
            const stored = storageRoutes.rows.find(sr => sr.domain === route.domain);
            if (stored) {
              route.created_at = stored.created_at;
              route.updated_at = stored.updated_at;
              route.priority = stored.priority || ROUTE_PRIORITY.NORMAL;
              route.options = stored.options ? JSON.parse(stored.options) : {};
            }
          });
        } catch (error) {
          console.warn('Failed to enhance routes with storage data:', error.message);
        }
      }
      
      return routes;
    } catch (error) {
      throw new Error(`Failed to list routes: ${error.message}`);
    }
  }

  async validateRoute(domain) {
    try {
      const normalizedDomain = domain.toLowerCase().trim();
      const issues = [];
      const warnings = [];
      
      // Check transport map
      const transportContent = this._readFile(this.transportMapPath);
      const routeRegex = new RegExp(`^${this._escapeRegex(normalizedDomain)}\\s+(.+)$`, 'm');
      const routeMatch = transportContent.match(routeRegex);
      
      if (!routeMatch) {
        issues.push('Domain not found in transport map');
      } else {
        const routeTarget = routeMatch[1].trim();
        if (!routeTarget.startsWith(this.encimapPipePrefix)) {
          issues.push(`Route target "${routeTarget}" is not an encrypted IMAP pipe`);
        }
      }
      
      // Check virtual mailbox domains
      const virtualDomains = await this._getVirtualMailboxDomains();
      if (!virtualDomains.includes(normalizedDomain)) {
        issues.push('Domain not in virtual_mailbox_domains configuration');
      }
      
      // Check transport map database is current
      try {
        await this._runCommand('postmap', ['-q', normalizedDomain, this.transportMapPath]);
      } catch (error) {
        warnings.push('Transport map database may be out of sync');
      }
      
      return {
        valid: issues.length === 0,
        issues,
        warnings,
        suggestions: issues.length > 0 ? {
          transport_map: `Add "${normalizedDomain}\t${this.encimapPipePrefix}:VAULTBOX_ID" to ${this.transportMapPath}`,
          virtual_mailbox_domains: `Add "${normalizedDomain}" to virtual_mailbox_domains in ${this.mainConfigPath}`,
          reload: 'Run "postmap /etc/postfix/transport && systemctl reload postfix"'
        } : null,
        validated_at: new Date()
      };
    } catch (error) {
      return {
        valid: false,
        issues: [`Validation failed: ${error.message}`],
        warnings: [],
        validated_at: new Date()
      };
    }
  }

  async getStatus() {
    try {
      const statusResult = await this._runCommand(this.statusCommand[0], this.statusCommand.slice(1));
      const isRunning = !statusResult.stderr.includes('inactive') && !statusResult.stderr.includes('failed');
      
      // Get queue information
      const queueInfo = await this.checkQueue();
      
      return {
        mta_type: this.mtaType,
        version: await this._getPostfixVersion(),
        running: isRunning,
        queue_size: queueInfo.pending_count + queueInfo.deferred_count,
        active_connections: 0, // Would need netstat or similar
        last_reload: null, // Could track this in storage
        performance: {
          transport_map_size: this._getFileLineCount(this.transportMapPath),
          virtual_mailbox_domains_count: (await this._getVirtualMailboxDomains()).length
        },
        warnings: []
      };
    } catch (error) {
      return {
        mta_type: this.mtaType,
        version: 'unknown',
        running: false,
        queue_size: 0,
        active_connections: 0,
        warnings: [`Status check failed: ${error.message}`]
      };
    }
  }

  async checkQueue(domain = null) {
    try {
      // Use postqueue to check mail queue
      const queueResult = await this._runCommand('postqueue', ['-p']);
      const queueOutput = queueResult.stdout;
      
      // Parse postqueue output
      const lines = queueOutput.split('\n');
      let pendingCount = 0;
      let deferredCount = 0;
      let activeCount = 0;
      const oldestMessages = [];
      
      for (const line of lines) {
        if (line.includes('MAILER-DAEMON')) continue;
        if (line.match(/^[A-F0-9]+/)) {
          const parts = line.split(/\s+/);
          if (parts.length >= 4) {
            const status = parts[1];
            const size = parts[2];
            const date = parts[3];
            const recipient = parts[4];
            
            if (domain && !recipient.includes(domain)) continue;
            
            if (status === '*') {
              activeCount++;
            } else if (status === '!') {
              deferredCount++;
            } else {
              pendingCount++;
            }
            
            if (oldestMessages.length < 10) {
              oldestMessages.push({
                id: parts[0],
                size,
                date,
                recipient,
                status
              });
            }
          }
        }
      }
      
      return {
        pending_count: pendingCount,
        deferred_count: deferredCount,
        active_count: activeCount,
        oldest_messages: oldestMessages,
        last_checked: new Date(),
        queue_status: this._getQueueStatus(pendingCount + deferredCount)
      };
    } catch (error) {
      return {
        pending_count: 0,
        deferred_count: 0,
        active_count: 0,
        oldest_messages: [],
        last_checked: new Date(),
        queue_status: QUEUE_STATUS.EMPTY,
        error: error.message
      };
    }
  }

  async flushQueue(domain = null) {
    try {
      const startTime = Date.now();
      const beforeQueue = await this.checkQueue(domain);
      
      // Flush the queue
      if (domain) {
        // Postfix doesn't have domain-specific flush, so we flush all
        console.warn(`[PostfixMTA] Domain-specific flush not supported, flushing entire queue`);
      }
      
      await this._runCommand('postqueue', ['-f']);
      
      // Wait a moment for processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const afterQueue = await this.checkQueue(domain);
      
      return {
        success: true,
        processed_count: Math.max(0, beforeQueue.pending_count - afterQueue.pending_count),
        failed_count: afterQueue.deferred_count,
        errors: [],
        completed_at: new Date(),
        duration_ms: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        processed_count: 0,
        failed_count: 0,
        errors: [error.message],
        completed_at: new Date()
      };
    }
  }

  async healthCheck() {
    const startTime = Date.now();
    
    try {
      // Test file access
      if (!fs.existsSync(this.transportMapPath)) {
        throw new Error(`Transport map file not found: ${this.transportMapPath}`);
      }
      
      // Test postfix status
      const status = await this.getStatus();
      
      return {
        healthy: status.running,
        latency_ms: Date.now() - startTime,
        details: {
          adapter_type: 'PostfixMTAAdapter',
          mta_type: this.mtaType,
          transport_map_exists: fs.existsSync(this.transportMapPath),
          main_config_exists: fs.existsSync(this.mainConfigPath),
          postfix_running: status.running,
          queue_size: status.queue_size,
          version: status.version
        }
      };
    } catch (error) {
      return {
        healthy: false,
        latency_ms: Date.now() - startTime,
        details: {
          adapter_type: 'PostfixMTAAdapter',
          error: error.message,
          transport_map_exists: fs.existsSync(this.transportMapPath),
          main_config_exists: fs.existsSync(this.mainConfigPath)
        }
      };
    }
  }

  // Private helper methods
  _ensureTransportMapExists() {
    if (!fs.existsSync(this.transportMapPath)) {
      fs.writeFileSync(this.transportMapPath, '# Postfix transport map for encrypted IMAP\n', { mode: 0o644 });
    }
  }

  _readFile(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        return '';
      }
      throw error;
    }
  }

  _addLineToFile(filePath, line) {
    fs.appendFileSync(filePath, line + '\n', { mode: 0o644 });
  }

  _removeLineFromFile(filePath, regex) {
    const content = this._readFile(filePath);
    const lines = content.split('\n');
    const filtered = lines.filter(line => !regex.test(line));
    fs.writeFileSync(filePath, filtered.join('\n'), { mode: 0o644 });
  }

  _escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async _runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      execFile(command, args, { timeout: 15000, ...options }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${command} failed: ${stderr || error.message}`));
        } else {
          resolve({ stdout: stdout || '', stderr: stderr || '' });
        }
      });
    });
  }

  async _addVirtualMailboxDomain(domain) {
    const content = this._readFile(this.mainConfigPath);
    const lines = content.split('\n');
    let foundVirtualDomains = false;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('virtual_mailbox_domains')) {
        foundVirtualDomains = true;
        const parts = lines[i].split('=');
        const domains = (parts[1] || '').trim().split(/[\s,]+/).filter(Boolean);
        
        if (!domains.includes(domain)) {
          domains.push(domain);
          lines[i] = `virtual_mailbox_domains = ${domains.join(', ')}`;
        }
        break;
      }
    }
    
    if (!foundVirtualDomains) {
      lines.push(`virtual_mailbox_domains = ${domain}`);
    }
    
    fs.writeFileSync(this.mainConfigPath, lines.join('\n'));
  }

  async _removeVirtualMailboxDomain(domain) {
    const content = this._readFile(this.mainConfigPath);
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('virtual_mailbox_domains')) {
        const parts = lines[i].split('=');
        const domains = (parts[1] || '').trim().split(/[\s,]+/).filter(Boolean);
        const filtered = domains.filter(d => d !== domain);
        
        if (filtered.length > 0) {
          lines[i] = `virtual_mailbox_domains = ${filtered.join(', ')}`;
        } else {
          lines[i] = 'virtual_mailbox_domains = ';
        }
        break;
      }
    }
    
    fs.writeFileSync(this.mainConfigPath, lines.join('\n'));
  }

  async _getVirtualMailboxDomains() {
    const content = this._readFile(this.mainConfigPath);
    const match = content.match(/^virtual_mailbox_domains\s*=\s*(.*)$/m);
    
    if (!match) return [];
    
    return match[1].trim().split(/[\s,]+/).filter(Boolean);
  }

  async _getPostfixVersion() {
    try {
      const result = await this._runCommand('postconf', ['-d', 'mail_version']);
      const match = result.stdout.match(/mail_version = (.+)/);
      return match ? match[1].trim() : 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  _getFileLineCount(filePath) {
    try {
      const content = this._readFile(filePath);
      return content.split('\n').filter(line => line.trim() && !line.startsWith('#')).length;
    } catch (error) {
      return 0;
    }
  }

  _getQueueStatus(queueSize) {
    if (queueSize === 0) return QUEUE_STATUS.EMPTY;
    if (queueSize < 10) return QUEUE_STATUS.NORMAL;
    if (queueSize < 100) return QUEUE_STATUS.HIGH;
    return QUEUE_STATUS.CRITICAL;
  }
}

export default PostfixMTAAdapter;
