import winston from 'winston';
import path from 'path';
import fs from 'fs';

/**
 * Create a structured logger for microservices
 * @param {Object} options - Logger configuration options
 * @returns {winston.Logger} Configured logger instance
 */
export function createLogger(options = {}) {
  const {
    serviceName = process.env.SERVICE_NAME || 'unknown-service',
    level = process.env.LOG_LEVEL || 'info',
    format = process.env.LOG_FORMAT || 'json',
    enableConsole = process.env.LOG_CONSOLE !== 'false',
    enableFile = process.env.LOG_FILE === 'true',
    logDir = process.env.LOG_DIR || './logs',
    maxFiles = process.env.LOG_MAX_FILES || '14d',
    maxSize = process.env.LOG_MAX_SIZE || '20m',
    enableRotation = process.env.LOG_ROTATION !== 'false',
    enableMetadata = true,
    enableCorrelation = true,
    ...customOptions
  } = options;

  // Ensure log directory exists
  if (enableFile && !fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Create custom format
  const customFormat = winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }),
    winston.format.errors({ stack: true }),
    winston.format.metadata({
      fillExcept: ['message', 'level', 'timestamp', 'label']
    }),
    winston.format.printf(({ timestamp, level, message, metadata, ...rest }) => {
      const logEntry = {
        timestamp,
        level,
        service: serviceName,
        message,
        ...rest
      };

      // Add metadata if enabled
      if (enableMetadata && metadata && Object.keys(metadata).length > 0) {
        logEntry.metadata = metadata;
      }

      // Add correlation ID if available
      if (enableCorrelation && process.env.CORRELATION_ID) {
        logEntry.correlationId = process.env.CORRELATION_ID;
      }

      // Add request ID if available
      if (process.env.REQUEST_ID) {
        logEntry.requestId = process.env.REQUEST_ID;
      }

      // Add trace ID if available
      if (process.env.TRACE_ID) {
        logEntry.traceId = process.env.TRACE_ID;
      }

      if (format === 'json') {
        return JSON.stringify(logEntry);
      } else {
        const metaStr = logEntry.metadata ? ` ${JSON.stringify(logEntry.metadata)}` : '';
        return `${timestamp} [${level.toUpperCase()}] ${serviceName}: ${message}${metaStr}`;
      }
    })
  );

  // Configure transports
  const transports = [];

  // Console transport
  if (enableConsole) {
    transports.push(
      new winston.transports.Console({
        level,
        format: format === 'json' ? customFormat : winston.format.combine(
          winston.format.colorize(),
          customFormat
        ),
        handleExceptions: true,
        handleRejections: true
      })
    );
  }

  // File transports
  if (enableFile) {
    // Combined log file
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, `${serviceName}.log`),
        level,
        format: customFormat,
        maxsize: maxSize,
        maxFiles: enableRotation ? maxFiles : undefined,
        handleExceptions: true,
        handleRejections: true
      })
    );

    // Error log file
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, `${serviceName}-error.log`),
        level: 'error',
        format: customFormat,
        maxsize: maxSize,
        maxFiles: enableRotation ? maxFiles : undefined,
        handleExceptions: true,
        handleRejections: true
      })
    );
  }

  // Create logger
  const logger = winston.createLogger({
    level,
    format: customFormat,
    transports,
    exitOnError: false,
    ...customOptions
  });

  // Add custom methods
  logger.request = function(message, metadata = {}) {
    this.info(message, {
      ...metadata,
      type: 'request',
      timestamp: new Date().toISOString()
    });
  };

  logger.response = function(message, metadata = {}) {
    this.info(message, {
      ...metadata,
      type: 'response',
      timestamp: new Date().toISOString()
    });
  };

  logger.performance = function(message, metadata = {}) {
    this.info(message, {
      ...metadata,
      type: 'performance',
      timestamp: new Date().toISOString()
    });
  };

  logger.security = function(message, metadata = {}) {
    this.warn(message, {
      ...metadata,
      type: 'security',
      timestamp: new Date().toISOString()
    });
  };

  logger.audit = function(message, metadata = {}) {
    this.info(message, {
      ...metadata,
      type: 'audit',
      timestamp: new Date().toISOString()
    });
  };

  logger.business = function(message, metadata = {}) {
    this.info(message, {
      ...metadata,
      type: 'business',
      timestamp: new Date().toISOString()
    });
  };

  logger.trace = function(message, metadata = {}) {
    this.debug(message, {
      ...metadata,
      type: 'trace',
      timestamp: new Date().toISOString()
    });
  };

  return logger;
}

/**
 * Create a child logger with additional context
 * @param {winston.Logger} parentLogger - Parent logger instance
 * @param {Object} context - Additional context to include in logs
 * @returns {winston.Logger} Child logger instance
 */
export function createChildLogger(parentLogger, context = {}) {
  return parentLogger.child(context);
}

/**
 * Logger middleware for Express applications
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware function
 */
