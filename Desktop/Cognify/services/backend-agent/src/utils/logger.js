/**
 * Logger Utility for Backend AI Agent
 * Provides structured logging with multiple transports and log levels
 */

'use strict';

const winston = require('winston');
const path = require('path');
const fs = require('fs-extra');
const config = require('../config/config');

// Ensure log directory exists
fs.ensureDirSync(config.logging.filePath);

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({
    fillExcept: ['message', 'level', 'timestamp', 'label'],
  }),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: config.logging.colorize }),
  winston.format.printf(({ timestamp, level, message, metadata, stack }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (metadata && Object.keys(metadata).length > 0) {
      log += ` ${JSON.stringify(metadata)}`;
    }
    
    // Add stack trace if present
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Create transports
const transports = [];

// Console transport
if (!config.isTest) {
  transports.push(
    new winston.transports.Console({
      level: config.logging.level,
      format: config.isDevelopment ? consoleFormat : logFormat,
      handleExceptions: config.logging.handleExceptions,
      handleRejections: config.logging.handleRejections,
    })
  );
}

// File transport for all logs
transports.push(
  new winston.transports.File({
    filename: path.join(config.logging.filePath, 'backend-agent.log'),
    level: config.logging.level,
    format: logFormat,
    maxsize: config.logging.maxSize,
    maxFiles: config.logging.maxFiles,
    tailable: true,
    handleExceptions: config.logging.handleExceptions,
    handleRejections: config.logging.handleRejections,
  })
);

// Error file transport
transports.push(
  new winston.transports.File({
    filename: path.join(config.logging.filePath, 'backend-agent-error.log'),
    level: 'error',
    format: logFormat,
    maxsize: config.logging.maxSize,
    maxFiles: config.logging.maxFiles,
    tailable: true,
    handleExceptions: config.logging.handleExceptions,
    handleRejections: config.logging.handleRejections,
  })
);

// Daily rotate file transport for production
if (config.isProduction) {
  const DailyRotateFile = require('winston-daily-rotate-file');
  
  transports.push(
    new DailyRotateFile({
      filename: path.join(config.logging.filePath, 'backend-agent-%DATE%.log'),
      datePattern: config.logging.datePattern,
      zippedArchive: config.logging.compress,
      maxSize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      level: config.logging.level,
      format: logFormat,
      handleExceptions: config.logging.handleExceptions,
      handleRejections: config.logging.handleRejections,
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: 'backend-agent',
    version: process.env.npm_package_version || '1.0.0',
    environment: config.env,
    pid: process.pid,
    hostname: require('os').hostname(),
  },
  transports,
  exitOnError: false,
});

// Add request ID to logs when available
logger.addRequestId = (requestId) => {
  return logger.child({ requestId });
};

// Add correlation ID to logs when available
logger.addCorrelationId = (correlationId) => {
  return logger.child({ correlationId });
};

// Add user context to logs
logger.addUserContext = (userId, userRole) => {
  return logger.child({ userId, userRole });
};

// Add task context to logs
logger.addTaskContext = (taskId, taskType) => {
  return logger.child({ taskId, taskType });
};

// Performance logging helper
logger.logPerformance = (operation, duration, metadata = {}) => {
  logger.info('Performance metric', {
    operation,
    duration,
    unit: 'ms',
    ...metadata,
  });
};

// Security logging helper
logger.logSecurity = (event, details = {}) => {
  logger.warn('Security event', {
    securityEvent: event,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

// API logging helper
logger.logAPI = (method, url, statusCode, duration, metadata = {}) => {
  const level = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'info';
  
  logger[level]('API request', {
    method,
    url,
    statusCode,
    duration,
    unit: 'ms',
    ...metadata,
  });
};

// Database logging helper
logger.logDatabase = (operation, collection, duration, metadata = {}) => {
  logger.info('Database operation', {
    operation,
    collection,
    duration,
    unit: 'ms',
    ...metadata,
  });
};

// Cache logging helper
logger.logCache = (operation, key, hit, duration, metadata = {}) => {
  logger.debug('Cache operation', {
    operation,
    key,
    hit,
    duration,
    unit: 'ms',
    ...metadata,
  });
};

// AI operation logging helper
logger.logAI = (operation, model, tokens, duration, metadata = {}) => {
  logger.info('AI operation', {
    operation,
    model,
    tokens,
    duration,
    unit: 'ms',
    ...metadata,
  });
};

// Task logging helper
logger.logTask = (taskId, taskType, status, duration, metadata = {}) => {
  const level = status === 'failed' ? 'error' : 'info';
  
  logger[level]('Task operation', {
    taskId,
    taskType,
    status,
    duration,
    unit: 'ms',
    ...metadata,
  });
};

// Health check logging helper
logger.logHealth = (component, status, details = {}) => {
  const level = status === 'healthy' ? 'info' : status === 'degraded' ? 'warn' : 'error';
  
  logger[level]('Health check', {
    component,
    status,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

// Metrics logging helper
logger.logMetrics = (metrics) => {
  logger.info('Metrics snapshot', {
    metrics,
    timestamp: new Date().toISOString(),
  });
};

// Error logging with context
logger.logError = (error, context = {}) => {
  logger.error('Application error', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    context,
    timestamp: new Date().toISOString(),
  });
};

// Startup logging
logger.logStartup = (component, details = {}) => {
  logger.info('Component started', {
    component,
    ...details,
    timestamp: new Date().toISOString(),
  });
};

// Shutdown logging
logger.logShutdown = (component, details = {}) => {
  logger.info('Component shutdown', {
    component,
    ...details,
    timestamp: new Date().toISOString(),
  });
};

// Configuration logging (without sensitive data)
logger.logConfig = (configSection, config) => {
  // Remove sensitive fields
  const sanitizedConfig = { ...config };
  const sensitiveFields = ['password', 'secret', 'key', 'token', 'apiKey'];
  
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        sanitized[key] = sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };
  
  logger.info('Configuration loaded', {
    section: configSection,
    config: sanitize(sanitizedConfig),
  });
};

// Stream for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

// Handle uncaught exceptions and unhandled rejections
if (config.logging.handleExceptions) {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      timestamp: new Date().toISOString(),
    });
    
    // Give logger time to write before exiting
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
}

if (config.logging.handleRejections) {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      reason: reason instanceof Error ? {
        name: reason.name,
        message: reason.message,
        stack: reason.stack,
      } : reason,
      promise: promise.toString(),
      timestamp: new Date().toISOString(),
    });
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  logger.end();
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  logger.end();
});

module.exports = logger;