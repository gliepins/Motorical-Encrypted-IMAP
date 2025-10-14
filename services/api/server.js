/**
 * Motorical Encrypted IMAP API Server v2
 * 
 * Updated to use the adapter architecture with clean vaultbox-motorblock separation.
 * This version implements the dedicated vaultbox SMTP credentials system.
 */

import express from 'express';
import { loadAdapters, getAdapter } from '../../config/adapter-loader.js';
import VaultboxSmtpService from '../core/vaultbox-smtp-service.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

// Global adapter references
let adapters = {};
let vaultboxSmtpService = null;

// Initialize adapters on startup
async function initializeServer() {
  try {
    console.log('[EncimapAPI] Loading adapters...');
    adapters = await loadAdapters();
    
    // Initialize vaultbox SMTP service
    vaultboxSmtpService = new VaultboxSmtpService(adapters.storage);
    
    console.log('[EncimapAPI] Server initialized with adapters');
  } catch (error) {
    console.error('[EncimapAPI] Failed to initialize:', error.message);
    process.exit(1);
  }
}

// Authentication middleware
async function authenticateS2S(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'missing bearer token' });
  }

  try {
    const authResult = await adapters.auth.validateToken(auth, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      headers: req.headers
    });

    if (!authResult.valid) {
      return res.status(403).json({ success: false, error: authResult.error || 'invalid token' });
    }

    req.user = {
      id: authResult.user_id,
      permissions: authResult.permissions || [],
      metadata: authResult.metadata
    };

    next();
  } catch (error) {
    console.error('[EncimapAPI] Auth error:', error);
    return res.status(500).json({ success: false, error: 'authentication failed' });
  }
}

