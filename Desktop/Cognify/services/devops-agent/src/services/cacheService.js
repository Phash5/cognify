/**
 * Cache Service for DevOps AI Agent
 * Handles caching of AI responses, task results, and frequently accessed data
 */

'use strict';

const Redis = require('ioredis');
const config = require('../config/config');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');

class CacheService {
  constructor() {
    this.redis = null;
    this.isConnected = false;
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      totalOperations: 0,
    };
    
    if (config.cache.enabled) {
      this.initializeRedis();
    }
    
    logger.info('Cache Service initialized', {
      enabled: config.cache.enabled,
      host: config.redis.host,
      port: config.redis.port,
    });
  }

  /**
   * Initialize Redis connection
   */
  initializeRedis() {
    try {
      const redisConfig = {
        host: config.redis.host,
        port: config.redis.port,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000,
      };
      
      if (config.redis.password) {
        redisConfig.password = config.redis.password;
      }
      
      if (config.redis.db) {
        redisConfig.db = config.redis.db;
      }
      
      this.redis = new Redis(redisConfig);
      
      this.redis.on('connect', () => {
        this.isConnected = true;
        logger.info('Redis connected successfully');
      });
      
      this.redis.on('ready', () => {
        logger.info('Redis ready for operations');
      });
      
      this.redis.on('error', (error) => {
        this.isConnected = false;
        this.metrics.errors++;
        logger.error('Redis connection error', {
          error: error.message,
          stack: error.stack,
        });
      });
      
      this.redis.on('close', () => {
        this.isConnected = false;
        logger.warn('Redis connection closed');
      });
      
      this.redis.on('reconnecting', () => {
        logger.info('Redis reconnecting...');
      });
      
    } catch (error) {
      logger.error('Failed to initialize Redis', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Get value from cache
   */
  async get(key) {
    if (!this.isEnabled()) {
      return null;
    }
    
    const span = telemetryService.startSpan('cache.get');
    
    try {
      span.setAttributes({
        'cache.key': key,
        'cache.operation': 'get',
      });
      
      this.metrics.totalOperations++;
      
      const value = await this.redis.get(this.prefixKey(key));
      
      if (value !== null) {
        this.metrics.hits++;
        span.setAttributes({ 'cache.hit': true });
        
        logger.debug('Cache hit', { key });
        
        try {
          const parsed = JSON.parse(value);
          span.end();
          return parsed;
        } catch (parseError) {
          logger.warn('Failed to parse cached value', {
            key,
            error: parseError.message,
          });
          
          // Delete corrupted cache entry
          await this.delete(key);
          span.end();
          return null;
        }
      } else {
        this.metrics.misses++;
        span.setAttributes({ 'cache.hit': false });
        
        logger.debug('Cache miss', { key });
        span.end();
        return null;
      }
      
    } catch (error) {
      this.metrics.errors++;
      span.recordException(error);
      span.end();
      
      logger.error('Cache get operation failed', {
        key,
        error: error.message,
      });
      
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key, value, ttl = null) {
    if (!this.isEnabled()) {
      return false;
    }
    
    const span = telemetryService.startSpan('cache.set');
    
    try {
      span.setAttributes({
        'cache.key': key,
        'cache.operation': 'set',
        'cache.ttl': ttl || config.cache.defaultTtl,
      });
      
      this.metrics.totalOperations++;
      this.metrics.sets++;
      
      const serialized = JSON.stringify(value);
      const prefixedKey = this.prefixKey(key);
      const cacheTtl = ttl || config.cache.defaultTtl;
      
      if (cacheTtl > 0) {
        await this.redis.setex(prefixedKey, cacheTtl, serialized);
      } else {
        await this.redis.set(prefixedKey, serialized);
      }
      
      logger.debug('Cache set', { key, ttl: cacheTtl });
      
      span.end();
      return true;
      
    } catch (error) {
      this.metrics.errors++;
      span.recordException(error);
      span.end();
      
      logger.error('Cache set operation failed', {
        key,
        error: error.message,
      });
      
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key) {
    if (!this.isEnabled()) {
      return false;
    }
    
    const span = telemetryService.startSpan('cache.delete');
    
    try {
      span.setAttributes({
        'cache.key': key,
        'cache.operation': 'delete',
      });
      
      this.metrics.totalOperations++;
      this.metrics.deletes++;
      
      const result = await this.redis.del(this.prefixKey(key));
      
      logger.debug('Cache delete', { key, deleted: result > 0 });
      
      span.setAttributes({ 'cache.deleted': result > 0 });
      span.end();
      
      return result > 0;
      
    } catch (error) {
      this.metrics.errors++;
      span.recordException(error);
      span.end();
      
      logger.error('Cache delete operation failed', {
        key,
        error: error.message,
      });
      
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key) {
    if (!this.isEnabled()) {
      return false;
    }
    
    try {
      this.metrics.totalOperations++;
      
      const result = await this.redis.exists(this.prefixKey(key));
      
      logger.debug('Cache exists check', { key, exists: result > 0 });
      
      return result > 0;
      
    } catch (error) {
      this.metrics.errors++;
      
      logger.error('Cache exists operation failed', {
        key,
        error: error.message,
      });
      
      return false;
    }
  }

  /**
   * Get TTL for a key
   */
  async getTtl(key) {
    if (!this.isEnabled()) {
      return -1;
    }
    
    try {
      this.metrics.totalOperations++;
      
      const ttl = await this.redis.ttl(this.prefixKey(key));
      
      logger.debug('Cache TTL check', { key, ttl });
      
      return ttl;
      
    } catch (error) {
      this.metrics.errors++;
      
      logger.error('Cache TTL operation failed', {
        key,
        error: error.message,
      });
      
      return -1;
    }
  }

  /**
   * Set TTL for existing key
   */
  async expire(key, ttl) {
    if (!this.isEnabled()) {
      return false;
    }
    
    try {
      this.metrics.totalOperations++;
      
      const result = await this.redis.expire(this.prefixKey(key), ttl);
      
      logger.debug('Cache expire', { key, ttl, success: result > 0 });
      
      return result > 0;
      
    } catch (error) {
      this.metrics.errors++;
      
      logger.error('Cache expire operation failed', {
        key,
        ttl,
        error: error.message,
      });
      
      return false;
    }
  }

  /**
   * Clear all cache entries with prefix
   */
  async clear(pattern = '*') {
    if (!this.isEnabled()) {
      return 0;
    }
    
    const span = telemetryService.startSpan('cache.clear');
    
    try {
      span.setAttributes({
        'cache.operation': 'clear',
        'cache.pattern': pattern,
      });
      
      this.metrics.totalOperations++;
      
      const prefixedPattern = this.prefixKey(pattern);
      const keys = await this.redis.keys(prefixedPattern);
      
      if (keys.length > 0) {
        const result = await this.redis.del(...keys);
        this.metrics.deletes += result;
        
        logger.info('Cache cleared', {
          pattern: prefixedPattern,
          keysDeleted: result,
        });
        
        span.setAttributes({ 'cache.keys_deleted': result });
        span.end();
        
        return result;
      }
      
      span.end();
      return 0;
      
    } catch (error) {
      this.metrics.errors++;
      span.recordException(error);
      span.end();
      
      logger.error('Cache clear operation failed', {
        pattern,
        error: error.message,
      });
      
      return 0;
    }
  }

  /**
   * Get multiple values from cache
   */
  async mget(keys) {
    if (!this.isEnabled() || !keys.length) {
      return {};
    }
    
    const span = telemetryService.startSpan('cache.mget');
    
    try {
      span.setAttributes({
        'cache.operation': 'mget',
        'cache.keys_count': keys.length,
      });
      
      this.metrics.totalOperations++;
      
      const prefixedKeys = keys.map(key => this.prefixKey(key));
      const values = await this.redis.mget(...prefixedKeys);
      
      const result = {};
      let hits = 0;
      
      keys.forEach((key, index) => {
        const value = values[index];
        if (value !== null) {
          try {
            result[key] = JSON.parse(value);
            hits++;
          } catch (parseError) {
            logger.warn('Failed to parse cached value in mget', {
              key,
              error: parseError.message,
            });
          }
        }
      });
      
      this.metrics.hits += hits;
      this.metrics.misses += (keys.length - hits);
      
      span.setAttributes({
        'cache.hits': hits,
        'cache.misses': keys.length - hits,
      });
      
      logger.debug('Cache mget', {
        keysRequested: keys.length,
        hits,
        misses: keys.length - hits,
      });
      
      span.end();
      return result;
      
    } catch (error) {
      this.metrics.errors++;
      span.recordException(error);
      span.end();
      
      logger.error('Cache mget operation failed', {
        keys,
        error: error.message,
      });
      
      return {};
    }
  }

  /**
   * Set multiple values in cache
   */
  async mset(keyValuePairs, ttl = null) {
    if (!this.isEnabled() || !Object.keys(keyValuePairs).length) {
      return false;
    }
    
    const span = telemetryService.startSpan('cache.mset');
    
    try {
      const keys = Object.keys(keyValuePairs);
      
      span.setAttributes({
        'cache.operation': 'mset',
        'cache.keys_count': keys.length,
        'cache.ttl': ttl || config.cache.defaultTtl,
      });
      
      this.metrics.totalOperations++;
      
      const pipeline = this.redis.pipeline();
      const cacheTtl = ttl || config.cache.defaultTtl;
      
      keys.forEach(key => {
        const prefixedKey = this.prefixKey(key);
        const serialized = JSON.stringify(keyValuePairs[key]);
        
        if (cacheTtl > 0) {
          pipeline.setex(prefixedKey, cacheTtl, serialized);
        } else {
          pipeline.set(prefixedKey, serialized);
        }
      });
      
      await pipeline.exec();
      
      this.metrics.sets += keys.length;
      
      logger.debug('Cache mset', {
        keysSet: keys.length,
        ttl: cacheTtl,
      });
      
      span.end();
      return true;
      
    } catch (error) {
      this.metrics.errors++;
      span.recordException(error);
      span.end();
      
      logger.error('Cache mset operation failed', {
        keyCount: Object.keys(keyValuePairs).length,
        error: error.message,
      });
      
      return false;
    }
  }

  /**
   * Increment a numeric value in cache
   */
  async increment(key, amount = 1) {
    if (!this.isEnabled()) {
      return null;
    }
    
    try {
      this.metrics.totalOperations++;
      
      const result = await this.redis.incrby(this.prefixKey(key), amount);
      
      logger.debug('Cache increment', { key, amount, result });
      
      return result;
      
    } catch (error) {
      this.metrics.errors++;
      
      logger.error('Cache increment operation failed', {
        key,
        amount,
        error: error.message,
      });
      
      return null;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    const stats = {
      ...this.metrics,
      hitRate: this.metrics.hits + this.metrics.misses > 0 
        ? this.metrics.hits / (this.metrics.hits + this.metrics.misses) 
        : 0,
      errorRate: this.metrics.totalOperations > 0 
        ? this.metrics.errors / this.metrics.totalOperations 
        : 0,
      enabled: this.isEnabled(),
      connected: this.isConnected,
    };
    
    if (this.isEnabled() && this.isConnected) {
      try {
        const info = await this.redis.info('memory');
        const memoryInfo = this.parseRedisInfo(info);
        
        stats.memory = {
          used: memoryInfo.used_memory_human || 'unknown',
          peak: memoryInfo.used_memory_peak_human || 'unknown',
          rss: memoryInfo.used_memory_rss_human || 'unknown',
        };
        
      } catch (error) {
        logger.warn('Failed to get Redis memory info', {
          error: error.message,
        });
      }
    }
    
    return stats;
  }

  /**
   * Health check for cache service
   */
  async healthCheck() {
    if (!this.isEnabled()) {
      return {
        status: 'disabled',
        message: 'Cache is disabled',
      };
    }
    
    try {
      const testKey = 'health_check_' + Date.now();
      const testValue = { timestamp: Date.now() };
      
      // Test set operation
      await this.set(testKey, testValue, 10);
      
      // Test get operation
      const retrieved = await this.get(testKey);
      
      if (!retrieved || retrieved.timestamp !== testValue.timestamp) {
        throw new Error('Cache data integrity check failed');
      }
      
      // Test delete operation
      await this.delete(testKey);
      
      return {
        status: 'healthy',
        message: 'Cache is working properly',
        connected: this.isConnected,
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
        connected: this.isConnected,
      };
    }
  }

  /**
   * Check if cache is enabled and connected
   */
  isEnabled() {
    return config.cache.enabled && this.redis && this.isConnected;
  }

  /**
   * Add prefix to cache key
   */
  prefixKey(key) {
    return `${config.cache.keyPrefix}:${key}`;
  }

  /**
   * Parse Redis INFO command output
   */
  parseRedisInfo(info) {
    const result = {};
    const lines = info.split('\r\n');
    
    lines.forEach(line => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key] = value;
        }
      }
    });
    
    return result;
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.redis) {
      try {
        await this.redis.quit();
        logger.info('Redis connection closed gracefully');
      } catch (error) {
        logger.error('Error closing Redis connection', {
          error: error.message,
        });
      }
    }
  }
}

module.exports = { CacheService };