export function loggerMiddleware(options = {}) {
  const {
    logger = createLogger(),
    includeBody = false,
    includeHeaders = false,
    excludeHeaders = ['authorization', 'cookie', 'x-api-key'],
    includeQuery = true,
    includeParams = true,
    skipPaths = ['/health', '/metrics'],
    skipMethods = [],
    logLevel = 'info'
  } = options;

  return (req, res, next) => {
    const startTime = Date.now();
    const { method, url, path } = req;

    // Skip logging for certain paths
    if (skipPaths.includes(path) || skipMethods.includes(method)) {
      return next();
    }

    // Generate request ID if not present
    if (!req.id) {
      req.id = require('uuid').v4();
    }

    // Set request ID in environment for child processes
    process.env.REQUEST_ID = req.id;

    // Prepare request metadata
    const requestMetadata = {
      requestId: req.id,
      method,
      url,
      path,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      timestamp: new Date().toISOString()
    };

    // Include query parameters
    if (includeQuery && Object.keys(req.query).length > 0) {
      requestMetadata.query = req.query;
    }

    // Include route parameters
    if (includeParams && req.params && Object.keys(req.params).length > 0) {
      requestMetadata.params = req.params;
    }

    // Include headers (filtered)
    if (includeHeaders) {
      const headers = { ...req.headers };
      excludeHeaders.forEach(header => {
        delete headers[header.toLowerCase()];
      });
      requestMetadata.headers = headers;
    }

    // Include body (be careful with sensitive data)
    if (includeBody && req.body) {
      requestMetadata.body = req.body;
    }

    // Log request
    logger.request(`${method} ${path}`, requestMetadata);

    // Capture response
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      const responseMetadata = {
        requestId: req.id,
        method,
        url,
        path,
        statusCode: res.statusCode,
        duration,
        contentLength: res.get('Content-Length'),
        timestamp: new Date().toISOString()
      };

      // Log response
      const logMethod = res.statusCode >= 400 ? 'error' : logLevel;
      logger[logMethod](`${method} ${path} ${res.statusCode}`, responseMetadata);

      // Clean up request ID from environment
      delete process.env.REQUEST_ID;

      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Error logging middleware for Express applications
 * @param {Object} options - Middleware options
 * @returns {Function} Express error middleware function
 */
export function errorLoggerMiddleware(options = {}) {
  const {
    logger = createLogger(),
    includeStack = process.env.NODE_ENV !== 'production',
    includeRequest = true
  } = options;

  return (error, req, res, next) => {
    const errorMetadata = {
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        status: error.status || error.statusCode
      },
      timestamp: new Date().toISOString()
    };

    // Include stack trace in non-production environments
    if (includeStack) {
      errorMetadata.error.stack = error.stack;
    }

    // Include request information
    if (includeRequest && req) {
      errorMetadata.request = {
        id: req.id,
        method: req.method,
        url: req.url,
        path: req.path,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
      };
    }

    // Log error
    logger.error('Request processing error', errorMetadata);

    next(error);
  };
}

/**
 * Performance logging utility
 * @param {winston.Logger} logger - Logger instance
 * @param {string} operation - Operation name
 * @param {Function} fn - Function to measure
 * @param {Object} metadata - Additional metadata
 * @returns {Promise} Function result
 */
export async function logPerformance(logger, operation, fn, metadata = {}) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage();

  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    const endMemory = process.memoryUsage();
    
    const performanceMetadata = {
      operation,
      duration,
      memory: {
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
        external: endMemory.external - startMemory.external
      },
      success: true,
      timestamp: new Date().toISOString(),
      ...metadata
    };

    logger.performance(`Operation completed: ${operation}`, performanceMetadata);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    const performanceMetadata = {
      operation,
      duration,
      success: false,
      error: {
        name: error.name,
        message: error.message
      },
      timestamp: new Date().toISOString(),
      ...metadata
    };

    logger.performance(`Operation failed: ${operation}`, performanceMetadata);
    throw error;
  }
}

/**
 * Correlation ID utilities
 */
export const correlation = {
  /**
   * Generate a new correlation ID
   * @returns {string} Correlation ID
   */
  generate() {
    return require('uuid').v4();
  },

  /**
   * Set correlation ID for current context
   * @param {string} id - Correlation ID
   */
  set(id) {
    process.env.CORRELATION_ID = id;
  },

  /**
   * Get current correlation ID
   * @returns {string|null} Correlation ID
   */
  get() {
    return process.env.CORRELATION_ID || null;
  },

  /**
   * Clear correlation ID
   */
  clear() {
    delete process.env.CORRELATION_ID;
  },

  /**
   * Execute function with correlation ID
   * @param {string} id - Correlation ID
   * @param {Function} fn - Function to execute
   * @returns {*} Function result
   */
  async withId(id, fn) {
    const previousId = this.get();
    this.set(id);
    
    try {
      return await fn();
    } finally {
      if (previousId) {
        this.set(previousId);
      } else {
        this.clear();
      }
    }
  }
};

/**
 * Default logger instance
 */
export const defaultLogger = createLogger();

/**
 * Export logger levels for convenience
 */
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  HTTP: 'http',
  VERBOSE: 'verbose',
  DEBUG: 'debug',
  SILLY: 'silly'
};

export default {
  createLogger,
  createChildLogger,
  loggerMiddleware,
  errorLoggerMiddleware,
  logPerformance,
  correlation,
  defaultLogger,
  LOG_LEVELS
};