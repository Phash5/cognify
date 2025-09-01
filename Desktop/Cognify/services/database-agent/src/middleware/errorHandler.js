/**
 * Error Handler Middleware
 * Comprehensive error handling and logging for the Database AI Agent
 */

'use strict';

const config = require('../config/config');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');

/**
 * Custom Error Classes
 */
class OperationalError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.name = 'OperationalError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

class AIServiceError extends Error {
  constructor(message, provider = 'openai', statusCode = 503) {
    super(message);
    this.name = 'AIServiceError';
    this.provider = provider;
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class RateLimitError extends Error {
  constructor(message, retryAfter = 60, statusCode = 429) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class DatabaseError extends Error {
  constructor(message, operation = 'unknown', statusCode = 500) {
    super(message);
    this.name = 'DatabaseError';
    this.operation = operation;
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class CacheError extends Error {
  constructor(message, operation = 'unknown', statusCode = 503) {
    super(message);
    this.name = 'CacheError';
    this.operation = operation;
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends Error {
  constructor(message, field = null, statusCode = 400) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Determine if error is operational (expected) or programming error
 */
const isOperationalError = (error) => {
  if (error.isOperational !== undefined) {
    return error.isOperational;
  }
  
  // Known operational error types
  const operationalErrors = [
    'ValidationError',
    'CastError',
    'MongoError',
    'MongooseError',
    'JsonWebTokenError',
    'TokenExpiredError',
    'MulterError',
    'SyntaxError',
  ];
  
  return operationalErrors.includes(error.name) || error.statusCode < 500;
};

/**
 * Get appropriate HTTP status code for error
 */
const getStatusCode = (error) => {
  if (error.statusCode) {
    return error.statusCode;
  }
  
  switch (error.name) {
    case 'ValidationError':
    case 'CastError':
      return 400;
    case 'JsonWebTokenError':
    case 'TokenExpiredError':
      return 401;
    case 'MongoError':
      if (error.code === 11000) return 409; // Duplicate key
      return 500;
    case 'MulterError':
      if (error.code === 'LIMIT_FILE_SIZE') return 413;
      if (error.code === 'LIMIT_FILE_COUNT') return 400;
      return 400;
    case 'SyntaxError':
      return 400;
    default:
      return 500;
  }
};

/**
 * Format error response based on environment
 */
const formatErrorResponse = (error, req) => {
  const statusCode = getStatusCode(error);
  const isOperational = isOperationalError(error);
  
  const response = {
    success: false,
    error: {
      type: error.name || 'Error',
      message: error.message || 'An error occurred',
      timestamp: new Date().toISOString(),
      requestId: req.id,
    },
  };
  
  // Add additional error details in development
  if (config.server.env === 'development') {
    response.error.stack = error.stack;
    response.error.isOperational = isOperational;
    
    if (error.provider) response.error.provider = error.provider;
    if (error.operation) response.error.operation = error.operation;
    if (error.field) response.error.field = error.field;
    if (error.retryAfter) response.error.retryAfter = error.retryAfter;
  }
  
  // Add retry information for rate limit errors
  if (error.name === 'RateLimitError' && error.retryAfter) {
    response.error.retryAfter = error.retryAfter;
  }
  
  return { statusCode, response };
};

/**
 * Log error with appropriate level and context
 */
const logError = (error, req, res) => {
  const span = telemetryService.startSpan('error_handler.log_error');
  
  try {
    const errorContext = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        statusCode: getStatusCode(error),
        isOperational: isOperationalError(error),
      },
      request: {
        id: req.id,
        method: req.method,
        url: req.url,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        body: req.method !== 'GET' ? req.body : undefined,
        query: req.query,
        params: req.params,
      },
      response: {
        statusCode: res.statusCode,
      },
    };
    
    span.setAttributes({
      'error.name': error.name,
      'error.message': error.message,
      'error.status_code': getStatusCode(error),
      'error.is_operational': isOperationalError(error),
      'request.method': req.method,
      'request.path': req.path,
      'request.user_id': req.user?.id,
    });
    
    // Record exception in telemetry
    span.recordException(error);
    
    // Increment error metrics
    telemetryService.incrementCounter('errors_total', {
      error_type: error.name,
      status_code: getStatusCode(error).toString(),
      endpoint: req.path,
      method: req.method,
    });
    
    // Log with appropriate level
    if (isOperationalError(error)) {
      if (getStatusCode(error) >= 500) {
        logger.error('Operational error occurred', errorContext);
      } else {
        logger.warn('Client error occurred', errorContext);
      }
    } else {
      logger.error('Programming error occurred', errorContext);
    }
    
    span.end();
    
  } catch (loggingError) {
    span.recordException(loggingError);
    span.end();
    
    // Fallback logging
    console.error('Error in error logging:', loggingError);
    console.error('Original error:', error);
  }
};

/**
 * Handle Joi validation errors
 */
const handleJoiError = (error) => {
  const message = error.details
    .map(detail => detail.message)
    .join(', ');
  
  return new ValidationError(message, error.details[0]?.path?.join('.'));
};

/**
 * Handle MongoDB errors
 */
const handleMongoError = (error) => {
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return new DatabaseError(
      `Duplicate value for field: ${field}`,
      'duplicate_key',
      409
    );
  }
  
  return new DatabaseError(
    error.message || 'Database operation failed',
    'mongo_error'
  );
};

/**
 * Handle Mongoose errors
 */
const handleMongooseError = (error) => {
  if (error.name === 'CastError') {
    return new ValidationError(
      `Invalid ${error.path}: ${error.value}`,
      error.path
    );
  }
  
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors)
      .map(err => err.message)
      .join(', ');
    
    return new ValidationError(messages);
  }
  
  return new DatabaseError(
    error.message || 'Database validation failed',
    'mongoose_error'
  );
};

/**
 * Handle JWT errors
 */
const handleJWTError = (error) => {
  if (error.name === 'TokenExpiredError') {
    return new OperationalError('Token has expired', 401);
  }
  
  if (error.name === 'JsonWebTokenError') {
    return new OperationalError('Invalid token', 401);
  }
  
  return new OperationalError('Authentication failed', 401);
};

/**
 * Handle Multer errors
 */
const handleMulterError = (error) => {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return new ValidationError('File too large', 'file', 413);
    case 'LIMIT_FILE_COUNT':
      return new ValidationError('Too many files', 'files', 400);
    case 'LIMIT_UNEXPECTED_FILE':
      return new ValidationError('Unexpected file field', 'file', 400);
    default:
      return new ValidationError('File upload error', 'file', 400);
  }
};

/**
 * Handle syntax errors (malformed JSON, etc.)
 */
const handleSyntaxError = (error) => {
  if (error.type === 'entity.parse.failed') {
    return new ValidationError('Invalid JSON in request body', 'body');
  }
  
  return new ValidationError('Syntax error in request', 'syntax');
};

/**
 * Main error handling middleware
 */
const errorHandler = (error, req, res, next) => {
  const span = telemetryService.startSpan('error_handler.handle_error');
  
  try {
    let processedError = error;
    
    // Transform specific error types
    switch (error.name) {
      case 'ValidationError':
        if (error.isJoi) {
          processedError = handleJoiError(error);
        } else if (error.errors) {
          processedError = handleMongooseError(error);
        }
        break;
      case 'MongoError':
      case 'MongoServerError':
        processedError = handleMongoError(error);
        break;
      case 'CastError':
        processedError = handleMongooseError(error);
        break;
      case 'JsonWebTokenError':
      case 'TokenExpiredError':
        processedError = handleJWTError(error);
        break;
      case 'MulterError':
        processedError = handleMulterError(error);
        break;
      case 'SyntaxError':
        processedError = handleSyntaxError(error);
        break;
    }
    
    // Log the error
    logError(processedError, req, res);
    
    // Format and send response
    const { statusCode, response } = formatErrorResponse(processedError, req);
    
    span.setAttributes({
      'error.processed_type': processedError.name,
      'error.status_code': statusCode,
      'response.sent': true,
    });
    
    // Set response headers
    if (processedError.name === 'RateLimitError' && processedError.retryAfter) {
      res.set('Retry-After', processedError.retryAfter);
    }
    
    res.status(statusCode).json(response);
    
    span.end();
    
  } catch (handlerError) {
    span.recordException(handlerError);
    span.end();
    
    // Fallback error response
    logger.error('Error in error handler', {
      originalError: error.message,
      handlerError: handlerError.message,
      requestId: req.id,
    });
    
    res.status(500).json({
      success: false,
      error: {
        type: 'InternalServerError',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
        requestId: req.id,
      },
    });
  }
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  const span = telemetryService.startSpan('error_handler.not_found');
  
  span.setAttributes({
    'request.method': req.method,
    'request.path': req.path,
    'request.user_id': req.user?.id,
  });
  
  logger.warn('Route not found', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    requestId: req.id,
  });
  
  telemetryService.incrementCounter('not_found_total', {
    method: req.method,
    path: req.path,
  });
  
  span.end();
  
  res.status(404).json({
    success: false,
    error: {
      type: 'NotFoundError',
      message: `Route ${req.method} ${req.path} not found`,
      timestamp: new Date().toISOString(),
      requestId: req.id,
    },
  });
};

/**
 * Global uncaught exception handler
 */
const handleUncaughtException = (error) => {
  logger.error('Uncaught Exception - shutting down gracefully', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  });
  
