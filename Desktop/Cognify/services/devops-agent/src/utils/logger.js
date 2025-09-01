/**
 * Logger Utility for DevOps AI Agent
 * Provides structured logging with different levels and contexts
 */

'use strict';

const winston = require('winston');
const path = require('path');
const config = require('../config/config');

// Custom log levels
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
    trace: 5,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
    trace: 'cyan',
  },
};

// Add colors to winston
winston.addColors(customLevels.colors);

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, service = 'devops-agent', ...meta } = info;
    
    const logEntry = {
      timestamp,
      level,
      service,
      message,
      ...meta,
    };
    
    // Add trace ID if available
    if (global.traceId) {
      logEntry.traceId = global.traceId;
    }
    
    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS',
  }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, service = 'devops-agent', ...meta } = info;
    
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ' ' + JSON.stringify(meta, null, 0);
    }
    
    return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
  })
);

// Create transports
const transports = [];

// Console transport
if (config.logging.console.enabled) {
  transports.push(
    new winston.transports.Console({
      level: config.logging.console.level,
      format: config.env === 'production' ? structuredFormat : consoleFormat,
      handleExceptions: true,
      handleRejections: true,
    })
  );
}

// File transports
if (config.logging.file.enabled) {
  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: path.join(config.logging.file.dir, 'combined.log'),
      level: config.logging.file.level,
      format: structuredFormat,
      maxsize: config.logging.file.maxSize,
      maxFiles: config.logging.file.maxFiles,
      handleExceptions: true,
      handleRejections: true,
    })
  );
  
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(config.logging.file.dir, 'error.log'),
      level: 'error',
      format: structuredFormat,
      maxsize: config.logging.file.maxSize,
      maxFiles: config.logging.file.maxFiles,
    })
  );
  
  // HTTP log file
  transports.push(
    new winston.transports.File({
      filename: path.join(config.logging.file.dir, 'http.log'),
      level: 'http',
      format: structuredFormat,
      maxsize: config.logging.file.maxSize,
      maxFiles: config.logging.file.maxFiles,
      filter: (info) => info.level === 'http',
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  levels: customLevels.levels,
  level: config.logging.level,
  format: structuredFormat,
  transports,
  exitOnError: false,
});

// Add request logging middleware
logger.requestMiddleware = (req, res, next) => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || req.id || 'unknown';
  
  // Set trace ID for this request
  global.traceId = requestId;
  
  // Log request start
  logger.http('Request started', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    requestId,
  });
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    
    logger.http('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      requestId,
    });
    
    // Clear trace ID
    global.traceId = undefined;
    
    originalEnd.apply(this, args);
  };
  
  next();
};

// Add specialized logging methods
logger.logTask = (message, meta = {}) => {
  logger.info(message, {
    ...meta,
    category: 'task',
  });
};

logger.logAiOperation = (message, meta = {}) => {
  logger.info(message, {
    ...meta,
    category: 'ai',
  });
};

logger.logCacheOperation = (message, meta = {}) => {
  logger.debug(message, {
    ...meta,
    category: 'cache',
  });
};

logger.logSecurity = (message, meta = {}) => {
  logger.warn(message, {
    ...meta,
    category: 'security',
  });
};

logger.logPerformance = (message, meta = {}) => {
  logger.info(message, {
    ...meta,
    category: 'performance',
  });
};

logger.logRateLimit = (message, meta = {}) => {
  logger.warn(message, {
    ...meta,
    category: 'rateLimit',
  });
};

logger.logValidation = (message, meta = {}) => {
  logger.warn(message, {
    ...meta,
    category: 'validation',
  });
};

logger.logAuth = (message, meta = {}) => {
  logger.info(message, {
    ...meta,
    category: 'auth',
  });
};

logger.logDeployment = (message, meta = {}) => {
  logger.info(message, {
    ...meta,
    category: 'deployment',
  });
};

