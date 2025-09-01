/**
 * Configuration for Service Discovery Service
 */

'use strict';

require('dotenv').config();

const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT, 10) || 3010,
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development',
    corsOrigins: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 30000,
    bodyLimit: process.env.BODY_LIMIT || '10mb',
    trustProxy: process.env.TRUST_PROXY === 'true',
  },

  // Service Registry Configuration
  registry: {
    // Service registration settings
    defaultTtl: parseInt(process.env.REGISTRY_DEFAULT_TTL, 10) || 300, // 5 minutes
    heartbeatInterval: parseInt(process.env.REGISTRY_HEARTBEAT_INTERVAL, 10) || 30000, // 30 seconds
    healthCheckInterval: parseInt(process.env.REGISTRY_HEALTH_CHECK_INTERVAL, 10) || 60000, // 1 minute
    cleanupInterval: parseInt(process.env.REGISTRY_CLEANUP_INTERVAL, 10) || 120000, // 2 minutes
    maxRetries: parseInt(process.env.REGISTRY_MAX_RETRIES, 10) || 3,
    retryDelay: parseInt(process.env.REGISTRY_RETRY_DELAY, 10) || 5000, // 5 seconds
    
    // Service discovery settings
    cacheEnabled: process.env.REGISTRY_CACHE_ENABLED !== 'false',
    cacheTtl: parseInt(process.env.REGISTRY_CACHE_TTL, 10) || 60, // 1 minute
    loadBalancing: {
      strategy: process.env.LOAD_BALANCING_STRATEGY || 'round_robin', // round_robin, least_connections, random, weighted
      healthCheckRequired: process.env.LOAD_BALANCING_HEALTH_CHECK !== 'false',
    },
    
    // Service filtering
    allowedServices: process.env.ALLOWED_SERVICES
      ? process.env.ALLOWED_SERVICES.split(',')
      : ['ai-orchestrator', 'frontend-agent', 'backend-agent', 'database-agent', 'devops-agent'],
    
    // Service zones and regions
    zones: {
      enabled: process.env.ZONES_ENABLED === 'true',
      default: process.env.DEFAULT_ZONE || 'default',
      preference: process.env.ZONE_PREFERENCE || 'local', // local, any
    },
  },

  // Redis Configuration for persistence
  redis: {
    enabled: process.env.REDIS_ENABLED !== 'false',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB, 10) || 1, // Different DB from cache
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'service-discovery:',
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT, 10) || 5000,
    retryAttempts: parseInt(process.env.REDIS_RETRY_ATTEMPTS, 10) || 3,
    retryDelay: parseInt(process.env.REDIS_RETRY_DELAY, 10) || 1000,
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST, 10) || 3,
    lazyConnect: process.env.REDIS_LAZY_CONNECT === 'true',
    keepAlive: parseInt(process.env.REDIS_KEEP_ALIVE, 10) || 30000,
  },

  // Health Check Configuration
  healthCheck: {
    enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT, 10) || 5000,
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 30000,
    retries: parseInt(process.env.HEALTH_CHECK_RETRIES, 10) || 3,
    endpoints: {
      http: '/health',
      tcp: true,
      custom: process.env.HEALTH_CHECK_CUSTOM_ENDPOINTS
        ? process.env.HEALTH_CHECK_CUSTOM_ENDPOINTS.split(',')
        : [],
    },
    gracePeriod: parseInt(process.env.HEALTH_CHECK_GRACE_PERIOD, 10) || 60000, // 1 minute
  },

  // Rate Limiting
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 1000,
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === 'true',
    skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'true',
    
    // Service-specific rate limits
    registration: {
      windowMs: parseInt(process.env.RATE_LIMIT_REGISTRATION_WINDOW_MS, 10) || 60000, // 1 minute
      maxRequests: parseInt(process.env.RATE_LIMIT_REGISTRATION_MAX_REQUESTS, 10) || 10,
    },
    discovery: {
      windowMs: parseInt(process.env.RATE_LIMIT_DISCOVERY_WINDOW_MS, 10) || 60000, // 1 minute
      maxRequests: parseInt(process.env.RATE_LIMIT_DISCOVERY_MAX_REQUESTS, 10) || 100,
    },
    heartbeat: {
      windowMs: parseInt(process.env.RATE_LIMIT_HEARTBEAT_WINDOW_MS, 10) || 60000, // 1 minute
      maxRequests: parseInt(process.env.RATE_LIMIT_HEARTBEAT_MAX_REQUESTS, 10) || 200,
    },
  },

  // Security Configuration
  security: {
    apiKeys: process.env.API_KEYS ? process.env.API_KEYS.split(',') : ['dev-service-discovery-key'],
    jwt: {
      secret: process.env.JWT_SECRET || 'service-discovery-jwt-secret-change-in-production',
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      algorithm: process.env.JWT_ALGORITHM || 'HS256',
    },
    helmet: {
      enabled: process.env.SECURITY_HELMET_ENABLED !== 'false',
      contentSecurityPolicy: process.env.SECURITY_CSP_ENABLED !== 'false',
      crossOriginEmbedderPolicy: process.env.SECURITY_COEP_ENABLED === 'true',
    },
    cors: {
      enabled: process.env.SECURITY_CORS_ENABLED !== 'false',
      credentials: process.env.CORS_CREDENTIALS === 'true',
      optionsSuccessStatus: 200,
    },
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    colorize: process.env.LOG_COLORIZE === 'true',
    timestamp: process.env.LOG_TIMESTAMP !== 'false',
    
    // File logging
    file: {
      enabled: process.env.LOG_FILE_ENABLED !== 'false',
      level: process.env.LOG_FILE_LEVEL || 'info',
      filename: process.env.LOG_FILE_NAME || 'service-discovery.log',
      dirname: process.env.LOG_FILE_DIR || './logs',
      maxSize: parseInt(process.env.LOG_FILE_MAX_SIZE, 10) || 10485760, // 10MB
      maxFiles: parseInt(process.env.LOG_FILE_MAX_FILES, 10) || 5,
      datePattern: process.env.LOG_FILE_DATE_PATTERN || 'YYYY-MM-DD',
      zippedArchive: process.env.LOG_FILE_ZIPPED === 'true',
    },
    
    // Console logging
    console: {
      enabled: process.env.LOG_CONSOLE_ENABLED !== 'false',
      level: process.env.LOG_CONSOLE_LEVEL || 'info',
    },
  },

  // Telemetry Configuration
  telemetry: {
    enabled: process.env.TELEMETRY_ENABLED !== 'false',
    serviceName: process.env.TELEMETRY_SERVICE_NAME || 'service-discovery',
    serviceVersion: process.env.TELEMETRY_SERVICE_VERSION || '1.0.0',
    
    // Jaeger configuration
    jaeger: {
      enabled: process.env.JAEGER_ENABLED !== 'false',
      endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
      agentHost: process.env.JAEGER_AGENT_HOST || 'localhost',
      agentPort: parseInt(process.env.JAEGER_AGENT_PORT, 10) || 6832,
    },
    
    // Prometheus configuration
    prometheus: {
      enabled: process.env.PROMETHEUS_ENABLED !== 'false',
      port: parseInt(process.env.PROMETHEUS_PORT, 10) || 9090,
      endpoint: process.env.PROMETHEUS_ENDPOINT || '/metrics',
      collectDefaultMetrics: process.env.PROMETHEUS_COLLECT_DEFAULT !== 'false',
      prefix: process.env.PROMETHEUS_PREFIX || 'service_discovery_',
    },
  },

  // Monitoring Configuration
  monitoring: {
    enabled: process.env.MONITORING_ENABLED !== 'false',
    metricsInterval: parseInt(process.env.MONITORING_METRICS_INTERVAL, 10) || 60000, // 1 minute
    alerting: {
      enabled: process.env.MONITORING_ALERTING_ENABLED === 'true',
      webhookUrl: process.env.MONITORING_WEBHOOK_URL,
      thresholds: {
        serviceDown: parseInt(process.env.ALERT_THRESHOLD_SERVICE_DOWN, 10) || 1,
        highLatency: parseInt(process.env.ALERT_THRESHOLD_HIGH_LATENCY, 10) || 5000, // 5 seconds
        errorRate: parseFloat(process.env.ALERT_THRESHOLD_ERROR_RATE) || 0.05, // 5%
      },
    },
  },

  // Development Configuration
  development: {
    enableDebugRoutes: process.env.DEV_ENABLE_DEBUG_ROUTES === 'true',
    mockServices: process.env.DEV_MOCK_SERVICES === 'true',
    enableRequestLogging: process.env.DEV_ENABLE_REQUEST_LOGGING !== 'false',
    enableDetailedErrors: process.env.DEV_ENABLE_DETAILED_ERRORS !== 'false',
  },

  // Feature Flags
  features: {
    serviceVersioning: process.env.FEATURE_SERVICE_VERSIONING === 'true',
    circuitBreaker: process.env.FEATURE_CIRCUIT_BREAKER === 'true',
    loadBalancing: process.env.FEATURE_LOAD_BALANCING !== 'false',
    serviceMetadata: process.env.FEATURE_SERVICE_METADATA !== 'false',
    eventStreaming: process.env.FEATURE_EVENT_STREAMING === 'true',
    distributedTracing: process.env.FEATURE_DISTRIBUTED_TRACING !== 'false',
  },
};

// Validate critical configuration
if (!config.security.apiKeys || config.security.apiKeys.length === 0) {
  throw new Error('API_KEYS must be configured');
}

if (config.server.environment === 'production') {
  if (config.security.jwt.secret === 'service-discovery-jwt-secret-change-in-production') {
    throw new Error('JWT_SECRET must be changed in production');
  }
  
  if (config.security.apiKeys.includes('dev-service-discovery-key')) {
    throw new Error('Default API keys must be changed in production');
  }
}

// Environment-specific overrides
if (config.server.environment === 'development') {
  config.logging.level = 'debug';
  config.logging.colorize = true;
  config.development.enableDebugRoutes = true;
  config.development.enableDetailedErrors = true;
}

if (config.server.environment === 'test') {
  config.logging.level = 'error';
  config.logging.console.enabled = false;
  config.logging.file.enabled = false;
  config.telemetry.enabled = false;
  config.redis.enabled = false;
}

module.exports = config;