  telemetryService.incrementCounter('uncaught_exceptions_total');
  
  // Give time for logging before exit
  setTimeout(() => {
    process.exit(1);
  }, 1000);
};

/**
 * Global unhandled promise rejection handler
 */
const handleUnhandledRejection = (reason, promise) => {
  logger.error('Unhandled Promise Rejection - shutting down gracefully', {
    reason: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack,
    } : reason,
    promise: promise.toString(),
  });
  
  telemetryService.incrementCounter('unhandled_rejections_total');
  
  // Give time for logging before exit
  setTimeout(() => {
    process.exit(1);
  }, 1000);
};

/**
 * Setup global error handlers
 */
const setupGlobalHandlers = () => {
  process.on('uncaughtException', handleUncaughtException);
  process.on('unhandledRejection', handleUnhandledRejection);
  
  logger.info('Global error handlers registered');
};

/**
 * Create error with context
 */
const createError = (message, statusCode = 500, type = 'OperationalError', context = {}) => {
  const error = new Error(message);
  error.name = type;
  error.statusCode = statusCode;
  error.isOperational = true;
  
  // Add context properties
  Object.assign(error, context);
  
  return error;
};

module.exports = {
  // Error classes
  OperationalError,
  AIServiceError,
  RateLimitError,
  DatabaseError,
  CacheError,
  ValidationError,
  
  // Middleware
  errorHandler,
  notFoundHandler,
  
  // Utilities
  isOperationalError,
  getStatusCode,
  formatErrorResponse,
  logError,
  createError,
  
  // Global handlers
  setupGlobalHandlers,
  handleUncaughtException,
  handleUnhandledRejection,
  
  // Specific error handlers
  handleJoiError,
  handleMongoError,
  handleMongooseError,
  handleJWTError,
  handleMulterError,
  handleSyntaxError,
};