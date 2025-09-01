/**
 * Cache Service for Backend AI Agent
 * Provides Redis-based caching with fallback to in-memory cache
 */

'use strict';

const Redis = require('ioredis');
const NodeCache = require('node-cache');
const EventEmitter = require('events');
const config = require('../config/config');
const logger = require('../utils/logger');
const { tracer, meter } = require('../utils/telemetry');

class CacheService extends EventEmitter {
  constructor() {
    super();
    
    this.redis = null;
    this.memoryCache = null;
    this.isRedisConnected = false;
    this.useRedis = true;
    
    // Metrics
    this.metrics = {
      hits: meter.createCounter({
        name: 'backend_cache_hits_total',
        description: 'Total number of cache hits',
      }),
      misses: meter.createCounter({
        name: 'backend_cache_misses_total',
        description: 'Total number of cache misses',
      }),
      sets: meter.createCounter({
        name: 'backend_cache_sets_total',
        description: 'Total number of cache sets',
      }),
      deletes: meter.createCounter({
        name: 'backend_cache_deletes_total',
        description: 'Total number of cache deletes',
      }),
      errors: meter.createCounter({
        name: 'backend_cache_errors_total',
        description: 'Total number of cache errors',
      }),
      operations: meter.createHistogram({
        name: 'backend_cache_operation_duration_seconds',
        description: 'Duration of cache operations',
        boundaries: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      }),
    };
    
    this.initializeCache();
  }
  
  async initializeCache() {
    const span = tracer.startSpan('cache.initialize');
    
    try {
      // Initialize memory cache as fallback
      this.memoryCache = new NodeCache({
        stdTTL: config.cache.stdTTL,
        checkperiod: config.cache.checkPeriod,
        useClones: config.cache.useClones,
        deleteOnExpire: config.cache.deleteOnExpire,
        maxKeys: config.cache.maxSize,
        errorOnMissing: config.cache.errorOnMissing,
      });
      
      // Set up memory cache event listeners
      this.memoryCache.on('set', (key, value) => {
        logger.debug('Memory cache set', { key, size: JSON.stringify(value).length });
      });
      
      this.memoryCache.on('del', (key, value) => {
        logger.debug('Memory cache delete', { key });
      });
      
      this.memoryCache.on('expired', (key, value) => {
        logger.debug('Memory cache expired', { key });
      });
      
      this.memoryCache.on('flush', () => {
        logger.debug('Memory cache flushed');
      });
      
      // Try to initialize Redis
      await this.initializeRedis();
      
      span.setAttributes({
        'cache.redis_connected': this.isRedisConnected,
        'cache.memory_initialized': true,
      });
      
      logger.info('Cache service initialized', {
        redis: this.isRedisConnected,
        memory: true,
        keyPrefix: config.redis.keyPrefix,
      });
      
    } catch (error) {
      span.recordException(error);
      logger.error('Cache initialization error', { error: error.message });
      throw error;
    } finally {
      span.end();
    }
  }
  
  async initializeRedis() {
    const span = tracer.startSpan('cache.initialize_redis');
    
    try {
      this.redis = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        keyPrefix: config.redis.keyPrefix,
        connectTimeout: config.redis.connectTimeout,
        commandTimeout: config.redis.commandTimeout,
        retryDelayOnFailure: config.redis.retryDelayOnFailure,
        maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
        maxRetriesOnFailover: config.redis.maxRetriesOnFailover,
        enableOfflineQueue: config.redis.enableOfflineQueue,
        lazyConnect: config.redis.lazyConnect,
        keepAlive: config.redis.keepAlive,
        family: config.redis.family,
      });
      
      // Redis event handlers
      this.redis.on('connect', () => {
        logger.info('Redis connected');
        this.isRedisConnected = true;
        this.emit('redis:connected');
      });
      
      this.redis.on('ready', () => {
        logger.info('Redis ready');
        this.emit('redis:ready');
      });
      
      this.redis.on('error', (error) => {
        logger.error('Redis error', { error: error.message });
        this.isRedisConnected = false;
        this.metrics.errors.add(1, { type: 'redis', operation: 'connection' });
        this.emit('redis:error', error);
      });
      
      this.redis.on('close', () => {
        logger.warn('Redis connection closed');
        this.isRedisConnected = false;
        this.emit('redis:closed');
      });
      
      this.redis.on('reconnecting', () => {
        logger.info('Redis reconnecting');
        this.emit('redis:reconnecting');
      });
      
      this.redis.on('end', () => {
        logger.warn('Redis connection ended');
        this.isRedisConnected = false;
        this.emit('redis:ended');
      });
      
      // Test Redis connection
      if (config.redis.lazyConnect) {
        await this.redis.connect();
      }
      
      await this.redis.ping();
      this.isRedisConnected = true;
      
