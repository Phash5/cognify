import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import EventEmitter from 'eventemitter3';
import { promisify } from 'util';

/**
 * Security utility for microservices
 */
class SecurityManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      serviceName: process.env.SERVICE_NAME || 'unknown-service',
      jwtSecret: process.env.JWT_SECRET || 'default-secret-change-in-production',
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
      jwtIssuer: process.env.JWT_ISSUER || 'cognify-microservices',
      jwtAudience: process.env.JWT_AUDIENCE || 'cognify-services',
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
      apiKeyLength: parseInt(process.env.API_KEY_LENGTH) || 32,
      sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 3600000, // 1 hour
      enableRateLimit: process.env.SECURITY_RATE_LIMIT !== 'false',
      enableAuditLog: process.env.SECURITY_AUDIT_LOG !== 'false',
      enableEncryption: process.env.SECURITY_ENCRYPTION !== 'false',
      encryptionKey: process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'),
      encryptionAlgorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
      ...options
    };

    this.logger = options.logger;
    
    // Rate limiting storage
    this.rateLimits = new Map();
    
    // Session storage
    this.sessions = new Map();
    
    // API key storage
    this.apiKeys = new Map();
    
    // Permission cache
    this.permissions = new Map();
    
    // Statistics
    this.stats = {
      authentications: 0,
      authenticationSuccesses: 0,
      authenticationFailures: 0,
      authorizations: 0,
      authorizationSuccesses: 0,
      authorizationFailures: 0,
      tokensGenerated: 0,
      tokensValidated: 0,
      passwordsHashed: 0,
      dataEncrypted: 0,
      dataDecrypted: 0,
      rateLimitHits: 0,
      securityViolations: 0
    };

    // Initialize cleanup interval
    this._initializeCleanup();
  }

  /**
   * Initialize cleanup intervals
   */
  _initializeCleanup() {
    // Clean expired sessions every 5 minutes
    this.sessionCleanupInterval = setInterval(() => {
      this._cleanupExpiredSessions();
    }, 5 * 60 * 1000);

    // Clean rate limit entries every minute
    this.rateLimitCleanupInterval = setInterval(() => {
      this._cleanupRateLimits();
    }, 60 * 1000);
  }

  /**
   * Generate JWT token
   * @param {Object} payload - Token payload
   * @param {Object} options - Token options
   * @returns {Promise<string>} JWT token
   */
  async generateToken(payload, options = {}) {
    try {
      const tokenOptions = {
        expiresIn: options.expiresIn || this.options.jwtExpiresIn,
        issuer: options.issuer || this.options.jwtIssuer,
        audience: options.audience || this.options.jwtAudience,
        subject: options.subject,
        jwtid: options.jwtid || crypto.randomUUID(),
        ...options
      };

      const token = jwt.sign(payload, this.options.jwtSecret, tokenOptions);
      
      this.stats.tokensGenerated++;
      
      if (this.logger) {
        this.logger.debug('JWT token generated', {
          subject: tokenOptions.subject,
          expiresIn: tokenOptions.expiresIn,
          serviceName: this.options.serviceName
        });
      }
      
      this.emit('tokenGenerated', { payload, options: tokenOptions });
      
      return token;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to generate JWT token', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Decoded token payload
   */
  async verifyToken(token, options = {}) {
    try {
      const verifyOptions = {
        issuer: options.issuer || this.options.jwtIssuer,
        audience: options.audience || this.options.jwtAudience,
        ...options
      };

      const decoded = jwt.verify(token, this.options.jwtSecret, verifyOptions);
      
      this.stats.tokensValidated++;
      
      if (this.logger) {
        this.logger.debug('JWT token verified', {
          subject: decoded.sub,
          expiresAt: new Date(decoded.exp * 1000),
          serviceName: this.options.serviceName
        });
      }
      
      this.emit('tokenVerified', { token, decoded });
      
      return decoded;
    } catch (error) {
      if (this.logger) {
        this.logger.warn('JWT token verification failed', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      this.emit('tokenVerificationFailed', { token, error: error.message });
      
      throw error;
    }
  }

  /**
   * Hash password
   * @param {string} password - Plain text password
   * @returns {Promise<string>} Hashed password
   */
  async hashPassword(password) {
    try {
      const hash = await bcrypt.hash(password, this.options.bcryptRounds);
      
      this.stats.passwordsHashed++;
      
      if (this.logger) {
        this.logger.debug('Password hashed', {
          rounds: this.options.bcryptRounds,
          serviceName: this.options.serviceName
        });
      }
      
      return hash;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to hash password', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Verify password
   * @param {string} password - Plain text password
   * @param {string} hash - Hashed password
   * @returns {Promise<boolean>} Password match
   */
  async verifyPassword(password, hash) {
    try {
      const match = await bcrypt.compare(password, hash);
      
      if (this.logger) {
        this.logger.debug('Password verification', {
          match,
          serviceName: this.options.serviceName
        });
      }
      
      return match;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to verify password', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Generate API key
   * @param {Object} metadata - API key metadata
   * @returns {string} API key
   */
  generateApiKey(metadata = {}) {
    const apiKey = crypto.randomBytes(this.options.apiKeyLength).toString('hex');
    
    this.apiKeys.set(apiKey, {
      ...metadata,
      createdAt: Date.now(),
      lastUsed: null,
      usageCount: 0
    });
    
    if (this.logger) {
      this.logger.debug('API key generated', {
        keyId: apiKey.substring(0, 8) + '...',
        metadata,
        serviceName: this.options.serviceName
      });
    }
    
    this.emit('apiKeyGenerated', { apiKey, metadata });
    
    return apiKey;
  }

  /**
   * Validate API key
   * @param {string} apiKey - API key
   * @returns {Object|null} API key metadata
   */
  validateApiKey(apiKey) {
    const keyData = this.apiKeys.get(apiKey);
    
    if (!keyData) {
      if (this.logger) {
        this.logger.warn('Invalid API key used', {
          keyId: apiKey.substring(0, 8) + '...',
          serviceName: this.options.serviceName
        });
      }
      
      this.emit('invalidApiKey', { apiKey });
      return null;
    }
    
    // Update usage statistics
    keyData.lastUsed = Date.now();
    keyData.usageCount++;
    
    if (this.logger) {
      this.logger.debug('API key validated', {
        keyId: apiKey.substring(0, 8) + '...',
        usageCount: keyData.usageCount,
        serviceName: this.options.serviceName
      });
    }
    
    this.emit('apiKeyValidated', { apiKey, metadata: keyData });
    
    return keyData;
  }

  /**
   * Revoke API key
   * @param {string} apiKey - API key
   * @returns {boolean} Revocation success
   */
  revokeApiKey(apiKey) {
    const revoked = this.apiKeys.delete(apiKey);
    
    if (revoked && this.logger) {
      this.logger.info('API key revoked', {
        keyId: apiKey.substring(0, 8) + '...',
        serviceName: this.options.serviceName
      });
    }
    
    if (revoked) {
      this.emit('apiKeyRevoked', { apiKey });
    }
    
    return revoked;
  }

  /**
   * Encrypt data
   * @param {string} data - Data to encrypt
   * @param {string} key - Encryption key (optional)
   * @returns {Object} Encrypted data with IV and tag
   */
  encrypt(data, key = null) {
    try {
      if (!this.options.enableEncryption) {
        return { data, encrypted: false };
      }
      
      const encryptionKey = key || Buffer.from(this.options.encryptionKey, 'hex');
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.options.encryptionAlgorithm, encryptionKey, iv);
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      this.stats.dataEncrypted++;
      
      if (this.logger) {
        this.logger.debug('Data encrypted', {
          algorithm: this.options.encryptionAlgorithm,
          dataLength: data.length,
          serviceName: this.options.serviceName
        });
      }
      
      return {
        data: encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        algorithm: this.options.encryptionAlgorithm,
        encrypted: true
      };
    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to encrypt data', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Decrypt data
   * @param {Object} encryptedData - Encrypted data object
   * @param {string} key - Decryption key (optional)
   * @returns {string} Decrypted data
   */
  decrypt(encryptedData, key = null) {
    try {
      if (!encryptedData.encrypted) {
        return encryptedData.data;
      }
      
      const decryptionKey = key || Buffer.from(this.options.encryptionKey, 'hex');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');
      
      const decipher = crypto.createDecipher(encryptedData.algorithm, decryptionKey, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      this.stats.dataDecrypted++;
      
      if (this.logger) {
        this.logger.debug('Data decrypted', {
          algorithm: encryptedData.algorithm,
          serviceName: this.options.serviceName
        });
      }
      
      return decrypted;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to decrypt data', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Check rate limit
   * @param {string} identifier - Rate limit identifier (IP, user ID, etc.)
   * @param {Object} options - Rate limit options
   * @returns {Object} Rate limit status
   */
  checkRateLimit(identifier, options = {}) {
    if (!this.options.enableRateLimit) {
      return { allowed: true, remaining: Infinity, resetTime: null };
    }
    
    const {
      maxRequests = 100,
      windowMs = 60000, // 1 minute
      skipSuccessfulRequests = false,
      skipFailedRequests = false
    } = options;
    
    const now = Date.now();
    const windowStart = now - windowMs;
    
    let limitData = this.rateLimits.get(identifier);
    
    if (!limitData || limitData.resetTime <= now) {
      limitData = {
        requests: [],
        resetTime: now + windowMs
      };
      this.rateLimits.set(identifier, limitData);
    }
    
    // Remove old requests outside the window
    limitData.requests = limitData.requests.filter(time => time > windowStart);
    
    const currentRequests = limitData.requests.length;
    const allowed = currentRequests < maxRequests;
    
    if (allowed) {
      limitData.requests.push(now);
    } else {
      this.stats.rateLimitHits++;
      
      if (this.logger) {
        this.logger.warn('Rate limit exceeded', {
          identifier,
          currentRequests,
          maxRequests,
          windowMs,
          serviceName: this.options.serviceName
        });
      }
      
      this.emit('rateLimitExceeded', {
        identifier,
        currentRequests,
        maxRequests,
        resetTime: limitData.resetTime
      });
    }
    
    return {
      allowed,
      remaining: Math.max(0, maxRequests - currentRequests - (allowed ? 1 : 0)),
      resetTime: limitData.resetTime,
      totalRequests: currentRequests
    };
  }

  /**
   * Create session
   * @param {string} userId - User ID
   * @param {Object} data - Session data
   * @returns {string} Session ID
   */
  createSession(userId, data = {}) {
    const sessionId = crypto.randomUUID();
    const expiresAt = Date.now() + this.options.sessionTimeout;
    
    this.sessions.set(sessionId, {
      userId,
      data,
      createdAt: Date.now(),
      expiresAt,
      lastAccessed: Date.now()
    });
    
    if (this.logger) {
      this.logger.debug('Session created', {
        sessionId,
        userId,
        expiresAt: new Date(expiresAt),
        serviceName: this.options.serviceName
      });
    }
    
    this.emit('sessionCreated', { sessionId, userId, data });
    
    return sessionId;
  }

  /**
   * Get session
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session data
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }
    
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId);
      
      if (this.logger) {
        this.logger.debug('Expired session removed', {
          sessionId,
          serviceName: this.options.serviceName
        });
      }
      
      return null;
    }
    
    // Update last accessed time
    session.lastAccessed = Date.now();
    
    return session;
  }

  /**
   * Update session
   * @param {string} sessionId - Session ID
   * @param {Object} data - Updated session data
   * @returns {boolean} Update success
   */
  updateSession(sessionId, data) {
    const session = this.getSession(sessionId);
    
    if (!session) {
      return false;
    }
    
    Object.assign(session.data, data);
    session.lastAccessed = Date.now();
    
    if (this.logger) {
      this.logger.debug('Session updated', {
        sessionId,
        serviceName: this.options.serviceName
      });
    }
    
    this.emit('sessionUpdated', { sessionId, data });
    
    return true;
  }

  /**
   * Destroy session
   * @param {string} sessionId - Session ID
   * @returns {boolean} Destruction success
   */
  destroySession(sessionId) {
    const destroyed = this.sessions.delete(sessionId);
    
    if (destroyed && this.logger) {
      this.logger.debug('Session destroyed', {
        sessionId,
        serviceName: this.options.serviceName
      });
    }
    
    if (destroyed) {
      this.emit('sessionDestroyed', { sessionId });
    }
    
    return destroyed;
  }

  /**
   * Check user permissions
   * @param {string} userId - User ID
   * @param {string} resource - Resource name
   * @param {string} action - Action name
   * @returns {Promise<boolean>} Permission granted
   */
  async checkPermission(userId, resource, action) {
    try {
      this.stats.authorizations++;
      
      const permissionKey = `${userId}:${resource}:${action}`;
      
      // Check cache first
      if (this.permissions.has(permissionKey)) {
        const cached = this.permissions.get(permissionKey);
        
        if (cached.expiresAt > Date.now()) {
          this.stats.authorizationSuccesses += cached.granted ? 1 : 0;
          this.stats.authorizationFailures += cached.granted ? 0 : 1;
          
          return cached.granted;
        }
        
        this.permissions.delete(permissionKey);
      }
      
      // This is a placeholder - implement your permission logic here
      // You might check against a database, external service, etc.
      const granted = await this._checkUserPermission(userId, resource, action);
      
      // Cache result for 5 minutes
      this.permissions.set(permissionKey, {
        granted,
        expiresAt: Date.now() + 5 * 60 * 1000
      });
      
      this.stats.authorizationSuccesses += granted ? 1 : 0;
      this.stats.authorizationFailures += granted ? 0 : 1;
      
      if (this.logger) {
        this.logger.debug('Permission check', {
          userId,
          resource,
          action,
          granted,
          serviceName: this.options.serviceName
        });
      }
      
      this.emit('permissionChecked', { userId, resource, action, granted });
      
      return granted;
    } catch (error) {
      this.stats.authorizationFailures++;
      
      if (this.logger) {
        this.logger.error('Permission check failed', {
          userId,
          resource,
          action,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      return false;
    }
  }

  /**
   * Placeholder for permission checking logic
   * @param {string} userId - User ID
   * @param {string} resource - Resource name
   * @param {string} action - Action name
   * @returns {Promise<boolean>} Permission granted
   */
  async _checkUserPermission(userId, resource, action) {
    // Implement your permission logic here
    // This could involve checking a database, calling an external service, etc.
    
    // For now, return true for demonstration
    return true;
  }

  /**
   * Clean up expired sessions
   */
  _cleanupExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }
    
    if (cleaned > 0 && this.logger) {
      this.logger.debug('Expired sessions cleaned', {
        cleaned,
        remaining: this.sessions.size,
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Clean up old rate limit entries
   */
  _cleanupRateLimits() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [identifier, limitData] of this.rateLimits.entries()) {
      if (limitData.resetTime <= now) {
        this.rateLimits.delete(identifier);
        cleaned++;
      }
    }
    
    if (cleaned > 0 && this.logger) {
      this.logger.debug('Rate limit entries cleaned', {
        cleaned,
        remaining: this.rateLimits.size,
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Get security statistics
   * @returns {Object} Security statistics
   */
  getStats() {
    return {
      ...this.stats,
      sessions: this.sessions.size,
      apiKeys: this.apiKeys.size,
      rateLimits: this.rateLimits.size,
      permissions: this.permissions.size,
      authenticationSuccessRate: this.stats.authentications > 0 ? 
                                 this.stats.authenticationSuccesses / this.stats.authentications : 0,
      authorizationSuccessRate: this.stats.authorizations > 0 ? 
                               this.stats.authorizationSuccesses / this.stats.authorizations : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      authentications: 0,
      authenticationSuccesses: 0,
      authenticationFailures: 0,
      authorizations: 0,
      authorizationSuccesses: 0,
      authorizationFailures: 0,
      tokensGenerated: 0,
      tokensValidated: 0,
      passwordsHashed: 0,
      dataEncrypted: 0,
      dataDecrypted: 0,
      rateLimitHits: 0,
      securityViolations: 0
    };
    
    if (this.logger) {
      this.logger.debug('Security statistics reset', {
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Close security manager and cleanup resources
   */
  close() {
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
    }
    
    if (this.rateLimitCleanupInterval) {
      clearInterval(this.rateLimitCleanupInterval);
    }
    
    this.sessions.clear();
    this.apiKeys.clear();
    this.rateLimits.clear();
    this.permissions.clear();
    this.removeAllListeners();

    if (this.logger) {
      this.logger.info('Security manager closed', {
        serviceName: this.options.serviceName
      });
    }
  }
}

/**
 * Create a security manager instance
 * @param {Object} options - Configuration options
 * @returns {SecurityManager} Security manager instance
 */
export function createSecurity(options = {}) {
  return new SecurityManager(options);
}

/**
 * Default security manager instance
 */
export const defaultSecurity = createSecurity();

export default {
  SecurityManager,
  createSecurity,
  defaultSecurity
};