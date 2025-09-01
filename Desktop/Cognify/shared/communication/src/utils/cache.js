import EventEmitter from 'eventemitter3';
import NodeCache from 'node-cache';
import Redis from 'ioredis';

/**
 * Multi-tier cache for microservices
 */
class DistributedCache extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      serviceName: process.env.SERVICE_NAME || 'unknown-service',
      enableMemory: process.env.CACHE_MEMORY !== 'false',
      enableRedis: process.env.CACHE_REDIS === 'true',
      memoryTtl: parseInt(process.env.CACHE_MEMORY_TTL) || 300, // 5 minutes
      redisTtl: parseInt(process.env.CACHE_REDIS_TTL) || 3600, // 1 hour
      maxMemoryKeys: parseInt(process.env.CACHE_MEMORY_MAX_KEYS) || 1000,
      checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD) || 60, // seconds
      enableCompression: process.env.CACHE_COMPRESSION === 'true',
      enableSerialization: true,
      keyPrefix: process.env.CACHE_KEY_PREFIX || 'cognify:cache:',
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      enableMetrics: true,
      enableEvents: true,
      ...options
    };

    this.logger = options.logger;
    
    // Cache instances
    this.memoryCache = null;
    this.redisCache = null;
    
    // Statistics
    this.stats = {
      memoryHits: 0,
      memoryMisses: 0,
      redisHits: 0,
      redisMisses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      evictions: 0
    };

    // Initialize cache layers
    this._initializeCaches();
  }

  /**
   * Initialize cache layers
   */
  async _initializeCaches() {
    try {
      if (this.options.enableMemory) {
        this._initializeMemoryCache();
      }
      
      if (this.options.enableRedis) {
        await this._initializeRedisCache();
      }

      if (this.logger) {
        this.logger.debug('Cache layers initialized', {
          memory: this.options.enableMemory,
          redis: this.options.enableRedis,
          serviceName: this.options.serviceName
        });
      }
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Failed to initialize cache layers', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Initialize memory cache
   */
  _initializeMemoryCache() {
    this.memoryCache = new NodeCache({
      stdTTL: this.options.memoryTtl,
      checkperiod: this.options.checkPeriod,
      maxKeys: this.options.maxMemoryKeys,
      useClones: false,
      deleteOnExpire: true
    });

    // Listen to cache events
    this.memoryCache.on('set', (key, value) => {
      if (this.options.enableEvents) {
        this.emit('memorySet', { key, value });
      }
    });

    this.memoryCache.on('del', (key, value) => {
      if (this.options.enableEvents) {
        this.emit('memoryDelete', { key, value });
      }
    });

    this.memoryCache.on('expired', (key, value) => {
      this.stats.evictions++;
      
      if (this.options.enableEvents) {
        this.emit('memoryExpired', { key, value });
      }
    });

    this.memoryCache.on('flush', () => {
      if (this.options.enableEvents) {
        this.emit('memoryFlush');
      }
    });

    if (this.logger) {
      this.logger.debug('Memory cache initialized', {
        ttl: this.options.memoryTtl,
        maxKeys: this.options.maxMemoryKeys,
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Initialize Redis cache
   */
  async _initializeRedisCache() {
    this.redisCache = new Redis(this.options.redisUrl, {
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keyPrefix: this.options.keyPrefix
    });

    // Listen to Redis events
    this.redisCache.on('connect', () => {
      if (this.logger) {
        this.logger.info('Redis cache connected', {
          url: this.options.redisUrl,
          serviceName: this.options.serviceName
        });
      }
      
      if (this.options.enableEvents) {
        this.emit('redisConnected');
      }
    });

    this.redisCache.on('error', (error) => {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Redis cache error', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      if (this.options.enableEvents) {
        this.emit('redisError', error);
      }
    });

    this.redisCache.on('close', () => {
      if (this.logger) {
        this.logger.warn('Redis cache disconnected', {
          serviceName: this.options.serviceName
        });
      }
      
      if (this.options.enableEvents) {
        this.emit('redisDisconnected');
      }
    });

    // Connect to Redis
    await this.redisCache.connect();

    if (this.logger) {
      this.logger.debug('Redis cache initialized', {
        url: this.options.redisUrl,
        ttl: this.options.redisTtl,
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @param {Object} options - Get options
   * @returns {Promise<any>} Cached value
   */
  async get(key, options = {}) {
    const cacheKey = this._buildKey(key);
    
    try {
      // Try memory cache first
      if (this.memoryCache && this.options.enableMemory) {
        const memoryValue = this.memoryCache.get(cacheKey);
        
        if (memoryValue !== undefined) {
          this.stats.memoryHits++;
          
          if (this.logger) {
            this.logger.debug('Cache hit (memory)', {
              key: cacheKey,
              serviceName: this.options.serviceName
            });
          }
          
          if (this.options.enableEvents) {
            this.emit('hit', { key: cacheKey, source: 'memory', value: memoryValue });
          }
          
          return this._deserialize(memoryValue);
        }
        
        this.stats.memoryMisses++;
      }
      
      // Try Redis cache
      if (this.redisCache && this.options.enableRedis) {
        const redisValue = await this.redisCache.get(cacheKey);
        
        if (redisValue !== null) {
          this.stats.redisHits++;
          
          const deserializedValue = this._deserialize(redisValue);
          
          // Populate memory cache
          if (this.memoryCache && this.options.enableMemory) {
            this.memoryCache.set(cacheKey, redisValue, options.memoryTtl || this.options.memoryTtl);
          }
          
          if (this.logger) {
            this.logger.debug('Cache hit (redis)', {
              key: cacheKey,
              serviceName: this.options.serviceName
            });
          }
          
          if (this.options.enableEvents) {
            this.emit('hit', { key: cacheKey, source: 'redis', value: deserializedValue });
          }
          
          return deserializedValue;
        }
        
        this.stats.redisMisses++;
      }
      
      // Cache miss
      if (this.logger) {
        this.logger.debug('Cache miss', {
          key: cacheKey,
          serviceName: this.options.serviceName
        });
      }
      
      if (this.options.enableEvents) {
        this.emit('miss', { key: cacheKey });
      }
      
      return undefined;
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Cache get error', {
          key: cacheKey,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      if (this.options.enableEvents) {
        this.emit('error', { operation: 'get', key: cacheKey, error });
      }
      
      return undefined;
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {Object} options - Set options
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value, options = {}) {
    const cacheKey = this._buildKey(key);
    const serializedValue = this._serialize(value);
    
    try {
      const memoryTtl = options.memoryTtl || this.options.memoryTtl;
      const redisTtl = options.redisTtl || this.options.redisTtl;
      
      // Set in memory cache
      if (this.memoryCache && this.options.enableMemory) {
        this.memoryCache.set(cacheKey, serializedValue, memoryTtl);
      }
      
      // Set in Redis cache
      if (this.redisCache && this.options.enableRedis) {
        if (redisTtl > 0) {
          await this.redisCache.setex(cacheKey, redisTtl, serializedValue);
        } else {
          await this.redisCache.set(cacheKey, serializedValue);
        }
      }
      
      this.stats.sets++;
      
      if (this.logger) {
        this.logger.debug('Cache set', {
          key: cacheKey,
          memoryTtl,
          redisTtl,
          serviceName: this.options.serviceName
        });
      }
      
      if (this.options.enableEvents) {
        this.emit('set', { key: cacheKey, value, memoryTtl, redisTtl });
      }
      
      return true;
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Cache set error', {
          key: cacheKey,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      if (this.options.enableEvents) {
        this.emit('error', { operation: 'set', key: cacheKey, error });
      }
      
      return false;
    }
  }

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Success status
   */
  async delete(key) {
    const cacheKey = this._buildKey(key);
    
    try {
      let deleted = false;
      
      // Delete from memory cache
      if (this.memoryCache && this.options.enableMemory) {
        deleted = this.memoryCache.del(cacheKey) > 0 || deleted;
      }
      
      // Delete from Redis cache
      if (this.redisCache && this.options.enableRedis) {
        const redisDeleted = await this.redisCache.del(cacheKey);
        deleted = redisDeleted > 0 || deleted;
      }
      
      if (deleted) {
        this.stats.deletes++;
        
        if (this.logger) {
          this.logger.debug('Cache delete', {
            key: cacheKey,
            serviceName: this.options.serviceName
          });
        }
        
        if (this.options.enableEvents) {
          this.emit('delete', { key: cacheKey });
        }
      }
      
      return deleted;
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Cache delete error', {
          key: cacheKey,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      if (this.options.enableEvents) {
        this.emit('error', { operation: 'delete', key: cacheKey, error });
      }
      
      return false;
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Exists status
   */
  async exists(key) {
    const cacheKey = this._buildKey(key);
    
    try {
      // Check memory cache first
      if (this.memoryCache && this.options.enableMemory) {
        if (this.memoryCache.has(cacheKey)) {
          return true;
        }
      }
      
      // Check Redis cache
      if (this.redisCache && this.options.enableRedis) {
        const exists = await this.redisCache.exists(cacheKey);
        return exists === 1;
      }
      
      return false;
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Cache exists error', {
          key: cacheKey,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      return false;
    }
  }

  /**
   * Get multiple values from cache
   * @param {Array<string>} keys - Cache keys
   * @returns {Promise<Object>} Key-value pairs
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
   * @param {Object} keyValuePairs - Key-value pairs
   * @param {Object} options - Set options
   * @returns {Promise<boolean>} Success status
   */
  async mset(keyValuePairs, options = {}) {
    const promises = [];
    
    for (const [key, value] of Object.entries(keyValuePairs)) {
      promises.push(this.set(key, value, options));
    }
    
    const results = await Promise.all(promises);
    return results.every(result => result === true);
  }

  /**
   * Delete multiple values from cache
   * @param {Array<string>} keys - Cache keys
   * @returns {Promise<number>} Number of deleted keys
   */
  async mdel(keys) {
    const promises = keys.map(key => this.delete(key));
    const results = await Promise.all(promises);
    
    return results.filter(result => result === true).length;
  }

  /**
   * Get or set value in cache
   * @param {string} key - Cache key
   * @param {Function} factory - Function to generate value if not cached
   * @param {Object} options - Options
   * @returns {Promise<any>} Cached or generated value
   */
  async getOrSet(key, factory, options = {}) {
    let value = await this.get(key, options);
    
    if (value === undefined) {
      try {
        value = await factory();
        
        if (value !== undefined) {
          await this.set(key, value, options);
        }
      } catch (error) {
        if (this.logger) {
          this.logger.error('Cache factory error', {
            key,
            error: error.message,
            serviceName: this.options.serviceName
          });
        }
        
        throw error;
      }
    }
    
    return value;
  }

  /**
   * Increment numeric value in cache
   * @param {string} key - Cache key
   * @param {number} delta - Increment value
   * @returns {Promise<number>} New value
   */
  async increment(key, delta = 1) {
    const cacheKey = this._buildKey(key);
    
    try {
      // Use Redis INCR if available
      if (this.redisCache && this.options.enableRedis) {
        const newValue = await this.redisCache.incrby(cacheKey, delta);
        
        // Update memory cache
        if (this.memoryCache && this.options.enableMemory) {
          this.memoryCache.set(cacheKey, this._serialize(newValue));
        }
        
        return newValue;
      }
      
      // Fallback to get/set for memory cache
      const currentValue = await this.get(key) || 0;
      const newValue = currentValue + delta;
      
      await this.set(key, newValue);
      return newValue;
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Cache increment error', {
          key: cacheKey,
          delta,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Decrement numeric value in cache
   * @param {string} key - Cache key
   * @param {number} delta - Decrement value
   * @returns {Promise<number>} New value
   */
  async decrement(key, delta = 1) {
    return this.increment(key, -delta);
  }

  /**
   * Set expiration time for a key
   * @param {string} key - Cache key
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} Success status
   */
  async expire(key, ttl) {
    const cacheKey = this._buildKey(key);
    
    try {
      let success = false;
      
      // Set TTL in memory cache
      if (this.memoryCache && this.options.enableMemory) {
        success = this.memoryCache.ttl(cacheKey, ttl) || success;
      }
      
      // Set TTL in Redis cache
      if (this.redisCache && this.options.enableRedis) {
        const redisSuccess = await this.redisCache.expire(cacheKey, ttl);
        success = redisSuccess === 1 || success;
      }
      
      return success;
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Cache expire error', {
          key: cacheKey,
          ttl,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      return false;
    }
  }

  /**
   * Get TTL for a key
   * @param {string} key - Cache key
   * @returns {Promise<number>} TTL in seconds (-1 if no expiry, -2 if not exists)
   */
  async ttl(key) {
    const cacheKey = this._buildKey(key);
    
    try {
      // Check Redis first for more accurate TTL
      if (this.redisCache && this.options.enableRedis) {
        return await this.redisCache.ttl(cacheKey);
      }
      
      // Fallback to memory cache
      if (this.memoryCache && this.options.enableMemory) {
        return this.memoryCache.getTtl(cacheKey);
      }
      
      return -2; // Key not found
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Cache TTL error', {
          key: cacheKey,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      return -2;
    }
  }

  /**
   * Clear all cache entries
   * @returns {Promise<boolean>} Success status
   */
  async clear() {
    try {
      // Clear memory cache
      if (this.memoryCache && this.options.enableMemory) {
        this.memoryCache.flushAll();
      }
      
      // Clear Redis cache (only keys with our prefix)
      if (this.redisCache && this.options.enableRedis) {
        const keys = await this.redisCache.keys(`${this.options.keyPrefix}*`);
        
        if (keys.length > 0) {
          await this.redisCache.del(...keys);
        }
      }
      
      if (this.logger) {
        this.logger.info('Cache cleared', {
          serviceName: this.options.serviceName
        });
      }
      
      if (this.options.enableEvents) {
        this.emit('clear');
      }
      
      return true;
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Cache clear error', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      return false;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const memoryStats = this.memoryCache ? {
      keys: this.memoryCache.keys().length,
      hits: this.stats.memoryHits,
      misses: this.stats.memoryMisses,
      hitRate: this.stats.memoryHits / (this.stats.memoryHits + this.stats.memoryMisses) || 0
    } : null;
    
    const redisStats = {
      hits: this.stats.redisHits,
      misses: this.stats.redisMisses,
      hitRate: this.stats.redisHits / (this.stats.redisHits + this.stats.redisMisses) || 0
    };
    
    return {
      memory: memoryStats,
      redis: redisStats,
      overall: {
        hits: this.stats.memoryHits + this.stats.redisHits,
        misses: this.stats.memoryMisses + this.stats.redisMisses,
        hitRate: (this.stats.memoryHits + this.stats.redisHits) / 
                 (this.stats.memoryHits + this.stats.redisHits + this.stats.memoryMisses + this.stats.redisMisses) || 0,
        sets: this.stats.sets,
        deletes: this.stats.deletes,
        errors: this.stats.errors,
        evictions: this.stats.evictions
      }
    };
  }

  /**
   * Build cache key with prefix
   * @param {string} key - Original key
   * @returns {string} Prefixed key
   */
  _buildKey(key) {
    return `${this.options.serviceName}:${key}`;
  }

  /**
   * Serialize value for storage
   * @param {any} value - Value to serialize
   * @returns {string} Serialized value
   */
  _serialize(value) {
    if (!this.options.enableSerialization) {
      return value;
    }
    
    try {
      return JSON.stringify(value);
    } catch (error) {
      if (this.logger) {
        this.logger.warn('Serialization failed, storing as string', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      return String(value);
    }
  }

  /**
   * Deserialize value from storage
   * @param {string} value - Serialized value
   * @returns {any} Deserialized value
   */
  _deserialize(value) {
    if (!this.options.enableSerialization) {
      return value;
    }
    
    try {
      return JSON.parse(value);
    } catch (error) {
      // Return as string if parsing fails
      return value;
    }
  }

  /**
   * Close cache connections
   */
  async close() {
    try {
      if (this.memoryCache) {
        this.memoryCache.close();
        this.memoryCache = null;
      }
      
      if (this.redisCache) {
        await this.redisCache.quit();
        this.redisCache = null;
      }
      
      this.removeAllListeners();

      if (this.logger) {
        this.logger.info('Cache closed', {
          serviceName: this.options.serviceName
        });
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error('Cache close error', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
    }
  }
}

/**
 * Create a cache instance
 * @param {Object} options - Configuration options
 * @returns {DistributedCache} Cache instance
 */
export function createCache(options = {}) {
  return new DistributedCache(options);
}

/**
 * Default cache instance
 */
export const defaultCache = createCache();

export default {
  DistributedCache,
  createCache,
  defaultCache
};