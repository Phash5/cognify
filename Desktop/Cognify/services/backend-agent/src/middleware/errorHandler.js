/**
 * Error Handling Middleware for Backend AI Agent
 * Provides comprehensive error handling, logging, and response formatting
 */

'use strict';

const createError = require('http-errors');
const { ValidationError } = require('joi');
const config = require('../config/config');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');

/**
 * Error types and their default status codes
 */
const ERROR_TYPES = {
  ValidationError: 400,
  CastError: 400,
  MongoError: 500,
  JsonWebTokenError: 401,
  TokenExpiredError: 401,
  MulterError: 400,
  SyntaxError: 400,
  TypeError: 500,
  ReferenceError: 500,
  RangeError: 400,
  URIError: 400,
};

/**
 * Operational error class for expected errors
 */
class OperationalError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.name = 'OperationalError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * AI Service error class
 */
class AIServiceError extends OperationalError {
  constructor(message, statusCode = 503, details = {}) {
    super(message, statusCode);
    this.name = 'AIServiceError';
    this.details = details;
    this.service = 'openai';
  }
}

/**
 * Rate limit error class
 */
class RateLimitError extends OperationalError {
  constructor(message = 'Rate limit exceeded', retryAfter = 60) {
    super(message, 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Database error class
 */
class DatabaseError extends OperationalError {
  constructor(message, originalError = null) {
    super(message, 500);
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

/**
 * Cache error class
 */
class CacheError extends OperationalError {
  constructor(message, operation = 'unknown') {
    super(message, 500);
    this.name = 'CacheError';
    this.operation = operation;
  }
}

/**
 * Determine if error is operational (expected) or programming error
 */
function isOperationalError(error) {
  if (error.isOperational !== undefined) {
    return error.isOperational;
  }
  
  // Check for known operational error types
  const operationalTypes = [
    'ValidationError',
    'CastError',
    'JsonWebTokenError',
    'TokenExpiredError',
    'MulterError',
    'MongoNetworkError',
    'MongoTimeoutError',
  ];
  
  return operationalTypes.includes(error.name) || error.status < 500;
}

/**
 * Get appropriate status code for error
 */
function getStatusCode(error) {
  // Use explicit status code if available
  if (error.statusCode) return error.statusCode;
  if (error.status) return error.status;
  
  // Use predefined mappings
  if (ERROR_TYPES[error.name]) {
    return ERROR_TYPES[error.name];
  }
  
  // Default to 500 for unknown errors
  return 500;
}

/**
 * Format error response based on environment
 */
function formatErrorResponse(error, req) {
  const statusCode = getStatusCode(error);
  const isProduction = config.server.env === 'production';
  
  // Base error response
  const errorResponse = {
    error: {
      message: error.message || 'An error occurred',
      type: error.name || 'Error',
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
    },
  };
  
  // Add request ID if available
  if (req.id) {
    errorResponse.error.requestId = req.id;
  }
  
  // Add trace ID if available
  const traceId = telemetryService.getTraceId();
  if (traceId) {
    errorResponse.error.traceId = traceId;
  }
  
  // Add validation details for validation errors
  if (error.name === 'ValidationError' && error.details) {
    errorResponse.error.details = error.details;
  }
  
  // Add retry information for rate limit errors
  if (error.name === 'RateLimitError' && error.retryAfter) {
    errorResponse.error.retryAfter = error.retryAfter;
  }
  
  // Add AI service details for AI errors
  if (error.name === 'AIServiceError' && error.details) {
    errorResponse.error.service = error.service;
    if (!isProduction) {
      errorResponse.error.details = error.details;
    }
  }
  
  // Include stack trace in development
  if (!isProduction && error.stack) {
    errorResponse.error.stack = error.stack;
  }
  
  // Include additional error properties in development
  if (!isProduction) {
    if (error.code) errorResponse.error.code = error.code;
    if (error.errno) errorResponse.error.errno = error.errno;
    if (error.syscall) errorResponse.error.syscall = error.syscall;
  }
  
  return errorResponse;
}

/**
 * Log error with appropriate level and context
 */
function logError(error, req, res) {
  const statusCode = getStatusCode(error);
  const isOperational = isOperationalError(error);
  
  // Determine log level
  let logLevel = 'error';
  if (statusCode < 500) {
    logLevel = 'warn';
  } else if (isOperational) {
    logLevel = 'error';
  } else {
    logLevel = 'fatal';
  }
  
  // Prepare log context
  const logContext = {
    error: {
      name: error.name,
      message: error.message,
      statusCode,
      isOperational,
      stack: error.stack,
    },
    request: {
      method: req.method,
      path: req.path,
      query: req.query,
      params: req.params,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer'),
    },
    response: {
      statusCode: res.statusCode,
    },
    user: req.user ? {
      id: req.user.id,
      roles: req.user.roles,
    } : null,
    timestamp: new Date().toISOString(),
  };
  
  // Add trace context
  const traceId = telemetryService.getTraceId();
  const spanId = telemetryService.getSpanId();
  if (traceId) logContext.traceId = traceId;
  if (spanId) logContext.spanId = spanId;
  
  // Add request ID if available
  if (req.id) {
    logContext.requestId = req.id;
  }
  
  // Add error-specific context
  if (error.details) logContext.error.details = error.details;
  if (error.code) logContext.error.code = error.code;
  if (error.service) logContext.error.service = error.service;
  
  // Log the error
  logger[logLevel]('Request error', logContext);
  
  // Record in telemetry
  telemetryService.recordException(error, {
    'error.type': error.name,
    'error.operational': isOperational,
    'http.status_code': statusCode,
    'http.method': req.method,
    'http.route': req.path,
  });
}

/**
 * Handle specific error types
 */
function handleSpecificErrors(error, req, res, next) {
  // Handle Joi validation errors
  if (error instanceof ValidationError) {
    const validationError = createError(400, 'Validation failed', {
      details: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      })),
      type: 'validation_error',
    });
    
    return next(validationError);
  }
  
  // Handle MongoDB errors
  if (error.name === 'MongoError' || error.name === 'MongoServerError') {
    if (error.code === 11000) {
      // Duplicate key error
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      const duplicateError = createError(409, `Duplicate ${field}`, {
        field,
        value: error.keyValue?.[field],
        type: 'duplicate_error',
      });
      
      return next(duplicateError);
    }
    
    // Other MongoDB errors
    const dbError = new DatabaseError('Database operation failed', error);
    return next(dbError);
  }
  
  // Handle Mongoose validation errors
  if (error.name === 'ValidationError' && error.errors) {
    const validationError = createError(400, 'Validation failed', {
      details: Object.keys(error.errors).map(field => ({
        field,
        message: error.errors[field].message,
        value: error.errors[field].value,
      })),
      type: 'validation_error',
    });
    
    return next(validationError);
  }
  
  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    const jwtError = createError(401, 'Invalid token', {
      type: 'authentication_error',
    });
    
    return next(jwtError);
  }
  
  if (error.name === 'TokenExpiredError') {
    const expiredError = createError(401, 'Token expired', {
      type: 'authentication_error',
      expiredAt: error.expiredAt,
    });
    
    return next(expiredError);
  }
  
  // Handle Multer errors (file upload)
  if (error.name === 'MulterError') {
    let message = 'File upload error';
    let statusCode = 400;
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File too large';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        break;
      case 'LIMIT_PART_COUNT':
        message = 'Too many parts';
        break;
      case 'LIMIT_FIELD_KEY':
        message = 'Field name too long';
        break;
      case 'LIMIT_FIELD_VALUE':
        message = 'Field value too long';
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Too many fields';
        break;
      case 'MISSING_FIELD_NAME':
        message = 'Missing field name';
        break;
    }
    
    const uploadError = createError(statusCode, message, {
      type: 'upload_error',
      code: error.code,
    });
    
    return next(uploadError);
  }
  
