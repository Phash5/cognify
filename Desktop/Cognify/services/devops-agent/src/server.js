/**
 * DevOps AI Agent Server
 * Main entry point for the DevOps AI Agent service
 */

'use strict';

const app = require('./app');
const config = require('./config/config');
const logger = require('./utils/logger');
const { TelemetryService } = require('./utils/telemetry');
const { DevOpsService } = require('./services/devopsService');
const { CacheService } = require('./services/cacheService');

// Initialize services
const telemetry = new TelemetryService();
const devopsService = new DevOpsService();
const cacheService = new CacheService();

// Server startup
async function startServer() {
  try {
    logger.logStartup('Starting DevOps AI Agent server...');
    
    // Initialize telemetry
    logger.logStartup('Initializing telemetry...');
    await telemetry.initialize();
    logger.logStartup('Telemetry initialized successfully');
    
    // Test cache connection
    logger.logStartup('Testing cache connection...');
    const cacheHealth = await cacheService.healthCheck();
    if (cacheHealth.healthy) {
      logger.logStartup('Cache connection successful');
    } else {
      logger.logError('Cache connection failed', new Error(cacheHealth.error));
      throw new Error(`Cache connection failed: ${cacheHealth.error}`);
    }
    
    // Test AI service
    logger.logStartup('Testing AI service connection...');
    const aiHealth = await devopsService.healthCheck();
    if (aiHealth.healthy) {
      logger.logStartup('AI service connection successful');
    } else {
      logger.logError('AI service connection failed', new Error(aiHealth.error));
      throw new Error(`AI service connection failed: ${aiHealth.error}`);
    }
    
    // Start HTTP server
    const server = app.listen(config.server.port, config.server.host, () => {
      const address = server.address();
      const host = address.address === '::' ? 'localhost' : address.address;
      const url = `http://${host}:${address.port}`;
      
      logger.logStartup(`DevOps AI Agent server started successfully`);
      logger.logStartup(`Server listening on ${url}`);
      logger.logStartup(`Environment: ${config.server.env}`);
      logger.logStartup(`Documentation available at ${url}/docs`);
      logger.logStartup(`Health checks available at ${url}/health`);
      logger.logStartup(`Metrics available at ${url}/metrics`);
      
      // Log configuration summary
      logConfigurationSummary();
      
      // Record startup metrics
      telemetry.incrementCounter('server_starts_total', {
        environment: config.server.env,
        version: '1.0.0',
      });
      
      telemetry.recordHistogram('server_startup_duration_seconds', 
        (Date.now() - startTime) / 1000,
        {
          environment: config.server.env,
        }
      );
    });
    
    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.logError(`Port ${config.server.port} is already in use`, error);
        process.exit(1);
      } else if (error.code === 'EACCES') {
        logger.logError(`Permission denied to bind to port ${config.server.port}`, error);
        process.exit(1);
      } else {
        logger.logError('Server error occurred', error);
        process.exit(1);
      }
    });
    
    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      logger.logShutdown(`Received ${signal}, starting graceful shutdown...`);
      
      // Stop accepting new connections
      server.close(async () => {
        logger.logShutdown('HTTP server closed');
        
        try {
          // Close cache service
          logger.logShutdown('Closing cache service...');
          await cacheService.close();
          logger.logShutdown('Cache service closed');
          
          // Shutdown telemetry
          logger.logShutdown('Shutting down telemetry...');
          await telemetry.shutdown();
          logger.logShutdown('Telemetry shutdown completed');
          
          logger.logShutdown('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.logError('Error during graceful shutdown', error);
          process.exit(1);
        }
      });
      
      // Force shutdown after timeout
      setTimeout(() => {
        logger.logError('Graceful shutdown timeout, forcing exit');
        process.exit(1);
      }, 30000); // 30 seconds timeout
    };
    
    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    return server;
    
  } catch (error) {
    logger.logError('Failed to start DevOps AI Agent server', error);
    
    // Record startup failure metric
    telemetry.incrementCounter('server_start_failures_total', {
      environment: config.server.env,
      error_type: error.name || 'Unknown',
    });
    
    process.exit(1);
  }
}

// Log configuration summary
function logConfigurationSummary() {
  const configSummary = {
    server: {
      host: config.server.host,
      port: config.server.port,
      environment: config.server.env,
      corsOrigins: config.server.corsOrigins,
      maxRequestSize: config.server.maxRequestSize,
    },
    logging: {
      level: config.logging.level,
      format: config.logging.format,
    },
    redis: {
      host: config.redis.host,
      port: config.redis.port,
      database: config.redis.database,
      keyPrefix: config.redis.keyPrefix,
    },
    cache: {
      defaultTtl: config.cache.defaultTtl,
      maxKeys: config.cache.maxKeys,
    },
    openai: {
      model: config.openai.model,
      maxTokens: config.openai.maxTokens,
      temperature: config.openai.temperature,
    },
    rateLimit: {
      maxRequests: config.rateLimit.maxRequests,
      windowMs: config.rateLimit.windowMs,
      aiMaxRequests: config.rateLimit.ai.maxRequests,
      aiWindowMs: config.rateLimit.ai.windowMs,
    },
    devops: {
      supportedPlatforms: config.devops.supportedPlatforms,
      supportedProviders: config.devops.supportedProviders,
      supportedMonitoringTools: config.devops.supportedMonitoringTools,
      supportedConfigTools: config.devops.supportedConfigTools,
    },
    telemetry: {
      jaegerEndpoint: config.telemetry.jaeger.endpoint,
      prometheusPort: config.telemetry.prometheus.port,
    },
  };
  
  logger.logConfig('DevOps AI Agent Configuration', configSummary);
}

// Record startup time
const startTime = Date.now();

// Start the server
if (require.main === module) {
  startServer().catch((error) => {
    logger.logError('Unhandled error during server startup', error);
    process.exit(1);
  });
}

// Export for testing
module.exports = { startServer };