const winston = require('winston');
const path = require('path');

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define log colors
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Tell winston that you want to link the colors
winston.addColors(logColors);

// Define which transports the logger must use
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
      winston.format.colorize({ all: true }),
      winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`
      )
    )
  }),
  
  // File transport for errors
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
      winston.format.json()
    )
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'combined.log'),
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
      winston.format.json()
    )
  })
];

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'cognify-ai-orchestrator',
    version: process.env.SERVICE_VERSION || '1.0.0'
  },
  transports,
  // Do not exit on handled exceptions
  exitOnError: false
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// HTTP request logging middleware
const httpLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.http(`${req.method} ${req.url}`, {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'http';
    
    logger.log(logLevel, `${req.method} ${req.url} ${res.statusCode} - ${duration}ms`, {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length'),
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
  });
  
  next();
};

// Error logging middleware
const errorLogger = (err, req, res, next) => {
  logger.error('Unhandled error', {
    error: {
      message: err.message,
      stack: err.stack,
      name: err.name
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query
    },
    timestamp: new Date().toISOString()
  });
  
  next(err);
};

// Task logging helpers
const taskLogger = {
  created: (taskId, taskType, metadata = {}) => {
    logger.info(`Task created: ${taskId}`, {
      taskId,
      taskType,
      operation: 'create',
      ...metadata,
      timestamp: new Date().toISOString()
    });
  },
  
  started: (taskId, taskType, metadata = {}) => {
    logger.info(`Task started: ${taskId}`, {
      taskId,
      taskType,
      operation: 'start',
      ...metadata,
      timestamp: new Date().toISOString()
    });
  },
  
  completed: (taskId, taskType, duration, metadata = {}) => {
    logger.info(`Task completed: ${taskId}`, {
      taskId,
      taskType,
      operation: 'complete',
      duration,
      ...metadata,
      timestamp: new Date().toISOString()
    });
  },
  
  failed: (taskId, taskType, error, metadata = {}) => {
    logger.error(`Task failed: ${taskId}`, {
      taskId,
      taskType,
      operation: 'fail',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      ...metadata,
      timestamp: new Date().toISOString()
    });
  },
  
  progress: (taskId, taskType, progress, metadata = {}) => {
    logger.debug(`Task progress: ${taskId} - ${progress}%`, {
      taskId,
      taskType,
      operation: 'progress',
      progress,
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }
};

// Agent logging helpers
const agentLogger = {
  registered: (agentId, agentType, metadata = {}) => {
    logger.info(`Agent registered: ${agentId}`, {
      agentId,
      agentType,
      operation: 'register',
      ...metadata,
      timestamp: new Date().toISOString()
    });
  },
  
  unregistered: (agentId, agentType, metadata = {}) => {
    logger.info(`Agent unregistered: ${agentId}`, {
      agentId,
      agentType,
      operation: 'unregister',
      ...metadata,
      timestamp: new Date().toISOString()
    });
  },
  
  request: (agentId, agentType, requestData, metadata = {}) => {
    logger.debug(`Agent request: ${agentId}`, {
      agentId,
      agentType,
      operation: 'request',
      requestData,
      ...metadata,
      timestamp: new Date().toISOString()
    });
  },
  
  response: (agentId, agentType, responseTime, metadata = {}) => {
    logger.debug(`Agent response: ${agentId}`, {
      agentId,
      agentType,
      operation: 'response',
      responseTime,
      ...metadata,
      timestamp: new Date().toISOString()
    });
  },
  
  error: (agentId, agentType, error, metadata = {}) => {
    logger.error(`Agent error: ${agentId}`, {
      agentId,
      agentType,
      operation: 'error',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }
};

// Event logging helpers
const eventLogger = {
  published: (eventType, eventId, metadata = {}) => {
    logger.debug(`Event published: ${eventType}`, {
      eventType,
      eventId,
      operation: 'publish',
      ...metadata,
      timestamp: new Date().toISOString()
    });
  },
  
  consumed: (eventType, eventId, metadata = {}) => {
    logger.debug(`Event consumed: ${eventType}`, {
      eventType,
      eventId,
      operation: 'consume',
      ...metadata,
      timestamp: new Date().toISOString()
    });
  },
  
  error: (eventType, eventId, error, metadata = {}) => {
    logger.error(`Event error: ${eventType}`, {
      eventType,
      eventId,
      operation: 'error',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }
};

// Service logging helpers
const serviceLogger = {
  startup: (serviceName, port, metadata = {}) => {
    logger.info(`Service started: ${serviceName}`, {
      serviceName,
      port,
      operation: 'startup',
      ...metadata,
      timestamp: new Date().toISOString()
    });
  },
  
  shutdown: (serviceName, metadata = {}) => {
    logger.info(`Service shutdown: ${serviceName}`, {
      serviceName,
      operation: 'shutdown',
      ...metadata,
      timestamp: new Date().toISOString()
    });
  },
  
  healthCheck: (serviceName, status, metadata = {}) => {
    const logLevel = status === 'healthy' ? 'debug' : 'warn';
    logger.log(logLevel, `Health check: ${serviceName} - ${status}`, {
      serviceName,
      status,
      operation: 'health_check',
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }
};

// Export logger and helpers
module.exports = {
  ...logger,
  httpLogger,
  errorLogger,
  taskLogger,
  agentLogger,
  eventLogger,
  serviceLogger
};