/**
 * DevOps AI Agent Configuration
 * Centralized configuration management for the DevOps AI Agent service
 */

'use strict';

const path = require('path');
require('dotenv').config();

// Helper function to parse boolean environment variables
const parseBoolean = (value, defaultValue = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }
  return defaultValue;
};

// Helper function to parse JSON environment variables
const parseJSON = (value, defaultValue = {}) => {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn(`Failed to parse JSON config: ${error.message}`);
    return defaultValue;
  }
};

// Helper function to parse array environment variables
const parseArray = (value, defaultValue = []) => {
  if (!value) return defaultValue;
  return value.split(',').map(item => item.trim()).filter(Boolean);
};

const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT, 10) || 3004,
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
    bodyLimit: process.env.BODY_LIMIT || '10mb',
    trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    file: {
      enabled: parseBoolean(process.env.LOG_FILE_ENABLED, true),
      path: process.env.LOG_FILE_PATH || 'logs/devops-agent.log',
      maxSize: process.env.LOG_FILE_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_FILE_MAX_FILES || '14d',
    },
    console: {
      enabled: parseBoolean(process.env.LOG_CONSOLE_ENABLED, true),
    },
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB, 10) || 3,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'devops-agent:',
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT, 10) || 5000,
    retryAttempts: parseInt(process.env.REDIS_RETRY_ATTEMPTS, 10) || 3,
    retryDelay: parseInt(process.env.REDIS_RETRY_DELAY, 10) || 1000,
  },

  // Cache Configuration
  cache: {
    enabled: parseBoolean(process.env.CACHE_ENABLED, true),
    defaultTtl: parseInt(process.env.CACHE_DEFAULT_TTL, 10) || 3600,
    maxKeys: parseInt(process.env.CACHE_MAX_KEYS, 10) || 10000,
    deploymentTtl: parseInt(process.env.CACHE_DEPLOYMENT_TTL, 10) || 7200,
    infrastructureTtl: parseInt(process.env.CACHE_INFRASTRUCTURE_TTL, 10) || 3600,
    monitoringTtl: parseInt(process.env.CACHE_MONITORING_TTL, 10) || 1800,
    configurationTtl: parseInt(process.env.CACHE_CONFIGURATION_TTL, 10) || 900,
  },

  // OpenAI Configuration
  openai: {
    enabled: parseBoolean(process.env.OPENAI_ENABLED, true),
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS, 10) || 4000,
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.1,
    timeout: parseInt(process.env.OPENAI_TIMEOUT, 10) || 30000,
    maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES, 10) || 3,
    retryDelay: parseInt(process.env.OPENAI_RETRY_DELAY, 10) || 1000,
  },

  // Authentication Configuration
  auth: {
    jwt: {
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      issuer: process.env.JWT_ISSUER || 'cognify-devops-agent',
      audience: process.env.JWT_AUDIENCE || 'cognify-users',
    },
    apiKey: {
      header: process.env.API_KEY_HEADER || 'X-API-Key',
      keys: parseArray(process.env.API_KEYS),
    },
  },

  // Rate Limiting Configuration
  rateLimit: {
    enabled: parseBoolean(process.env.RATE_LIMIT_ENABLED, true),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    message: process.env.RATE_LIMIT_MESSAGE || 'Too many requests, please try again later',
    skipSuccessfulRequests: parseBoolean(process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS, false),
    skipFailedRequests: parseBoolean(process.env.RATE_LIMIT_SKIP_FAILED_REQUESTS, false),
  },

  // Burst Protection
  burstLimit: {
    enabled: parseBoolean(process.env.BURST_LIMIT_ENABLED, true),
    windowMs: parseInt(process.env.BURST_LIMIT_WINDOW_MS, 10) || 60000, // 1 minute
    maxRequests: parseInt(process.env.BURST_LIMIT_MAX_REQUESTS, 10) || 20,
  },

  // AI-Specific Rate Limiting
  aiRateLimit: {
    enabled: parseBoolean(process.env.AI_RATE_LIMIT_ENABLED, true),
    windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS, 10) || 3600000, // 1 hour
    maxRequests: parseInt(process.env.AI_RATE_LIMIT_MAX_REQUESTS, 10) || 50,
    costPerRequest: parseInt(process.env.AI_RATE_LIMIT_COST_PER_REQUEST, 10) || 1,
  },

  // DevOps-Specific Rate Limiting
  deploymentRateLimit: {
    windowMs: parseInt(process.env.DEPLOYMENT_RATE_LIMIT_WINDOW_MS, 10) || 3600000,
    maxRequests: parseInt(process.env.DEPLOYMENT_RATE_LIMIT_MAX_REQUESTS, 10) || 10,
  },

  infrastructureRateLimit: {
    windowMs: parseInt(process.env.INFRASTRUCTURE_RATE_LIMIT_WINDOW_MS, 10) || 3600000,
    maxRequests: parseInt(process.env.INFRASTRUCTURE_RATE_LIMIT_MAX_REQUESTS, 10) || 15,
  },

  monitoringRateLimit: {
    windowMs: parseInt(process.env.MONITORING_RATE_LIMIT_WINDOW_MS, 10) || 3600000,
    maxRequests: parseInt(process.env.MONITORING_RATE_LIMIT_MAX_REQUESTS, 10) || 30,
  },

  configurationRateLimit: {
    windowMs: parseInt(process.env.CONFIGURATION_RATE_LIMIT_WINDOW_MS, 10) || 3600000,
    maxRequests: parseInt(process.env.CONFIGURATION_RATE_LIMIT_MAX_REQUESTS, 10) || 25,
  },

  // Task Management Configuration
  tasks: {
    queueEnabled: parseBoolean(process.env.TASK_QUEUE_ENABLED, true),
    maxConcurrent: parseInt(process.env.TASK_MAX_CONCURRENT, 10) || 5,
    defaultTimeout: parseInt(process.env.TASK_DEFAULT_TIMEOUT, 10) || 300000, // 5 minutes
    retryAttempts: parseInt(process.env.TASK_RETRY_ATTEMPTS, 10) || 3,
    retryDelay: parseInt(process.env.TASK_RETRY_DELAY, 10) || 5000,
    cleanupInterval: parseInt(process.env.TASK_CLEANUP_INTERVAL, 10) || 3600000, // 1 hour
    maxAge: parseInt(process.env.TASK_MAX_AGE, 10) || 86400000, // 24 hours
  },

  // DevOps Configuration
  devops: {
    // Supported platforms and tools
    supportedPlatforms: parseArray(process.env.DEVOPS_SUPPORTED_PLATFORMS, [
      'kubernetes', 'docker', 'aws', 'gcp', 'azure', 'terraform', 'ansible'
    ]),
    defaultTimeout: parseInt(process.env.DEVOPS_DEFAULT_TIMEOUT, 10) || 300000,
    maxConcurrentDeployments: parseInt(process.env.DEVOPS_MAX_CONCURRENT_DEPLOYMENTS, 10) || 3,
    
    // Deployment Configuration
    deployment: {
      enableRollback: parseBoolean(process.env.DEPLOYMENT_ENABLE_ROLLBACK, true),
      healthCheckTimeout: parseInt(process.env.DEPLOYMENT_HEALTH_CHECK_TIMEOUT, 10) || 300000,
      progressTracking: parseBoolean(process.env.DEPLOYMENT_PROGRESS_TRACKING, true),
      notificationEnabled: parseBoolean(process.env.DEPLOYMENT_NOTIFICATION_ENABLED, true),
    },

    // Infrastructure Configuration
    infrastructure: {
      enableValidation: parseBoolean(process.env.INFRASTRUCTURE_ENABLE_VALIDATION, true),
      dryRunDefault: parseBoolean(process.env.INFRASTRUCTURE_DRY_RUN_DEFAULT, true),
      costEstimation: parseBoolean(process.env.INFRASTRUCTURE_COST_ESTIMATION, true),
      securityScanning: parseBoolean(process.env.INFRASTRUCTURE_SECURITY_SCANNING, true),
    },

    // Monitoring Configuration
    monitoring: {
      enableAlerts: parseBoolean(process.env.MONITORING_ENABLE_ALERTS, true),
      metricsRetention: parseInt(process.env.MONITORING_METRICS_RETENTION, 10) || 2592000000, // 30 days
      alertThresholds: parseJSON(process.env.MONITORING_ALERT_THRESHOLDS, {
        cpu: 80,
        memory: 85,
        disk: 90,
        errorRate: 5,
      }),
    },

    // Configuration Management
    configuration: {
      enableVersioning: parseBoolean(process.env.CONFIGURATION_ENABLE_VERSIONING, true),
      enableValidation: parseBoolean(process.env.CONFIGURATION_ENABLE_VALIDATION, true),
      backupEnabled: parseBoolean(process.env.CONFIGURATION_BACKUP_ENABLED, true),
      encryptSecrets: parseBoolean(process.env.CONFIGURATION_ENCRYPT_SECRETS, true),
    },
  },

  // File Upload Configuration
  upload: {
    enabled: parseBoolean(process.env.UPLOAD_ENABLED, true),
    maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE, 10) || 10485760, // 10MB
    maxFiles: parseInt(process.env.UPLOAD_MAX_FILES, 10) || 5,
    allowedTypes: parseArray(process.env.UPLOAD_ALLOWED_TYPES, [
      '.yml', '.yaml', '.json', '.tf', '.sh', '.ps1', '.dockerfile', '.md'
    ]),
    destination: process.env.UPLOAD_DESTINATION || 'tmp/uploads',
    preservePath: parseBoolean(process.env.UPLOAD_PRESERVE_PATH, false),
  },

  // Security Configuration
  security: {
    helmet: {
      enabled: parseBoolean(process.env.SECURITY_HELMET_ENABLED, true),
    },
    cors: {
      enabled: parseBoolean(process.env.SECURITY_CORS_ENABLED, true),
      origin: parseArray(process.env.SECURITY_CORS_ORIGIN, ['http://localhost:3000']),
      credentials: parseBoolean(process.env.SECURITY_CORS_CREDENTIALS, true),
    },
    csp: {
      enabled: parseBoolean(process.env.CSP_ENABLED, true),
      reportOnly: parseBoolean(process.env.CSP_REPORT_ONLY, false),
      reportUri: process.env.CSP_REPORT_URI || '/api/security/csp-report',
    },
    validation: {
      strictMode: parseBoolean(process.env.VALIDATION_STRICT_MODE, true),
      sanitizeHtml: parseBoolean(process.env.VALIDATION_SANITIZE_HTML, true),
      maxStringLength: parseInt(process.env.VALIDATION_MAX_STRING_LENGTH, 10) || 10000,
      maxArrayLength: parseInt(process.env.VALIDATION_MAX_ARRAY_LENGTH, 10) || 1000,
    },
  },

  // Telemetry Configuration
  telemetry: {
    enabled: parseBoolean(process.env.TELEMETRY_ENABLED, true),
    serviceName: process.env.TELEMETRY_SERVICE_NAME || 'devops-agent',
    serviceVersion: process.env.TELEMETRY_SERVICE_VERSION || '1.0.0',
    
    // Jaeger Configuration
    jaeger: {
      enabled: parseBoolean(process.env.JAEGER_ENABLED, true),
      endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
      agentHost: process.env.JAEGER_AGENT_HOST || 'localhost',
      agentPort: parseInt(process.env.JAEGER_AGENT_PORT, 10) || 6832,
      samplerType: process.env.JAEGER_SAMPLER_TYPE || 'const',
      samplerParam: parseFloat(process.env.JAEGER_SAMPLER_PARAM) || 1,
    },
    
    // Prometheus Configuration
    prometheus: {
      enabled: parseBoolean(process.env.PROMETHEUS_ENABLED, true),
      port: parseInt(process.env.PROMETHEUS_PORT, 10) || 9465,
      endpoint: process.env.PROMETHEUS_ENDPOINT || '/metrics',
      prefix: process.env.PROMETHEUS_PREFIX || 'devops_agent_',
    },
  },

  // Health Check Configuration
  healthCheck: {
    enabled: parseBoolean(process.env.HEALTH_CHECK_ENABLED, true),
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 30000,
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT, 10) || 5000,
    retries: parseInt(process.env.HEALTH_CHECK_RETRIES, 10) || 3,
    
    // Dependency Health Checks
    redis: parseBoolean(process.env.HEALTH_CHECK_REDIS, true),
    openai: parseBoolean(process.env.HEALTH_CHECK_OPENAI, true),
    externalServices: parseBoolean(process.env.HEALTH_CHECK_EXTERNAL_SERVICES, false),
  },

  // Orchestrator Integration
  orchestrator: {
    enabled: parseBoolean(process.env.ORCHESTRATOR_ENABLED, true),
    url: process.env.ORCHESTRATOR_URL || 'http://localhost:3001',
    apiKey: process.env.ORCHESTRATOR_API_KEY,
    timeout: parseInt(process.env.ORCHESTRATOR_TIMEOUT, 10) || 10000,
    retryAttempts: parseInt(process.env.ORCHESTRATOR_RETRY_ATTEMPTS, 10) || 3,
    heartbeatInterval: parseInt(process.env.ORCHESTRATOR_HEARTBEAT_INTERVAL, 10) || 30000,
  },

  // Service Discovery
  serviceDiscovery: {
    enabled: parseBoolean(process.env.SERVICE_DISCOVERY_ENABLED, true),
    type: process.env.SERVICE_DISCOVERY_TYPE || 'consul',
    host: process.env.SERVICE_DISCOVERY_HOST || 'localhost',
    port: parseInt(process.env.SERVICE_DISCOVERY_PORT, 10) || 8500,
    serviceName: process.env.SERVICE_DISCOVERY_SERVICE_NAME || 'devops-agent',
    serviceId: process.env.SERVICE_DISCOVERY_SERVICE_ID || 'devops-agent-1',
    healthCheckUrl: process.env.SERVICE_DISCOVERY_HEALTH_CHECK_URL || 'http://localhost:3004/api/health',
    tags: parseArray(process.env.SERVICE_DISCOVERY_TAGS, ['ai', 'devops', 'microservice']),
  },

  // Database Configuration (for metadata storage)
  database: {
    url: process.env.DATABASE_URL || 'mongodb://localhost:27017/cognify_devops_agent',
    options: parseJSON(process.env.DATABASE_OPTIONS, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }),
  },
};

// Validation
if (config.openai.enabled && !config.openai.apiKey) {
  if (config.server.env === 'production') {
    throw new Error('OpenAI API key is required in production');
  }
  console.warn('Warning: OpenAI API key not configured');
}

if (config.auth.apiKey.keys.length === 0) {
  console.warn('Warning: No API keys configured');
}

module.exports = config;