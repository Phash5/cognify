/**
 * Logger Utility
 * Structured logging for the Database AI Agent
 */

'use strict';

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const config = require('../config/config');

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      message,
      service: 'database-agent',
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
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

// Create transports
const transports = [];

// Console transport
transports.push(
  new winston.transports.Console({
    level: config.logging.level,
    format: config.env === 'production' ? logFormat : consoleFormat,
    handleExceptions: true,
    handleRejections: true,
  })
);

// File transports for production
if (config.env === 'production' || config.logging.enableFileLogging) {
  // Ensure logs directory exists
  const logsDir = path.join(process.cwd(), 'logs');
  
  // Combined logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'database-agent-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.maxFileSize,
      maxFiles: config.logging.maxFiles,
      format: logFormat,
      level: config.logging.level,
      handleExceptions: true,
      handleRejections: true,
    })
  );
  
  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(logsDir, 'database-agent-error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.maxFileSize,
      maxFiles: config.logging.maxFiles,
      format: logFormat,
      level: 'error',
      handleExceptions: true,
      handleRejections: true,
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  exitOnError: false,
  silent: config.env === 'test' && !config.logging.enableTestLogging,
});

// Handle uncaught exceptions and unhandled rejections
logger.exceptions.handle(
  new winston.transports.Console({
    format: consoleFormat,
  })
);

logger.rejections.handle(
  new winston.transports.Console({
    format: consoleFormat,
  })
);

// Add helper methods
logger.performance = (message, startTime, metadata = {}) => {
  const duration = Date.now() - startTime;
  logger.info(message, {
    ...metadata,
    performance: {
      duration,
      startTime,
      endTime: Date.now(),
    },
  });
};

logger.security = (message, metadata = {}) => {
  logger.warn(message, {
    ...metadata,
    category: 'security',
    timestamp: new Date().toISOString(),
  });
};

logger.api = (req, res, duration) => {
  const { method, url, ip, headers } = req;
  const { statusCode } = res;
  
  logger.info('API Request', {
    category: 'api',
    request: {
      method,
      url,
      ip,
      userAgent: headers['user-agent'],
      contentLength: headers['content-length'],
    },
    response: {
      statusCode,
      duration,
    },
  });
};

logger.database = (operation, metadata = {}) => {
  logger.debug('Database Operation', {
    ...metadata,
    category: 'database',
    operation,
    timestamp: new Date().toISOString(),
  });
};

logger.cache = (operation, key, hit = null, metadata = {}) => {
  logger.debug('Cache Operation', {
    ...metadata,
    category: 'cache',
    operation,
    key,
    hit,
    timestamp: new Date().toISOString(),
  });
};

logger.ai = (operation, model, tokens = null, metadata = {}) => {
  logger.info('AI Operation', {
    ...metadata,
    category: 'ai',
    operation,
    model,
    tokens,
    timestamp: new Date().toISOString(),
  });
};

logger.task = (taskId, status, metadata = {}) => {
  logger.info('Task Update', {
    ...metadata,
    category: 'task',
    taskId,
    status,
    timestamp: new Date().toISOString(),
  });
};

logger.health = (component, status, metadata = {}) => {
  const level = status === 'healthy' ? 'info' : 'warn';
  logger[level]('Health Check', {
    ...metadata,
    category: 'health',
    component,
    status,
    timestamp: new Date().toISOString(),
  });
};

logger.metrics = (name, value, unit = null, metadata = {}) => {
  logger.debug('Metric', {
    ...metadata,
    category: 'metrics',
    metric: {
      name,
      value,
      unit,
    },
    timestamp: new Date().toISOString(),
  });
};

logger.errorWithContext = (error, context = {}) => {
  logger.error(error.message, {
    ...context,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    timestamp: new Date().toISOString(),
  });
};

logger.startup = (component, metadata = {}) => {
  logger.info(`${component} started`, {
    ...metadata,
    category: 'startup',
    component,
    timestamp: new Date().toISOString(),
  });
};

logger.shutdown = (component, metadata = {}) => {
  logger.info(`${component} shutdown`, {
    ...metadata,
    category: 'shutdown',
    component,
    timestamp: new Date().toISOString(),
  });
};

logger.config = (configData, sanitize = true) => {
  let logData = configData;
  
  if (sanitize) {
    // Remove sensitive information
    logData = JSON.parse(JSON.stringify(configData));
    
    const sensitiveKeys = [
      'password', 'secret', 'key', 'token', 'apiKey',
      'connectionString', 'credentials', 'auth'
    ];
    
    const sanitizeObject = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        } else if (sensitiveKeys.some(sensitive => 
          key.toLowerCase().includes(sensitive.toLowerCase())
        )) {
          obj[key] = '[REDACTED]';
        }
      }
    };
    
    sanitizeObject(logData);
  }
  
  logger.info('Configuration loaded', {
    category: 'config',
    config: logData,
    timestamp: new Date().toISOString(),
  });
};

// Log startup information
logger.startup('Logger', {
  level: config.logging.level,
  transports: transports.map(t => t.constructor.name),
  environment: config.env,
});

module.exports = logger;