      span.setAttributes({
        'redis.host': config.redis.host,
        'redis.port': config.redis.port,
        'redis.db': config.redis.db,
        'redis.connected': true,
      });
      
    } catch (error) {
      logger.warn('Redis initialization failed, using memory cache only', {
        error: error.message,
      });
      
      this.isRedisConnected = false;
      this.useRedis = false;
      
      span.recordException(error);
      span.setAttributes({
        'redis.connected': false,
        'redis.error': error.message,
      });
      
      // Don't throw error, fall back to memory cache
    } finally {
      span.end();
    }
  }
  
  async get(key) {
    const span = tracer.startSpan('cache.get');
    const startTime = Date.now();
    
    try {
      span.setAttributes({ 'cache.key': key });
      
      let value = null;
      let source = 'none';
      
      // Try Redis first if available
      if (this.isRedisConnected && this.useRedis) {
        try {
          const redisValue = await this.redis.get(key);
          if (redisValue !== null) {
            value = JSON.parse(redisValue);
            source = 'redis';
          }
        } catch (error) {
          logger.warn('Redis get error, falling back to memory cache', {
            key,
            error: error.message,
          });
          this.metrics.errors.add(1, { type: 'redis', operation: 'get' });
        }
      }
      
      // Fall back to memory cache
      if (value === null) {
        value = this.memoryCache.get(key);
        if (value !== undefined) {
          source = 'memory';
        }
      }
      
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.operations.record(duration, { operation: 'get', source });
      
      if (value !== null && value !== undefined) {
        this.metrics.hits.add(1, { source });
        span.setAttributes({
          'cache.hit': true,
          'cache.source': source,
        });
        
        logger.debug('Cache hit', { key, source });
        return value;
      } else {
        this.metrics.misses.add(1);
        span.setAttributes({
          'cache.hit': false,
        });
        
        logger.debug('Cache miss', { key });
        return null;
      }
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errors.add(1, { type: 'general', operation: 'get' });
      logger.error('Cache get error', { key, error: error.message });
      return null;
    } finally {
      span.end();
    }
  }
  
  async set(key, value, ttl = config.cache.ttl) {
    const span = tracer.startSpan('cache.set');
    const startTime = Date.now();
    
    try {
      span.setAttributes({
        'cache.key': key,
        'cache.ttl': ttl,
        'cache.value_size': JSON.stringify(value).length,
      });
      
      const serializedValue = JSON.stringify(value);
      let redisSuccess = false;
      let memorySuccess = false;
      
      // Set in Redis if available
      if (this.isRedisConnected && this.useRedis) {
        try {
          if (ttl > 0) {
            await this.redis.setex(key, ttl, serializedValue);
          } else {
            await this.redis.set(key, serializedValue);
          }
          redisSuccess = true;
        } catch (error) {
          logger.warn('Redis set error', {
            key,
            error: error.message,
          });
          this.metrics.errors.add(1, { type: 'redis', operation: 'set' });
        }
      }
      
      // Set in memory cache
      try {
        this.memoryCache.set(key, value, ttl);
        memorySuccess = true;
      } catch (error) {
        logger.warn('Memory cache set error', {
          key,
          error: error.message,
        });
        this.metrics.errors.add(1, { type: 'memory', operation: 'set' });
      }
      
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.operations.record(duration, { operation: 'set' });
      this.metrics.sets.add(1, {
        redis_success: redisSuccess,
        memory_success: memorySuccess,
      });
      
      span.setAttributes({
        'cache.redis_success': redisSuccess,
        'cache.memory_success': memorySuccess,
      });
      
      logger.debug('Cache set', {
        key,
        ttl,
        redis: redisSuccess,
        memory: memorySuccess,
      });
      
      return redisSuccess || memorySuccess;
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errors.add(1, { type: 'general', operation: 'set' });
      logger.error('Cache set error', { key, error: error.message });
      return false;
    } finally {
      span.end();
    }
  }
  
  async del(key) {
    const span = tracer.startSpan('cache.delete');
    const startTime = Date.now();
    
    try {
      span.setAttributes({ 'cache.key': key });
      
      let redisSuccess = false;
      let memorySuccess = false;
      
      // Delete from Redis if available
      if (this.isRedisConnected && this.useRedis) {
        try {
          const result = await this.redis.del(key);
          redisSuccess = result > 0;
        } catch (error) {
          logger.warn('Redis delete error', {
            key,
            error: error.message,
          });
          this.metrics.errors.add(1, { type: 'redis', operation: 'delete' });
        }
      }
      
      // Delete from memory cache
      try {
        memorySuccess = this.memoryCache.del(key) > 0;
      } catch (error) {
        logger.warn('Memory cache delete error', {
          key,
          error: error.message,
        });
        this.metrics.errors.add(1, { type: 'memory', operation: 'delete' });
      }
      
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.operations.record(duration, { operation: 'delete' });
      this.metrics.deletes.add(1, {
        redis_success: redisSuccess,
        memory_success: memorySuccess,
      });
      
      span.setAttributes({
        'cache.redis_success': redisSuccess,
        'cache.memory_success': memorySuccess,
      });
      
      logger.debug('Cache delete', {
        key,
        redis: redisSuccess,
        memory: memorySuccess,
      });
      
      return redisSuccess || memorySuccess;
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errors.add(1, { type: 'general', operation: 'delete' });
      logger.error('Cache delete error', { key, error: error.message });
      return false;
    } finally {
      span.end();
    }
  }
  
  async exists(key) {
    const span = tracer.startSpan('cache.exists');
    
    try {
      span.setAttributes({ 'cache.key': key });
      
      // Check Redis first if available
      if (this.isRedisConnected && this.useRedis) {
        try {
          const exists = await this.redis.exists(key);
          if (exists) {
            span.setAttributes({ 'cache.exists': true, 'cache.source': 'redis' });
            return true;
          }
        } catch (error) {
          logger.warn('Redis exists error', {
            key,
            error: error.message,
          });
          this.metrics.errors.add(1, { type: 'redis', operation: 'exists' });
        }
      }
      
      // Check memory cache
      const exists = this.memoryCache.has(key);
      span.setAttributes({
        'cache.exists': exists,
        'cache.source': exists ? 'memory' : 'none',
      });
      
      return exists;
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errors.add(1, { type: 'general', operation: 'exists' });
      logger.error('Cache exists error', { key, error: error.message });
      return false;
    } finally {
      span.end();
    }
  }
  
  async flush() {
    const span = tracer.startSpan('cache.flush');
    
    try {
      let redisSuccess = false;
      let memorySuccess = false;
      
      // Flush Redis if available
      if (this.isRedisConnected && this.useRedis) {
        try {
          await this.redis.flushdb();
          redisSuccess = true;
        } catch (error) {
          logger.warn('Redis flush error', { error: error.message });
          this.metrics.errors.add(1, { type: 'redis', operation: 'flush' });
        }
      }
      
      // Flush memory cache
      try {
        this.memoryCache.flushAll();
        memorySuccess = true;
      } catch (error) {
        logger.warn('Memory cache flush error', { error: error.message });
        this.metrics.errors.add(1, { type: 'memory', operation: 'flush' });
      }
      
      span.setAttributes({
        'cache.redis_success': redisSuccess,
        'cache.memory_success': memorySuccess,
      });
      
      logger.info('Cache flushed', {
        redis: redisSuccess,
        memory: memorySuccess,
      });
      
      return redisSuccess || memorySuccess;
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errors.add(1, { type: 'general', operation: 'flush' });
      logger.error('Cache flush error', { error: error.message });
      return false;
    } finally {
      span.end();
    }
  }
  
  async keys(pattern = '*') {
    const span = tracer.startSpan('cache.keys');
    
    try {
      span.setAttributes({ 'cache.pattern': pattern });
      
      let keys = [];
      
      // Get keys from Redis if available
      if (this.isRedisConnected && this.useRedis) {
        try {
          const redisKeys = await this.redis.keys(pattern);
          keys = keys.concat(redisKeys.map(key => 
            key.startsWith(config.redis.keyPrefix) 
              ? key.slice(config.redis.keyPrefix.length)
              : key
          ));
        } catch (error) {
          logger.warn('Redis keys error', {
            pattern,
            error: error.message,
          });
          this.metrics.errors.add(1, { type: 'redis', operation: 'keys' });
        }
      }
      
      // Get keys from memory cache
      try {
        const memoryKeys = this.memoryCache.keys();
        keys = keys.concat(memoryKeys);
      } catch (error) {
        logger.warn('Memory cache keys error', {
          pattern,
          error: error.message,
        });
        this.metrics.errors.add(1, { type: 'memory', operation: 'keys' });
      }
      
      // Remove duplicates
      keys = [...new Set(keys)];
      
      // Apply pattern matching for memory cache keys
      if (pattern !== '*') {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        keys = keys.filter(key => regex.test(key));
      }
      
      span.setAttributes({ 'cache.keys_count': keys.length });
      
      return keys;
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errors.add(1, { type: 'general', operation: 'keys' });
      logger.error('Cache keys error', { pattern, error: error.message });
      return [];
    } finally {
      span.end();
    }
  }
  
  async ttl(key) {
    const span = tracer.startSpan('cache.ttl');
    
    try {
      span.setAttributes({ 'cache.key': key });
      
      // Check Redis TTL if available
      if (this.isRedisConnected && this.useRedis) {
        try {
          const ttl = await this.redis.ttl(key);
          if (ttl >= 0) {
            span.setAttributes({ 'cache.ttl': ttl, 'cache.source': 'redis' });
            return ttl;
          }
        } catch (error) {
          logger.warn('Redis TTL error', {
            key,
            error: error.message,
          });
          this.metrics.errors.add(1, { type: 'redis', operation: 'ttl' });
        }
      }
      
      // Memory cache doesn't provide TTL info, return -1 if key exists
      const exists = this.memoryCache.has(key);
      const ttl = exists ? -1 : -2; // -1 = no expiry, -2 = key doesn't exist
      
      span.setAttributes({
        'cache.ttl': ttl,
        'cache.source': 'memory',
      });
      
      return ttl;
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errors.add(1, { type: 'general', operation: 'ttl' });
      logger.error('Cache TTL error', { key, error: error.message });
      return -2;
    } finally {
      span.end();
    }
  }
  
  async getStats() {
    const span = tracer.startSpan('cache.get_stats');
    
    try {
      const stats = {
        redis: {
          connected: this.isRedisConnected,
          host: config.redis.host,
          port: config.redis.port,
          db: config.redis.db,
          keyPrefix: config.redis.keyPrefix,
        },
        memory: {
          keys: this.memoryCache.keys().length,
          stats: this.memoryCache.getStats(),
        },
        operations: {
          // These would be collected from metrics in a real implementation
          hits: 0,
          misses: 0,
          sets: 0,
          deletes: 0,
          errors: 0,
        },
      };
      
      // Get Redis info if available
      if (this.isRedisConnected && this.useRedis) {
        try {
          const info = await this.redis.info('memory');
          stats.redis.info = info;
        } catch (error) {
          logger.warn('Redis info error', { error: error.message });
        }
      }
      
      span.setAttributes({
        'cache.redis_connected': this.isRedisConnected,
        'cache.memory_keys': stats.memory.keys,
      });
      
      return stats;
      
    } catch (error) {
      span.recordException(error);
      logger.error('Cache stats error', { error: error.message });
      return {
        redis: { connected: false },
        memory: { keys: 0, stats: {} },
        operations: { hits: 0, misses: 0, sets: 0, deletes: 0, errors: 0 },
      };
    } finally {
      span.end();
    }
  }
  
  async healthCheck() {
    const span = tracer.startSpan('cache.health_check');
    
    try {
      const health = {
        redis: {
          status: 'unhealthy',
          connected: false,
          latency: null,
          error: null,
        },
        memory: {
          status: 'healthy',
          keys: this.memoryCache.keys().length,
          stats: this.memoryCache.getStats(),
        },
        overall: 'degraded',
      };
      
      // Check Redis health
      if (this.isRedisConnected && this.useRedis) {
        try {
          const start = Date.now();
          await this.redis.ping();
          const latency = Date.now() - start;
          
          health.redis.status = 'healthy';
          health.redis.connected = true;
          health.redis.latency = latency;
        } catch (error) {
          health.redis.error = error.message;
          logger.warn('Redis health check failed', { error: error.message });
        }
      }
      
      // Determine overall health
      if (health.redis.status === 'healthy' && health.memory.status === 'healthy') {
        health.overall = 'healthy';
      } else if (health.memory.status === 'healthy') {
        health.overall = 'degraded'; // Memory cache working, Redis not
      } else {
        health.overall = 'unhealthy';
      }
      
      span.setAttributes({
        'cache.redis_healthy': health.redis.status === 'healthy',
        'cache.memory_healthy': health.memory.status === 'healthy',
        'cache.overall_status': health.overall,
      });
      
      return health;
      
    } catch (error) {
      span.recordException(error);
      logger.error('Cache health check error', { error: error.message });
      return {
        redis: { status: 'unhealthy', connected: false, error: error.message },
        memory: { status: 'unhealthy', error: error.message },
        overall: 'unhealthy',
      };
    } finally {
      span.end();
    }
  }
  
  async cleanup() {
    const span = tracer.startSpan('cache.cleanup');
    
    try {
      logger.info('Cleaning up cache service');
      
      // Close Redis connection
      if (this.redis) {
        try {
          await this.redis.quit();
          logger.info('Redis connection closed');
        } catch (error) {
          logger.warn('Redis cleanup error', { error: error.message });
        }
      }
      
      // Clear memory cache
      if (this.memoryCache) {
        try {
          this.memoryCache.flushAll();
          this.memoryCache.close();
          logger.info('Memory cache cleared');
        } catch (error) {
          logger.warn('Memory cache cleanup error', { error: error.message });
        }
      }
      
      // Remove all listeners
      this.removeAllListeners();
      
      span.setAttributes({ 'cache.cleanup_success': true });
      
    } catch (error) {
      span.recordException(error);
      logger.error('Cache cleanup error', { error: error.message });
    } finally {
      span.end();
    }
  }
}

module.exports = CacheService;