/**
 * DevOps AI Agent Application
 * Main Express application setup with middleware, routes, and error handling
 */

'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const config = require('./config/config');
const logger = require('./utils/logger');
const { TelemetryService } = require('./utils/telemetry');
const {
  requestId,
  requestLogger,
  authenticateApiKey,
  authenticateJWT,
  rateLimitGeneral,
  rateLimitAI,
  rateLimitDevOpsDeployment,
  rateLimitDevOpsInfrastructure,
  rateLimitDevOpsMonitoring,
  rateLimitDevOpsConfiguration,
  speedLimiter,
  errorHandler,
  notFoundHandler,
  requestTimeout,
  contentTypeValidation,
  requestSizeValidation,
} = require('./middleware');

// Import routes
const agentRoutes = require('./routes/agent');
const taskRoutes = require('./routes/tasks');
const healthRoutes = require('./routes/health');
const { router: metricsRoutes } = require('./routes/metrics');

// Initialize telemetry
const telemetry = new TelemetryService();
telemetry.initialize();

// Create Express application
const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DevOps AI Agent API',
      version: '1.0.0',
      description: 'AI-powered DevOps automation service for deployment, infrastructure, monitoring, and configuration management',
      contact: {
        name: 'DevOps AI Agent Support',
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
        url: 'https://api.cognify.ai/devops',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for authentication',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
            message: {
              type: 'string',
              description: 'Detailed error description',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Error timestamp',
            },
            requestId: {
              type: 'string',
              description: 'Request ID for tracking',
            },
          },
          required: ['error', 'timestamp'],
        },
        Task: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique task identifier',
            },
            type: {
              type: 'string',
              enum: ['deployment', 'infrastructure', 'monitoring', 'configuration'],
              description: 'Type of DevOps operation',
            },
            status: {
              type: 'string',
              enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
              description: 'Current task status',
            },
            progress: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Task completion percentage',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Task creation timestamp',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
            },
            result: {
              type: 'object',
              description: 'Task result data',
            },
            error: {
              type: 'string',
              description: 'Error message if task failed',
            },
          },
          required: ['id', 'type', 'status', 'createdAt'],
        },
        DeploymentRequest: {
          type: 'object',
          properties: {
            platform: {
              type: 'string',
              enum: ['kubernetes', 'docker', 'aws', 'azure', 'gcp', 'heroku', 'vercel'],
              description: 'Deployment platform',
            },
            environment: {
              type: 'string',
              enum: ['development', 'staging', 'production'],
              description: 'Target environment',
            },
            application: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Application name',
                },
                type: {
                  type: 'string',
                  enum: ['web', 'api', 'microservice', 'database', 'worker'],
                  description: 'Application type',
                },
                runtime: {
                  type: 'string',
                  description: 'Runtime environment (e.g., node:18, python:3.9)',
                },
                port: {
                  type: 'number',
                  description: 'Application port',
                },
              },
              required: ['name', 'type'],
            },
            requirements: {
              type: 'object',
              properties: {
                cpu: {
                  type: 'string',
                  description: 'CPU requirements',
                },
                memory: {
                  type: 'string',
                  description: 'Memory requirements',
                },
                storage: {
                  type: 'string',
                  description: 'Storage requirements',
                },
                replicas: {
                  type: 'number',
                  description: 'Number of replicas',
                },
              },
            },
            configuration: {
              type: 'object',
              description: 'Additional configuration options',
            },
          },
          required: ['platform', 'environment', 'application'],
        },
        InfrastructureRequest: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              enum: ['aws', 'azure', 'gcp', 'terraform', 'pulumi'],
              description: 'Infrastructure provider',
            },
            resources: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    description: 'Resource type (e.g., vm, database, storage)',
                  },
                  name: {
                    type: 'string',
                    description: 'Resource name',
                  },
                  specifications: {
                    type: 'object',
                    description: 'Resource specifications',
                  },
                },
                required: ['type', 'name'],
              },
            },
            environment: {
              type: 'string',
              enum: ['development', 'staging', 'production'],
              description: 'Target environment',
            },
            region: {
              type: 'string',
              description: 'Deployment region',
            },
            configuration: {
              type: 'object',
              description: 'Additional configuration options',
            },
          },
          required: ['provider', 'resources', 'environment'],
        },
      },
    },
    tags: [
      {
        name: 'Agent',
        description: 'DevOps AI Agent operations',
      },
      {
        name: 'Tasks',
        description: 'Task management and monitoring',
      },
      {
        name: 'Health',
        description: 'Health checks and status monitoring',
      },
      {
        name: 'Metrics',
        description: 'Performance and operational metrics',
      },
    ],
  },
  apis: ['./src/routes/*.js'], // Path to the API files
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: config.server.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
}));

// Compression middleware
app.use(compression());

// Request parsing middleware
app.use(express.json({ limit: config.server.maxRequestSize }));
app.use(express.urlencoded({ extended: true, limit: config.server.maxRequestSize }));

// Request ID and logging
app.use(requestId);
app.use(requestLogger);

// Request timeout
app.use(requestTimeout);

// Content type validation
app.use(contentTypeValidation);

// Request size validation
app.use(requestSizeValidation);

// Speed limiter (general traffic shaping)
app.use(speedLimiter);

// API Documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'DevOps AI Agent API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
  },
}));

// Serve swagger spec as JSON
app.get('/docs/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'DevOps AI Agent',
    version: '1.0.0',
    status: 'operational',
    timestamp: new Date().toISOString(),
    documentation: '/docs',
    health: '/health',
    metrics: '/metrics',
  });
});

// API Routes with rate limiting
app.use('/agent', rateLimitGeneral, rateLimitAI, agentRoutes);
app.use('/tasks', rateLimitGeneral, taskRoutes);
app.use('/health', healthRoutes);
app.use('/metrics', metricsRoutes);

// DevOps-specific rate limiting for agent routes
app.use('/agent/deployment', rateLimitDevOpsDeployment);
app.use('/agent/infrastructure', rateLimitDevOpsInfrastructure);
app.use('/agent/monitoring', rateLimitDevOpsMonitoring);
app.use('/agent/configuration', rateLimitDevOpsConfiguration);

// Favicon
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.logInfo('SIGTERM received, starting graceful shutdown');
  
  // Close telemetry
  try {
    await telemetry.shutdown();
    logger.logInfo('Telemetry shutdown completed');
  } catch (error) {
    logger.logError('Error during telemetry shutdown', error);
  }
  
  // Exit process
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.logInfo('SIGINT received, starting graceful shutdown');
  
  // Close telemetry
  try {
    await telemetry.shutdown();
    logger.logInfo('Telemetry shutdown completed');
  } catch (error) {
    logger.logError('Error during telemetry shutdown', error);
  }
  
  // Exit process
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.logError('Uncaught exception', error);
  
  // Record error metric
  telemetry.incrementCounter('uncaught_exceptions_total', {
    error_type: error.name || 'Unknown',
  });
  
  // Exit process
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.logError('Unhandled promise rejection', {
    reason,
    promise: promise.toString(),
  });
  
  // Record error metric
  telemetry.incrementCounter('unhandled_rejections_total', {
    reason_type: typeof reason,
  });
  
  // Exit process
  process.exit(1);
});

// Export app for testing
module.exports = app;