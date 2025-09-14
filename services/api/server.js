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

    // Add MTA routing for the domain (not per-vaultbox, per-domain)
    try {
      await adapters.mta.addDomainRoute(domainLower, vaultboxId, {
        priority: 10,
        route_type: 'encrypted_imap'
      });
    } catch (mtaError) {
      console.warn('[EncimapAPI] MTA routing setup failed:', mtaError.message);
      // Continue - vaultbox is created, routing can be fixed later
    }

    console.log(`[EncimapAPI] Created vaultbox ${vaultboxId} for domain ${domainLower}`);

    res.json({ 
      success: true, 
      data: { 
        id: vaultboxId,
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

    // Remove MTA routing for the domain
    try {
      await adapters.mta.removeDomainRoute(vaultbox.domain);
      console.log(`[EncimapAPI] Removed MTA routing for domain ${vaultbox.domain}`);
    } catch (mtaError) {
      console.warn('[EncimapAPI] MTA routing removal failed:', mtaError.message);
      // Continue - vaultbox deletion is more important
    }

    // Delete vaultbox and cascade to related data (messages, certs, smtp_credentials)
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

    // Create SMTP credentials using dedicated service
    const credentials = await vaultboxSmtpService.createCredentials(vaultboxId, {
      host,
      port,
      securityType: security_type
    });

    console.log(`[EncimapAPI] Created SMTP credentials for vaultbox ${vaultboxId}: ${credentials.username}`);

    res.json({ 
      success: true, 
      data: {
        credentials,
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

    // Check permission
    const hasPermission = await adapters.auth.hasPermission(
      req.user.id, 'update', 'credentials', { vaultbox_id: vaultboxId }
    );
    if (!hasPermission && req.user.id !== vaultbox.user_id) {
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

// ====================================================================
// CERTIFICATE MANAGEMENT ENDPOINTS (EXISTING FUNCTIONALITY)
// ====================================================================

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
