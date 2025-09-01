/**
 * Service Discovery Server
 * Main entry point for the Service Discovery microservice
 */

'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const config = require('./config/config');
const logger = require('./utils/logger');
const { telemetryService } = require('./utils/telemetry');
const ServiceRegistry = require('./services/serviceRegistry');

// Initialize Express app
const app = express();

// Initialize service registry
const serviceRegistry = new ServiceRegistry();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Add request ID middleware
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
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration
app.use(cors({
  origin: config.server.cors.origin,
  credentials: config.server.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key'],
}));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use(logger.requestLogger);

// Telemetry middleware
if (config.telemetry.enabled) {
  app.use(telemetryService.getTracingMiddleware());
  app.use(telemetryService.getMetricsMiddleware());
}

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: config.rateLimiting.general.windowMs,
  max: config.rateLimiting.general.max,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: Math.ceil(config.rateLimiting.general.windowMs / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress;
  },
});

app.use(generalLimiter);

// API key authentication middleware
const authenticateApiKey = (req, res, next) => {
  if (!config.security.apiKey.enabled) {
    return next();
  }

  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key is required',
    });
  }

  if (!config.security.apiKey.keys.includes(apiKey)) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
  }

  next();
};

// Service-specific rate limiters
const registrationLimiter = rateLimit({
  windowMs: config.rateLimiting.serviceRegistration.windowMs,
  max: config.rateLimiting.serviceRegistration.max,
  message: {
    error: 'Too many registration requests',
    message: 'Registration rate limit exceeded. Please try again later.',
  },
  keyGenerator: (req) => {
    return `${req.ip}:registration`;
  },
});

const discoveryLimiter = rateLimit({
  windowMs: config.rateLimiting.serviceDiscovery.windowMs,
  max: config.rateLimiting.serviceDiscovery.max,
  message: {
    error: 'Too many discovery requests',
    message: 'Discovery rate limit exceeded. Please try again later.',
  },
  keyGenerator: (req) => {
    return `${req.ip}:discovery`;
  },
});

const heartbeatLimiter = rateLimit({
  windowMs: config.rateLimiting.heartbeat.windowMs,
  max: config.rateLimiting.heartbeat.max,
  message: {
    error: 'Too many heartbeat requests',
    message: 'Heartbeat rate limit exceeded. Please try again later.',
  },
  keyGenerator: (req) => {
    return `${req.ip}:heartbeat`;
  },
});

// Health check endpoint
app.get('/health', (req, res) => {
  const healthStatus = serviceRegistry.getHealthStatus();
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'service-discovery',
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    registry: healthStatus,
  });
});

// Readiness check endpoint
app.get('/ready', (req, res) => {
  const isReady = serviceRegistry.isInitialized;
  
  if (isReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
    });
  }
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  const metrics = serviceRegistry.getMetrics();
  
  res.status(200).json({
    metrics,
    timestamp: new Date().toISOString(),
  });
});

// Service registration endpoint
app.post('/api/v1/services/register', authenticateApiKey, registrationLimiter, async (req, res) => {
  const span = telemetryService.startSpan('service_registration');
  const timer = telemetryService.createTimer('service_registration_duration');
  
  try {
    const serviceData = req.body;
    
    // Validate required fields
    if (!serviceData.name || !serviceData.host || !serviceData.port) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: name, host, port',
      });
    }
    
    const result = await serviceRegistry.registerService(serviceData);
    const duration = timer.end();
    
    telemetryService.recordServiceRegistration(serviceData.name, duration);
    
    span.setAttributes({
      'service.name': serviceData.name,
      'service.host': serviceData.host,
      'service.port': serviceData.port,
      'service.instance_id': result.instanceId,
    });
    
    logger.info('Service registered via API', {
      requestId: req.id,
      serviceName: serviceData.name,
      instanceId: result.instanceId,
      host: serviceData.host,
      port: serviceData.port,
    });
    
    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    const duration = timer.end();
    telemetryService.recordRegistryError('registration', error.name);
    
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    
    logger.error('Service registration failed', {
      requestId: req.id,
      error: error.message,
      stack: error.stack,
    });
    
    res.status(400).json({
      error: 'Registration Failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  } finally {
    span.end();
  }
});

// Service deregistration endpoint
app.delete('/api/v1/services/:instanceId', authenticateApiKey, async (req, res) => {
  const span = telemetryService.startSpan('service_deregistration');
  
  try {
    const { instanceId } = req.params;
    
    if (!instanceId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Instance ID is required',
      });
    }
    
    const result = await serviceRegistry.deregisterService(instanceId);
    
    telemetryService.recordServiceDeregistration(result.serviceName);
    
    span.setAttributes({
      'service.instance_id': instanceId,
      'service.name': result.serviceName,
    });
    
    logger.info('Service deregistered via API', {
      requestId: req.id,
      instanceId,
      serviceName: result.serviceName,
    });
    
    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    telemetryService.recordRegistryError('deregistration', error.name);
    
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    
    logger.error('Service deregistration failed', {
      requestId: req.id,
      instanceId: req.params.instanceId,
      error: error.message,
    });
    
    res.status(404).json({
      error: 'Deregistration Failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  } finally {
    span.end();
  }
});

