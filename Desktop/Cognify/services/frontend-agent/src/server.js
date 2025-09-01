/**
 * Frontend AI Agent Service - Server Entry Point
 * Initializes and starts the Express server with proper error handling and service initialization
 */

'use strict';

const http = require('http');
const app = require('./app');
const config = require('./config/config');
const logger = require('./utils/logger');
const { telemetryService } = require('./services/telemetryService');
const { cacheService } = require('./services/cacheService');
const { eventEmitter } = require('./services/eventEmitter');
const { frontendService } = require('./services/frontendService');
const { rateLimiterMiddleware } = require('./middleware/rateLimiter');

// Server configuration
const PORT = process.env.PORT || config.server.port || 3001;
const HOST = process.env.HOST || config.server.host || '0.0.0.0';

// Create HTTP server
const server = http.createServer(app);

// Store server reference for graceful shutdown
app.server = server;

// Server startup sequence
async function startServer() {
  try {
    logger.logInfo('Starting Frontend AI Agent Service...', {
      port: PORT,
      host: HOST,
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      pid: process.pid,
    });

    // Initialize telemetry service first
    await telemetryService.initialize();
    logger.logInfo('Telemetry service initialized');

    // Initialize cache service
    await cacheService.connect();
    logger.logInfo('Cache service connected');

    // Initialize event emitter
    await eventEmitter.connect();
    logger.logInfo('Event emitter connected');

    // Initialize rate limiter
    await rateLimiterMiddleware.initialize();
    logger.logInfo('Rate limiter initialized');

    // Initialize frontend service
    await frontendService.initialize();
    logger.logInfo('Frontend service initialized');

    // Start HTTP server
    await new Promise((resolve, reject) => {
      server.listen(PORT, HOST, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    logger.logInfo('Frontend AI Agent Service started successfully', {
      port: PORT,
      host: HOST,
      url: `http://${HOST}:${PORT}`,
      documentation: `http://${HOST}:${PORT}/api-docs`,
      health: `http://${HOST}:${PORT}/health`,
    });

    // Log service capabilities
    logger.logInfo('Service capabilities:', {
      frameworks: ['React', 'Vue', 'Angular'],
      languages: ['JavaScript', 'TypeScript'],
      features: [
        'Component generation',
        'Hook creation',
        'Style generation',
        'Code optimization',
        'Code review',
        'Test generation',
      ],
    });

    // Register service with orchestrator if configured
    if (process.env.ORCHESTRATOR_URL) {
      try {
        await registerWithOrchestrator();
        logger.logInfo('Successfully registered with orchestrator');
      } catch (error) {
        logger.logError(error, { operation: 'orchestrator_registration' });
        // Don't fail startup if orchestrator registration fails
      }
    }

    // Send startup telemetry
    telemetryService.recordEvent('service.started', {
      service: 'frontend-agent',
      version: process.env.npm_package_version || '1.0.0',
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
    });

  } catch (error) {
    logger.logError(error, { operation: 'server_startup' });
    
    // Attempt cleanup before exit
    try {
      await cleanup();
    } catch (cleanupError) {
      logger.logError(cleanupError, { operation: 'startup_cleanup' });
    }
    
    process.exit(1);
  }
}

// Register with orchestrator service
async function registerWithOrchestrator() {
  const axios = require('axios');
  
  const registrationData = {
    serviceId: 'frontend-agent',
    serviceName: 'Frontend AI Agent',
    serviceType: 'ai-agent',
    version: process.env.npm_package_version || '1.0.0',
    host: HOST,
    port: PORT,
    healthEndpoint: '/health',
    capabilities: [
      'react-component-generation',
      'vue-component-generation',
      'angular-component-generation',
      'hook-generation',
      'style-generation',
      'code-optimization',
      'code-review',
      'test-generation',
    ],
    metadata: {
      frameworks: ['React', 'Vue', 'Angular'],
      languages: ['JavaScript', 'TypeScript'],
      environment: process.env.NODE_ENV || 'development',
    },
  };

  const orchestratorUrl = process.env.ORCHESTRATOR_URL;
  const response = await axios.post(
    `${orchestratorUrl}/api/v1/services/register`,
    registrationData,
    {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'frontend-agent/1.0.0',
        ...(process.env.ORCHESTRATOR_API_KEY && {
          'Authorization': `Bearer ${process.env.ORCHESTRATOR_API_KEY}`,
        }),
      },
    }
  );

  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`Orchestrator registration failed: ${response.status} ${response.statusText}`);
  }

  return response.data;
}

// Cleanup function
async function cleanup() {
  logger.logInfo('Cleaning up services...');
  
  const cleanupPromises = [
    frontendService.shutdown().catch(error => 
      logger.logError(error, { operation: 'frontend_service_cleanup' })
    ),
    cacheService.disconnect().catch(error => 
      logger.logError(error, { operation: 'cache_service_cleanup' })
    ),
    eventEmitter.disconnect().catch(error => 
      logger.logError(error, { operation: 'event_emitter_cleanup' })
    ),
    rateLimiterMiddleware.cleanup().catch(error => 
      logger.logError(error, { operation: 'rate_limiter_cleanup' })
    ),
    telemetryService.shutdown().catch(error => 
      logger.logError(error, { operation: 'telemetry_service_cleanup' })
    ),
  ];

  await Promise.allSettled(cleanupPromises);
  logger.logInfo('Service cleanup completed');
}

// Server error handling
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

  switch (error.code) {
    case 'EACCES':
      logger.logError(new Error(`${bind} requires elevated privileges`));
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.logError(new Error(`${bind} is already in use`));
      process.exit(1);
      break;
    default:
      logger.logError(error, { operation: 'server_error' });
      throw error;
  }
});

server.on('listening', () => {
  const addr = server.address();
  const bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
  logger.logInfo(`Server listening on ${bind}`);
});

// Handle server close
server.on('close', () => {
  logger.logInfo('HTTP server closed');
});

// Graceful shutdown handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown(signal) {
  logger.logInfo(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Stop accepting new connections
    server.close(async () => {
      logger.logInfo('HTTP server stopped accepting new connections');
      
      try {
        await cleanup();
        logger.logInfo('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.logError(error, { operation: 'graceful_shutdown_cleanup' });
        process.exit(1);
      }
    });

    // Force shutdown after timeout
    setTimeout(() => {
      logger.logError(new Error('Graceful shutdown timeout, forcing exit'));
      process.exit(1);
    }, 30000); // 30 seconds timeout

  } catch (error) {
    logger.logError(error, { operation: 'graceful_shutdown' });
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  logger.logError(error, { operation: 'uncaught_exception' });
  
  try {
    await cleanup();
  } catch (cleanupError) {
    logger.logError(cleanupError, { operation: 'uncaught_exception_cleanup' });
  }
  
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  const error = new Error(`Unhandled Rejection: ${reason}`);
  logger.logError(error, {
    operation: 'unhandled_rejection',
    promise: promise.toString(),
  });
  
  try {
    await cleanup();
  } catch (cleanupError) {
    logger.logError(cleanupError, { operation: 'unhandled_rejection_cleanup' });
  }
  
  process.exit(1);
});

// Handle process warnings
process.on('warning', (warning) => {
  logger.logWarn('Process warning', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack,
  });
});

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = { server, startServer, cleanup };