// Health check endpoint (public)
app.get('/s2s/v1/health', async (req, res) => {
  try {
    if (!adapters.storage) {
      return res.status(500).json({ status: 'not_initialized' });
    }

    // Test storage adapter
    await adapters.storage.query('SELECT 1');
    
    // Get adapter health
    const adapterHealth = {};
    for (const [name, adapter] of Object.entries(adapters)) {
      try {
        adapterHealth[name] = await adapter.healthCheck();
      } catch (error) {
        adapterHealth[name] = { healthy: false, error: error.message };
      }
    }

    const allHealthy = Object.values(adapterHealth).every(h => h.healthy);

    res.json({ 
      status: allHealthy ? 'ok' : 'degraded',
      adapters: adapterHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// All other endpoints require authentication
app.use('/s2s/v1', authenticateS2S);

// ====================================================================
// VAULTBOX MANAGEMENT ENDPOINTS
// ====================================================================

// List user's vaultboxes with enhanced information
app.get('/s2s/v1/vaultboxes', async (req, res) => {
  try {
    const userId = req.query.user_id || req.user.id;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'missing user_id' });
    }

    // Check permission
    const hasPermission = await adapters.auth.hasPermission(
      req.user.id, 'read', 'vaultbox', { user_id: userId }
    );
    if (!hasPermission && req.user.id !== userId) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    // Get vaultboxes with certificate and SMTP info
    const result = await adapters.storage.query(`
      SELECT 
        v.id, v.domain, v.name, v.alias, v.status, v.smtp_enabled, v.created_at,
        EXISTS (SELECT 1 FROM vaultbox_certs c WHERE c.vaultbox_id = v.id) AS has_certs,
        (SELECT COUNT(*) FROM messages m WHERE m.vaultbox_id = v.id) AS message_count,
        vsc.username as smtp_username,
        vsc.host as smtp_host,
        vsc.port as smtp_port,
        vsc.security_type as smtp_security,
        vsc.messages_sent_count as smtp_messages_sent,
        vsc.last_used as smtp_last_used
      FROM vaultboxes v
      LEFT JOIN vaultbox_smtp_credentials vsc ON v.id = vsc.vaultbox_id AND vsc.enabled = true
      WHERE v.user_id = $1
      ORDER BY v.created_at DESC
    `, [userId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('[EncimapAPI] Error fetching vaultboxes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new vaultbox
app.post('/s2s/v1/vaultboxes', async (req, res) => {
  try {
    const { user_id, domain, name, alias } = req.body || {};
    const userId = user_id || req.user.id;

    if (!domain || !name) {
      return res.status(400).json({ success: false, error: 'missing domain or name' });
    }

    // Check permission
    const hasPermission = await adapters.auth.hasPermission(
      req.user.id, 'create', 'vaultbox'
    );
    if (!hasPermission) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    // Verify user has access to domain
    const userDomains = await adapters.user.getUserDomains(userId);
    const domainLower = domain.toLowerCase();
    const validDomain = userDomains.find(d => d.domain.toLowerCase() === domainLower && d.verified);
    
    if (!validDomain) {
      return res.status(400).json({ success: false, error: 'domain not verified for user' });
    }

    // Create vaultbox
    const vaultboxData = {
      user_id: userId,
      domain: domainLower,
      name: name.trim(),
      alias: alias ? alias.trim().toLowerCase() : null,
      status: 'active',
      smtp_enabled: false
    };

    const result = await adapters.storage.insert('vaultboxes', vaultboxData);
    const vaultboxId = result.id;

    // Add MTA routing for the specific email address (not domain-wide)
    try {
      if (alias) {
        // Create email-specific routing: alias@domain -> vaultbox
        const emailAddress = `${alias}@${domainLower}`;
        await adapters.mta.addEmailRoute(emailAddress, vaultboxId, {
          priority: 10,
          route_type: 'encrypted_imap'
        });
        console.log(`[EncimapAPI] Added email-specific route: ${emailAddress} -> ${vaultboxId}`);
      } else {
        console.warn('[EncimapAPI] No alias provided, skipping MTA route creation');
      }
    } catch (mtaError) {
      console.warn('[EncimapAPI] MTA routing setup failed:', mtaError.message);
      // Continue - vaultbox is created, routing can be fixed later
    }

    console.log(`[EncimapAPI] Created vaultbox ${vaultboxId} for domain ${domainLower}`);
    
    res.json({
      success: true,
      data: {
        vaultbox_id: vaultboxId,
        domain: domainLower,
        name: name.trim(),
        has_certs: false,
        smtp_enabled: false
      } 
    });
  } catch (error) {
    console.error('[EncimapAPI] Error creating vaultbox:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete vaultbox
app.delete('/s2s/v1/vaultboxes/:id', async (req, res) => {
  try {
    const vaultboxId = req.params.id;
    
    if (!vaultboxId) {
      return res.status(400).json({ success: false, error: 'missing vaultbox id' });
    }

    // Verify vaultbox exists and user has access
    const vaultbox = await adapters.storage.findById('vaultboxes', vaultboxId);
    if (!vaultbox) {
      return res.status(404).json({ success: false, error: 'vaultbox not found' });
    }

    // Check if this is a service-to-service call or user owns the vaultbox
    const isServiceCall = req.user.id === 'backend.motorical' || req.user.id === 'motorical-backend';
    const userOwnsVaultbox = req.user.id === vaultbox.user_id;
    
    if (!isServiceCall && !userOwnsVaultbox) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    // Remove MTA routing for the specific email address
    try {
      if (vaultbox.alias) {
        const emailAddress = `${vaultbox.alias}@${vaultbox.domain}`;
        await adapters.mta.removeEmailRoute(emailAddress);
        console.log(`[EncimapAPI] Removed MTA routing for email ${emailAddress}`);
    } else {
        console.warn('[EncimapAPI] No alias found, skipping MTA route removal');
      }
    } catch (mtaError) {
      console.warn('[EncimapAPI] MTA routing removal failed:', mtaError.message);
      // Continue - vaultbox deletion is more important
    }

    // Delete vaultbox and cascade to related data (messages, certs, smtp_credentials, imap_credentials)
    await adapters.storage.delete('vaultboxes', { id: vaultboxId });

    // Remove maildir if it exists
    try {
      const fs = await import('fs');
      const path = `/var/mail/vaultboxes/${vaultboxId}`;
      if (fs.existsSync(path)) {
        fs.rmSync(path, { recursive: true, force: true });
        console.log(`[EncimapAPI] Removed maildir ${path}`);
      }
    } catch (error) {
      console.warn('[EncimapAPI] Maildir removal failed:', error.message);
      // Continue - this is not critical
    }

    console.log(`[EncimapAPI] Deleted vaultbox ${vaultboxId} (${vaultbox.domain})`);
    res.json({ success: true, message: 'Vaultbox deleted successfully' });
  } catch (error) {
    console.error('[EncimapAPI] Error deleting vaultbox:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// VAULTBOX SMTP CREDENTIALS ENDPOINTS (NEW CLEAN SYSTEM)
// ====================================================================

// Create SMTP credentials for vaultbox
app.post('/s2s/v1/vaultboxes/:id/smtp-credentials', async (req, res) => {
  try {
    const vaultboxId = req.params.id;
    const { host, port, security_type } = req.body || {};

    // Verify vaultbox exists and user has access
    const vaultbox = await adapters.storage.findById('vaultboxes', vaultboxId);
    if (!vaultbox) {
      return res.status(404).json({ success: false, error: 'vaultbox not found' });
    }

    // Check permission
    const hasPermission = await adapters.auth.hasPermission(
      req.user.id, 'create', 'credentials', { vaultbox_id: vaultboxId }
    );
    if (!hasPermission && req.user.id !== vaultbox.user_id) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    // Check if IMAP credentials already exist to use the same username
    let username;
    const existingImap = await adapters.storage.find('imap_app_credentials', { vaultbox_id: vaultboxId });
    
    if (existingImap.rows && existingImap.rows.length > 0) {
      // Use existing IMAP username for SMTP to ensure they match
      username = existingImap.rows[0].username;
      console.log(`[EncimapAPI] Using existing IMAP username for SMTP: ${username}`);
    } else {
      // Generate new unified username
      username = generateUnifiedUsername(vaultbox.domain, vaultboxId);
    }
    
    const password = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    
    // Hash password using bcrypt
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 12);

    // Create SMTP credentials with unified username
    const credentials = await adapters.storage.insert('vaultbox_smtp_credentials', {
      vaultbox_id: vaultboxId,
      username: username,
      password_hash: passwordHash,
      host: host || 'mail.motorical.com',
      port: port || 587,
      security_type: security_type || 'STARTTLS'
    });

    console.log(`[EncimapAPI] Created SMTP credentials for vaultbox ${vaultboxId}: ${username}`);

    res.json({
      success: true,
      data: {
        credentials: {
          id: credentials.id,
          vaultbox_id: vaultboxId,
          username: username,
          password: password,
          host: host || 'mail.motorical.com',
          port: port || 587,
          security_type: security_type || 'STARTTLS',
          created_at: new Date().toISOString()
        },
        message: 'SMTP credentials created successfully'
      }
    });
  } catch (error) {
    console.error('[EncimapAPI] Error creating SMTP credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get SMTP credentials for vaultbox (without password)
app.get('/s2s/v1/vaultboxes/:id/smtp-credentials', async (req, res) => {
  try {
    const vaultboxId = req.params.id;

    // Verify vaultbox exists and user has access
    const vaultbox = await adapters.storage.findById('vaultboxes', vaultboxId);
    if (!vaultbox) {
      return res.status(404).json({ success: false, error: 'vaultbox not found' });
    }

    // Check permission
    const hasPermission = await adapters.auth.hasPermission(
      req.user.id, 'read', 'credentials', { vaultbox_id: vaultboxId }
    );
    if (!hasPermission && req.user.id !== vaultbox.user_id) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    const credentials = await vaultboxSmtpService.getCredentials(vaultboxId);

    res.json({
      success: true,
      data: credentials 
    });
  } catch (error) {
    console.error('[EncimapAPI] Error fetching SMTP credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Regenerate SMTP password
app.post('/s2s/v1/vaultboxes/:id/smtp-credentials/regenerate', async (req, res) => {
  try {
    const vaultboxId = req.params.id;

    // Verify vaultbox exists and user has access
    const vaultbox = await adapters.storage.findById('vaultboxes', vaultboxId);
    if (!vaultbox) {
      return res.status(404).json({ success: false, error: 'vaultbox not found' });
    }

    // Check if this is a service-to-service call or user owns the vaultbox
    const isServiceCall = req.user.id === 'backend.motorical' || req.user.id === 'motorical-backend';
    const userOwnsVaultbox = req.user.id === vaultbox.user_id;
    
    if (!isServiceCall && !userOwnsVaultbox) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    const newCredentials = await vaultboxSmtpService.regeneratePassword(vaultboxId);

    console.log(`[EncimapAPI] Regenerated SMTP password for vaultbox ${vaultboxId}`);

    res.json({
      success: true,
      data: {
        credentials: newCredentials,
        message: 'SMTP password regenerated successfully'
      }
    });
  } catch (error) {
    console.error('[EncimapAPI] Error regenerating SMTP password:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete SMTP credentials
app.delete('/s2s/v1/vaultboxes/:id/smtp-credentials', async (req, res) => {
  try {
    const vaultboxId = req.params.id;

    // Verify vaultbox exists and user has access
    const vaultbox = await adapters.storage.findById('vaultboxes', vaultboxId);
    if (!vaultbox) {
      return res.status(404).json({ success: false, error: 'vaultbox not found' });
    }

    // Check permission
    const hasPermission = await adapters.auth.hasPermission(
      req.user.id, 'delete', 'credentials', { vaultbox_id: vaultboxId }
    );
    if (!hasPermission && req.user.id !== vaultbox.user_id) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    const deleted = await vaultboxSmtpService.deleteCredentials(vaultboxId);

    if (deleted) {
      console.log(`[EncimapAPI] Deleted SMTP credentials for vaultbox ${vaultboxId}`);
      res.json({ success: true, message: 'SMTP credentials deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'no SMTP credentials found' });
    }
  } catch (error) {
    console.error('[EncimapAPI] Error deleting SMTP credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get usage statistics for user's vaultboxes
app.get('/s2s/v1/usage', async (req, res) => {
  try {
    const userId = req.query.user_id || req.user.id;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'missing user_id' });
    }

    // Check permission
    const hasPermission = await adapters.auth.hasPermission(
      req.user.id, 'read', 'usage', { user_id: userId }
    );
    if (!hasPermission && req.user.id !== userId) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    // Get usage statistics with message counts and storage
    const result = await adapters.storage.query(`
      SELECT 
        v.id as vaultbox_id,
        v.domain,
        COUNT(m.id) as message_count,
        COALESCE(SUM(m.size_bytes), 0) as total_bytes,
        MAX(m.received_at) as last_received
      FROM vaultboxes v
      LEFT JOIN messages m ON m.vaultbox_id = v.id
      WHERE v.user_id = $1
      GROUP BY v.id, v.domain
      ORDER BY last_received DESC NULLS LAST, v.created_at DESC
    `, [userId]);

    const usage = result.rows.map(row => ({
      vaultbox_id: row.vaultbox_id,
      domain: row.domain,
      message_count: Number(row.message_count || 0),
      total_bytes: Number(row.total_bytes || 0),
      last_received: row.last_received
    }));

    console.log(`[EncimapAPI] Usage query for user ${userId}: ${usage.length} vaultboxes, ${usage.reduce((sum, u) => sum + u.message_count, 0)} total messages`);

    res.json({ success: true, data: usage });
  } catch (error) {
    console.error('[EncimapAPI] Error getting usage statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// VAULTBOX IMAP CREDENTIALS ENDPOINTS
// ====================================================================

// Create IMAP credentials for vaultbox
app.post('/s2s/v1/vaultboxes/:id/imap-credentials', async (req, res) => {
  try {
    const vaultboxId = req.params.id;

    // Verify vaultbox exists and user has access
    const vaultbox = await adapters.storage.findById('vaultboxes', vaultboxId);
    if (!vaultbox) {
      return res.status(404).json({ success: false, error: 'vaultbox not found' });
    }

    // Check if this is a service-to-service call or user owns the vaultbox
    const isServiceCall = req.user.id === 'backend.motorical' || req.user.id === 'motorical-backend';
    const userOwnsVaultbox = req.user.id === vaultbox.user_id;
    
    if (!isServiceCall && !userOwnsVaultbox) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    // Check if IMAP credentials already exist
    const existing = await adapters.storage.find('imap_app_credentials', { vaultbox_id: vaultboxId });
    if (existing.rows && existing.rows.length > 0) {
      const existingCred = existing.rows[0];
      return res.json({
        success: true,
        data: {
          username: existingCred.username,
          vaultbox_id: vaultboxId,
          created_at: existingCred.created_at
        }
      });
    }

    // Check if SMTP credentials already exist to use the same username
    let username;
    const existingSmtp = await adapters.storage.find('vaultbox_smtp_credentials', { vaultbox_id: vaultboxId });
    
    if (existingSmtp.rows && existingSmtp.rows.length > 0) {
      // Use existing SMTP username for IMAP to ensure they match
      username = existingSmtp.rows[0].username;
      console.log(`[EncimapAPI] Using existing SMTP username for IMAP: ${username}`);
    } else {
      // Generate new unified username
      username = generateUnifiedUsername(vaultbox.domain, vaultboxId);
    }
    
    const password = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    
    // Hash password using bcrypt
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(password, 12);

    // Create IMAP credentials
    const result = await adapters.storage.insert('imap_app_credentials', {
      user_id: vaultbox.user_id,
      vaultbox_id: vaultboxId,
      username: username,
      password_hash: passwordHash
    });

    console.log(`[EncimapAPI] Created IMAP credentials for vaultbox ${vaultboxId}: ${username}`);

    res.json({
      success: true,
      data: {
        username: username,
        password: password,  // Only returned on creation
        vaultbox_id: vaultboxId,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[EncimapAPI] Error creating IMAP credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Regenerate IMAP password for vaultbox (keep same username)
app.post('/s2s/v1/vaultboxes/:id/imap-credentials/regenerate', async (req, res) => {
  try {
    const vaultboxId = req.params.id;

    // Verify vaultbox exists and user has access
    const vaultbox = await adapters.storage.findById('vaultboxes', vaultboxId);
    if (!vaultbox) {
      return res.status(404).json({ success: false, error: 'vaultbox not found' });
    }

    // Check if this is a service-to-service call or user owns the vaultbox
    const isServiceCall = req.user.id === 'backend.motorical' || req.user.id === 'motorical-backend';
    const userOwnsVaultbox = req.user.id === vaultbox.user_id;
    
    if (!isServiceCall && !userOwnsVaultbox) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    // Check if IMAP credentials exist
    const existing = await adapters.storage.find('imap_app_credentials', { vaultbox_id: vaultboxId });
    if (!existing.rows || existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'IMAP credentials not found' });
    }

    const existingCred = existing.rows[0];
    
    // Generate new password
    const newPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    
    // Hash password using bcrypt
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password in database
    await adapters.storage.update('imap_app_credentials', 
      { 
        password_hash: passwordHash,
        updated_at: new Date().toISOString()
      },
      { vaultbox_id: vaultboxId }
    );

    console.log(`[EncimapAPI] Regenerated IMAP password for vaultbox ${vaultboxId}: ${existingCred.username}`);

    res.json({
      success: true,
      data: {
        vaultbox_id: vaultboxId,
        username: existingCred.username,
        password: newPassword // Return new plaintext password
      }
    });
  } catch (error) {
    console.error('[EncimapAPI] Error regenerating IMAP password:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get IMAP credentials for vaultbox (without password)
app.get('/s2s/v1/vaultboxes/:id/imap-credentials', async (req, res) => {
  try {
    const vaultboxId = req.params.id;

    // Verify vaultbox exists and user has access
    const vaultbox = await adapters.storage.findById('vaultboxes', vaultboxId);
    if (!vaultbox) {
      return res.status(404).json({ success: false, error: 'vaultbox not found' });
    }

    // Check if this is a service-to-service call or user owns the vaultbox
    const isServiceCall = req.user.id === 'backend.motorical' || req.user.id === 'motorical-backend';
    const userOwnsVaultbox = req.user.id === vaultbox.user_id;
    
    if (!isServiceCall && !userOwnsVaultbox) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    // Get IMAP credentials (without password)
    const result = await adapters.storage.find('imap_app_credentials', { vaultbox_id: vaultboxId });
    
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'IMAP credentials not found' });
    }

    const credentials = result.rows[0];

    res.json({
      success: true,
      data: {
        username: credentials.username,
        vaultbox_id: vaultboxId,
        created_at: credentials.created_at
      }
    });
  } catch (error) {
    console.error('[EncimapAPI] Error getting IMAP credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get latest active IMAP credentials for user (username only)
app.get('/s2s/v1/imap-credentials', async (req, res) => {
  try {
    const userId = req.query.user_id || req.user.id;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'missing user_id' });
    }

    // Check if this is a service-to-service call or user is requesting their own data
    const isServiceCall = req.user.id === 'backend.motorical' || req.user.id === 'motorical-backend';
    const userRequestingOwnData = req.user.id === userId;
    
    if (!isServiceCall && !userRequestingOwnData) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    // Get latest IMAP credentials for user
    const result = await adapters.storage.query(`
      SELECT username FROM imap_app_credentials 
      WHERE user_id = $1 
      ORDER BY created_at DESC LIMIT 1
    `, [userId]);

    const row = (result.rows && result.rows.length > 0) ? result.rows[0] : null;
    
    res.json({ 
      success: true, 
      data: row 
    });
  } catch (error) {
    console.error('[EncimapAPI] Error getting user IMAP credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// List all IMAP credentials for user
app.get('/s2s/v1/imap-credentials/list', async (req, res) => {
  try {
    const userId = req.query.user_id || req.user.id;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'missing user_id' });
    }

    // Check if this is a service-to-service call or user is requesting their own data
    const isServiceCall = req.user.id === 'backend.motorical' || req.user.id === 'motorical-backend';
    const userRequestingOwnData = req.user.id === userId;
    
    if (!isServiceCall && !userRequestingOwnData) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    // Get all IMAP credentials for user with vaultbox details
    const result = await adapters.storage.query(`
      SELECT a.username, a.created_at, a.vaultbox_id, v.domain
      FROM imap_app_credentials a
      LEFT JOIN vaultboxes v ON v.id = a.vaultbox_id
      WHERE a.user_id = $1
      ORDER BY a.created_at DESC
    `, [userId]);

    res.json({ 
      success: true, 
      data: result.rows || []
    });
  } catch (error) {
    console.error('[EncimapAPI] Error listing user IMAP credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// CERTIFICATE MANAGEMENT ENDPOINTS (EXISTING FUNCTIONALITY)
// ====================================================================

// Generate certificate using server-side OpenSSL
app.post('/s2s/v1/generate-certificate', async (req, res) => {
  try {
    const { common_name, email, organization } = req.body || {};
    if (!common_name || !email) {
      return res.status(400).json({ success: false, error: 'missing common_name or email' });
    }

    const fs = await import('fs');
    const os = await import('os');
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const run = promisify(execFile);

    const tmp = fs.mkdtempSync(os.tmpdir() + '/cert-gen-');
    const keyPath = tmp + '/private.key';
    const crtPath = tmp + '/certificate.crt';
    const configPath = tmp + '/cert.conf';
    
    // Create OpenSSL config for S/MIME certificate
    const config = `[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${common_name}
emailAddress = ${email}
O = ${organization || 'Motorical Encrypted IMAP (Self-signed)'}

[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment, dataEncipherment
extendedKeyUsage = emailProtection, clientAuth
subjectAltName = email:${email}
`;
    
    fs.writeFileSync(configPath, config);
    
    // Generate private key (2048-bit RSA)
    await run('openssl', ['genrsa', '-out', keyPath, '2048']);
    
    // Generate self-signed certificate
    await run('openssl', ['req', '-new', '-x509', '-key', keyPath, '-out', crtPath, '-days', '365', '-config', configPath]);
    
    // Read generated files
    const pemKey = fs.readFileSync(keyPath, 'utf8');
    const pemCert = fs.readFileSync(crtPath, 'utf8');
    
    // Cleanup
    try { 
      fs.rmSync(tmp, { recursive: true, force: true }); 
    } catch(_) {}
    
    console.log(`[EncimapAPI] Generated certificate for ${common_name} (${email})`);

    res.json({
      success: true,
      data: {
        private_key: pemKey,
        certificate: pemCert,
        common_name,
        email
      }
    });
  } catch (error) {
    console.error('[EncimapAPI] Certificate generation failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload certificate for vaultbox
app.post('/s2s/v1/vaultboxes/:id/certs', async (req, res) => {
  try {
    const vaultboxId = req.params.id;
    const { label, public_cert_pem } = req.body || {};

    if (!public_cert_pem) {
      return res.status(400).json({ success: false, error: 'missing certificate' });
    }

    // Verify vaultbox exists and user has access
    const vaultbox = await adapters.storage.findById('vaultboxes', vaultboxId);
    if (!vaultbox) {
      return res.status(404).json({ success: false, error: 'vaultbox not found' });
    }

    // Check permission
    const hasPermission = await adapters.auth.hasPermission(
      req.user.id, 'create', 'certificate', { vaultbox_id: vaultboxId }
    );
    if (!hasPermission && req.user.id !== vaultbox.user_id) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    // Generate certificate fingerprint (placeholder - implement proper fingerprinting)
    const fingerprint = 'sha256:' + Buffer.from(public_cert_pem).toString('base64').slice(0, 32);

    const certData = {
      vaultbox_id: vaultboxId,
      label: label || null,
      public_cert_pem,
      fingerprint_sha256: fingerprint
    };

    const result = await adapters.storage.insert('vaultbox_certs', certData);

    console.log(`[EncimapAPI] Added certificate to vaultbox ${vaultboxId}`);

    res.json({
      success: true,
      data: {
        id: result.id, 
        fingerprint: fingerprint 
      }
    });
  } catch (error) {
    console.error('[EncimapAPI] Error adding certificate:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// IMAP CREDENTIALS ENDPOINTS (EXISTING FUNCTIONALITY)
// ====================================================================

// Create IMAP credentials (one per vaultbox)
app.post('/s2s/v1/imap-credentials', async (req, res) => {
  try {
    const { user_id, vaultbox_id } = req.body || {};
    const userId = user_id || req.user.id;

    // Check permission
    const hasPermission = await adapters.auth.hasPermission(
      req.user.id, 'create', 'credentials'
    );
    if (!hasPermission) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    // For now, maintain existing IMAP credential creation logic
    // This should be updated to use adapters, but keeping existing functionality
    // TODO: Refactor to use proper IMAP credential service

    res.json({ success: true, message: 'IMAP credentials endpoint - TODO: implement with adapters' });
  } catch (error) {
    console.error('[EncimapAPI] Error creating IMAP credentials:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate P12 bundle from PEM key and certificate
app.post('/s2s/v1/p12', async (req, res) => {
  try {
    const { pem_key, pem_cert, password, friendly_name } = req.body || {};
    if (!pem_key || !pem_cert || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'missing pem_key, pem_cert or password' });
    }

    const fs = await import('fs');
    const os = await import('os');
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const run = promisify(execFile);

    const tmp = fs.mkdtempSync(os.tmpdir() + '/p12-');
    const keyPath = tmp + '/key.pem';
    const crtPath = tmp + '/cert.pem';
    const outPath = tmp + '/bundle.p12';
    
    fs.writeFileSync(keyPath, pem_key);
    fs.writeFileSync(crtPath, pem_cert);
    
    const name = friendly_name || 'Encrypted IMAP';
    await run('openssl', ['pkcs12', '-export', '-inkey', keyPath, '-in', crtPath, '-name', name, '-passout', `pass:${password}`, '-out', outPath]);
    
    const buf = fs.readFileSync(outPath);
    
    res.setHeader('Content-Type', 'application/x-pkcs12');
    res.setHeader('Content-Disposition', 'attachment; filename="encrypted-imap.p12"');
    res.end(buf);
    
    try { 
      fs.rmSync(tmp, { recursive: true, force: true }); 
    } catch(_) {}
    
    console.log(`[EncimapAPI] Generated P12 bundle: ${name}`);
  } catch (error) {
    console.error('[EncimapAPI] P12 generation failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate ZIP bundle containing P12 and PEM files
app.post('/s2s/v1/bundle', async (req, res) => {
  try {
    const { pem_key, pem_cert, password, friendly_name } = req.body || {};
    if (!pem_key || !pem_cert || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'missing pem_key, pem_cert or password' });
    }

    const fs = await import('fs');
    const os = await import('os');
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const run = promisify(execFile);
    const JSZip = (await import('jszip')).default;

    const zip = new JSZip();
    const tmp = fs.mkdtempSync(os.tmpdir() + '/bundle-');
    const keyPath = tmp + '/key.pem';
    const crtPath = tmp + '/cert.pem';
    const outPath = tmp + '/bundle.p12';
    
    fs.writeFileSync(keyPath, pem_key);
    fs.writeFileSync(crtPath, pem_cert);
    
    const name = friendly_name || 'Encrypted IMAP';
    await run('openssl', ['pkcs12', '-export', '-inkey', keyPath, '-in', crtPath, '-name', name, '-passout', `pass:${password}`, '-out', outPath]);
    const p12Buffer = fs.readFileSync(outPath);
    
    // Add files to ZIP
    zip.file('encrypted-imap.p12', p12Buffer);
    zip.file('smime.crt', pem_cert);
    zip.file('README.txt', `Encrypted IMAP Certificate Bundle

Generated: ${new Date().toISOString()}
Password for P12: ${password}

Files included:
- encrypted-imap.p12: PKCS#12 bundle for mail client installation
- smime.crt: S/MIME certificate for encryption

Installation:
1. Install encrypted-imap.p12 in your mail client (iOS Mail, Apple Mail, Outlook, Thunderbird)
2. Import smime.crt for S/MIME encryption
3. Configure IMAP: mail.motorical.com:993 (SSL/TLS)

Support: https://motorical.com/docs/encrypted-imap
`);

    const zipBuffer = await zip.generateAsync({ 
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="encrypted-imap-bundle.zip"');
    res.end(zipBuffer);
    
    try { 
      fs.rmSync(tmp, { recursive: true, force: true }); 
    } catch(_) {}
    
    console.log(`[EncimapAPI] Generated certificate bundle: ${name}`);
  } catch (error) {
    console.error('[EncimapAPI] Bundle generation failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// DOMAIN MANAGEMENT ENDPOINTS
// ====================================================================

// Register domain for encrypted IMAP
app.post('/s2s/v1/domains', async (req, res) => {
  try {
    const { user_id, domain, name, alias } = req.body || {};
    const userId = user_id || req.user.id;

    if (!domain) {
      return res.status(400).json({ success: false, error: 'missing domain' });
    }

    // Check permission
    const hasPermission = await adapters.auth.hasPermission(
      req.user.id, 'create', 'domain'
    );
    if (!hasPermission) {
      return res.status(403).json({ success: false, error: 'access denied' });
    }

    const domainLower = domain.toLowerCase();

    // Verify user owns the domain
    const userDomains = await adapters.user.getUserDomains(userId);
    const validDomain = userDomains.find(d => d.domain.toLowerCase() === domainLower && d.verified);
    
    if (!validDomain) {
      return res.status(400).json({ success: false, error: 'domain not verified for user' });
    }

    // Check if vaultbox already exists for this domain
    const existingVaultbox = await adapters.storage.find('vaultboxes', {
      user_id: userId,
      domain: domainLower
    }, { limit: 1 });

    let vaultboxId;
    if (existingVaultbox.rows.length > 0) {
      vaultboxId = existingVaultbox.rows[0].id;
    } else {
      // Create new vaultbox
      const vaultboxData = {
        user_id: userId,
        domain: domainLower,
        name: name || domainLower,
        status: 'active',
        smtp_enabled: false
      };

      const result = await adapters.storage.insert('vaultboxes', vaultboxData);
      vaultboxId = result.id;
    }

    // Set up MTA routing
    try {
      await adapters.mta.addDomainRoute(domainLower, vaultboxId, {
        priority: 10,
        route_type: 'encrypted_imap'
      });
    } catch (mtaError) {
      console.warn('[EncimapAPI] MTA routing setup failed:', mtaError.message);
    }

    res.json({
      success: true,
      data: {
        vaultbox_id: vaultboxId,
        domain: domainLower 
      }
    });
  } catch (error) {
    console.error('[EncimapAPI] Error registering domain:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// ADMINISTRATION AND MONITORING
// ====================================================================

// Get adapter status (admin only)
app.get('/s2s/v1/admin/adapters/status', async (req, res) => {
  try {
    // Check admin permission
    const hasPermission = await adapters.auth.hasPermission(
      req.user.id, 'read', 'system'
    );
    if (!hasPermission) {
      return res.status(403).json({ success: false, error: 'admin access required' });
    }

    const adapterHealth = {};
    for (const [name, adapter] of Object.entries(adapters)) {
      try {
        adapterHealth[name] = await adapter.healthCheck();
      } catch (error) {
        adapterHealth[name] = { healthy: false, error: error.message };
      }
    }

    res.json({ success: true, data: adapterHealth });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====================================================================
// HELPER FUNCTIONS FOR UNIFIED USERNAME GENERATION
// ====================================================================

/**
 * Generate a unified username for both IMAP and SMTP credentials
 * Format: encimap-{domain-with-hyphens}-{random-suffix}
 * This ensures both IMAP and SMTP use the same standardized format
 */
function generateUnifiedUsername(domain, vaultboxId) {
  // Normalize domain (replace dots with hyphens, remove special chars)
  const normalizedDomain = domain
    .toLowerCase()
    .replace(/\./g, '-')
    .replace(/[^a-z0-9\-]/g, '');
  
  // Generate a short random suffix for uniqueness
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  
  // Create unified username format
  const username = `encimap-${normalizedDomain}-${randomSuffix}`;
  
  console.log(`[EncimapAPI] Generated unified username: ${username} for domain: ${domain}`);
  return username;
}

// Start server
const PORT = process.env.PORT || 4301;

// Initialize and start
initializeServer().then(() => {
  app.listen(PORT, () => {
    console.log(`[EncimapAPI] Server listening on port ${PORT} with adapter architecture`);
  });
}).catch((error) => {
  console.error('[EncimapAPI] Failed to start server:', error);
  process.exit(1);
});

export default app;
