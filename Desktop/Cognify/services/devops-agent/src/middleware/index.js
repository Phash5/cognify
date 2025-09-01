/**
 * Middleware Collection for DevOps AI Agent
 * Provides authentication, rate limiting, error handling, and request processing
 */

'use strict';

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const logger = require('../utils/logger');
const { TelemetryService } = require('../utils/telemetry');
const { handleValidationErrors } = require('../utils/validation');

// Initialize telemetry
const telemetry = new TelemetryService();

/**
 * Security middleware
 */
const security = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

/**
 * CORS middleware
 */
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = config.security.corsOrigins || ['http://localhost:3000'];
    
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      logger.logSecurity('CORS origin blocked', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-Rate-Limit-Remaining'],
};

/**
 * Request ID middleware
 */
const requestId = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request start
  logger.logRequest('Request started', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    headers: {
      'content-type': req.get('Content-Type'),
      'authorization': req.get('Authorization') ? '[REDACTED]' : undefined,
      'x-api-key': req.get('X-API-Key') ? '[REDACTED]' : undefined,
    },
  });
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    
    logger.logRequest('Request completed', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length'),
    });
    
    // Record metrics
    telemetry.recordHistogram('http_request_duration_ms', duration, {
      method: req.method,
      route: req.route?.path || req.url,
      status_code: res.statusCode.toString(),
    });
    
    telemetry.incrementCounter('http_requests_total', {
      method: req.method,
      route: req.route?.path || req.url,
      status_code: res.statusCode.toString(),
    });
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