logger.logInfrastructure = (message, meta = {}) => {
  logger.info(message, {
    ...meta,
    category: 'infrastructure',
  });
};

logger.logMonitoring = (message, meta = {}) => {
  logger.info(message, {
    ...meta,
    category: 'monitoring',
  });
};

logger.logConfiguration = (message, meta = {}) => {
  logger.info(message, {
    ...meta,
    category: 'configuration',
  });
};

// Add error logging with context
logger.logError = (error, context = {}) => {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    name: error.name,
    code: error.code,
    ...context,
  };
  
  logger.error('Error occurred', errorInfo);
};

// Add startup logging
logger.logStartup = (message, meta = {}) => {
  logger.info(message, {
    ...meta,
    category: 'startup',
  });
};

// Add shutdown logging
logger.logShutdown = (message, meta = {}) => {
  logger.info(message, {
    ...meta,
    category: 'shutdown',
  });
};

// Add health check logging
logger.logHealth = (message, meta = {}) => {
  logger.debug(message, {
    ...meta,
    category: 'health',
  });
};

// Add metrics logging
logger.logMetrics = (message, meta = {}) => {
  logger.debug(message, {
    ...meta,
    category: 'metrics',
  });
};

// Add configuration logging
logger.logConfig = (message, meta = {}) => {
  // Sanitize sensitive configuration data
  const sanitizedMeta = { ...meta };
  
  // Remove sensitive fields
  const sensitiveFields = [
    'password', 'secret', 'key', 'token', 'apiKey',
    'connectionString', 'credentials', 'auth',
  ];
  
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = sensitiveFields.some(field => 
        lowerKey.includes(field.toLowerCase())
      );
      
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        sanitized[key] = sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };
  
  logger.info(message, {
    ...sanitize(sanitizedMeta),
    category: 'config',
  });
};

// Add timer utility
logger.timer = (label) => {
  const start = Date.now();
  
  return {
    end: (message = `Timer ${label} completed`, meta = {}) => {
      const duration = Date.now() - start;
      logger.logPerformance(message, {
        ...meta,
        timer: label,
        duration,
      });
      return duration;
    },
  };
};

// Add child logger creation
logger.child = (defaultMeta = {}) => {
  return {
    error: (message, meta = {}) => logger.error(message, { ...defaultMeta, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { ...defaultMeta, ...meta }),
    info: (message, meta = {}) => logger.info(message, { ...defaultMeta, ...meta }),
    http: (message, meta = {}) => logger.http(message, { ...defaultMeta, ...meta }),
    debug: (message, meta = {}) => logger.debug(message, { ...defaultMeta, ...meta }),
    trace: (message, meta = {}) => logger.trace(message, { ...defaultMeta, ...meta }),
    
    // Specialized methods
    logTask: (message, meta = {}) => logger.logTask(message, { ...defaultMeta, ...meta }),
    logAiOperation: (message, meta = {}) => logger.logAiOperation(message, { ...defaultMeta, ...meta }),
    logCacheOperation: (message, meta = {}) => logger.logCacheOperation(message, { ...defaultMeta, ...meta }),
    logSecurity: (message, meta = {}) => logger.logSecurity(message, { ...defaultMeta, ...meta }),
    logPerformance: (message, meta = {}) => logger.logPerformance(message, { ...defaultMeta, ...meta }),
    logError: (error, context = {}) => logger.logError(error, { ...defaultMeta, ...context }),
  };
};

// Handle uncaught exceptions and unhandled rejections
if (config.logging.handleExceptions) {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack,
      category: 'uncaughtException',
    });
    
    // Give logger time to write before exiting
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
      category: 'unhandledRejection',
    });
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.logShutdown('Received SIGINT, shutting down gracefully');
  
  // Close logger transports
  logger.end();
  
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

process.on('SIGTERM', () => {
  logger.logShutdown('Received SIGTERM, shutting down gracefully');
  
  // Close logger transports
  logger.end();
  
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

module.exports = logger;