import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';
import { HTTP_HEADERS, HTTP_STATUS } from '../constants/http.js';
import { AuthenticationError, AuthorizationError, RateLimitExceededError } from '../types/errors.js';

/**
 * Security middleware using Helmet
 * @param {Object} options - Helmet configuration options
 * @returns {Function} Express middleware
 */
export function securityMiddleware(options = {}) {
  const defaultOptions = {
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
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    ...options
  };

  return helmet(defaultOptions);
}

/**
 * CORS middleware with microservice-friendly defaults
 * @param {Object} options - CORS configuration options
 * @returns {Function} Express middleware
 */
export function corsMiddleware(options = {}) {
  const defaultOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      // Allow all origins in development
      if (process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      
      // Check allowed origins from environment or options
      const allowedOrigins = options.allowedOrigins || 
        (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['*']);
      
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-API-Key',
      'X-Request-ID',
      'X-Correlation-ID',
      'X-Trace-ID',
      'X-Service-Name',
      'X-Client-Version'
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-Response-Time',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset'
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
    ...options
  };

  return cors(defaultOptions);
}

/**
 * Compression middleware
 * @param {Object} options - Compression options
 * @returns {Function} Express middleware
 */
export function compressionMiddleware(options = {}) {
  const defaultOptions = {
    filter: (req, res) => {
      // Don't compress if the request includes a Cache-Control: no-transform directive
      if (req.headers['cache-control'] && req.headers['cache-control'].includes('no-transform')) {
        return false;
      }
      
      // Use compression filter function
      return compression.filter(req, res);
    },
    threshold: 1024, // Only compress if response is larger than 1KB
    level: 6, // Compression level (1-9)
    ...options
  };

  return compression(defaultOptions);
}

/**
 * Request ID middleware - adds unique ID to each request
 * @param {Object} options - Request ID options
 * @returns {Function} Express middleware
 */
export function requestIdMiddleware(options = {}) {
  const {
    header = HTTP_HEADERS.X_REQUEST_ID,
    generator = () => uuidv4(),
    setResponseHeader = true
  } = options;

  return (req, res, next) => {
    // Use existing request ID if present, otherwise generate new one
    const requestId = req.headers[header.toLowerCase()] || generator();
    
    // Set request ID in request object
    req.requestId = requestId;
    req.headers[header.toLowerCase()] = requestId;
    
    // Set response header
    if (setResponseHeader) {
      res.setHeader(header, requestId);
    }
    
    next();
  };
}

/**
 * Response time middleware
 * @param {Object} options - Response time options
 * @returns {Function} Express middleware
 */
export function responseTimeMiddleware(options = {}) {
  const {
    header = HTTP_HEADERS.X_RESPONSE_TIME,
    digits = 3,
    suffix = 'ms'
  } = options;

  return (req, res, next) => {
    const startTime = process.hrtime.bigint();
    
    res.on('finish', () => {
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
      
      const formattedTime = responseTime.toFixed(digits) + suffix;
      res.setHeader(header, formattedTime);
      
      // Store response time for metrics
      req.responseTime = responseTime;
    });
    
    next();
  };
}

/**
 * Rate limiting middleware
 * @param {Object} options - Rate limiting options
 * @returns {Function} Express middleware
 */
export function rateLimitMiddleware(options = {}) {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(options.windowMs / 1000) || 900
      }
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: (req) => {
      // Use IP address by default, but allow custom key generation
      return req.ip || req.connection.remoteAddress;
    },
    handler: (req, res) => {
      const error = new RateLimitExceededError(
        'Rate limit exceeded',
        options.max || 100,
        options.windowMs || 900000
      );
      
      res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json(error.toResponse());
    },
    ...options
  };

  return rateLimit(defaultOptions);
}

/**
 * API Key authentication middleware
 * @param {Object} options - Authentication options
 * @returns {Function} Express middleware
 */
