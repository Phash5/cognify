/**
 * Frontend AI Agent Service - Main Application
 * Express.js application with comprehensive middleware, routing, and error handling
 */

'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const httpStatus = require('http-status-codes');
const path = require('path');
const fs = require('fs');

// Import configuration and utilities
const config = require('./config/config');
const logger = require('./utils/logger');
const { telemetryService } = require('./services/telemetryService');
const { cacheService } = require('./services/cacheService');
const { eventEmitter } = require('./services/eventEmitter');
const { frontendService } = require('./services/frontendService');

// Import middleware
const { errorHandler, notFoundHandler, asyncHandler } = require('./middleware/errorHandler');
const { rateLimiterMiddleware } = require('./middleware/rateLimiter');
const authMiddleware = require('./middleware/auth');
const validationMiddleware = require('./middleware/validation');
const requestLogger = require('./middleware/requestLogger');
const securityMiddleware = require('./middleware/security');

// Import routes
const agentRoutes = require('./routes/agent');
const taskRoutes = require('./routes/tasks');
const codeRoutes = require('./routes/code');
const healthRoutes = require('./routes/health');

// Create Express application
const app = express();

// Trust proxy for accurate IP addresses behind load balancers
app.set('trust proxy', 1);

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Frontend AI Agent API',
      version: process.env.npm_package_version || '1.0.0',
      description: 'Specialized AI agent for frontend development tasks including React, Vue, and Angular code generation, optimization, and analysis.',
      contact: {
        name: 'Cognify Development Team',
        email: 'dev@cognify.ai',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3001',
        description: 'Frontend AI Agent Service',
      },
      {
        url: 'https://api.cognify.ai/frontend-agent',
        description: 'Production Frontend AI Agent Service',
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
        description: 'Agent management and status endpoints',
      },
      {
        name: 'Tasks',
        description: 'Task creation, management, and execution',
      },
      {
        name: 'Code',
        description: 'Code generation, analysis, and optimization',
      },
      {
        name: 'Health',
        description: 'Health checks and monitoring',
      },
    ],
  },
  apis: [
    path.join(__dirname, 'routes/*.js'),
    path.join(__dirname, 'middleware/*.js'),
    path.join(__dirname, 'services/*.js'),
  ],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Global middleware setup

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'https://cognify.ai',
      'https://app.cognify.ai',
      ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
    ];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Request-ID',
    'X-Correlation-ID',
  ],
  exposedHeaders: [
    'X-Request-ID',
    'X-Correlation-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
}));

// Compression middleware
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  threshold: 1024, // Only compress responses larger than 1KB
}));

// Body parsing middleware
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
}));

// Request logging middleware
app.use(requestLogger);

// Security middleware
app.use(securityMiddleware);

// Global rate limiting
app.use(rateLimiterMiddleware.generalLimiter());

// Health check endpoint (before authentication)
app.use('/health', healthRoutes);
app.use('/api/v1/health', healthRoutes);

// API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Frontend AI Agent API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
  },
}));

// Serve swagger.json
app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// API routes with authentication and validation
app.use('/api/v1/agent', authMiddleware.authenticate, agentRoutes);
app.use('/api/v1/tasks', authMiddleware.authenticate, taskRoutes);
app.use('/api/v1/code', authMiddleware.authenticate, codeRoutes);

// Legacy route support (without version prefix)
app.use('/agent', authMiddleware.authenticate, agentRoutes);
app.use('/tasks', authMiddleware.authenticate, taskRoutes);
app.use('/code', authMiddleware.authenticate, codeRoutes);

// Root endpoint
app.get('/', asyncHandler(async (req, res) => {
  const serviceInfo = {
    service: 'Frontend AI Agent',
    version: process.env.npm_package_version || '1.0.0',
    description: 'Specialized AI agent for frontend development tasks',
    status: 'running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    capabilities: [
      'React component generation',
      'Vue component generation',
      'Angular component generation',
      'Custom hooks creation',
      'CSS/SCSS styling',
      'Code optimization',
      'Code review and analysis',
      'Test generation',
      'Documentation generation',
    ],
    endpoints: {
      health: '/health',
      documentation: '/api-docs',
      agent: '/api/v1/agent',
      tasks: '/api/v1/tasks',
      code: '/api/v1/code',
    },
    links: {
      documentation: `${req.protocol}://${req.get('host')}/api-docs`,
      health: `${req.protocol}://${req.get('host')}/health`,
      swagger: `${req.protocol}://${req.get('host')}/swagger.json`,
    },
  };

  res.json(serviceInfo);
}));

// Metrics endpoint
app.get('/metrics', asyncHandler(async (req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    service: 'frontend-agent',
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    telemetry: telemetryService.getMetrics(),
    cache: await cacheService.getStats(),
    frontend: frontendService.getMetrics(),
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid,
    },
  };

  res.json(metrics);
}));

// Favicon handling
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /');
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown(signal) {
  logger.logInfo(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Stop accepting new requests
    if (app.server) {
      app.server.close(() => {
        logger.logInfo('HTTP server closed');
      });
    }
    
    // Cleanup services
    await Promise.allSettled([
      frontendService.shutdown(),
      cacheService.disconnect(),
      eventEmitter.disconnect(),
      telemetryService.shutdown(),
      rateLimiterMiddleware.cleanup(),
    ]);
    
    logger.logInfo('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.logError(error, { operation: 'graceful_shutdown' });
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.logError(error, { operation: 'uncaught_exception' });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.logError(new Error(`Unhandled Rejection: ${reason}`), {
    operation: 'unhandled_rejection',
    promise: promise.toString(),
  });
  process.exit(1);
});

module.exports = app;