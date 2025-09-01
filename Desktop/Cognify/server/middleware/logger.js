const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Get current log level from environment
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

// Format timestamp
const formatTimestamp = () => {
  return new Date().toISOString();
};

// Write log to file
const writeLogToFile = (level, message, meta = {}) => {
  if (LOG_LEVELS[level.toUpperCase()] > currentLogLevel) {
    return;
  }

  const timestamp = formatTimestamp();
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    ...meta
  };

  const logString = JSON.stringify(logEntry) + '\n';
  const logFile = path.join(logsDir, `${new Date().toISOString().split('T')[0]}.log`);

  fs.appendFile(logFile, logString, (err) => {
    if (err) {
      console.error('Failed to write to log file:', err);
    }
  });
};

// Console logger with colors
const consoleLog = (level, message, meta = {}) => {
  if (LOG_LEVELS[level.toUpperCase()] > currentLogLevel) {
    return;
  }

  const timestamp = formatTimestamp();
  let color = colors.white;

  switch (level.toUpperCase()) {
    case 'ERROR':
      color = colors.red;
      break;
    case 'WARN':
      color = colors.yellow;
      break;
    case 'INFO':
      color = colors.green;
      break;
    case 'DEBUG':
      color = colors.blue;
      break;
  }

  const prefix = `${colors.gray}[${timestamp}]${colors.reset} ${color}[${level.toUpperCase()}]${colors.reset}`;
  
  if (Object.keys(meta).length > 0) {
    console.log(`${prefix} ${message}`, meta);
  } else {
    console.log(`${prefix} ${message}`);
  }
};

// Logger object
const logger = {
  error: (message, meta = {}) => {
    consoleLog('ERROR', message, meta);
    writeLogToFile('ERROR', message, meta);
  },
  warn: (message, meta = {}) => {
    consoleLog('WARN', message, meta);
    writeLogToFile('WARN', message, meta);
  },
  info: (message, meta = {}) => {
    consoleLog('INFO', message, meta);
    writeLogToFile('INFO', message, meta);
  },
  debug: (message, meta = {}) => {
    consoleLog('DEBUG', message, meta);
    writeLogToFile('DEBUG', message, meta);
  }
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  // Add request ID to request object
  req.requestId = requestId;
  
  // Add request ID to response headers
  res.set('X-Request-ID', requestId);
  
  // Log request start
  const requestInfo = {
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
    timestamp: formatTimestamp()
  };
  
  // Add user info if available
  if (req.user) {
    requestInfo.userId = req.user._id;
    requestInfo.userEmail = req.user.email;
  }
  
  logger.info(`${req.method} ${req.url}`, requestInfo);
  
  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    
    const responseInfo = {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      timestamp: formatTimestamp()
    };
    
    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error(`${req.method} ${req.url} - ${res.statusCode}`, responseInfo);
    } else if (res.statusCode >= 400) {
      logger.warn(`${req.method} ${req.url} - ${res.statusCode}`, responseInfo);
    } else {
      logger.info(`${req.method} ${req.url} - ${res.statusCode}`, responseInfo);
    }
    
    return originalJson.call(this, data);
  };
  
  // Override res.send to log response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    const responseInfo = {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      timestamp: formatTimestamp()
    };
    
    // Log based on status code
    if (res.statusCode >= 500) {
      logger.error(`${req.method} ${req.url} - ${res.statusCode}`, responseInfo);
    } else if (res.statusCode >= 400) {
      logger.warn(`${req.method} ${req.url} - ${res.statusCode}`, responseInfo);
    } else {
      logger.info(`${req.method} ${req.url} - ${res.statusCode}`, responseInfo);
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

// Security logging middleware
const securityLogger = (req, res, next) => {
  // Log suspicious activities
  const suspiciousPatterns = [
    /\.\.\//, // Path traversal
    /<script/i, // XSS attempts
    /union.*select/i, // SQL injection
    /javascript:/i, // JavaScript injection
    /eval\(/i, // Code injection
  ];
  
  const requestData = JSON.stringify({
    url: req.url,
    body: req.body,
    query: req.query,
    headers: req.headers
  });
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(requestData)) {
      logger.warn('Suspicious request detected', {
        requestId: req.requestId,
        pattern: pattern.toString(),
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: formatTimestamp()
      });
      break;
    }
  }
  
  next();
};

// Performance logging middleware
const performanceLogger = (req, res, next) => {
  const startTime = process.hrtime.bigint();
  
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    // Log slow requests (> 1 second)
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        duration: `${duration.toFixed(2)}ms`,
        statusCode: res.statusCode,
        timestamp: formatTimestamp()
      });
    }
  });
  
  next();
};

// Clean up old log files (keep last 30 days)
const cleanupLogs = () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  fs.readdir(logsDir, (err, files) => {
    if (err) {
      logger.error('Failed to read logs directory', { error: err.message });
      return;
    }
    
    files.forEach(file => {
      if (file.endsWith('.log')) {
        const filePath = path.join(logsDir, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          
          if (stats.mtime < thirtyDaysAgo) {
            fs.unlink(filePath, (err) => {
              if (err) {
                logger.error('Failed to delete old log file', { file, error: err.message });
              } else {
                logger.info('Deleted old log file', { file });
              }
            });
          }
        });
      }
    });
  });
};

// Run cleanup daily
setInterval(cleanupLogs, 24 * 60 * 60 * 1000);

module.exports = {
  logger,
  requestLogger,
  securityLogger,
  performanceLogger,
  cleanupLogs
};