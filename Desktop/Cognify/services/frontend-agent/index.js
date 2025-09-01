#!/usr/bin/env node

/**
 * Frontend AI Agent Service
 * Main entry point for the specialized AI agent handling frontend development tasks
 */

'use strict';

// Load environment variables first
require('dotenv').config();

// Core dependencies
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const responseTime = require('response-time');
const cookieParser = require('cookie-parser');

// OpenTelemetry instrumentation (must be imported before other modules)
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// Application modules
const logger = require('./src/utils/logger');
const { FrontendService } = require('./src/services/frontendService');
const errorHandler = require('./src/middleware/errorHandler');
const { rateLimiter } = require('./src/middleware/rateLimiter');

// Route handlers
const agentRoutes = require('./src/routes/agent');
const taskRoutes = require('./src/routes/tasks');
const codeRoutes = require('./src/routes/code');
const uiRoutes = require('./src/routes/ui');
const healthRoutes = require('./src/routes/health');
const metricsRoutes = require('./src/routes/metrics');

// Swagger documentation
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Global error handling
require('express-async-errors');

/**
 * Initialize OpenTelemetry SDK
 */
function initializeOpenTelemetry() {
  try {
    const sdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'frontend-agent',
        [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
        [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'cognify',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
      }),
      instrumentations: [getNodeAutoInstrumentations()],
      metricReader: new PrometheusExporter({
        port: parseInt(process.env.METRICS_PORT, 10) || 9464,
        endpoint: '/metrics',
      }),
      traceExporter: new JaegerExporter({
        endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
      }),
    });

    sdk.start();
    logger.info('OpenTelemetry SDK initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry SDK:', error);
  }
}

/**
 * Configure Swagger documentation
 */
function setupSwagger(app) {
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Frontend AI Agent API',
        version: process.env.npm_package_version || '1.0.0',
        description: 'Specialized AI Agent for Frontend Development Tasks',
        contact: {
          name: 'Cognify Team',
          email: 'support@cognify.com',
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT',
        },
      },
      servers: [
        {
          url: `http://localhost:${process.env.PORT || 3002}`,
          description: 'Development server',
        },
        {
          url: process.env.API_BASE_URL || 'https://api.cognify.com',
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
          apiKey: {
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
          apiKey: [],
        },
      ],
    },
    apis: ['./src/routes/*.js', './src/models/*.js'],
  };

  const specs = swaggerJsdoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Frontend AI Agent API Documentation',
  }));

  // Serve OpenAPI spec as JSON
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });

  logger.info('Swagger documentation configured at /api-docs');
}

/**
 * Configure Express application
 */
function createApp() {
  const app = express();

  // Trust proxy for accurate client IP addresses
  app.set('trust proxy', 1);

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // CORS configuration
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
  }));

  // Compression middleware
  app.use(compression());

  // Request parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Logging middleware
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  }));

  // Response time tracking
  app.use(responseTime((req, res, time) => {
    logger.debug(`${req.method} ${req.url} - ${time.toFixed(2)}ms`);
  }));

  // Rate limiting
  app.use(rateLimiter.general);

  // API routes
  app.use('/api/v1/agent', agentRoutes);
  app.use('/api/v1/tasks', taskRoutes);
  app.use('/api/v1/code', codeRoutes);
  app.use('/api/v1/ui', uiRoutes);
  app.use('/health', healthRoutes);
  app.use('/metrics', metricsRoutes);

  // Setup Swagger documentation
  setupSwagger(app);

  return app;
}

/**
 * Initialize and start the application
 */
async function startServer() {
  // Initialize OpenTelemetry
  initializeOpenTelemetry();

  // Create Express app
  const app = createApp();

  // Initialize frontend service
  const frontendService = new FrontendService();
  await frontendService.initialize();

  const PORT = process.env.PORT || 3002;

  // Start server
  const server = app.listen(PORT, () => {
    logger.info(`Frontend AI Agent started on port ${PORT}`);
    logger.info(`Health check available at http://localhost:${PORT}/health`);
    logger.info(`Metrics available at http://localhost:${PORT}/metrics`);
    logger.info(`API documentation available at http://localhost:${PORT}/api-docs`);
  });

  // Graceful shutdown handlers
  const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    
    server.close(async () => {
      try {
        await frontendService.shutdown();
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return { app, server, frontendService };
}

// Start the application if this file is run directly
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = { createApp, startServer };