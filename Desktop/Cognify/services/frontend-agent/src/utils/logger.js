/**
 * Logger utility for Frontend AI Agent
 * Provides structured logging with different levels and formats
 */

'use strict';

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service = 'frontend-agent', ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      service,
      message,
      ...meta,
    };
    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, service = 'frontend-agent', ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
  })
);

// Create transports
const transports = [];

// Console transport
if (process.env.NODE_ENV !== 'test') {
  transports.push(
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
      handleExceptions: true,
      handleRejections: true,
    })
  );
}

// File transports for production
if (process.env.NODE_ENV === 'production') {
  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      format: logFormat,
      maxSize: '20m',
      maxFiles: '14d',
      handleExceptions: true,
      handleRejections: true,
    })
  );

  // Combined logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      format: logFormat,
      maxSize: '20m',
      maxFiles: '14d',
    })
  );

  // Access logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'access-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'http',
      format: logFormat,
      maxSize: '20m',
      maxFiles: '14d',
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'frontend-agent',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    hostname: require('os').hostname(),
    pid: process.pid,
  },
  transports,
  exitOnError: false,
});

// Add request ID to logs if available
logger.addRequestId = (requestId) => {
  return logger.child({ requestId });
};

// Add user context to logs
logger.addUserContext = (userId, userEmail) => {
  return logger.child({ userId, userEmail });
};

// Add task context to logs
logger.addTaskContext = (taskId, taskType) => {
  return logger.child({ taskId, taskType });
};

// Performance logging
logger.performance = (operation, duration, metadata = {}) => {
  logger.info('Performance metric', {
    operation,
    duration,
    unit: 'ms',
    ...metadata,
  });
};

// Security logging
logger.security = (event, details = {}) => {
  logger.warn('Security event', {
    securityEvent: event,
    ...details,
  });
};

// Business logic logging
logger.business = (event, details = {}) => {
  logger.info('Business event', {
    businessEvent: event,
    ...details,
  });
};

// API logging
logger.api = (method, url, statusCode, duration, metadata = {}) => {
  const level = statusCode >= 400 ? 'warn' : 'info';
  logger.log(level, 'API request', {
    method,
    url,
    statusCode,
    duration,
    unit: 'ms',
    ...metadata,
  });
};

// Database logging
logger.database = (operation, collection, duration, metadata = {}) => {
  logger.info('Database operation', {
    dbOperation: operation,
    collection,
    duration,
    unit: 'ms',
    ...metadata,
  });
};

// AI/ML logging
logger.ai = (operation, model, tokens, cost, metadata = {}) => {
  logger.info('AI operation', {
    aiOperation: operation,
    model,
    tokens,
    cost,
    ...metadata,
  });
};

// Cache logging
logger.cache = (operation, key, hit, metadata = {}) => {
  logger.debug('Cache operation', {
    cacheOperation: operation,
    key,
    hit,
    ...metadata,
  });
};

// External service logging
logger.external = (service, operation, duration, success, metadata = {}) => {
  const level = success ? 'info' : 'warn';
  logger.log(level, 'External service call', {
    externalService: service,
    operation,
    duration,
    success,
    unit: 'ms',
    ...metadata,
  });
};

// Validation logging
logger.validation = (type, success, errors = [], metadata = {}) => {
  const level = success ? 'debug' : 'warn';
  logger.log(level, 'Validation result', {
    validationType: type,
    success,
    errors,
    ...metadata,
  });
};

// Rate limiting logging
logger.rateLimit = (identifier, limit, current, metadata = {}) => {
  logger.warn('Rate limit event', {
    rateLimitIdentifier: identifier,
    limit,
    current,
    ...metadata,
  });
};

// Health check logging
logger.health = (component, status, details = {}) => {
  const level = status === 'healthy' ? 'info' : 'error';
  logger.log(level, 'Health check', {
    healthComponent: component,
    status,
    ...details,
  });
};

// Startup/shutdown logging
logger.lifecycle = (event, details = {}) => {
  logger.info('Application lifecycle', {
    lifecycleEvent: event,
    ...details,
  });
};

// Configuration logging
logger.config = (component, loaded, details = {}) => {
  logger.info('Configuration', {
    configComponent: component,
    loaded,
    ...details,
  });
};

// Metrics logging
logger.metrics = (name, value, type = 'gauge', metadata = {}) => {
  logger.debug('Metric', {
    metricName: name,
    value,
    type,
    ...metadata,
  });
};

// Error context enhancement
logger.enhanceError = (error, context = {}) => {
  return {
    message: error.message,
    stack: error.stack,
    name: error.name,
    code: error.code,
    ...context,
  };
};

// Structured error logging
logger.logError = (error, context = {}) => {
  logger.error('Error occurred', logger.enhanceError(error, context));
};

// Create child logger with context
logger.createChild = (context = {}) => {
  return logger.child(context);
};

// Log level helpers
logger.isDebugEnabled = () => logger.isLevelEnabled('debug');
logger.isInfoEnabled = () => logger.isLevelEnabled('info');
logger.isWarnEnabled = () => logger.isLevelEnabled('warn');
logger.isErrorEnabled = () => logger.isLevelEnabled('error');

// Flush logs (useful for testing)
logger.flush = () => {
  return new Promise((resolve) => {
    logger.on('finish', resolve);
    logger.end();
  });
};

// Handle uncaught exceptions and unhandled rejections
if (process.env.NODE_ENV === 'production') {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', logger.enhanceError(error));
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      reason: reason instanceof Error ? logger.enhanceError(reason) : reason,
      promise: promise.toString(),
    });
  });
}

module.exports = logger;