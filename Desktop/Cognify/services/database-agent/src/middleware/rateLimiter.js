/**
 * Rate Limiting Middleware
 * Configurable rate limiting for the Database AI Agent
 */

'use strict';

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const config = require('../config/config');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');

// Redis client for rate limiting
let redisClient;
if (config.redis.enabled) {
  redisClient = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
  
  redisClient.on('error', (err) => {
    logger.error('Redis rate limiter connection error', { error: err.message });
  });
  
  redisClient.on('connect', () => {
    logger.info('Redis rate limiter connected');
  });
}

/**
 * Create rate limiter with telemetry
 */
const createRateLimiter = (options) => {
  const limiterOptions = {
    ...options,
    handler: (req, res) => {
      const span = telemetryService.startSpan('rate_limiter.limit_exceeded');
      
      span.setAttributes({
        'rate_limit.type': options.name || 'unknown',
        'rate_limit.limit': options.max,
        'rate_limit.window_ms': options.windowMs,
        'rate_limit.ip': req.ip,
        'rate_limit.user_id': req.user?.id,
        'rate_limit.path': req.path,
      });
      
      logger.warn('Rate limit exceeded', {
        type: options.name || 'unknown',
        ip: req.ip,
        userId: req.user?.id,
        path: req.path,
        userAgent: req.get('User-Agent'),
        limit: options.max,
        windowMs: options.windowMs,
      });
      
      // Increment rate limit exceeded metric
      telemetryService.incrementCounter('rate_limit_exceeded_total', {
        type: options.name || 'unknown',
        endpoint: req.path,
      });
      
      span.end();
      
      res.status(429).json({
        success: false,
        error: {
          type: 'RateLimitError',
          message: 'Too many requests, please try again later',
          retryAfter: Math.ceil(options.windowMs / 1000),
        },
      });
    },
    onLimitReached: (req, res, options) => {
      telemetryService.incrementCounter('rate_limit_reached_total', {
        type: options.name || 'unknown',
        endpoint: req.path,
      });
    },
  };
  
  // Use Redis store if available
  if (redisClient && config.redis.enabled) {
    limiterOptions.store = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: `rl:db-agent:${options.name || 'default'}:`,
    });
  }
  
  return rateLimit(limiterOptions);
};

/**
 * General API rate limiter
 */
const generalLimiter = createRateLimiter({
  name: 'general',
  windowMs: config.rateLimiting.general.windowMs,
  max: config.rateLimiting.general.max,
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.id || req.ip;
  },
});

/**
 * AI-specific rate limiter for database operations
 */
const aiLimiter = createRateLimiter({
  name: 'ai_database',
  windowMs: config.rateLimiting.ai.windowMs,
  max: config.rateLimiting.ai.max,
  message: 'Too many AI database requests',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
});

/**
 * Schema generation rate limiter
 */
const schemaGenerationLimiter = createRateLimiter({
  name: 'schema_generation',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 schema generations per 15 minutes
  message: 'Too many schema generation requests',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
});

/**
 * Query optimization rate limiter
 */
const queryOptimizationLimiter = createRateLimiter({
  name: 'query_optimization',
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // 20 optimizations per 10 minutes
  message: 'Too many query optimization requests',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
});

/**
 * Migration generation rate limiter
 */
const migrationLimiter = createRateLimiter({
  name: 'migration_generation',
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 5, // 5 migrations per 30 minutes
  message: 'Too many migration generation requests',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
});

/**
 * Performance analysis rate limiter
 */
const performanceAnalysisLimiter = createRateLimiter({
  name: 'performance_analysis',
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 15, // 15 analyses per 5 minutes
  message: 'Too many performance analysis requests',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
});

/**
 * Authentication rate limiter
 */
const authLimiter = createRateLimiter({
  name: 'auth',
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 auth attempts per 15 minutes
  message: 'Too many authentication attempts',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  skipSuccessfulRequests: true,
});

/**
 * Burst rate limiter for short-term spikes
 */
const burstLimiter = createRateLimiter({
  name: 'burst',
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'Too many requests in short time',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
});

/**
 * Dynamic rate limiter based on user role
 */
const dynamicLimiter = (req, res, next) => {
  const span = telemetryService.startSpan('rate_limiter.dynamic_check');
  
  try {
    let maxRequests = config.rateLimiting.general.max;
    let windowMs = config.rateLimiting.general.windowMs;
    
    // Adjust limits based on user role
    if (req.user) {
      switch (req.user.role) {
        case 'admin':
          maxRequests = maxRequests * 5; // 5x limit for admins
          break;
        case 'premium':
          maxRequests = maxRequests * 3; // 3x limit for premium users
          break;
        case 'pro':
          maxRequests = maxRequests * 2; // 2x limit for pro users
          break;
        case 'api':
          maxRequests = maxRequests * 4; // 4x limit for API users
          break;
        default:
          // Keep default limits for regular users
          break;
      }
    }
    
    span.setAttributes({
      'rate_limit.type': 'dynamic',
      'rate_limit.user_role': req.user?.role || 'anonymous',
      'rate_limit.max_requests': maxRequests,
      'rate_limit.window_ms': windowMs,
    });
    
    const dynamicRateLimit = createRateLimiter({
      name: 'dynamic',
      windowMs,
      max: maxRequests,
      message: 'Dynamic rate limit exceeded',
      keyGenerator: (req) => {
        return req.user?.id || req.ip;
      },
    });
    
    span.end();
    dynamicRateLimit(req, res, next);
    
  } catch (error) {
    span.recordException(error);
    span.end();
    
    logger.error('Dynamic rate limiter error', {
      error: error.message,
      userId: req.user?.id,
      path: req.path,
    });
    
    // Fall back to general limiter
    generalLimiter(req, res, next);
  }
};

