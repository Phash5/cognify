/**
 * Error Handler Middleware for Frontend AI Agent
 * Centralized error handling with logging and telemetry
 */

'use strict';

const httpStatus = require('http-status-codes');
const createError = require('http-errors');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const telemetryService = require('../services/telemetryService');

/**
 * Custom error classes
 */
class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = httpStatus.StatusCodes.BAD_REQUEST;
    this.details = details;
    this.isOperational = true;
  }
}

class AIServiceError extends Error {
  constructor(message, provider = 'unknown', statusCode = httpStatus.StatusCodes.SERVICE_UNAVAILABLE) {
    super(message);
    this.name = 'AIServiceError';
    this.statusCode = statusCode;
    this.provider = provider;
    this.isOperational = true;
  }
}

class CacheError extends Error {
  constructor(message, operation = 'unknown') {
    super(message);
    this.name = 'CacheError';
    this.statusCode = httpStatus.StatusCodes.INTERNAL_SERVER_ERROR;
    this.operation = operation;
    this.isOperational = true;
  }
}

class TaskError extends Error {
  constructor(message, taskId = null, statusCode = httpStatus.StatusCodes.UNPROCESSABLE_ENTITY) {
    super(message);
    this.name = 'TaskError';
    this.statusCode = statusCode;
    this.taskId = taskId;
    this.isOperational = true;
  }
}

class RateLimitError extends Error {
  constructor(message, retryAfter = 60) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = httpStatus.StatusCodes.TOO_MANY_REQUESTS;
    this.retryAfter = retryAfter;
    this.isOperational = true;
  }
}

class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = httpStatus.StatusCodes.UNAUTHORIZED;
    this.isOperational = true;
  }
}

class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = httpStatus.StatusCodes.FORBIDDEN;
    this.isOperational = true;
  }
}

/**
 * Error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  const errorId = uuidv4();
  const requestId = req.requestId || uuidv4();
  const requestLogger = logger.addRequestId(requestId);

  // Set default error properties
  let statusCode = err.statusCode || httpStatus.StatusCodes.INTERNAL_SERVER_ERROR;
  let message = err.message || 'Internal Server Error';
  let details = err.details || null;
  let errorType = err.name || 'UnknownError';

  // Handle specific error types
  if (err instanceof ValidationError) {
    statusCode = httpStatus.StatusCodes.BAD_REQUEST;
    details = err.details;
  } else if (err instanceof AIServiceError) {
    statusCode = err.statusCode;
    details = { provider: err.provider };
  } else if (err instanceof CacheError) {
    statusCode = httpStatus.StatusCodes.INTERNAL_SERVER_ERROR;
    details = { operation: err.operation };
  } else if (err instanceof TaskError) {
    statusCode = err.statusCode;
    details = { taskId: err.taskId };
  } else if (err instanceof RateLimitError) {
    statusCode = httpStatus.StatusCodes.TOO_MANY_REQUESTS;
    res.set('Retry-After', err.retryAfter);
    details = { retryAfter: err.retryAfter };
  } else if (err instanceof AuthenticationError) {
    statusCode = httpStatus.StatusCodes.UNAUTHORIZED;
  } else if (err instanceof AuthorizationError) {
    statusCode = httpStatus.StatusCodes.FORBIDDEN;
  } else if (createError.isHttpError(err)) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err.name === 'SyntaxError' && err.type === 'entity.parse.failed') {
    statusCode = httpStatus.StatusCodes.BAD_REQUEST;
    message = 'Invalid JSON in request body';
    errorType = 'ParseError';
  } else if (err.name === 'MulterError') {
    statusCode = httpStatus.StatusCodes.BAD_REQUEST;
    message = 'File upload error';
    errorType = 'FileUploadError';
    details = { code: err.code };
  }

  // Determine if error should be logged
  const shouldLog = statusCode >= 500 || !err.isOperational;

  // Log error
  if (shouldLog) {
    requestLogger.logError(err, {
      errorId,
      requestId,
      statusCode,
      errorType,
      url: req.originalUrl,
      method: req.method,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      stack: err.stack,
    });
  } else {
    requestLogger.logWarning(`Operational error: ${message}`, {
      errorId,
      requestId,
      statusCode,
      errorType,
      url: req.originalUrl,
      method: req.method,
    });
  }

  // Record telemetry
  telemetryService.recordError(errorType, req.route?.path || req.originalUrl, {
    statusCode,
    errorId,
    requestId,
  });

  // Prepare error response
  const errorResponse = {
    error: {
      id: errorId,
      type: errorType,
      message: message,
      statusCode: statusCode,
      timestamp: new Date().toISOString(),
    },
  };

  // Add details in development mode or for client errors
  if (process.env.NODE_ENV === 'development' || statusCode < 500) {
    if (details) {
      errorResponse.error.details = details;
    }
    
    if (process.env.NODE_ENV === 'development' && err.stack) {
      errorResponse.error.stack = err.stack;
    }
  }

  // Add request ID for tracking
  errorResponse.error.requestId = requestId;

  // Set security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  });

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
  const error = createError(httpStatus.StatusCodes.NOT_FOUND, `Route ${req.originalUrl} not found`);
  next(error);
};

/**
 * Async error wrapper
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Validation error helper
 */
const createValidationError = (message, details = []) => {
  return new ValidationError(message, details);
};

/**
 * AI service error helper
 */
const createAIServiceError = (message, provider = 'unknown', statusCode = httpStatus.StatusCodes.SERVICE_UNAVAILABLE) => {
  return new AIServiceError(message, provider, statusCode);
};

/**
 * Cache error helper
 */
const createCacheError = (message, operation = 'unknown') => {
  return new CacheError(message, operation);
};

/**
 * Task error helper
 */
const createTaskError = (message, taskId = null, statusCode = httpStatus.StatusCodes.UNPROCESSABLE_ENTITY) => {
  return new TaskError(message, taskId, statusCode);
};

/**
 * Rate limit error helper
 */
const createRateLimitError = (message, retryAfter = 60) => {
  return new RateLimitError(message, retryAfter);
};

/**
 * Authentication error helper
 */
const createAuthenticationError = (message) => {
  return new AuthenticationError(message);
};

/**
 * Authorization error helper
 */
const createAuthorizationError = (message) => {
  return new AuthorizationError(message);
};

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (err) => {
  logger.logError(err, {
    type: 'uncaughtException',
    fatal: true,
  });
  
  // Give time for logging
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.logError(new Error(`Unhandled Rejection: ${reason}`), {
    type: 'unhandledRejection',
    promise: promise.toString(),
  });
  
  // Give time for logging
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

/**
 * Handle warning events
 */
process.on('warning', (warning) => {
  logger.logWarning(`Process warning: ${warning.message}`, {
    name: warning.name,
    stack: warning.stack,
  });
});

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  
  // Error classes
  ValidationError,
  AIServiceError,
  CacheError,
  TaskError,
  RateLimitError,
  AuthenticationError,
  AuthorizationError,
  
  // Error helpers
  createValidationError,
  createAIServiceError,
  createCacheError,
  createTaskError,
  createRateLimitError,
  createAuthenticationError,
  createAuthorizationError,
};