export function apiKeyAuthMiddleware(options = {}) {
  const {
    header = HTTP_HEADERS.X_API_KEY,
    validApiKeys = [],
    getValidApiKeys = null,
    optional = false
  } = options;

  return async (req, res, next) => {
    try {
      const apiKey = req.headers[header.toLowerCase()];
      
      if (!apiKey) {
        if (optional) {
          return next();
        }
        throw new AuthenticationError('API key is required');
      }
      
      // Get valid API keys
      let validKeys = validApiKeys;
      if (getValidApiKeys && typeof getValidApiKeys === 'function') {
        validKeys = await getValidApiKeys();
      }
      
      // Validate API key
      if (!validKeys.includes(apiKey)) {
        throw new AuthenticationError('Invalid API key');
      }
      
      // Store API key info in request
      req.apiKey = apiKey;
      req.authenticated = true;
      
      next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        res.status(error.statusCode).json(error.toResponse());
      } else {
        const authError = new AuthenticationError('Authentication failed');
        res.status(authError.statusCode).json(authError.toResponse());
      }
    }
  };
}

/**
 * JWT authentication middleware
 * @param {Object} options - JWT options
 * @returns {Function} Express middleware
 */
export function jwtAuthMiddleware(options = {}) {
  const {
    secret = process.env.JWT_SECRET,
    algorithms = ['HS256'],
    optional = false,
    getSecret = null
  } = options;

  return async (req, res, next) => {
    try {
      const authHeader = req.headers[HTTP_HEADERS.AUTHORIZATION.toLowerCase()];
      
      if (!authHeader) {
        if (optional) {
          return next();
        }
        throw new AuthenticationError('Authorization header is required');
      }
      
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      
      if (!token) {
        throw new AuthenticationError('JWT token is required');
      }
      
      // Get secret
      let jwtSecret = secret;
      if (getSecret && typeof getSecret === 'function') {
        jwtSecret = await getSecret(req);
      }
      
      if (!jwtSecret) {
        throw new AuthenticationError('JWT secret not configured');
      }
      
      // Verify token (you would need to import a JWT library like jsonwebtoken)
      // For now, this is a placeholder - implement actual JWT verification
      const decoded = { sub: 'user123', iat: Date.now() }; // Placeholder
      
      // Store user info in request
      req.user = decoded;
      req.authenticated = true;
      
      next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        res.status(error.statusCode).json(error.toResponse());
      } else {
        const authError = new AuthenticationError('JWT verification failed');
        res.status(authError.statusCode).json(authError.toResponse());
      }
    }
  };
}

/**
 * Service-to-service authentication middleware
 * @param {Object} options - Service auth options
 * @returns {Function} Express middleware
 */
export function serviceAuthMiddleware(options = {}) {
  const {
    allowedServices = [],
    getServiceSecret = null,
    optional = false
  } = options;

  return async (req, res, next) => {
    try {
      const serviceName = req.headers[HTTP_HEADERS.X_SERVICE_NAME.toLowerCase()];
      const serviceAuth = req.headers[HTTP_HEADERS.AUTHORIZATION.toLowerCase()];
      
      if (!serviceName || !serviceAuth) {
        if (optional) {
          return next();
        }
        throw new AuthenticationError('Service authentication required');
      }
      
      // Check if service is allowed
      if (allowedServices.length > 0 && !allowedServices.includes(serviceName)) {
        throw new AuthorizationError(`Service '${serviceName}' is not authorized`);
      }
      
      // Verify service authentication
      if (getServiceSecret && typeof getServiceSecret === 'function') {
        const expectedSecret = await getServiceSecret(serviceName);
        const providedSecret = serviceAuth.startsWith('Bearer ') ? serviceAuth.slice(7) : serviceAuth;
        
        if (providedSecret !== expectedSecret) {
          throw new AuthenticationError('Invalid service credentials');
        }
      }
      
      // Store service info in request
      req.serviceName = serviceName;
      req.serviceAuthenticated = true;
      
      next();
    } catch (error) {
      if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
        res.status(error.statusCode).json(error.toResponse());
      } else {
        const authError = new AuthenticationError('Service authentication failed');
        res.status(authError.statusCode).json(authError.toResponse());
      }
    }
  };
}

/**
 * Request logging middleware
 * @param {Object} logger - Logger instance
 * @param {Object} options - Logging options
 * @returns {Function} Express middleware
 */
