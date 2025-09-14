/**
 * Motorical User Management Adapter Implementation
 * 
 * Concrete implementation of UserAdapter that integrates with the main
 * Motorical platform for user data, domains, and subscription management.
 */

import { UserAdapter, FEATURES, PLANS, VERIFICATION_METHODS } from '../interfaces/user.js';

export class MotoricaUserAdapter extends UserAdapter {
  constructor(config) {
    super(config);
    this.apiBaseUrl = config.apiBaseUrl || config.base_url || 'http://localhost:3001';
    this.apiToken = config.apiToken || config.api_token;
    this.storageAdapter = config.storageAdapter; // Reference to storage adapter
    this.authAdapter = config.authAdapter; // Reference to auth adapter
    
    if (!this.storageAdapter) {
      throw new Error('Storage adapter is required for Motorical user management');
    }
  }

  async getUser(userId) {
    try {
      // Query user from main Motorical database
      const result = await this.storageAdapter.findById('users', userId);
      
      if (!result) {
        throw new Error(`User ${userId} not found`);
      }

      return {
        id: result.id,
        email: result.email,
        verified: result.email_verified || false,
        created_at: result.created_at,
        plan: await this._getUserPlan(userId),
        metadata: {
          first_name: result.first_name,
          last_name: result.last_name,
          company: result.company,
          timezone: result.timezone
        },
        preferences: result.preferences || {}
      };
    } catch (error) {
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  async getUserDomains(userId) {
    try {
      // Get verified domains for this user
      const domains = await this.storageAdapter.find('domains', {
        user_id: userId,
        verified: true
      }, {
        order: 'created_at DESC'
      });

      return domains.rows.map(domain => ({
        domain: domain.domain,
        verified: domain.verified,
        dns_verified: domain.dns_configured || false,
        verification_token: null, // Don't expose tokens
        added_at: domain.created_at,
        verified_at: domain.verified_at,
        dns_records: domain.dns_records || {}
      }));
    } catch (error) {
      throw new Error(`Failed to get user domains: ${error.message}`);
    }
  }

  async getUserSubscription(userId) {
    try {
      // Get user's current subscription from Stripe integration
      const user = await this.getUser(userId);
      const subscription = await this.storageAdapter.find('subscriptions', {
        user_id: userId,
        status: 'active'
      }, {
        order: 'created_at DESC',
        limit: 1
      });

      const currentSub = subscription.rows[0];
      const planName = currentSub?.plan_name || 'starter';
      
      // Map plan names to feature sets and limits
      const planConfig = this._getPlanConfiguration(planName);
      
      return {
        plan: planName,
        features: planConfig.features,
        limits: planConfig.limits,
        usage: await this.getUsage(userId),
        expires_at: currentSub?.expires_at || null,
        status: currentSub?.status || 'active'
      };
    } catch (error) {
      throw new Error(`Failed to get user subscription: ${error.message}`);
    }
  }

  async updateUsage(userId, usage) {
    try {
      const now = new Date();
      
      // Update or insert usage record
      await this.storageAdapter.query(`
        INSERT INTO user_usage (user_id, messages_received, storage_used_bytes, domains_used, api_calls, last_activity, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id) DO UPDATE SET
          messages_received = COALESCE(user_usage.messages_received, 0) + COALESCE($2, 0),
          storage_used_bytes = COALESCE($3, user_usage.storage_used_bytes),
          domains_used = COALESCE($4, user_usage.domains_used),
          api_calls = COALESCE(user_usage.api_calls, 0) + COALESCE($5, 0),
          last_activity = COALESCE($6, user_usage.last_activity),
          updated_at = $7
      `, [
        userId,
        usage.messages_received || 0,
        usage.storage_used_bytes || null,
        usage.domains_used || null,
        usage.api_calls || 0,
        usage.last_activity || now,
        now
      ]);

      return true;
    } catch (error) {
      throw new Error(`Failed to update usage: ${error.message}`);
    }
  }

  async hasFeature(userId, feature) {
    try {
      const subscription = await this.getUserSubscription(userId);
      return subscription.features[feature] === true;
    } catch (error) {
      console.error(`Failed to check feature ${feature} for user ${userId}:`, error);
      return false; // Fail secure
    }
  }

  async getUsage(userId) {
    try {
      // Get current usage statistics
      const usageResult = await this.storageAdapter.find('user_usage', {
        user_id: userId
      }, { limit: 1 });

      const usage = usageResult.rows[0] || {};

      // Get period usage (current month)
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const periodUsage = await this.storageAdapter.query(`
        SELECT 
          COUNT(*) as messages_this_month,
          SUM(size_bytes) as storage_this_month
        FROM messages m
        JOIN vaultboxes v ON m.vaultbox_id = v.id
        WHERE v.user_id = $1 AND m.received_at >= $2
      `, [userId, startOfMonth]);

      const period = periodUsage.rows[0] || {};

      // Get current limits from subscription
      const subscription = await this.getUserSubscription(userId);

      return {
        messages_received: parseInt(usage.messages_received || 0),
        storage_used_bytes: parseInt(usage.storage_used_bytes || 0),
        domains_used: parseInt(usage.domains_used || 0),
        api_calls_today: parseInt(usage.api_calls || 0),
        last_activity: usage.last_activity,
        limits: subscription.limits,
        period_usage: {
          messages_this_month: parseInt(period.messages_this_month || 0),
          storage_this_month: parseInt(period.storage_this_month || 0),
          period_start: startOfMonth,
          period_end: new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0)
        }
      };
    } catch (error) {
      throw new Error(`Failed to get usage: ${error.message}`);
    }
  }

  async verifyDomain(userId, domain) {
    try {
      // Check if domain is already verified
      const existingDomain = await this.storageAdapter.find('domains', {
        user_id: userId,
        domain: domain.toLowerCase()
      }, { limit: 1 });

      if (!existingDomain.rows.length) {
        return {
          verified: false,
          dns_configured: false,
          error: 'Domain not found in user account'
        };
      }

      const domainRecord = existingDomain.rows[0];

      if (domainRecord.verified) {
        return {
          verified: true,
          dns_configured: domainRecord.dns_configured || false,
          verification_method: VERIFICATION_METHODS.DNS_TXT,
          verified_at: domainRecord.verified_at
        };
      }

      // Perform DNS verification (would integrate with DNS checking service)
      const dnsCheck = await this._checkDNSVerification(domain, domainRecord.verification_token);

      if (dnsCheck.verified) {
        // Update domain as verified
        await this.storageAdapter.update('domains', 
          { 
            verified: true, 
            verified_at: new Date(),
            dns_configured: dnsCheck.dns_configured 
          },
          { id: domainRecord.id }
        );

        return {
          verified: true,
          dns_configured: dnsCheck.dns_configured,
          verification_method: VERIFICATION_METHODS.DNS_TXT,
          verified_at: new Date()
        };
      }

      return {
        verified: false,
        dns_configured: false,
        missing_records: dnsCheck.missing_records || [],
        verification_method: VERIFICATION_METHODS.DNS_TXT
      };
    } catch (error) {
      throw new Error(`Domain verification failed: ${error.message}`);
    }
  }

  async addDomain(userId, domain) {
    try {
      const normalizedDomain = domain.toLowerCase().trim();
      
      // Check if domain already exists
      const existing = await this.storageAdapter.find('domains', {
        user_id: userId,
        domain: normalizedDomain
      }, { limit: 1 });

      if (existing.rows.length > 0) {
        return existing.rows[0];
      }

      // Generate verification token
      const verificationToken = this._generateVerificationToken();

      // Add domain to database
      const result = await this.storageAdapter.insert('domains', {
        user_id: userId,
        domain: normalizedDomain,
        verified: false,
        verification_token: verificationToken,
        verification_method: VERIFICATION_METHODS.DNS_TXT,
        created_at: new Date()
      });

      return {
        domain: normalizedDomain,
        verified: false,
        dns_verified: false,
        verification_token: verificationToken,
        added_at: new Date(),
        dns_records: {
          txt: `_motorical-verification.${normalizedDomain}`,
          value: verificationToken
        }
      };
    } catch (error) {
      throw new Error(`Failed to add domain: ${error.message}`);
    }
  }

  async removeDomain(userId, domain) {
    try {
      const result = await this.storageAdapter.delete('domains', {
        user_id: userId,
        domain: domain.toLowerCase()
      });

      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to remove domain: ${error.message}`);
    }
  }

  async healthCheck() {
    const startTime = Date.now();
    
    try {
      // Test database connectivity via storage adapter
      await this.storageAdapter.query('SELECT 1');
      
      // Test user table access
      const userCount = await this.storageAdapter.count('users');
      
      return {
        healthy: true,
        latency_ms: Date.now() - startTime,
        details: {
          adapter_type: 'MotoricaUserAdapter',
          storage_connected: true,
          user_count: userCount,
          api_base_url: this.apiBaseUrl
        }
      };
    } catch (error) {
      return {
        healthy: false,
        latency_ms: Date.now() - startTime,
        details: {
          adapter_type: 'MotoricaUserAdapter',
          error: error.message,
          storage_connected: false
        }
      };
    }
  }

  // Private helper methods
  async _getUserPlan(userId) {
    try {
      const subscription = await this.storageAdapter.find('subscriptions', {
        user_id: userId,
        status: 'active'
      }, {
        order: 'created_at DESC',
        limit: 1
      });

      return subscription.rows[0]?.plan_name || PLANS.STARTER;
    } catch (error) {
      return PLANS.STARTER;
    }
  }

  _getPlanConfiguration(planName) {
    const plans = {
      [PLANS.FREE]: {
        features: {
          [FEATURES.ENCRYPTED_IMAP]: false,
          [FEATURES.MULTIPLE_DOMAINS]: false,
          [FEATURES.ADVANCED_RULES]: false,
          [FEATURES.WEBHOOK_SUPPORT]: false,
          [FEATURES.API_ACCESS]: true
        },
        limits: {
          domains_max: 0,
          messages_per_month: 0,
          storage_gb: 0,
          retention_days_max: 0,
          api_calls_per_hour: 100
        }
      },
      [PLANS.STARTER]: {
        features: {
          [FEATURES.ENCRYPTED_IMAP]: true,
          [FEATURES.MULTIPLE_DOMAINS]: false,
          [FEATURES.ADVANCED_RULES]: false,
          [FEATURES.WEBHOOK_SUPPORT]: false,
          [FEATURES.API_ACCESS]: true
        },
        limits: {
          domains_max: 1,
          messages_per_month: 1000,
          storage_gb: 1,
          retention_days_max: 30,
          api_calls_per_hour: 500
        }
      },
      [PLANS.PROFESSIONAL]: {
        features: {
          [FEATURES.ENCRYPTED_IMAP]: true,
          [FEATURES.MULTIPLE_DOMAINS]: true,
          [FEATURES.ADVANCED_RULES]: true,
          [FEATURES.WEBHOOK_SUPPORT]: true,
          [FEATURES.API_ACCESS]: true
        },
        limits: {
          domains_max: 5,
          messages_per_month: 10000,
          storage_gb: 10,
          retention_days_max: 365,
          api_calls_per_hour: 2000
        }
      },
      [PLANS.ENTERPRISE]: {
        features: {
          [FEATURES.ENCRYPTED_IMAP]: true,
          [FEATURES.MULTIPLE_DOMAINS]: true,
          [FEATURES.ADVANCED_RULES]: true,
          [FEATURES.WEBHOOK_SUPPORT]: true,
          [FEATURES.API_ACCESS]: true,
          [FEATURES.CUSTOM_RETENTION]: true,
          [FEATURES.BULK_OPERATIONS]: true
        },
        limits: {
          domains_max: 50,
          messages_per_month: 100000,
          storage_gb: 100,
          retention_days_max: 3650,
          api_calls_per_hour: 10000
        }
      }
    };

    return plans[planName] || plans[PLANS.STARTER];
  }

  _generateVerificationToken() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  async _checkDNSVerification(domain, verificationToken) {
    // This would integrate with actual DNS checking
    // For now, return a mock response
    try {
      // In reality, this would use DNS resolution to check for TXT record
      // const txtRecord = await dns.resolveTxt(`_motorical-verification.${domain}`);
      
      return {
        verified: false, // Would be true if TXT record matches token
        dns_configured: false,
        missing_records: [`_motorical-verification.${domain} TXT ${verificationToken}`]
      };
    } catch (error) {
      return {
        verified: false,
        dns_configured: false,
        missing_records: [`_motorical-verification.${domain} TXT ${verificationToken}`],
        error: error.message
      };
    }
  }
}

export default MotoricaUserAdapter;
