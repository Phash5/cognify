/**
 * Cache Service for Frontend AI Agent
 * Handles Redis caching operations and in-memory fallback
 */

'use strict';

const Redis = require('ioredis');
const NodeCache = require('node-cache');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const telemetryService = require('./telemetryService');

class CacheService {
  constructor() {
    this.redis = null;
    this.memoryCache = null;
    this.isRedisConnected = false;
    this.useMemoryFallback = true;
    
    // Cache configuration
    this.config = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB) || 0,
        keyPrefix: process.env.REDIS_KEY_PREFIX || 'frontend-agent:',
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        connectTimeout: 10000,
        commandTimeout: 5000,
      },
      memory: {
        stdTTL: 600, // 10 minutes default TTL
        checkperiod: 120, // Check for expired keys every 2 minutes
        useClones: false,
        maxKeys: 1000,
      },
      defaultTTL: 3600, // 1 hour
      maxValueSize: 1024 * 1024, // 1MB
    };
    
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    };
  }

  /**
   * Initialize cache service
   */
  async initialize() {
    try {
      // Initialize memory cache as fallback
      this.memoryCache = new NodeCache(this.config.memory);
      
      // Set up memory cache event listeners
      this.memoryCache.on('set', (key, value) => {
        logger.cache('set', key, false, { backend: 'memory', size: JSON.stringify(value).length });
      });
      
      this.memoryCache.on('del', (key, value) => {
        logger.cache('delete', key, false, { backend: 'memory' });
      });
      
      this.memoryCache.on('expired', (key, value) => {
        logger.cache('expire', key, false, { backend: 'memory' });
      });

      // Try to initialize Redis
      if (process.env.REDIS_ENABLED !== 'false') {
        await this.initializeRedis();
      }

      logger.lifecycle('cache_initialized', {
        redisEnabled: this.isRedisConnected,
        memoryFallback: this.useMemoryFallback,
        defaultTTL: this.config.defaultTTL,
      });
    } catch (error) {
      logger.logError(error, { component: 'cache', operation: 'initialize' });
      throw error;
    }
  }

  /**
   * Initialize Redis connection
   */
  async initializeRedis() {
    try {
      this.redis = new Redis(this.config.redis);
      
      // Set up Redis event listeners
      this.redis.on('connect', () => {
        this.isRedisConnected = true;
        logger.info('Redis connected successfully');
      });
      
      this.redis.on('ready', () => {
        logger.info('Redis ready for operations');
      });
      
      this.redis.on('error', (error) => {
        this.isRedisConnected = false;
        logger.logError(error, { component: 'redis', operation: 'connection' });
        this.stats.errors++;
      });
      
      this.redis.on('close', () => {
        this.isRedisConnected = false;
        logger.warn('Redis connection closed');
      });
      
      this.redis.on('reconnecting', () => {
        logger.info('Redis reconnecting...');
      });

      // Test connection
      await this.redis.ping();
      this.isRedisConnected = true;
      
      logger.info('Redis initialized successfully', {
        host: this.config.redis.host,
        port: this.config.redis.port,
        db: this.config.redis.db,
      });
    } catch (error) {
      this.isRedisConnected = false;
      logger.warn('Redis initialization failed, using memory cache only', {
        error: error.message,
      });
    }
  }

  /**
   * Get value from cache
   */
  async get(key) {
    const requestId = uuidv4();
    const requestLogger = logger.addRequestId(requestId);

    return telemetryService.withSpan('cache.get', async (span) => {
      try {
        const normalizedKey = this.normalizeKey(key);
        
        span.setAttributes({
          'cache.key': normalizedKey,
          'cache.backend': this.isRedisConnected ? 'redis' : 'memory',
        });

        let value = null;
        let backend = 'none';

        // Try Redis first if available
        if (this.isRedisConnected) {
          try {
            const redisValue = await this.redis.get(normalizedKey);
            if (redisValue !== null) {
              value = JSON.parse(redisValue);
              backend = 'redis';
            }
          } catch (error) {
            requestLogger.logError(error, { operation: 'redis_get', key: normalizedKey });
            this.stats.errors++;
          }
        }

        // Fallback to memory cache
        if (value === null && this.useMemoryFallback) {
          value = this.memoryCache.get(normalizedKey);
          if (value !== undefined) {
            backend = 'memory';
          }
        }

        const hit = value !== null && value !== undefined;
        
        if (hit) {
          this.stats.hits++;
          requestLogger.cache('get', normalizedKey, true, { backend });
          telemetryService.recordCacheOperation('get', normalizedKey, true, { backend });
        } else {
          this.stats.misses++;
          requestLogger.cache('get', normalizedKey, false, { backend: 'none' });
          telemetryService.recordCacheOperation('get', normalizedKey, false);
        }

        return value;
      } catch (error) {
        requestLogger.logError(error, { operation: 'cache_get', key });
        this.stats.errors++;
        telemetryService.recordError('cache_get_error', error.code || 'unknown');
        return null;
      }
    });
  }

  /**
   * Set value in cache
   */
  async set(key, value, ttl = null) {
    const requestId = uuidv4();
    const requestLogger = logger.addRequestId(requestId);

    return telemetryService.withSpan('cache.set', async (span) => {
      try {
        const normalizedKey = this.normalizeKey(key);
        const effectiveTTL = ttl || this.config.defaultTTL;
        const serializedValue = JSON.stringify(value);
        
        // Check value size
        if (serializedValue.length > this.config.maxValueSize) {
          throw new Error(`Value too large: ${serializedValue.length} bytes (max: ${this.config.maxValueSize})`);
        }
        
        span.setAttributes({
          'cache.key': normalizedKey,
          'cache.ttl': effectiveTTL,
          'cache.value_size': serializedValue.length,
          'cache.backend': this.isRedisConnected ? 'redis' : 'memory',
        });

        let success = false;
        const backends = [];

        // Set in Redis if available
        if (this.isRedisConnected) {
          try {
            await this.redis.setex(normalizedKey, effectiveTTL, serializedValue);
            backends.push('redis');
            success = true;
          } catch (error) {
            requestLogger.logError(error, { operation: 'redis_set', key: normalizedKey });
            this.stats.errors++;
          }
        }

        // Set in memory cache as backup/fallback
        if (this.useMemoryFallback) {
          try {
            this.memoryCache.set(normalizedKey, value, effectiveTTL);
            backends.push('memory');
            success = true;
          } catch (error) {
            requestLogger.logError(error, { operation: 'memory_set', key: normalizedKey });
            this.stats.errors++;
          }
        }

        if (success) {
          this.stats.sets++;
          requestLogger.cache('set', normalizedKey, false, {
            backends: backends.join(','),
            ttl: effectiveTTL,
            size: serializedValue.length,
          });
          telemetryService.recordCacheOperation('set', normalizedKey, false, {
            backends: backends.join(','),
          });
        }

        return success;
      } catch (error) {
        requestLogger.logError(error, { operation: 'cache_set', key });
        this.stats.errors++;
        telemetryService.recordError('cache_set_error', error.code || 'unknown');
        return false;
      }
    });
  }

  /**
   * Delete value from cache
   */
  async delete(key) {
    const requestId = uuidv4();
    const requestLogger = logger.addRequestId(requestId);

    return telemetryService.withSpan('cache.delete', async (span) => {
      try {
        const normalizedKey = this.normalizeKey(key);
        
        span.setAttributes({
          'cache.key': normalizedKey,
          'cache.operation': 'delete',
        });

        let success = false;
        const backends = [];

        // Delete from Redis if available
        if (this.isRedisConnected) {
          try {
            const result = await this.redis.del(normalizedKey);
            if (result > 0) {
              backends.push('redis');
              success = true;
            }
          } catch (error) {
            requestLogger.logError(error, { operation: 'redis_delete', key: normalizedKey });
            this.stats.errors++;
          }
        }

        // Delete from memory cache
        if (this.useMemoryFallback) {
          try {
            const result = this.memoryCache.del(normalizedKey);
            if (result > 0) {
              backends.push('memory');
              success = true;
            }
          } catch (error) {
            requestLogger.logError(error, { operation: 'memory_delete', key: normalizedKey });
            this.stats.errors++;
          }
        }

        if (success) {
          this.stats.deletes++;
          requestLogger.cache('delete', normalizedKey, false, {
            backends: backends.join(','),
          });
          telemetryService.recordCacheOperation('delete', normalizedKey, false, {
            backends: backends.join(','),
          });
        }

        return success;
      } catch (error) {
        requestLogger.logError(error, { operation: 'cache_delete', key });
        this.stats.errors++;
        telemetryService.recordError('cache_delete_error', error.code || 'unknown');
        return false;
      }
    });
  }

  /**
   * Check if key exists in cache
   */
  async exists(key) {
    try {
      const normalizedKey = this.normalizeKey(key);
      
      // Check Redis first if available
      if (this.isRedisConnected) {
        try {
          const result = await this.redis.exists(normalizedKey);
          if (result > 0) return true;
        } catch (error) {
          logger.logError(error, { operation: 'redis_exists', key: normalizedKey });
        }
      }

      // Check memory cache
      if (this.useMemoryFallback) {
        return this.memoryCache.has(normalizedKey);
      }

      return false;
    } catch (error) {
      logger.logError(error, { operation: 'cache_exists', key });
      return false;
    }
  }

  /**
   * Get multiple values from cache
   */
  async mget(keys) {
    const results = {};
    
    for (const key of keys) {
      results[key] = await this.get(key);
    }
    
    return results;
  }

  /**
   * Set multiple values in cache
   */
  async mset(keyValuePairs, ttl = null) {
    const results = {};
    
    for (const [key, value] of Object.entries(keyValuePairs)) {
      results[key] = await this.set(key, value, ttl);
    }
    
    return results;
  }

  /**
   * Clear all cache entries
   */
  async clear() {
    try {
      let success = false;
      
      // Clear Redis if available
      if (this.isRedisConnected) {
        try {
          await this.redis.flushdb();
          success = true;
        } catch (error) {
          logger.logError(error, { operation: 'redis_clear' });
        }
      }

      // Clear memory cache
      if (this.useMemoryFallback) {
        this.memoryCache.flushAll();
        success = true;
      }

      if (success) {
        logger.info('Cache cleared successfully');
      }

      return success;
    } catch (error) {
      logger.logError(error, { operation: 'cache_clear' });
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const memoryStats = this.memoryCache ? {
      keys: this.memoryCache.keys().length,
      size: this.memoryCache.getStats(),
    } : null;

    return {
      ...this.stats,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      backends: {
        redis: {
          connected: this.isRedisConnected,
          host: this.config.redis.host,
          port: this.config.redis.port,
        },
        memory: memoryStats,
      },
      uptime: process.uptime(),
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const isHealthy = this.isRedisConnected || this.useMemoryFallback;
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      redis: {
        connected: this.isRedisConnected,
        host: this.config.redis.host,
        port: this.config.redis.port,
      },
      memory: {
        enabled: this.useMemoryFallback,
        keys: this.memoryCache ? this.memoryCache.keys().length : 0,
      },
      stats: this.getStats(),
    };
  }

  /**
   * Normalize cache key
   */
  normalizeKey(key) {
    if (typeof key !== 'string') {
      key = JSON.stringify(key);
    }
    
    // Remove any existing prefix and add our own
    const cleanKey = key.replace(/^[^:]*:/, '');
    return `${this.config.redis.keyPrefix}${cleanKey}`;
  }

  /**
   * Create cache key from components
   */
  createKey(...components) {
    return components
      .filter(c => c !== null && c !== undefined)
      .map(c => typeof c === 'string' ? c : JSON.stringify(c))
      .join(':');
  }

  /**
   * Shutdown cache service
   */
  async shutdown() {
    try {
      if (this.redis && this.isRedisConnected) {
        await this.redis.quit();
        this.isRedisConnected = false;
      }
      
      if (this.memoryCache) {
        this.memoryCache.close();
      }
      
      logger.lifecycle('cache_shutdown');
    } catch (error) {
      logger.logError(error, { component: 'cache', operation: 'shutdown' });
    }
  }
}

module.exports = new CacheService();