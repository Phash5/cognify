/**
 * Cognify Communication Library
 * 
 * A comprehensive communication library for microservices architecture
 * providing HTTP client/server utilities, service discovery integration,
 * circuit breakers, retry mechanisms, and observability features.
 */

// Core communication components
export { default as HttpClient } from './client/HttpClient.js';
export { default as ServiceClient } from './client/ServiceClient.js';
export { default as CircuitBreaker } from './client/CircuitBreaker.js';
export { default as RetryPolicy } from './client/RetryPolicy.js';
export { default as LoadBalancer } from './client/LoadBalancer.js';

// Server middleware and utilities
export { default as createServer } from './server/createServer.js';
export { default as healthCheck } from './server/middleware/healthCheck.js';
export { default as requestId } from './server/middleware/requestId.js';
export { default as requestLogger } from './server/middleware/requestLogger.js';
export { default as errorHandler } from './server/middleware/errorHandler.js';
export { default as rateLimiter } from './server/middleware/rateLimiter.js';
export { default as validation } from './server/middleware/validation.js';
export { default as authentication } from './server/middleware/authentication.js';

// Additional server middleware
export * from './server/middleware.js';

// Service discovery integration
export { default as ServiceRegistry } from './discovery/ServiceRegistry.js';
export { default as ServiceDiscovery } from './discovery/ServiceDiscovery.js';
export { default as HealthMonitor } from './discovery/HealthMonitor.js';

// Event system
export { default as EventBus } from './events/EventBus.js';
export { default as EventEmitter } from './events/EventEmitter.js';
export { default as MessageQueue } from './events/MessageQueue.js';

// Additional event system components
export * from './events/EventBus.js';
export * from './events/MessageQueue.js';
export * from './events/EventRouter.js';
export * from './events/SubscriptionManager.js';
export * from './events/EnhancedEventBus.js';
export * from './events/index.js';

// Utilities
export { default as Logger } from './utils/Logger.js';
export { default as Metrics } from './utils/Metrics.js';
export { default as Tracer } from './utils/Tracer.js';
export { default as Cache } from './utils/Cache.js';
export { default as Config } from './utils/Config.js';
export { default as Validator } from './utils/Validator.js';

// Additional utilities
export * from './utils/logger.js';
export * from './utils/metrics.js';
export * from './utils/tracer.js';
export * from './utils/cache.js';
export * from './utils/config.js';
export * from './utils/validator.js';
export * from './utils/security.js';

// Types and constants
export * from './types/index.js';
export * from './types/errors.js';
export * from './constants/index.js';
export * from './constants/http.js';