/**
 * Authentication middleware
 */
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'];
    
    // Check API key authentication
    if (apiKey) {
      if (!config.auth.apiKeys.includes(apiKey)) {
        logger.logSecurity('Invalid API key', {
          requestId: req.requestId,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
        
        return res.status(401).json({
          error: 'Invalid API key',
          timestamp: new Date().toISOString(),
        });
      }
      
      req.auth = {
        type: 'api-key',
        apiKey,
      };
      
      logger.logAuthentication('API key authentication successful', {
        requestId: req.requestId,
        type: 'api-key',
      });
      
      return next();
    }
    
    // Check JWT authentication
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        const decoded = jwt.verify(token, config.auth.jwtSecret);
        
        req.auth = {
          type: 'jwt',
          user: decoded,
        };
        
        logger.logAuthentication('JWT authentication successful', {
          requestId: req.requestId,
          type: 'jwt',
          userId: decoded.sub,
        });
        
        return next();
      } catch (jwtError) {
        logger.logSecurity('Invalid JWT token', {
          requestId: req.requestId,
          error: jwtError.message,
          ip: req.ip,
        });
        
        return res.status(401).json({
          error: 'Invalid or expired token',
          timestamp: new Date().toISOString(),
        });
      }
    }
    
    // No authentication provided
    logger.logSecurity('No authentication provided', {
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    
    return res.status(401).json({
      error: 'Authentication required',
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    logger.logError('Authentication middleware error', error, {
      requestId: req.requestId,
    });
    
    return res.status(500).json({
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Rate limiting middleware
 */
const createRateLimit = (options = {}) => {
  const defaultOptions = {
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: {
      error: 'Too many requests',
      retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
      timestamp: new Date().toISOString(),
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use API key or user ID if available, otherwise IP
      return req.auth?.apiKey || req.auth?.user?.sub || req.ip;
    },
    onLimitReached: (req, res, options) => {
      logger.logSecurity('Rate limit exceeded', {
        requestId: req.requestId,
        ip: req.ip,
        key: options.keyGenerator(req),
        limit: options.max,
        windowMs: options.windowMs,
      });
      
      telemetry.incrementCounter('rate_limit_exceeded_total', {
        endpoint: req.route?.path || req.url,
      });
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.url.startsWith('/health');
    },
  };
  
  return rateLimit({ ...defaultOptions, ...options });
};

/**
 * AI-specific rate limiting
 */
const aiRateLimit = createRateLimit({
  windowMs: config.rateLimit.ai.windowMs,
  max: config.rateLimit.ai.maxRequests,
  message: {
    error: 'Too many AI requests',
    retryAfter: Math.ceil(config.rateLimit.ai.windowMs / 1000),
    timestamp: new Date().toISOString(),
  },
});

/**
 * DevOps-specific rate limiting
 */
const devopsRateLimit = {
  deployment: createRateLimit({
    windowMs: config.rateLimit.devops.deployment.windowMs,
    max: config.rateLimit.devops.deployment.maxRequests,
    message: {
      error: 'Too many deployment requests',
      retryAfter: Math.ceil(config.rateLimit.devops.deployment.windowMs / 1000),
      timestamp: new Date().toISOString(),
    },
  }),
  
  infrastructure: createRateLimit({
    windowMs: config.rateLimit.devops.infrastructure.windowMs,
    max: config.rateLimit.devops.infrastructure.maxRequests,
    message: {
      error: 'Too many infrastructure requests',
      retryAfter: Math.ceil(config.rateLimit.devops.infrastructure.windowMs / 1000),
      timestamp: new Date().toISOString(),
    },
  }),
  
  monitoring: createRateLimit({
    windowMs: config.rateLimit.devops.monitoring.windowMs,
    max: config.rateLimit.devops.monitoring.maxRequests,
    message: {
      error: 'Too many monitoring requests',
      retryAfter: Math.ceil(config.rateLimit.devops.monitoring.windowMs / 1000),
      timestamp: new Date().toISOString(),
    },
  }),
  
  configuration: createRateLimit({
    windowMs: config.rateLimit.devops.configuration.windowMs,
    max: config.rateLimit.devops.configuration.maxRequests,
    message: {
      error: 'Too many configuration requests',
      retryAfter: Math.ceil(config.rateLimit.devops.configuration.windowMs / 1000),
      timestamp: new Date().toISOString(),
    },
  }),
};

/**
 * Slow down middleware for gradual rate limiting
 */
const speedLimiter = slowDown({
  windowMs: config.rateLimit.windowMs,
  delayAfter: Math.floor(config.rateLimit.maxRequests * 0.8),
  delayMs: 500,
  maxDelayMs: 5000,
  keyGenerator: (req) => {
    return req.auth?.apiKey || req.auth?.user?.sub || req.ip;
  },
  onLimitReached: (req, res, options) => {
    logger.logSecurity('Speed limit applied', {
      requestId: req.requestId,
      ip: req.ip,
      delay: options.delay,
    });
  },
});

/**
 * Error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log error
  logger.logError('Request error', err, {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  });
  
  // Record error metric
  telemetry.incrementCounter('http_errors_total', {
    error_type: err.name || 'UnknownError',
    status_code: err.statusCode?.toString() || '500',
  });
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.details || [],
      timestamp: new Date().toISOString(),
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }
  
  if (err.name === 'ForbiddenError') {
    return res.status(403).json({
      error: 'Forbidden',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }
  
  if (err.name === 'NotFoundError') {
    return res.status(404).json({
      error: 'Not found',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }
  
  if (err.name === 'ConflictError') {
    return res.status(409).json({
      error: 'Conflict',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }
  
  if (err.name === 'TooManyRequestsError') {
    return res.status(429).json({
      error: 'Too many requests',
      message: err.message,
      retryAfter: err.retryAfter,
      timestamp: new Date().toISOString(),
    });
  }
  
  // Handle OpenAI API errors
  if (err.response?.status) {
    const status = err.response.status;
    const message = err.response.data?.error?.message || 'AI service error';
    
    if (status === 429) {
      return res.status(429).json({
        error: 'AI service rate limit exceeded',
        message: 'Please try again later',
        timestamp: new Date().toISOString(),
      });
    }
    
    if (status >= 500) {
      return res.status(502).json({
        error: 'AI service unavailable',
        message: 'The AI service is temporarily unavailable',
        timestamp: new Date().toISOString(),
      });
    }
    
    return res.status(400).json({
      error: 'AI service error',
      message,
      timestamp: new Date().toISOString(),
    });
  }
  
  // Default error response
  const statusCode = err.statusCode || 500;
  const message = config.server.env === 'production' 
    ? 'Internal server error' 
    : err.message;
  
  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error' : 'Bad request',
    message,
    timestamp: new Date().toISOString(),
    ...(config.server.env !== 'production' && { stack: err.stack }),
  });
};

/**
 * 404 handler
 */
const notFoundHandler = (req, res) => {
  logger.logRequest('Route not found', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
  });
  
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.url} not found`,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Request timeout middleware
 */
const timeout = (timeoutMs = 30000) => {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        logger.logError('Request timeout', new Error('Request timeout'), {
          requestId: req.requestId,
          method: req.method,
          url: req.url,
          timeout: timeoutMs,
        });
        
        res.status(408).json({
          error: 'Request timeout',
          message: 'The request took too long to process',
          timestamp: new Date().toISOString(),
        });
      }
    }, timeoutMs);
    
    res.on('finish', () => {
      clearTimeout(timer);
    });
    
    next();
  };
};

/**
 * Content type validation middleware
 */
const validateContentType = (allowedTypes = ['application/json']) => {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      return next();
    }
    
    const contentType = req.get('Content-Type');
    
    if (!contentType) {
      return res.status(400).json({
        error: 'Content-Type header required',
        timestamp: new Date().toISOString(),
      });
    }
    
    const isAllowed = allowedTypes.some(type => 
      contentType.toLowerCase().includes(type.toLowerCase())
    );
    
    if (!isAllowed) {
      return res.status(415).json({
        error: 'Unsupported Media Type',
        message: `Content-Type must be one of: ${allowedTypes.join(', ')}`,
        timestamp: new Date().toISOString(),
      });
    }
    
    next();
  };
};

/**
 * Request size validation middleware
 */
const validateRequestSize = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength) {
      const sizeInBytes = parseInt(contentLength, 10);
      const maxSizeInBytes = parseSize(maxSize);
      
      if (sizeInBytes > maxSizeInBytes) {
        return res.status(413).json({
          error: 'Payload too large',
          message: `Request size exceeds maximum allowed size of ${maxSize}`,
          timestamp: new Date().toISOString(),
        });
      }
    }
    
    next();
  };
};

/**
 * Parse size string to bytes
 */
function parseSize(size) {
  const units = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  
  const match = size.toLowerCase().match(/^(\d+)([a-z]*)$/);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }
  
  const [, number, unit] = match;
  const multiplier = units[unit] || units.b;
  
  return parseInt(number, 10) * multiplier;
}

module.exports = {
  security,
  cors: cors(corsOptions),
  compression: compression(),
  requestId,
  requestLogger,
  authenticate,
  createRateLimit,
  aiRateLimit,
  devopsRateLimit,
  speedLimiter,
  errorHandler,
  notFoundHandler,
  timeout,
  validateContentType,
  validateRequestSize,
  handleValidationErrors,
};