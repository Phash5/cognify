/**
 * Cache Service
 * Redis-based caching service for the Database AI Agent
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
    this.connectionAttempts = 0;
    this.maxRetries = config.cache.maxRetries || 3;
    this.retryDelay = config.cache.retryDelay || 1000;
    
    // Metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      connectionErrors: 0,
      totalOperations: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
    };
    
    // Initialize Redis connection if caching is enabled
    if (config.cache.enabled) {
      this.initializeRedis();
    } else {
      logger.info('Cache service disabled');
    }
  }

  /**
   * Initialize Redis connection
   */
  async initializeRedis() {
    try {
      const redisOptions = {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        connectTimeout: 10000,
        commandTimeout: 5000,
        family: 4,
      };

      // Add TLS configuration if enabled
      if (config.redis.tls) {
        redisOptions.tls = {
          rejectUnauthorized: false,
        };
      }

      this.redis = new Redis(redisOptions);

      // Event handlers
      this.redis.on('connect', () => {
        logger.info('Redis connected', {
          host: config.redis.host,
          port: config.redis.port,
          db: config.redis.db,
        });
        this.isConnected = true;
        this.connectionAttempts = 0;
      });

      this.redis.on('ready', () => {
        logger.info('Redis ready for operations');
      });

      this.redis.on('error', (error) => {
        logger.error('Redis connection error', {
          error: error.message,
          host: config.redis.host,
          port: config.redis.port,
        });
        this.isConnected = false;
        this.metrics.connectionErrors++;
        this.metrics.errors++;
      });

      this.redis.on('close', () => {
        logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      this.redis.on('reconnecting', (delay) => {
        logger.info('Redis reconnecting', { delay });
        this.connectionAttempts++;
      });

      this.redis.on('end', () => {
        logger.warn('Redis connection ended');
        this.isConnected = false;
      });

      // Connect to Redis
      await this.redis.connect();
      
      logger.info('Cache service initialized with Redis', {
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
      });
      
    } catch (error) {
      logger.error('Failed to initialize Redis cache', {
        error: error.message,
        stack: error.stack,
      });
      this.isConnected = false;
      this.metrics.connectionErrors++;
      this.metrics.errors++;
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
    const startTime = Date.now();
    
    try {
      span.setAttributes({
        'cache.key': key,
        'cache.operation': 'get',
      });
      
      const value = await this.redis.get(key);
      const duration = Date.now() - startTime;
      
      this.updateMetrics('get', duration, value !== null);
      
      if (value !== null) {
        this.metrics.hits++;
        span.setAttributes({ 'cache.hit': true });
        
        logger.debug('Cache hit', {
          key,
          duration,
          size: value.length,
        });
        
        try {
          return JSON.parse(value);
        } catch (parseError) {
          logger.warn('Failed to parse cached value', {
            key,
            error: parseError.message,
          });
          // Delete corrupted cache entry
          await this.delete(key);
          return null;
        }
      } else {
        this.metrics.misses++;
        span.setAttributes({ 'cache.hit': false });
        
        logger.debug('Cache miss', {
          key,
          duration,
        });
        
        return null;
      }
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errors++;
      
      logger.error('Cache get operation failed', {
        key,
        error: error.message,
        duration: Date.now() - startTime,
      });
      
      return null;
    } finally {
      span.end();
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
    const startTime = Date.now();
    
    try {
      span.setAttributes({
        'cache.key': key,
        'cache.operation': 'set',
        'cache.ttl': ttl || config.cache.ttl,
      });
      
      const serializedValue = JSON.stringify(value);
      const effectiveTtl = ttl || config.cache.ttl;
      
      let result;
      if (effectiveTtl > 0) {
        result = await this.redis.setex(key, effectiveTtl, serializedValue);
      } else {
        result = await this.redis.set(key, serializedValue);
      }
      
      const duration = Date.now() - startTime;
      this.updateMetrics('set', duration, true);
      this.metrics.sets++;
      
      logger.debug('Cache set', {
        key,
        ttl: effectiveTtl,
        size: serializedValue.length,
        duration,
        result,
      });
      
      return result === 'OK';
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errors++;
      
      logger.error('Cache set operation failed', {
        key,
        ttl,
        error: error.message,
        duration: Date.now() - startTime,
      });
      
      return false;
    } finally {
      span.end();
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
    const startTime = Date.now();
    
    try {
      span.setAttributes({
        'cache.key': key,
        'cache.operation': 'delete',
      });
      
      const result = await this.redis.del(key);
      const duration = Date.now() - startTime;
      
      this.updateMetrics('delete', duration, true);
      this.metrics.deletes++;
      
      logger.debug('Cache delete', {
        key,
        duration,
        deleted: result > 0,
      });
      
      return result > 0;
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errors++;
      
      logger.error('Cache delete operation failed', {
        key,
        error: error.message,
        duration: Date.now() - startTime,
      });
      
      return false;
    } finally {
      span.end();
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async deletePattern(pattern) {
    if (!this.isEnabled()) {
      return 0;
    }

    const span = telemetryService.startSpan('cache.delete_pattern');
    const startTime = Date.now();
    
    try {
      span.setAttributes({
        'cache.pattern': pattern,
        'cache.operation': 'delete_pattern',
      });
      
      const keys = await this.redis.keys(pattern);
      
      if (keys.length === 0) {
        logger.debug('No keys found for pattern', { pattern });
        return 0;
      }
      
      const result = await this.redis.del(...keys);
      const duration = Date.now() - startTime;
      
      this.updateMetrics('delete_pattern', duration, true);
      this.metrics.deletes += result;
      
      logger.debug('Cache pattern delete', {
        pattern,
        keysFound: keys.length,
        deleted: result,
        duration,
      });
      
      return result;
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errors++;
      
      logger.error('Cache pattern delete operation failed', {
        pattern,
        error: error.message,
        duration: Date.now() - startTime,
      });
      
      return 0;
    } finally {
      span.end();
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key) {
    if (!this.isEnabled()) {
      return false;
    }

    const span = telemetryService.startSpan('cache.exists');
    const startTime = Date.now();
    
    try {
      span.setAttributes({
        'cache.key': key,
        'cache.operation': 'exists',
      });
      
      const result = await this.redis.exists(key);
      const duration = Date.now() - startTime;
      
      this.updateMetrics('exists', duration, true);
      
      logger.debug('Cache exists check', {
        key,
        exists: result === 1,
        duration,
      });
      
      return result === 1;
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errors++;
      
      logger.error('Cache exists operation failed', {
        key,
        error: error.message,
        duration: Date.now() - startTime,
      });
      
      return false;
    } finally {
      span.end();
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
      const ttl = await this.redis.ttl(key);
      
      logger.debug('Cache TTL check', {
        key,
        ttl,
      });
      
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
   * Extend TTL for a key
   */
  async extendTtl(key, ttl) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      const result = await this.redis.expire(key, ttl);
      
      logger.debug('Cache TTL extended', {
        key,
        ttl,
        success: result === 1,
      });
      
      return result === 1;
      
    } catch (error) {
      this.metrics.errors++;
      
      logger.error('Cache TTL extend operation failed', {
        key,
        ttl,
        error: error.message,
      });
      
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear() {
    if (!this.isEnabled()) {
      return false;
    }

    const span = telemetryService.startSpan('cache.clear');
    const startTime = Date.now();
    
    try {
      span.setAttributes({
        'cache.operation': 'clear',
      });
      
      const result = await this.redis.flushdb();
      const duration = Date.now() - startTime;
      
      this.updateMetrics('clear', duration, true);
      
      logger.info('Cache cleared', {
        duration,
        result,
      });
      
      return result === 'OK';
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errors++;
      
      logger.error('Cache clear operation failed', {
        error: error.message,
        duration: Date.now() - startTime,
      });
      
      return false;
    } finally {
      span.end();
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    const stats = {
      enabled: this.isEnabled(),
      connected: this.isConnected,
      metrics: { ...this.metrics },
    };
    
    if (this.isEnabled() && this.isConnected) {
      try {
        const info = await this.redis.info('memory');
        const memoryInfo = this.parseRedisInfo(info);
        
        stats.redis = {
          memory: {
            used: memoryInfo.used_memory_human,
            peak: memoryInfo.used_memory_peak_human,
            rss: memoryInfo.used_memory_rss_human,
          },
          keyspace: await this.getKeyspaceInfo(),
        };
        
      } catch (error) {
        logger.error('Failed to get Redis stats', {
          error: error.message,
        });
      }
    }
    
    // Calculate derived metrics
    stats.metrics.hitRate = this.calculateHitRate();
    stats.metrics.errorRate = this.calculateErrorRate();
    
    return stats;
  }

  /**
   * Get keyspace information
   */
  async getKeyspaceInfo() {
    try {
      const info = await this.redis.info('keyspace');
      const keyspaceInfo = this.parseRedisInfo(info);
      
      const dbKey = `db${config.redis.db}`;
      if (keyspaceInfo[dbKey]) {
        const dbInfo = keyspaceInfo[dbKey];
        const match = dbInfo.match(/keys=(\d+),expires=(\d+),avg_ttl=(\d+)/);
        
        if (match) {
          return {
            keys: parseInt(match[1], 10),
            expires: parseInt(match[2], 10),
            avgTtl: parseInt(match[3], 10),
          };
        }
      }
      
      return {
        keys: 0,
        expires: 0,
        avgTtl: 0,
      };
      
    } catch (error) {
      logger.error('Failed to get keyspace info', {
        error: error.message,
      });
      
      return {
        keys: 0,
        expires: 0,
        avgTtl: 0,
      };
    }
  }

  /**
   * Parse Redis INFO command output
   */
  parseRedisInfo(info) {
    const result = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value !== undefined) {
          result[key] = value;
        }
      }
    }
    
    return result;
  }

  /**
   * Calculate hit rate percentage
   */
  calculateHitRate() {
    const total = this.metrics.hits + this.metrics.misses;
    return total > 0 ? (this.metrics.hits / total) * 100 : 0;
  }

  /**
   * Calculate error rate percentage
   */
  calculateErrorRate() {
    return this.metrics.totalOperations > 0 ? 
      (this.metrics.errors / this.metrics.totalOperations) * 100 : 0;
  }

  /**
   * Update metrics
   */
  updateMetrics(operation, duration, success) {
    this.metrics.totalOperations++;
    this.metrics.totalResponseTime += duration;
    this.metrics.averageResponseTime = this.metrics.totalResponseTime / this.metrics.totalOperations;
    
    if (!success) {
      this.metrics.errors++;
    }
  }

  /**
   * Check if cache is enabled and connected
   */
  isEnabled() {
    return config.cache.enabled && this.isConnected && this.redis;
  }

  /**
   * Health check
   */
  async healthCheck() {
    if (!config.cache.enabled) {
      return {
        status: 'disabled',
        message: 'Cache service is disabled',
      };
    }
    
    if (!this.isConnected || !this.redis) {
      return {
        status: 'unhealthy',
        message: 'Redis connection not available',
        connectionAttempts: this.connectionAttempts,
      };
    }
    
    try {
      const startTime = Date.now();
      const result = await this.redis.ping();
      const responseTime = Date.now() - startTime;
      
      if (result === 'PONG') {
        return {
          status: 'healthy',
          message: 'Redis connection is healthy',
          responseTime,
          metrics: this.metrics,
        };
      } else {
        return {
          status: 'unhealthy',
          message: 'Redis ping failed',
          response: result,
        };
      }
      
    } catch (error) {
      this.metrics.errors++;
      
      return {
        status: 'unhealthy',
        message: 'Redis health check failed',
        error: error.message,
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.redis) {
      try {
        logger.info('Shutting down cache service');
        await this.redis.quit();
        this.isConnected = false;
        logger.info('Cache service shutdown complete');
      } catch (error) {
        logger.error('Error during cache service shutdown', {
          error: error.message,
        });
      }
    }
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      connectionErrors: 0,
      totalOperations: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
    };
    
    logger.info('Cache metrics reset');
  }
}

module.exports = { CacheService };