// Default configuration
export const defaultConfig = {
  client: {
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
    circuitBreaker: {
      enabled: true,
      threshold: 5,
      timeout: 60000,
      resetTimeout: 30000
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    cors: {
      origin: '*',
      credentials: true
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000 // requests per window
    }
  },
  discovery: {
    enabled: true,
    url: 'http://localhost:3004',
    heartbeatInterval: 30000,
    healthCheckInterval: 60000
  },
  logging: {
    level: 'info',
    format: 'json'
  },
  telemetry: {
    enabled: false,
    serviceName: 'cognify-service',
    jaegerEndpoint: 'http://localhost:14268/api/traces'
  }
};

/**
 * Initialize the communication library with configuration
 * @param {Object} config - Configuration object
 * @returns {Object} Initialized communication components
 */
export function initialize(config = {}) {
  const mergedConfig = {
    ...defaultConfig,
    ...config
  };

  // Initialize logger
  const logger = new Logger(mergedConfig.logging);
  
  // Initialize metrics and tracing if enabled
  let metrics, tracer;
  if (mergedConfig.telemetry.enabled) {
    metrics = new Metrics(mergedConfig.telemetry);
    tracer = new Tracer(mergedConfig.telemetry);
  }

  // Initialize additional utilities
  const { createLogger } = require('./utils/logger.js');
  const { createMetrics } = require('./utils/metrics.js');
  const { createTracer } = require('./utils/tracer.js');
  const { createCache } = require('./utils/cache.js');
  const { createConfig } = require('./utils/config.js');
  const { createValidator } = require('./utils/validator.js');
  const { createSecurity } = require('./utils/security.js');
  const { createEventRouter } = require('./events/EventRouter.js');
  const { createSubscriptionManager } = require('./events/SubscriptionManager.js');
  const { createEnhancedEventBus } = require('./events/EnhancedEventBus.js');
  const { createEventBus } = require('./events/EventBus.js');

  const enhancedLogger = createLogger({ serviceName: mergedConfig.telemetry.serviceName });
  const enhancedMetrics = createMetrics({ serviceName: mergedConfig.telemetry.serviceName, logger: enhancedLogger });
  const enhancedTracer = createTracer({ serviceName: mergedConfig.telemetry.serviceName, logger: enhancedLogger });
  const cache = createCache({ serviceName: mergedConfig.telemetry.serviceName, logger: enhancedLogger });
  const configManager = createConfig({ serviceName: mergedConfig.telemetry.serviceName });
  const validator = createValidator({ serviceName: mergedConfig.telemetry.serviceName, logger: enhancedLogger });
  const security = createSecurity({ serviceName: mergedConfig.telemetry.serviceName, logger: enhancedLogger });

  // Create enhanced event system
  const eventRouter = createEventRouter({
    logger: enhancedLogger,
    metrics: enhancedMetrics,
    tracer: enhancedTracer
  });
  
  const subscriptionManager = createSubscriptionManager({
    logger: enhancedLogger,
    metrics: enhancedMetrics,
    tracer: enhancedTracer
  });
  
  const enhancedEventBus = createEnhancedEventBus({
    logger: enhancedLogger,
    metrics: enhancedMetrics,
    tracer: enhancedTracer,
    eventRouter,
    subscriptionManager
  });
  
  // Legacy event bus for backward compatibility
  const eventBus = createEventBus({
    logger: enhancedLogger,
    metrics: enhancedMetrics,
    tracer: enhancedTracer
  });

  // Initialize service discovery if enabled
  let serviceDiscovery;
  if (mergedConfig.discovery.enabled) {
    serviceDiscovery = new ServiceDiscovery({
      ...mergedConfig.discovery,
      logger: enhancedLogger,
      metrics: enhancedMetrics
    });
  }

  // Create HTTP client with all features
  const httpClient = new HttpClient({
    ...mergedConfig.client,
    logger,
    metrics,
    tracer
  });

  // Create service client with discovery integration
  const serviceClient = new ServiceClient({
    httpClient,
    serviceDiscovery,
    logger: enhancedLogger,
    metrics: enhancedMetrics,
    tracer: enhancedTracer,
    cache
  });

  return {
    config: mergedConfig,
    logger,
    metrics,
    tracer,
    httpClient,
    serviceClient,
    serviceDiscovery,
    
    // Enhanced utilities
    enhancedLogger,
    enhancedMetrics,
    enhancedTracer,
    cache,
    configManager,
    validator,
    security,
    
    // Enhanced event system
    eventRouter,
    subscriptionManager,
    enhancedEventBus,
    eventBus,
    
    // Factory functions
    createServer: (serverConfig) => createServer({ ...mergedConfig.server, ...serverConfig }),
    createEventBus: (eventConfig) => createEventBus({ 
      ...mergedConfig.events, 
      ...eventConfig,
      logger: enhancedLogger,
      metrics: enhancedMetrics,
      tracer: enhancedTracer
    }),
    createEnhancedEventBus: (eventConfig) => createEnhancedEventBus({
      ...mergedConfig.events,
      ...eventConfig,
      logger: enhancedLogger,
      metrics: enhancedMetrics,
      tracer: enhancedTracer
    }),
    createCache: (cacheConfig) => new Cache({ ...mergedConfig.cache, ...cacheConfig }),
    createMessageQueue: (queueConfig) => new MessageQueue({
      ...mergedConfig.messageQueue,
      ...queueConfig,
      logger: enhancedLogger,
      metrics: enhancedMetrics,
      tracer: enhancedTracer
    })
  };
}

/**
 * Quick setup for common use cases
 */
export const quickSetup = {
  /**
   * Setup for a typical microservice
   */
  microservice: (serviceName, config = {}) => {
    return initialize({
      ...config,
      telemetry: {
        enabled: true,
        serviceName,
        ...config.telemetry
      },
      discovery: {
        enabled: true,
        ...config.discovery
      }
    });
  },

  /**
   * Setup for development environment
   */
  development: (config = {}) => {
    return initialize({
      ...config,
      logging: {
        level: 'debug',
        format: 'simple',
        ...config.logging
      },
      telemetry: {
        enabled: false,
        ...config.telemetry
      }
    });
  },

  /**
   * Setup for production environment
   */
  production: (config = {}) => {
    return initialize({
      ...config,
      logging: {
        level: 'warn',
        format: 'json',
        ...config.logging
      },
      telemetry: {
        enabled: true,
        ...config.telemetry
      },
      client: {
        ...defaultConfig.client,
        circuitBreaker: {
          enabled: true,
          threshold: 3,
          timeout: 30000,
          resetTimeout: 60000
        },
        ...config.client
      }
    });
  }
};

// Export version
export const version = '1.0.0';

// Default export for convenience
export default {
  initialize,
  quickSetup,
  defaultConfig,
  version
};