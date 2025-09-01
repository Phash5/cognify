const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const { logger } = require('../config/logger');
const { tracer } = require('../config/telemetry');

/**
 * Rate limiting middleware for the Frontend AI Agent service
 */
class RateLimiterMiddleware {
  constructor() {
    this.redis = null;
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection for rate limiting
   */
  initializeRedis() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.redis = new Redis(redisUrl, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });

      this.redis.on('connect', () => {
        logger.info('Rate limiter Redis connected');
      });

      this.redis.on('error', (error) => {
        logger.error('Rate limiter Redis error', { error: error.message });
      });
    } catch (error) {
      logger.error('Failed to initialize Redis for rate limiting', { error: error.message });
    }
  }

  /**
   * Create Redis store for rate limiting
   */
  createRedisStore() {
    if (!this.redis) {
      return undefined;
    }

    return new RedisStore({
      sendCommand: (...args) => this.redis.call(...args),
      prefix: 'frontend-agent:rate-limit:'
    });
  }

  /**
   * General API rate limiter
   */
  generalLimiter = () => {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: {
        success: false,
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createRedisStore(),
      keyGenerator: (req) => {
        // Use user ID if authenticated, otherwise IP
        return req.user?.id || req.ip;
      },
      handler: (req, res) => {
        const span = tracer.startSpan('rateLimiter.generalLimiter.exceeded');
        
        logger.warn('General rate limit exceeded', {
          ip: req.ip,
          userId: req.user?.id,
          path: req.path,
          method: req.method
        });

        res.status(429).json({
          success: false,
          error: 'Too many requests from this IP, please try again later.',
          retryAfter: '15 minutes'
        });
        
        span.end();
      }
    });
  };

  /**
   * Task creation rate limiter (more restrictive)
   */
  taskCreationLimiter = () => {
    return rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 10, // Limit each user to 10 task creations per minute
      message: {
        success: false,
        error: 'Too many task creation requests, please slow down.',
        retryAfter: '1 minute'
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createRedisStore(),
      keyGenerator: (req) => {
        return `task-creation:${req.user?.id || req.ip}`;
      },
      handler: (req, res) => {
        const span = tracer.startSpan('rateLimiter.taskCreationLimiter.exceeded');
        
        logger.warn('Task creation rate limit exceeded', {
          ip: req.ip,
          userId: req.user?.id,
          taskType: req.body?.type
        });

        res.status(429).json({
          success: false,
          error: 'Too many task creation requests, please slow down.',
          retryAfter: '1 minute'
        });
        
        span.end();
      }
    });
  };

  /**
   * AI processing rate limiter (very restrictive)
   */
  aiProcessingLimiter = () => {
    return rateLimit({
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 20, // Limit each user to 20 AI processing requests per 5 minutes
      message: {
        success: false,
        error: 'AI processing rate limit exceeded, please wait before making more requests.',
        retryAfter: '5 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createRedisStore(),
      keyGenerator: (req) => {
        return `ai-processing:${req.user?.id || req.ip}`;
      },
      handler: (req, res) => {
        const span = tracer.startSpan('rateLimiter.aiProcessingLimiter.exceeded');
        
        logger.warn('AI processing rate limit exceeded', {
          ip: req.ip,
          userId: req.user?.id,
          endpoint: req.path
        });

        res.status(429).json({
          success: false,
          error: 'AI processing rate limit exceeded, please wait before making more requests.',
          retryAfter: '5 minutes'
        });
        
        span.end();
      }
    });
  };

  /**
   * Authentication rate limiter
   */
  authLimiter = () => {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // Limit each IP to 5 failed auth attempts per windowMs
      message: {
        success: false,
        error: 'Too many authentication attempts, please try again later.',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createRedisStore(),
      keyGenerator: (req) => {
        return `auth:${req.ip}`;
      },
      skipSuccessfulRequests: true, // Don't count successful requests
      handler: (req, res) => {
        const span = tracer.startSpan('rateLimiter.authLimiter.exceeded');
        
        logger.warn('Authentication rate limit exceeded', {
          ip: req.ip,
          path: req.path
        });

        res.status(429).json({
          success: false,
          error: 'Too many authentication attempts, please try again later.',
          retryAfter: '15 minutes'
        });
        
        span.end();
      }
    });
  };

  /**
   * Health check rate limiter (very permissive)
   */
  healthCheckLimiter = () => {
    return rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 60, // Allow 60 health checks per minute
      message: {
        success: false,
        error: 'Health check rate limit exceeded.',
        retryAfter: '1 minute'
      },
      standardHeaders: false,
      legacyHeaders: false,
      store: this.createRedisStore(),
      keyGenerator: (req) => {
        return `health:${req.ip}`;
      },
      handler: (req, res) => {
        res.status(429).json({
          success: false,
          error: 'Health check rate limit exceeded.'
        });
      }
    });
  };

  /**
   * Metrics endpoint rate limiter
   */
  metricsLimiter = () => {
    return rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 30, // Allow 30 metrics requests per minute
      message: {
        success: false,
        error: 'Metrics rate limit exceeded.',
        retryAfter: '1 minute'
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createRedisStore(),
      keyGenerator: (req) => {
        return `metrics:${req.user?.id || req.ip}`;
      },
      handler: (req, res) => {
        const span = tracer.startSpan('rateLimiter.metricsLimiter.exceeded');
        
        logger.warn('Metrics rate limit exceeded', {
          ip: req.ip,
          userId: req.user?.id
        });

        res.status(429).json({
          success: false,
          error: 'Metrics rate limit exceeded.',
          retryAfter: '1 minute'
        });
        
        span.end();
      }
    });
  };

  /**
   * Dynamic rate limiter based on user tier
   */
  dynamicLimiter = (options = {}) => {
    const {
      windowMs = 15 * 60 * 1000,
      defaultMax = 100,
      tierLimits = {
        free: 50,
        premium: 200,
        enterprise: 1000
      }
    } = options;

    return rateLimit({
      windowMs,
      max: (req) => {
        const userTier = req.user?.tier || 'free';
        return tierLimits[userTier] || defaultMax;
      },
      message: (req) => {
        const userTier = req.user?.tier || 'free';
        const limit = tierLimits[userTier] || defaultMax;
        
        return {
          success: false,
          error: `Rate limit exceeded for ${userTier} tier (${limit} requests per ${windowMs / 1000 / 60} minutes).`,
          tier: userTier,
          limit
        };
      },
      standardHeaders: true,
      legacyHeaders: false,
      store: this.createRedisStore(),
      keyGenerator: (req) => {
        const userTier = req.user?.tier || 'free';
        return `dynamic:${userTier}:${req.user?.id || req.ip}`;
      },
      handler: (req, res) => {
        const span = tracer.startSpan('rateLimiter.dynamicLimiter.exceeded');
        
        const userTier = req.user?.tier || 'free';
        const limit = tierLimits[userTier] || defaultMax;
        
        logger.warn('Dynamic rate limit exceeded', {
          ip: req.ip,
          userId: req.user?.id,
          tier: userTier,
          limit
        });

        res.status(429).json({
          success: false,
          error: `Rate limit exceeded for ${userTier} tier (${limit} requests per ${windowMs / 1000 / 60} minutes).`,
          tier: userTier,
          limit
        });
        
        span.end();
      }
    });
  };

  /**
   * Cleanup Redis connection
   */
  async cleanup() {
    try {
      if (this.redis) {
        await this.redis.quit();
        logger.info('Rate limiter Redis connection closed');
      }
    } catch (error) {
      logger.error('Error closing rate limiter Redis connection', { error: error.message });
    }
  }
}

// Create singleton instance
const rateLimiterMiddleware = new RateLimiterMiddleware();

module.exports = { 
  RateLimiterMiddleware,
  rateLimiterMiddleware
};