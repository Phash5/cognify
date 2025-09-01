/**
 * Logger Utility
 * Centralized logging service with multiple transports and structured logging
 */

'use strict';

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config/config');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for structured logging
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      service: service || 'service-discovery',
      message,
      ...meta
    };
    
    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const serviceName = service || 'service-discovery';
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${serviceName}] ${level}: ${message}${metaStr}`;
  })
);

// Create transports array
const transports = [];

// Console transport
if (config.logging.console.enabled) {
  transports.push(
    new winston.transports.Console({
      level: config.logging.console.level,
      format: consoleFormat,
      handleExceptions: true,
      handleRejections: true,
    })
  );
}

// File transport for general logs
if (config.logging.file.enabled) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, config.logging.file.filename),
      level: config.logging.file.level,
      format: customFormat,
      maxsize: config.logging.file.maxSize,
      maxFiles: config.logging.file.maxFiles,
      handleExceptions: true,
      handleRejections: true,
    })
  );
}

// Error file transport
if (config.logging.file.enabled) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: customFormat,
      maxsize: config.logging.file.maxSize,
      maxFiles: config.logging.file.maxFiles,
      handleExceptions: true,
      handleRejections: true,
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: customFormat,
  defaultMeta: {
    service: 'service-discovery',
    version: process.env.npm_package_version || '1.0.0',
    environment: config.server.environment,
    pid: process.pid,
  },
  transports,
  exitOnError: false,
});

// Add request logging middleware
logger.requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || req.id || Math.random().toString(36).substr(2, 9);
  
  // Add request ID to request object
  req.requestId = requestId;
  
  // Log request start
  logger.info('Request started', {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    headers: {
      'content-type': req.get('Content-Type'),
      'authorization': req.get('Authorization') ? '[REDACTED]' : undefined,
    },
  });
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length'),
    });
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

// Add error logging middleware
logger.errorLogger = (err, req, res, next) => {
  logger.error('Request error', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
      status: err.status || err.statusCode,
    },
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
  });
  
  next(err);
};

// Add structured logging methods
logger.logServiceEvent = (event, data = {}) => {
  logger.info(`Service event: ${event}`, {
    event,
    ...data,
  });
};

logger.logServiceError = (operation, error, data = {}) => {
  logger.error(`Service error: ${operation}`, {
    operation,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    ...data,
  });
};

logger.logServiceMetrics = (metrics) => {
  logger.info('Service metrics', {
    metrics,
    timestamp: new Date().toISOString(),
  });
};

logger.logHealthCheck = (serviceName, instanceId, status, details = {}) => {
  logger.info('Health check performed', {
    serviceName,
    instanceId,
    status,
    ...details,
  });
};

logger.logServiceRegistration = (serviceName, instanceId, details = {}) => {
  logger.info('Service registered', {
    serviceName,
    instanceId,
    ...details,
  });
};

logger.logServiceDeregistration = (serviceName, instanceId, reason = '') => {
  logger.info('Service deregistered', {
    serviceName,
    instanceId,
    reason,
  });
};

logger.logServiceDiscovery = (serviceName, instancesFound, filters = {}) => {
  logger.debug('Service discovery', {
    serviceName,
    instancesFound,
    filters,
  });
};

// Add performance logging
logger.time = (label) => {
  const start = process.hrtime.bigint();
  
  return {
    end: (data = {}) => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to milliseconds
      
      logger.info(`Performance: ${label}`, {
        label,
        duration,
        ...data,
      });
      
      return duration;
    }
  };
};

// Add child logger creation
logger.child = (meta) => {
  return winston.createLogger({
    level: config.logging.level,
    format: customFormat,
    defaultMeta: {
      ...logger.defaultMeta,
      ...meta,
    },
    transports: logger.transports,
    exitOnError: false,
  });
};

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  });
  
  // Give logger time to write before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack,
    } : reason,
    promise: promise.toString(),
  });
});

// Log startup information
logger.info('Logger initialized', {
  level: config.logging.level,
  transports: transports.map(t => t.constructor.name),
  environment: config.server.environment,
  version: process.env.npm_package_version || '1.0.0',
});

module.exports = logger;