// Service discovery endpoint
app.get('/api/v1/services/:serviceName', authenticateApiKey, discoveryLimiter, async (req, res) => {
  const span = telemetryService.startSpan('service_discovery');
  const timer = telemetryService.createTimer('service_discovery_duration');
  
  try {
    const { serviceName } = req.params;
    const options = {
      healthyOnly: req.query.healthyOnly !== 'false',
      zone: req.query.zone,
      tags: req.query.tags ? req.query.tags.split(',') : undefined,
      version: req.query.version,
      loadBalance: req.query.loadBalance === 'true',
      strategy: req.query.strategy,
    };
    
    const result = await serviceRegistry.discoverServices(serviceName, options);
    const duration = timer.end();
    
    telemetryService.recordServiceDiscovery(serviceName, result.instances.length, duration);
    
    span.setAttributes({
      'service.name': serviceName,
      'service.instances_found': result.instances.length,
      'service.total_instances': result.totalInstances,
      'service.healthy_instances': result.healthyInstances,
    });
    
    logger.debug('Service discovery completed', {
      requestId: req.id,
      serviceName,
      instancesFound: result.instances.length,
      options,
    });
    
    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    const duration = timer.end();
    telemetryService.recordRegistryError('discovery', error.name);
    
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    
    logger.error('Service discovery failed', {
      requestId: req.id,
      serviceName: req.params.serviceName,
      error: error.message,
    });
    
    res.status(500).json({
      error: 'Discovery Failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  } finally {
    span.end();
  }
});

// Heartbeat endpoint
app.post('/api/v1/services/:instanceId/heartbeat', authenticateApiKey, heartbeatLimiter, async (req, res) => {
  try {
    const { instanceId } = req.params;
    
    if (!instanceId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Instance ID is required',
      });
    }
    
    const result = await serviceRegistry.updateHeartbeat(instanceId);
    
    logger.debug('Heartbeat updated', {
      requestId: req.id,
      instanceId,
    });
    
    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    telemetryService.recordRegistryError('heartbeat', error.name);
    
    logger.error('Heartbeat update failed', {
      requestId: req.id,
      instanceId: req.params.instanceId,
      error: error.message,
    });
    
    res.status(404).json({
      error: 'Heartbeat Failed',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Get all services endpoint
app.get('/api/v1/services', authenticateApiKey, async (req, res) => {
  try {
    const services = serviceRegistry.getAllServices();
    
    logger.debug('All services retrieved', {
      requestId: req.id,
      serviceCount: Object.keys(services).length,
    });
    
    res.status(200).json({
      success: true,
      data: services,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    telemetryService.recordRegistryError('list_services', error.name);
    
    logger.error('Failed to retrieve services', {
      requestId: req.id,
      error: error.message,
    });
    
    res.status(500).json({
      error: 'Failed to retrieve services',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Development endpoints (only in development mode)
if (config.development.enabled) {
  // Debug endpoint to view registry state
  app.get('/debug/registry', (req, res) => {
    const services = serviceRegistry.getAllServices();
    const metrics = serviceRegistry.getMetrics();
    
    res.status(200).json({
      services,
      metrics,
      config: {
        environment: config.server.environment,
        redis: {
          enabled: config.redis.enabled,
          connected: serviceRegistry.isRedisConnected,
        },
        telemetry: {
          enabled: config.telemetry.enabled,
        },
      },
      timestamp: new Date().toISOString(),
    });
  });
  
  // Mock service endpoint for testing
  app.post('/debug/mock-service', async (req, res) => {
    try {
      const mockService = {
        name: req.body.name || 'mock-service',
        host: req.body.host || 'localhost',
        port: req.body.port || 3000,
        protocol: req.body.protocol || 'http',
        version: req.body.version || '1.0.0',
        metadata: { mock: true },
        tags: ['mock', 'test'],
      };
      
      const result = await serviceRegistry.registerService(mockService);
      
      res.status(201).json({
        success: true,
        data: result,
        message: 'Mock service registered',
      });
      
    } catch (error) {
      res.status(400).json({
        error: 'Failed to register mock service',
        message: error.message,
      });
    }
  });
}

// Error handling middleware
app.use(logger.errorLogger);

app.use((err, req, res, next) => {
  telemetryService.recordRegistryError('http_error', err.name);
  
  logger.error('Unhandled error', {
    requestId: req.id,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
  });
  
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: config.server.environment === 'development' ? err.message : 'Something went wrong',
    requestId: req.id,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    requestId: req.id,
    timestamp: new Date().toISOString(),
  });
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      // Shutdown service registry
      await serviceRegistry.shutdown();
      
      // Shutdown telemetry
      await telemetryService.shutdown();
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
      
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    }
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, config.server.shutdownTimeout);
};

// Start server
const server = app.listen(config.server.port, config.server.host, () => {
  logger.info('Service Discovery server started', {
    host: config.server.host,
    port: config.server.port,
    environment: config.server.environment,
    version: process.env.npm_package_version || '1.0.0',
    pid: process.pid,
    redis: {
      enabled: config.redis.enabled,
    },
    telemetry: {
      enabled: config.telemetry.enabled,
      jaeger: config.telemetry.jaeger.enabled,
      prometheus: config.telemetry.prometheus.enabled,
    },
    rateLimiting: {
      enabled: true,
      general: config.rateLimiting.general.max,
    },
    security: {
      apiKey: config.security.apiKey.enabled,
      helmet: true,
      cors: true,
    },
  });
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${config.server.port} is already in use`);
    process.exit(1);
  } else {
    logger.error('Server error', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
  }
});

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  });
  
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
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

module.exports = { app, server, serviceRegistry };