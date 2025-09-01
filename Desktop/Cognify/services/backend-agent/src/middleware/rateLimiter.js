/**
 * Rate Limiting Middleware for Backend AI Agent
 * Provides configurable rate limiting with Redis backend
 */

'use strict';

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const createError = require('http-errors');
const config = require('../config/config');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');

// Redis client for rate limiting (if available)
let redisClient = null;
try {
  if (config.redis.enabled) {
    const Redis = require('ioredis');
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.rateLimitDb || 2,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    
    redisClient.on('error', (err) => {
      logger.error('Rate limiter Redis connection error', {
        error: err.message,
      });
    });
  }
} catch (error) {
  logger.warn('Failed to initialize Redis for rate limiting', {
    error: error.message,
  });
}

/**
 * Create rate limiter with custom configuration
 */
function createRateLimiter(options = {}) {
  const defaultOptions = {
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path.startsWith('/health') || req.path.startsWith('/metrics');
    },
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP
      return req.user?.id || req.ip;
    },
    onLimitReached: (req, res, options) => {
      const identifier = req.user?.id || req.ip;
      
      logger.warn('Rate limit exceeded', {
        identifier,
        userId: req.user?.id,
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        limit: options.max,
        windowMs: options.windowMs,
      });
      
      // Record rate limit event in telemetry
      telemetryService.addEvent('rate_limit_exceeded', {
        'rate_limit.identifier': identifier,
        'rate_limit.path': req.path,
        'rate_limit.method': req.method,
        'rate_limit.limit': options.max,
        'rate_limit.window_ms': options.windowMs,
      });
    },
    handler: (req, res, next, options) => {
      const identifier = req.user?.id || req.ip;
      
      logger.warn('Rate limit handler triggered', {
        identifier,
        userId: req.user?.id,
        ip: req.ip,
        path: req.path,
        method: req.method,
        limit: options.max,
        windowMs: options.windowMs,
      });
      
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(options.windowMs / 1000),
        limit: options.max,
        windowMs: options.windowMs,
      });
    },
  };
  
  // Use Redis store if available
  if (redisClient) {
    defaultOptions.store = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: 'rl:backend-agent:',
    });
  }
  
  // Merge with custom options
  const finalOptions = { ...defaultOptions, ...options };
  
  return rateLimit(finalOptions);
}

/**
 * General API rate limiter
 */
const generalLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded for general API usage.',
  },
});

/**
 * AI-specific rate limiter (more restrictive)
 */
const aiLimiter = createRateLimiter({
  windowMs: config.rateLimit.ai.windowMs,
  max: config.rateLimit.ai.max,
  keyGenerator: (req) => {
    // More specific key for AI requests
    const baseKey = req.user?.id || req.ip;
    return `ai:${baseKey}`;
  },
  message: {
    error: 'AI rate limit exceeded',
    message: 'Too many AI requests. Please wait before making more AI-powered requests.',
  },
});

/**
 * Code generation rate limiter (most restrictive)
 */
const codeGenerationLimiter = createRateLimiter({
  windowMs: config.rateLimit.ai.windowMs * 2, // Double the window
  max: Math.floor(config.rateLimit.ai.max / 2), // Half the requests
  keyGenerator: (req) => {
    const baseKey = req.user?.id || req.ip;
    return `codegen:${baseKey}`;
  },
  message: {
    error: 'Code generation rate limit exceeded',
    message: 'Too many code generation requests. This operation is resource-intensive.',
  },
});

/**
 * File upload rate limiter
 */
const uploadLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 uploads per minute
  keyGenerator: (req) => {
    const baseKey = req.user?.id || req.ip;
    return `upload:${baseKey}`;
  },
  message: {
    error: 'Upload rate limit exceeded',
    message: 'Too many file uploads. Please wait before uploading more files.',
  },
});

/**
 * Authentication rate limiter
 */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  keyGenerator: (req) => {
    // Use IP for auth attempts
    return `auth:${req.ip}`;
  },
  message: {
    error: 'Authentication rate limit exceeded',
    message: 'Too many authentication attempts. Please try again later.',
  },
  skipSuccessfulRequests: true, // Don't count successful auth attempts
});

/**
 * Dynamic rate limiter based on user tier/role
 */
