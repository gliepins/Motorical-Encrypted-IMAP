/**
 * Vaultbox SMTP Credentials Service
 * 
 * Dedicated service for managing simple SMTP credentials for encrypted IMAP vaultboxes.
 * This is separate from the full MotorBlock system to maintain clean architecture.
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';

export class VaultboxSmtpService {
  constructor(storageAdapter) {
    this.storage = storageAdapter;
    this.saltRounds = 12; // Same as main platform for consistency
  }

  /**
   * Create SMTP credentials for a vaultbox
   */
  async createCredentials(vaultboxId, options = {}) {
    try {
      // Get vaultbox info for username generation
      const vaultbox = await this.storage.findById('vaultboxes', vaultboxId);
      if (!vaultbox) {
        throw new Error(`Vaultbox ${vaultboxId} not found`);
      }

      // Check if credentials already exist
      const existing = await this.storage.find('vaultbox_smtp_credentials', {
        vaultbox_id: vaultboxId
      }, { limit: 1 });

      if (existing.rows.length > 0) {
        throw new Error('SMTP credentials already exist for this vaultbox');
      }

      // Generate username and password
      const username = await this._generateUsername(vaultbox.domain, vaultboxId);
      const password = this._generatePassword();
      const passwordHash = await bcrypt.hash(password, this.saltRounds);

      // Create credentials record
      const credentialsData = {
        vaultbox_id: vaultboxId,
        username,
        password_hash: passwordHash,
        host: options.host || 'mail.motorical.com',
        port: options.port || 587,
        security_type: options.securityType || 'STARTTLS',
        enabled: true
      };

      const result = await this.storage.insert('vaultbox_smtp_credentials', credentialsData);

      // Update vaultbox to mark SMTP as enabled
      await this.storage.update('vaultboxes', 
        { smtp_enabled: true }, 
        { id: vaultboxId }
      );

      console.log(`[VaultboxSmtp] Created credentials for vaultbox ${vaultboxId}: ${username}`);

      return {
        id: result.id,
        vaultbox_id: vaultboxId,
        username,
        password, // Return plaintext password only on creation
        host: credentialsData.host,
        port: credentialsData.port,
        security_type: credentialsData.security_type,
        created_at: new Date()
      };
    } catch (error) {
      throw new Error(`Failed to create SMTP credentials: ${error.message}`);
    }
  }

  /**
   * Get SMTP credentials for a vaultbox (without password)
   */
  async getCredentials(vaultboxId) {
    try {
      const result = await this.storage.find('vaultbox_smtp_credentials', {
        vaultbox_id: vaultboxId,
        enabled: true
      }, { limit: 1 });

      if (result.rows.length === 0) {
        return null;
      }

      const creds = result.rows[0];
      return {
        id: creds.id,
        vaultbox_id: creds.vaultbox_id,
        username: creds.username,
        host: creds.host,
        port: creds.port,
        security_type: creds.security_type,
        created_at: creds.created_at,
        updated_at: creds.updated_at,
        last_used: creds.last_used,
        messages_sent_count: creds.messages_sent_count,
        last_message_sent: creds.last_message_sent
      };
    } catch (error) {
      throw new Error(`Failed to get SMTP credentials: ${error.message}`);
    }
  }

  /**
   * Regenerate password for existing credentials
   */
  async regeneratePassword(vaultboxId) {
    try {
      const existing = await this.storage.find('vaultbox_smtp_credentials', {
        vaultbox_id: vaultboxId,
        enabled: true
      }, { limit: 1 });

      if (existing.rows.length === 0) {
        throw new Error('No SMTP credentials found for this vaultbox');
      }

      const newPassword = this._generatePassword();
      const passwordHash = await bcrypt.hash(newPassword, this.saltRounds);

      await this.storage.update('vaultbox_smtp_credentials', 
        { password_hash: passwordHash },
        { vaultbox_id: vaultboxId }
      );

      const creds = existing.rows[0];
      
      console.log(`[VaultboxSmtp] Regenerated password for ${creds.username}`);

      return {
        vaultbox_id: vaultboxId,
        username: creds.username,
        password: newPassword, // Return new plaintext password
        host: creds.host,
        port: creds.port,
        security_type: creds.security_type
      };
    } catch (error) {
      throw new Error(`Failed to regenerate password: ${error.message}`);
    }
  }

  /**
   * Validate SMTP credentials for authentication
   */
  async validateCredentials(username, password) {
    try {
      const result = await this.storage.find('vaultbox_smtp_credentials', {
        username,
        enabled: true
      }, { limit: 1 });

      if (result.rows.length === 0) {
        return { valid: false, reason: 'credentials_not_found' };
      }

      const creds = result.rows[0];
      const isValid = await bcrypt.compare(password, creds.password_hash);

      if (isValid) {
        // Update last used timestamp
        await this.storage.update('vaultbox_smtp_credentials',
          { last_used: new Date() },
          { id: creds.id }
        );

        return {
          valid: true,
          vaultbox_id: creds.vaultbox_id,
          username: creds.username,
          credentials_id: creds.id
        };
      }

      return { valid: false, reason: 'invalid_password' };
    } catch (error) {
      console.error('[VaultboxSmtp] Validation error:', error);
      return { valid: false, reason: 'validation_error' };
    }
  }

  /**
   * Record successful message sending
   */
  async recordMessageSent(credentialsId) {
    try {
      await this.storage.query(`
        UPDATE vaultbox_smtp_credentials 
        SET 
          messages_sent_count = messages_sent_count + 1,
          last_message_sent = now()
        WHERE id = $1
      `, [credentialsId]);
    } catch (error) {
      // Don't throw - this is best effort tracking
      console.warn('[VaultboxSmtp] Failed to record message sent:', error.message);
    }
  }

  /**
   * Disable SMTP credentials for a vaultbox
   */
  async disableCredentials(vaultboxId) {
    try {
      const result = await this.storage.update('vaultbox_smtp_credentials',
        { enabled: false },
        { vaultbox_id: vaultboxId }
      );

      if (result.rowCount > 0) {
        // Update vaultbox to mark SMTP as disabled
        await this.storage.update('vaultboxes', 
          { smtp_enabled: false }, 
          { id: vaultboxId }
        );
      }

      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to disable SMTP credentials: ${error.message}`);
    }
  }

  /**
   * Delete SMTP credentials for a vaultbox
   */
  async deleteCredentials(vaultboxId) {
    try {
      const result = await this.storage.delete('vaultbox_smtp_credentials', {
        vaultbox_id: vaultboxId
      });

      if (result.rowCount > 0) {
        // Update vaultbox to mark SMTP as disabled
        await this.storage.update('vaultboxes', 
          { smtp_enabled: false }, 
          { id: vaultboxId }
        );
      }

      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to delete SMTP credentials: ${error.message}`);
    }
  }

  /**
   * List all SMTP credentials for a user
   */
  async listCredentialsForUser(userId) {
    try {
      const result = await this.storage.query(`
        SELECT 
          vsc.*,
          v.domain,
          v.name as vaultbox_name
        FROM vaultbox_smtp_credentials vsc
        JOIN vaultboxes v ON vsc.vaultbox_id = v.id
        WHERE v.user_id = $1 AND vsc.enabled = true
        ORDER BY vsc.created_at DESC
      `, [userId]);

      return result.rows.map(row => ({
        id: row.id,
        vaultbox_id: row.vaultbox_id,
        vaultbox_name: row.vaultbox_name,
        domain: row.domain,
        username: row.username,
        host: row.host,
        port: row.port,
        security_type: row.security_type,
        created_at: row.created_at,
        last_used: row.last_used,
        messages_sent_count: row.messages_sent_count
      }));
    } catch (error) {
      throw new Error(`Failed to list credentials: ${error.message}`);
    }
  }

  /**
   * Get usage statistics for vaultbox SMTP
   */
  async getUsageStats(vaultboxId) {
    try {
      const result = await this.storage.find('vaultbox_smtp_credentials', {
        vaultbox_id: vaultboxId
      }, { limit: 1 });

      if (result.rows.length === 0) {
        return {
          enabled: false,
          messages_sent_count: 0,
          last_used: null,
          last_message_sent: null
        };
      }

      const creds = result.rows[0];
      return {
        enabled: creds.enabled,
        messages_sent_count: creds.messages_sent_count || 0,
        last_used: creds.last_used,
        last_message_sent: creds.last_message_sent,
        created_at: creds.created_at
      };
    } catch (error) {
      throw new Error(`Failed to get usage stats: ${error.message}`);
    }
  }

  // Private helper methods
  async _generateUsername(domain, vaultboxId) {
    try {
      // Use the database function for consistent username generation
      const result = await this.storage.query(`
        SELECT generate_vaultbox_smtp_username($1, $2) as username
      `, [domain, vaultboxId]);
      
      return result.rows[0].username;
    } catch (error) {
      // Fallback to simple generation if function fails
      console.warn('[VaultboxSmtp] Using fallback username generation');
      const domainPart = domain.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      const idPart = vaultboxId.substring(0, 8);
      return `vaultbox-${domainPart}-${idPart}`;
    }
  }

  _generatePassword(length = 24) {
    // Generate a secure random password
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%^&*_-';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      password += charset[randomIndex];
    }
    
    return password;
  }
}

export default VaultboxSmtpService;
