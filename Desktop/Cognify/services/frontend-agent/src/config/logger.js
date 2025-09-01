const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which level to log based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define format for file logs (without colors)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: format,
    level: level()
  }),
  
  // Error log file
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }),
  
  // Combined log file
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }),
  
  // HTTP requests log file
  new winston.transports.File({
    filename: path.join(logsDir, 'http.log'),
    level: 'http',
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 3
  })
];

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  format: fileFormat,
  transports,
  exitOnError: false
});

// HTTP request logging middleware
const httpLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent') || '',
      ip: req.ip || req.connection.remoteAddress,
      timestamp: new Date().toISOString()
    };
    
    if (res.statusCode >= 400) {
      logger.error('HTTP Request Error', logData);
    } else {
      logger.http('HTTP Request', logData);
    }
  });
  
  next();
};

// Error logging middleware
const errorLogger = (err, req, res, next) => {
  const errorData = {
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
  };
  
  logger.error('Application Error', errorData);
  next(err);
};

// Frontend-specific logging helpers
const logTask = (level, taskId, taskType, message, metadata = {}) => {
  const logData = {
    taskId,
    taskType,
    message,
    service: 'frontend-agent',
    ...metadata,
    timestamp: new Date().toISOString()
  };
  
  logger[level](`Task ${taskType}`, logData);
};

const logCodeGeneration = (level, operation, details, metadata = {}) => {
  const logData = {
    operation,
    details,
    service: 'frontend-agent',
    category: 'code-generation',
    ...metadata,
    timestamp: new Date().toISOString()
  };
  
  logger[level](`Code Generation: ${operation}`, logData);
};

const logOptimization = (level, type, before, after, metadata = {}) => {
  const logData = {
    type,
    before,
    after,
    improvement: after && before ? `${((before - after) / before * 100).toFixed(2)}%` : 'N/A',
    service: 'frontend-agent',
    category: 'optimization',
    ...metadata,
    timestamp: new Date().toISOString()
  };
  
  logger[level](`Optimization: ${type}`, logData);
};

const logAIInteraction = (level, model, operation, tokens, latency, metadata = {}) => {
  const logData = {
    model,
    operation,
    tokens,
    latency: `${latency}ms`,
    service: 'frontend-agent',
    category: 'ai-interaction',
    ...metadata,
    timestamp: new Date().toISOString()
  };
  
  logger[level](`AI Interaction: ${model}`, logData);
};

const logComponent = (level, componentName, action, metadata = {}) => {
  const logData = {
    componentName,
    action,
    service: 'frontend-agent',
    category: 'component',
    ...metadata,
    timestamp: new Date().toISOString()
  };
  
  logger[level](`Component ${action}: ${componentName}`, logData);
};

const logTest = (level, testType, testName, result, metadata = {}) => {
  const logData = {
    testType,
    testName,
    result,
    service: 'frontend-agent',
    category: 'testing',
    ...metadata,
    timestamp: new Date().toISOString()
  };
  
  logger[level](`Test ${result}: ${testName}`, logData);
};

// Service lifecycle logging
const logServiceStart = (port, environment) => {
  logger.info('Frontend Agent Service Started', {
    port,
    environment,
    service: 'frontend-agent',
    category: 'lifecycle',
    timestamp: new Date().toISOString()
  });
};

const logServiceStop = (reason) => {
  logger.info('Frontend Agent Service Stopping', {
    reason,
    service: 'frontend-agent',
    category: 'lifecycle',
    timestamp: new Date().toISOString()
  });
};

const logServiceError = (error, context) => {
  logger.error('Frontend Agent Service Error', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    context,
    service: 'frontend-agent',
    category: 'lifecycle',
    timestamp: new Date().toISOString()
  });
};

// Agent registration logging
const logAgentRegistration = (orchestratorUrl, agentId, success) => {
  const level = success ? 'info' : 'error';
  const message = success ? 'Agent registered successfully' : 'Agent registration failed';
  
  logger[level](message, {
    orchestratorUrl,
    agentId,
    service: 'frontend-agent',
    category: 'registration',
    timestamp: new Date().toISOString()
  });
};

const logHeartbeat = (orchestratorUrl, success, responseTime) => {
  const level = success ? 'debug' : 'warn';
  const message = success ? 'Heartbeat sent successfully' : 'Heartbeat failed';
  
  logger[level](message, {
    orchestratorUrl,
    responseTime: responseTime ? `${responseTime}ms` : 'N/A',
    service: 'frontend-agent',
    category: 'heartbeat',
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  logger,
  httpLogger,
  errorLogger,
  logTask,
  logCodeGeneration,
  logOptimization,
  logAIInteraction,
  logComponent,
  logTest,
  logServiceStart,
  logServiceStop,
  logServiceError,
  logAgentRegistration,
  logHeartbeat
};