export function requestLoggingMiddleware(logger, options = {}) {
  const {
    logLevel = 'info',
    includeBody = false,
    includeHeaders = false,
    excludeHeaders = ['authorization', 'cookie', 'x-api-key'],
    maxBodyLength = 1000
  } = options;

  return (req, res, next) => {
    const startTime = Date.now();
    
    // Log request
    const requestData = {
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId,
      serviceName: req.headers[HTTP_HEADERS.X_SERVICE_NAME.toLowerCase()]
    };
    
    if (includeHeaders) {
      requestData.headers = { ...req.headers };
      // Remove sensitive headers
      excludeHeaders.forEach(header => {
        delete requestData.headers[header];
      });
    }
    
    if (includeBody && req.body) {
      let body = req.body;
      if (typeof body === 'string' && body.length > maxBodyLength) {
        body = body.substring(0, maxBodyLength) + '...';
      } else if (typeof body === 'object') {
        body = JSON.stringify(body).substring(0, maxBodyLength);
      }
      requestData.body = body;
    }
    
    logger[logLevel]('Incoming request', requestData);
    
    // Log response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      const responseData = {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        requestId: req.requestId,
        contentLength: res.get('Content-Length')
      };
      
      const level = res.statusCode >= 400 ? 'warn' : logLevel;
      logger[level]('Request completed', responseData);
    });
    
    next();
  };
}

/**
 * Error handling middleware
 * @param {Object} logger - Logger instance
 * @param {Object} options - Error handling options
 * @returns {Function} Express error middleware
 */
export function errorHandlingMiddleware(logger, options = {}) {
  const {
    includeStack = process.env.NODE_ENV === 'development',
    logErrors = true
  } = options;

  return (error, req, res, next) => {
    // Log error
    if (logErrors && logger) {
      logger.error('Request error', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: error.code,
          statusCode: error.statusCode
        },
        request: {
          method: req.method,
          url: req.url,
          requestId: req.requestId,
          ip: req.ip
        }
      });
    }
    
    // Handle different error types
    let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
    let response = {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString()
      }
    };
    
    if (error.statusCode) {
      statusCode = error.statusCode;
    }
    
    if (error.toResponse && typeof error.toResponse === 'function') {
      response = error.toResponse();
    } else if (error.code) {
      response.error.code = error.code;
      response.error.message = error.message;
    } else {
      response.error.message = error.message;
    }
    
    // Include stack trace in development
    if (includeStack && error.stack) {
      response.error.stack = error.stack;
    }
    
    // Include request ID for tracing
    if (req.requestId) {
      response.error.requestId = req.requestId;
    }
    
    res.status(statusCode).json(response);
  };
}

/**
 * Health check middleware
 * @param {Object} options - Health check options
 * @returns {Function} Express middleware
 */
export function healthCheckMiddleware(options = {}) {
  const {
    path = '/health',
    checks = [],
    timeout = 5000
  } = options;

  return async (req, res, next) => {
    if (req.path !== path) {
      return next();
    }
    
    try {
      const results = await Promise.allSettled(
        checks.map(check => 
          Promise.race([
            check(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Health check timeout')), timeout)
            )
          ])
        )
      );
      
      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: results.map((result, index) => ({
          name: checks[index].name || `check_${index}`,
          status: result.status === 'fulfilled' ? 'healthy' : 'unhealthy',
          message: result.status === 'fulfilled' ? 'OK' : result.reason.message
        }))
      };
      
      const hasUnhealthyChecks = results.some(result => result.status === 'rejected');
      if (hasUnhealthyChecks) {
        healthStatus.status = 'unhealthy';
        return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(healthStatus);
      }
      
      res.status(HTTP_STATUS.OK).json(healthStatus);
    } catch (error) {
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  };
}

export default {
  securityMiddleware,
  corsMiddleware,
  compressionMiddleware,
  requestIdMiddleware,
  responseTimeMiddleware,
  rateLimitMiddleware,
  apiKeyAuthMiddleware,
  jwtAuthMiddleware,
  serviceAuthMiddleware,
  requestLoggingMiddleware,
  errorHandlingMiddleware,
  healthCheckMiddleware
};