/**
 * Endpoint-specific rate limiter
 */
const endpointLimiter = (endpointConfig) => {
  return createRateLimiter({
    name: `endpoint_${endpointConfig.name}`,
    windowMs: endpointConfig.windowMs || 15 * 60 * 1000,
    max: endpointConfig.max || 100,
    message: `Too many requests to ${endpointConfig.name} endpoint`,
    keyGenerator: (req) => {
      return req.user?.id || req.ip;
    },
  });
};

/**
 * Rate limiter health check
 */
const healthCheck = async () => {
  const span = telemetryService.startSpan('rate_limiter.health_check');
  
  try {
    if (!redisClient || !config.redis.enabled) {
      span.setAttributes({ 'health.redis_enabled': false });
      span.end();
      return {
        status: 'healthy',
        store: 'memory',
        redis: 'disabled',
      };
    }
    
    // Test Redis connection
    await redisClient.ping();
    
    span.setAttributes({
      'health.redis_enabled': true,
      'health.redis_status': 'connected',
    });
    
    span.end();
    
    return {
      status: 'healthy',
      store: 'redis',
      redis: 'connected',
    };
    
  } catch (error) {
    span.recordException(error);
    span.setAttributes({
      'health.redis_enabled': true,
      'health.redis_status': 'error',
    });
    span.end();
    
    logger.error('Rate limiter health check failed', {
      error: error.message,
    });
    
    return {
      status: 'unhealthy',
      store: 'redis',
      redis: 'error',
      error: error.message,
    };
  }
};

/**
 * Get rate limiter statistics
 */
const getStats = async () => {
  const span = telemetryService.startSpan('rate_limiter.get_stats');
  
  try {
    if (!redisClient || !config.redis.enabled) {
      span.end();
      return {
        store: 'memory',
        redis: 'disabled',
        stats: 'not_available',
      };
    }
    
    // Get Redis info
    const info = await redisClient.info('memory');
    const keyCount = await redisClient.dbsize();
    
    span.setAttributes({
      'stats.store': 'redis',
      'stats.key_count': keyCount,
    });
    
    span.end();
    
    return {
      store: 'redis',
      keyCount,
      memoryInfo: info,
      timestamp: new Date().toISOString(),
    };
    
  } catch (error) {
    span.recordException(error);
    span.end();
    
    logger.error('Failed to get rate limiter stats', {
      error: error.message,
    });
    
    return {
      store: 'redis',
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Reset rate limits for a specific key
 */
const resetLimits = async (key, limiterName = 'general') => {
  const span = telemetryService.startSpan('rate_limiter.reset_limits');
  
  try {
    if (!redisClient || !config.redis.enabled) {
      span.setAttributes({ 'reset.store': 'memory' });
      span.end();
      return { success: false, message: 'Redis not available' };
    }
    
    const pattern = `rl:db-agent:${limiterName}:${key}*`;
    const keys = await redisClient.keys(pattern);
    
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
    
    span.setAttributes({
      'reset.store': 'redis',
      'reset.limiter_name': limiterName,
      'reset.key': key,
      'reset.keys_deleted': keys.length,
    });
    
    span.end();
    
    logger.info('Rate limits reset', {
      limiterName,
      key,
      keysDeleted: keys.length,
    });
    
    return {
      success: true,
      keysDeleted: keys.length,
      limiterName,
      key,
    };
    
  } catch (error) {
    span.recordException(error);
    span.end();
    
    logger.error('Failed to reset rate limits', {
      error: error.message,
      limiterName,
      key,
    });
    
    return {
      success: false,
      error: error.message,
      limiterName,
      key,
    };
  }
};

/**
 * Graceful shutdown
 */
const shutdown = async () => {
  const span = telemetryService.startSpan('rate_limiter.shutdown');
  
  try {
    if (redisClient) {
      await redisClient.quit();
      logger.info('Rate limiter Redis connection closed');
    }
    
    span.setAttributes({ 'shutdown.success': true });
    span.end();
    
  } catch (error) {
    span.recordException(error);
    span.end();
    
    logger.error('Error during rate limiter shutdown', {
      error: error.message,
    });
  }
};

module.exports = {
  // Rate limiters
  generalLimiter,
  aiLimiter,
  schemaGenerationLimiter,
  queryOptimizationLimiter,
  migrationLimiter,
  performanceAnalysisLimiter,
  authLimiter,
  burstLimiter,
  dynamicLimiter,
  endpointLimiter,
  
  // Utilities
  createRateLimiter,
  healthCheck,
  getStats,
  resetLimits,
  shutdown,
  
  // Redis client (for testing)
  redisClient,
};