  // Handle syntax errors (malformed JSON)
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    const syntaxError = createError(400, 'Invalid JSON in request body', {
      type: 'syntax_error',
    });
    
    return next(syntaxError);
  }
  
  // Pass through other errors
  next(error);
}

/**
 * Main error handling middleware
 */
function errorHandler(error, req, res, next) {
  // Skip if response already sent
  if (res.headersSent) {
    return next(error);
  }
  
  // Log the error
  logError(error, req, res);
  
  // Format error response
  const errorResponse = formatErrorResponse(error, req);
  const statusCode = getStatusCode(error);
  
  // Set appropriate headers
  res.status(statusCode);
  
  // Add retry-after header for rate limit errors
  if (error.name === 'RateLimitError' && error.retryAfter) {
    res.setHeader('Retry-After', error.retryAfter);
  }
  
  // Add CORS headers if needed
  if (req.method === 'OPTIONS' || statusCode === 401 || statusCode === 403) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  
  // Send error response
  res.json(errorResponse);
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res, next) {
  const error = createError(404, `Route ${req.method} ${req.path} not found`, {
    type: 'not_found_error',
    method: req.method,
    path: req.path,
  });
  
  next(error);
}

/**
 * Async error wrapper
 * Catches errors in async route handlers
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Process exit handler for unhandled errors
 */
function handleUncaughtException(error) {
  logger.fatal('Uncaught exception', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    timestamp: new Date().toISOString(),
  });
  
  // Record in telemetry
  telemetryService.recordException(error, {
    'error.type': 'uncaught_exception',
    'error.fatal': true,
  });
  
  // Graceful shutdown
  process.exit(1);
}

/**
 * Unhandled promise rejection handler
 */
function handleUnhandledRejection(reason, promise) {
  logger.fatal('Unhandled promise rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString(),
    timestamp: new Date().toISOString(),
  });
  
  // Record in telemetry
  telemetryService.recordException(new Error(reason), {
    'error.type': 'unhandled_rejection',
    'error.fatal': true,
  });
  
  // Graceful shutdown
  process.exit(1);
}

/**
 * Setup global error handlers
 */
function setupGlobalErrorHandlers() {
  process.on('uncaughtException', handleUncaughtException);
  process.on('unhandledRejection', handleUnhandledRejection);
  
  logger.info('Global error handlers registered');
}

module.exports = {
  // Error classes
  OperationalError,
  AIServiceError,
  RateLimitError,
  DatabaseError,
  CacheError,
  
  // Middleware
  errorHandler,
  notFoundHandler,
  handleSpecificErrors,
  asyncHandler,
  
  // Utilities
  isOperationalError,
  getStatusCode,
  formatErrorResponse,
  logError,
  
  // Global handlers
  setupGlobalErrorHandlers,
  handleUncaughtException,
  handleUnhandledRejection,
};