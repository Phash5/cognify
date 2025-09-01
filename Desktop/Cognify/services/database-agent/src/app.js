/**
 * Database AI Agent Application
 * Express.js application for AI-powered database development tasks
 */

'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { v4: uuidv4 } = require('uuid');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Import configuration and utilities
const config = require('./config/config');
const logger = require('./utils/logger');
const { telemetryService } = require('./utils/telemetry');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');
const { generalLimiter, burstLimiter } = require('./middleware/rateLimiter');

// Import routes
const agentRoutes = require('./routes/agent');
const taskRoutes = require('./routes/tasks');
const healthRoutes = require('./routes/health');

// Initialize Express app
const app = express();

// Trust proxy for accurate client IP detection
app.set('trust proxy', config.server.trustProxy);

// Request ID middleware
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Request-ID',
    'X-API-Key',
  ],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
}));

// Compression middleware
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  threshold: 1024,
}));

// Body parsing middleware
app.use(express.json({
  limit: config.server.bodyLimit,
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));

app.use(express.urlencoded({
  extended: true,
  limit: config.server.bodyLimit,
}));

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  logger.logApiRequest(req, {
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length'),
  });
  
  // Start telemetry span
  const span = telemetryService.startSpan(`${req.method} ${req.route?.path || req.path}`);
  req.span = span;
  
  span.setAttributes({
    'http.method': req.method,
    'http.url': req.url,
    'http.route': req.route?.path || req.path,
    'http.user_agent': req.get('User-Agent'),
    'request.id': req.id,
  });
  
  // Response logging
  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    
    // Log response
    logger.logApiRequest(req, {
      statusCode: res.statusCode,
      responseTime,
      responseSize: data ? Buffer.byteLength(data) : 0,
    });
    
    // Update telemetry
    span.setAttributes({
      'http.status_code': res.statusCode,
      'http.response_time': responseTime,
      'http.response_size': data ? Buffer.byteLength(data) : 0,
    });
    
    telemetryService.recordHistogram('http_request_duration_ms', responseTime, {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode.toString(),
    });
    
    telemetryService.incrementCounter('http_requests_total', {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode.toString(),
    });
    
    if (res.statusCode >= 400) {
      telemetryService.incrementCounter('http_errors_total', {
        method: req.method,
        route: req.route?.path || req.path,
        status_code: res.statusCode.toString(),
      });
    }
    
    span.end();
    
    return originalSend.call(this, data);
  };
  
  next();
});

// Rate limiting middleware
if (config.rateLimit.enabled) {
  app.use(generalLimiter);
  app.use(burstLimiter);
}

// Swagger documentation setup
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Database AI Agent API',
      version: '1.0.0',
      description: 'AI-powered database development and optimization service',
      contact: {
        name: 'API Support',
        email: 'support@cognify.ai',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.server.port}`,
        description: 'Development server',
      },
      {
        url: 'https://api.cognify.ai/database-agent',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
      {
        apiKeyAuth: [],
      },
    ],
    tags: [
      {
        name: 'Agent',
        description: 'Database AI agent capabilities and operations',
      },
      {
        name: 'Tasks',
        description: 'Task management and monitoring',
      },
      {
        name: 'Health',
        description: 'Health checks and monitoring',
      },
    ],
  },
  apis: ['./src/routes/*.js'], // Path to the API docs
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Serve Swagger documentation
if (config.server.env !== 'production') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Database AI Agent API Documentation',
  }));
  
  // Serve raw OpenAPI spec
  app.get('/api/docs/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

// API routes
app.use('/api/health', healthRoutes);
app.use('/api/agent', authenticateToken, agentRoutes);
app.use('/api/tasks', authenticateToken, taskRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Database AI Agent',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    documentation: config.server.env !== 'production' ? '/api/docs' : undefined,
    endpoints: {
      health: '/api/health',
      agent: '/api/agent',
      tasks: '/api/tasks',
    },
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    service: 'Database AI Agent API',
    version: '1.0.0',
    description: 'AI-powered database development and optimization service',
    endpoints: {
      agent: {
        capabilities: 'GET /api/agent/capabilities',
        generateSchema: 'POST /api/agent/generate-schema',
        optimizeQuery: 'POST /api/agent/optimize-query',
        generateMigration: 'POST /api/agent/generate-migration',
        analyzePerformance: 'POST /api/agent/analyze-performance',
        status: 'GET /api/agent/status',
      },
      tasks: {
        list: 'GET /api/tasks',
        get: 'GET /api/tasks/:id',
        cancel: 'DELETE /api/tasks/:id',
        retry: 'POST /api/tasks/:id/retry',
        result: 'GET /api/tasks/:id/result',
        download: 'GET /api/tasks/:id/download',
        stats: 'GET /api/tasks/stats',
      },
      health: {
        basic: 'GET /api/health',
        detailed: 'GET /api/health/detailed',
        ready: 'GET /api/health/ready',
        live: 'GET /api/health/live',
        metrics: 'GET /api/health/metrics',
      },
    },
    documentation: config.server.env !== 'production' ? '/api/docs' : undefined,
  });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.logShutdown('SIGTERM received, starting graceful shutdown');
  
  // Close server
  if (app.server) {
    app.server.close(() => {
      logger.logShutdown('HTTP server closed');
      
      // Cleanup telemetry
      telemetryService.shutdown()
        .then(() => {
          logger.logShutdown('Telemetry service shutdown complete');
          process.exit(0);
        })
        .catch((error) => {
          logger.error('Error during telemetry shutdown', { error: error.message });
          process.exit(1);
        });
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGINT', () => {
  logger.logShutdown('SIGINT received, starting graceful shutdown');
  
  // Close server
  if (app.server) {
    app.server.close(() => {
      logger.logShutdown('HTTP server closed');
      
      // Cleanup telemetry
      telemetryService.shutdown()
        .then(() => {
          logger.logShutdown('Telemetry service shutdown complete');
          process.exit(0);
        })
        .catch((error) => {
          logger.error('Error during telemetry shutdown', { error: error.message });
          process.exit(1);
        });
    });
  } else {
    process.exit(0);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  
  // Exit process after logging
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise.toString(),
  });
  
  // Exit process after logging
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

module.exports = app;