function dynamicRateLimiter(req, res, next) {
  const span = telemetryService.startSpan('rate_limit.dynamic');
  
  try {
    // Default limits
    let windowMs = config.rateLimit.windowMs;
    let max = config.rateLimit.max;
    
    // Adjust limits based on user role
    if (req.user) {
      const roles = req.user.roles || [];
      
      if (roles.includes('premium')) {
        max = max * 3; // 3x limit for premium users
      } else if (roles.includes('pro')) {
        max = max * 2; // 2x limit for pro users
      } else if (roles.includes('admin')) {
        max = max * 10; // 10x limit for admins
      }
      
      span.setAttributes({
        'rate_limit.user_id': req.user.id,
        'rate_limit.roles': roles.join(','),
        'rate_limit.adjusted_max': max,
        'rate_limit.window_ms': windowMs,
      });
    }
    
    // Create dynamic limiter
    const dynamicLimiter = createRateLimiter({
      windowMs,
      max,
      keyGenerator: (req) => {
        const baseKey = req.user?.id || req.ip;
        const tier = req.user?.roles?.includes('premium') ? 'premium' :
                    req.user?.roles?.includes('pro') ? 'pro' :
                    req.user?.roles?.includes('admin') ? 'admin' : 'basic';
        return `dynamic:${tier}:${baseKey}`;
      },
    });
    
    span.end();
    dynamicLimiter(req, res, next);
    
  } catch (error) {
    span.recordException(error);
    span.end();
    
    logger.error('Dynamic rate limiter error', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
    });
    
    // Fall back to general limiter
    generalLimiter(req, res, next);
  }
}

/**
 * Rate limiter for specific endpoints
 */
function endpointRateLimiter(endpointConfig) {
  return createRateLimiter({
    windowMs: endpointConfig.windowMs || config.rateLimit.windowMs,
    max: endpointConfig.max || config.rateLimit.max,
    keyGenerator: (req) => {
      const baseKey = req.user?.id || req.ip;
      return `endpoint:${endpointConfig.name}:${baseKey}`;
    },
    message: {
      error: `Rate limit exceeded for ${endpointConfig.name}`,
      message: endpointConfig.message || 'Too many requests for this endpoint.',
    },
  });
}

/**
 * Burst rate limiter for handling traffic spikes
 */
const burstLimiter = createRateLimiter({
  windowMs: 1000, // 1 second
  max: 20, // 20 requests per second
  keyGenerator: (req) => {
    const baseKey = req.user?.id || req.ip;
    return `burst:${baseKey}`;
  },
  message: {
    error: 'Burst rate limit exceeded',
    message: 'Too many requests in a short time. Please slow down.',
  },
});

/**
 * Middleware to add rate limit headers
 */
function addRateLimitHeaders(req, res, next) {
  // Add custom headers for rate limit information
  res.setHeader('X-RateLimit-Service', 'backend-agent');
  res.setHeader('X-RateLimit-Policy', 'sliding-window');
  
  next();
}

/**
 * Get rate limit status for a key
 */
async function getRateLimitStatus(key, windowMs = config.rateLimit.windowMs) {
  if (!redisClient) {
    return {
      available: true,
      remaining: config.rateLimit.max,
      resetTime: Date.now() + windowMs,
    };
  }
  
  try {
    const current = await redisClient.get(`rl:backend-agent:${key}`);
    const remaining = Math.max(0, config.rateLimit.max - (parseInt(current) || 0));
    const ttl = await redisClient.ttl(`rl:backend-agent:${key}`);
    const resetTime = ttl > 0 ? Date.now() + (ttl * 1000) : Date.now() + windowMs;
    
    return {
      available: remaining > 0,
      remaining,
      resetTime,
      current: parseInt(current) || 0,
    };
  } catch (error) {
    logger.error('Failed to get rate limit status', {
      error: error.message,
      key,
    });
    
    return {
      available: true,
      remaining: config.rateLimit.max,
      resetTime: Date.now() + windowMs,
      error: error.message,
    };
  }
}

/**
 * Reset rate limit for a specific key (admin function)
 */
async function resetRateLimit(key) {
  if (!redisClient) {
    return { success: false, message: 'Redis not available' };
  }
  
  try {
    await redisClient.del(`rl:backend-agent:${key}`);
    
    logger.info('Rate limit reset', {
      key,
      timestamp: new Date().toISOString(),
    });
    
    return { success: true, message: 'Rate limit reset successfully' };
  } catch (error) {
    logger.error('Failed to reset rate limit', {
      error: error.message,
      key,
    });
    
    return { success: false, message: error.message };
  }
}

/**
 * Health check for rate limiter
 */
function healthCheck() {
  return {
    status: redisClient ? 'healthy' : 'degraded',
    redisConnected: redisClient?.status === 'ready',
    fallbackMode: !redisClient,
    config: {
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      aiWindowMs: config.rateLimit.ai.windowMs,
      aiMax: config.rateLimit.ai.max,
    },
  };
}

module.exports = {
  // Main rate limiters
  generalLimiter,
  aiLimiter,
  codeGenerationLimiter,
  uploadLimiter,
  authLimiter,
  burstLimiter,
  
  // Dynamic and custom limiters
  dynamicRateLimiter,
  endpointRateLimiter,
  createRateLimiter,
  
  // Utility functions
  addRateLimitHeaders,
  getRateLimitStatus,
  resetRateLimit,
  healthCheck,
  
  // Redis client (for testing)
  redisClient,
};