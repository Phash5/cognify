/**
 * Backend AI Agent Server
 * Main entry point for the Backend AI Agent microservice
 */

'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const responseTime = require('response-time');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const rateLimit = require('express-rate-limit');
const config = require('./config/config');
const logger = require('./utils/logger');
const { telemetryService } = require('./utils/telemetry');
const { errorHandler, notFoundHandler, setupGlobalErrorHandlers } = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');

// Import routes
const agentRoutes = require('./routes/agent');
const tasksRoutes = require('./routes/tasks');
const healthRoutes = require('./routes/health');

// Initialize telemetry first
telemetryService.init();

// Setup global error handlers
setupGlobalErrorHandlers();

const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

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
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = config.security.cors.allowedOrigins;
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: config.security.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Session-ID',
    'X-Request-ID',
  ],
  exposedHeaders: [
    'X-Request-ID',
    'X-Response-Time',
    'X-Rate-Limit-Limit',
    'X-Rate-Limit-Remaining',
    'X-Rate-Limit-Reset',
  ],
};

app.use(cors(corsOptions));

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

// Request parsing middleware
app.use(express.json({ 
  limit: config.server.maxRequestSize,
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: config.server.maxRequestSize,
}));
app.use(cookieParser());

// Response time middleware
app.use(responseTime((req, res, time) => {
  res.setHeader('X-Response-Time', `${time.toFixed(2)}ms`);
  
  // Log slow requests
  if (time > 1000) {
    logger.warn('Slow request detected', {
      method: req.method,
      url: req.url,
      responseTime: time,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });
  }
}));

// Request ID middleware
app.use((req, res, next) => {
  req.id = req.get('X-Request-ID') || 
           `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    logger.info('HTTP Request', {
      requestId: req.id,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      contentLength: res.get('Content-Length'),
    });
  });
  
  next();
});

// Global rate limiting
if (config.rateLimit.enabled) {
  app.use('/api', generalLimiter);
}

// Swagger documentation setup
if (config.server.env !== 'production') {
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Backend AI Agent API',
        version: '1.0.0',
        description: 'AI-powered backend development assistant API',
        contact: {
          name: 'Cognify Team',
          email: 'support@cognify.dev',
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
          url: `http://${config.server.host}:${config.server.port}`,
          description: 'Local server',
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
    },
    apis: [
      './src/routes/*.js',
      './src/middleware/*.js',
    ],
  };
  
  const specs = swaggerJsdoc(swaggerOptions);
  
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Backend AI Agent API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
    },
  }));
  
  logger.info('Swagger documentation available at /api-docs');
}

// API routes
app.use('/health', healthRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/tasks', tasksRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Backend AI Agent',
    version: process.env.npm_package_version || '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    environment: config.server.env,
    documentation: config.server.env !== 'production' ? '/api-docs' : undefined,
    endpoints: {
      health: '/health',
      agent: '/api/agent',
      tasks: '/api/tasks',
    },
  });
});

// Metrics endpoint (for Prometheus)
app.get('/metrics', async (req, res) => {
  try {
    const metrics = await telemetryService.getMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  } catch (error) {
    logger.error('Failed to get metrics', { error: error.message });
    res.status(500).send('Failed to get metrics');
  }
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown', { error: err.message });
      process.exit(1);
    }
    
    logger.info('Server closed successfully');
    
    // Close telemetry
    telemetryService.shutdown()
      .then(() => {
        logger.info('Telemetry shutdown completed');
        process.exit(0);
      })
      .catch((error) => {
        logger.error('Error during telemetry shutdown', { error: error.message });
        process.exit(1);
      });
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 30000);
};

// Start server
const server = app.listen(config.server.port, config.server.host, () => {
  logger.info('Backend AI Agent started', {
    port: config.server.port,
    host: config.server.host,
    environment: config.server.env,
    nodeVersion: process.version,
    pid: process.pid,
    documentation: config.server.env !== 'production' ? `http://${config.server.host}:${config.server.port}/api-docs` : undefined,
  });
  
  // Log configuration summary
  logger.info('Service configuration', {
    cache: {
      enabled: config.cache.enabled,
      type: config.cache.type,
    },
    ai: {
      provider: config.ai.provider,
      model: config.ai.model,
    },
    rateLimit: {
      enabled: config.rateLimit.enabled,
      windowMs: config.rateLimit.windowMs,
      maxRequests: config.rateLimit.maxRequests,
    },
    security: {
      cors: config.security.cors.allowedOrigins.length > 0,
      helmet: true,
    },
    telemetry: {
      enabled: config.telemetry.enabled,
      jaeger: config.telemetry.jaeger.enabled,
      prometheus: config.telemetry.prometheus.enabled,
    },
  });
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${config.server.port} is already in use`);
  } else {
    logger.error('Server error', { error: error.message, code: error.code });
  }
  process.exit(1);
});

// Graceful shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  
  // Attempt graceful shutdown
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise.toString(),
  });
  
  // Attempt graceful shutdown
  gracefulShutdown('unhandledRejection');
});

module.exports = app;