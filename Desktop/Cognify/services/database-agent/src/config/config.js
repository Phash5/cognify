/**
 * Configuration Management for Database AI Agent Service
 * Centralizes all configuration with environment variable support
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Load environment variables from .env file if it exists
if (fs.existsSync(path.join(__dirname, '../../.env'))) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}

const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT, 10) || 3003,
    host: process.env.HOST || 'localhost',
    env: process.env.NODE_ENV || 'development',
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3003',
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '50mb',
    keepAliveTimeout: parseInt(process.env.KEEP_ALIVE_TIMEOUT, 10) || 65000,
    headersTimeout: parseInt(process.env.HEADERS_TIMEOUT, 10) || 66000,
    maxHeaderSize: parseInt(process.env.MAX_HEADER_SIZE, 10) || 16384,
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    file: {
      enabled: process.env.LOG_FILE_ENABLED === 'true',
      path: process.env.LOG_FILE_PATH || './logs',
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_MAX_FILES || '14d',
      datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD',
    },
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'database-agent:',
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT, 10) || 5000,
    retryDelayOnFailure: parseInt(process.env.REDIS_RETRY_DELAY_ON_FAILURE, 10) || 100,
    maxRetryDelay: parseInt(process.env.REDIS_MAX_RETRY_DELAY, 10) || 2000,
    maxRetries: parseInt(process.env.REDIS_MAX_RETRIES, 10) || 3,
  },

  // Cache Configuration
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    type: process.env.CACHE_TYPE || 'redis', // 'redis' or 'memory'
    ttl: parseInt(process.env.CACHE_TTL, 10) || 3600, // seconds
    maxSize: parseInt(process.env.CACHE_MAX_SIZE, 10) || 1000,
    checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD, 10) || 600, // seconds
  },

  // OpenAI Configuration
  ai: {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS, 10) || 4000,
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.1,
    timeout: parseInt(process.env.OPENAI_TIMEOUT, 10) || 60000,
    maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES, 10) || 3,
    retryDelay: parseInt(process.env.OPENAI_RETRY_DELAY, 10) || 1000,
  },

  // Authentication Configuration
  auth: {
    jwt: {
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      issuer: process.env.JWT_ISSUER || 'cognify-database-agent',
      audience: process.env.JWT_AUDIENCE || 'cognify-users',
    },
    apiKey: {
      header: process.env.API_KEY_HEADER || 'X-API-Key',
      keys: process.env.API_KEYS ? process.env.API_KEYS.split(',') : ['dev-key-123'],
    },
  },

  // Rate Limiting Configuration
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    message: process.env.RATE_LIMIT_MESSAGE || 'Too many requests, please try again later',
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS === 'true',
    skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED_REQUESTS === 'true',
  },

  // Database AI-specific rate limiting
  aiRateLimit: {
    windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS, 10) || 60 * 60 * 1000, // 1 hour
    maxRequests: parseInt(process.env.AI_RATE_LIMIT_MAX_REQUESTS, 10) || 50,
    message: process.env.AI_RATE_LIMIT_MESSAGE || 'Database AI request limit exceeded, please try again later',
  },

  // Task Configuration
  tasks: {
    queueConcurrency: parseInt(process.env.TASK_QUEUE_CONCURRENCY, 10) || 5,
    timeout: parseInt(process.env.TASK_TIMEOUT, 10) || 300000, // 5 minutes
    retryAttempts: parseInt(process.env.TASK_RETRY_ATTEMPTS, 10) || 3,
    retryDelay: parseInt(process.env.TASK_RETRY_DELAY, 10) || 5000,
    cleanupInterval: parseInt(process.env.TASK_CLEANUP_INTERVAL, 10) || 3600000, // 1 hour
    maxHistory: parseInt(process.env.TASK_MAX_HISTORY, 10) || 1000,
  },

  // Database Configuration
  database: {
    // Supported database types
    supportedTypes: (process.env.DB_SUPPORTED_TYPES || 'mongodb,postgresql,mysql,sqlite,redis,cassandra,elasticsearch').split(','),
    defaultType: process.env.DB_DEFAULT_TYPE || 'mongodb',
    
    // Schema generation options
    includeIndexes: process.env.DB_INCLUDE_INDEXES !== 'false',
    includeValidation: process.env.DB_INCLUDE_VALIDATION !== 'false',
    includeRelationships: process.env.DB_INCLUDE_RELATIONSHIPS !== 'false',
    includeSeedData: process.env.DB_INCLUDE_SEED_DATA === 'true',
    includeQueries: process.env.DB_INCLUDE_QUERIES !== 'false',
    includeMigrations: process.env.DB_INCLUDE_MIGRATIONS !== 'false',
    
    // Code style preferences
    codeStyle: process.env.DB_CODE_STYLE || 'standard',
    useTypeScript: process.env.DB_USE_TYPESCRIPT === 'true',
    useORM: process.env.DB_USE_ORM !== 'false',
    defaultORM: process.env.DB_DEFAULT_ORM || 'mongoose', // mongoose, sequelize, typeorm, prisma
    
    // Performance options
    optimizeQueries: process.env.DB_OPTIMIZE_QUERIES !== 'false',
    includePerformanceHints: process.env.DB_INCLUDE_PERFORMANCE_HINTS !== 'false',
    includeCaching: process.env.DB_INCLUDE_CACHING === 'true',
    includeConnectionPooling: process.env.DB_INCLUDE_CONNECTION_POOLING !== 'false',
  },

  // File Upload Configuration
  upload: {
    maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE, 10) || 10 * 1024 * 1024, // 10MB
    maxFiles: parseInt(process.env.UPLOAD_MAX_FILES, 10) || 10,
    allowedTypes: process.env.UPLOAD_ALLOWED_TYPES ? 
      process.env.UPLOAD_ALLOWED_TYPES.split(',') : 
      ['.sql', '.json', '.js', '.ts', '.yaml', '.yml', '.md', '.txt'],
    tempDir: process.env.UPLOAD_TEMP_DIR || './temp',
    cleanupInterval: parseInt(process.env.UPLOAD_CLEANUP_INTERVAL, 10) || 3600000, // 1 hour
  },

  // Security Configuration
  security: {
    cors: {
      allowedOrigins: process.env.CORS_ALLOWED_ORIGINS ? 
        process.env.CORS_ALLOWED_ORIGINS.split(',') : 
        ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
      credentials: process.env.CORS_CREDENTIALS !== 'false',
    },
    helmet: {
      enabled: process.env.HELMET_ENABLED !== 'false',
      contentSecurityPolicy: process.env.CSP_ENABLED !== 'false',
      hsts: {
        enabled: process.env.HSTS_ENABLED !== 'false',
        maxAge: parseInt(process.env.HSTS_MAX_AGE, 10) || 31536000, // 1 year
        includeSubDomains: process.env.HSTS_INCLUDE_SUBDOMAINS !== 'false',
        preload: process.env.HSTS_PRELOAD !== 'false',
      },
    },
  },

  // Telemetry Configuration
  telemetry: {
    enabled: process.env.TELEMETRY_ENABLED !== 'false',
    serviceName: process.env.TELEMETRY_SERVICE_NAME || 'database-ai-agent',
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
      prefix: process.env.PROMETHEUS_PREFIX || 'database_agent_',
    },
  },

  // Health Check Configuration
  healthCheck: {
    enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 30000, // 30 seconds
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT, 10) || 5000,
    retries: parseInt(process.env.HEALTH_CHECK_RETRIES, 10) || 3,
  },

  // Orchestrator Integration
  orchestrator: {
    url: process.env.ORCHESTRATOR_URL || 'http://localhost:3000',
    apiKey: process.env.ORCHESTRATOR_API_KEY,
    timeout: parseInt(process.env.ORCHESTRATOR_TIMEOUT, 10) || 30000,
    retryAttempts: parseInt(process.env.ORCHESTRATOR_RETRY_ATTEMPTS, 10) || 3,
    retryDelay: parseInt(process.env.ORCHESTRATOR_RETRY_DELAY, 10) || 2000,
    healthCheckInterval: parseInt(process.env.ORCHESTRATOR_HEALTH_CHECK_INTERVAL, 10) || 60000,
  },

  // Service Discovery
  serviceDiscovery: {
    enabled: process.env.SERVICE_DISCOVERY_ENABLED === 'true',
    type: process.env.SERVICE_DISCOVERY_TYPE || 'consul', // consul, etcd, zookeeper
    host: process.env.SERVICE_DISCOVERY_HOST || 'localhost',
    port: parseInt(process.env.SERVICE_DISCOVERY_PORT, 10) || 8500,
    registryTtl: parseInt(process.env.SERVICE_REGISTRY_TTL, 10) || 30,
    registryInterval: parseInt(process.env.SERVICE_REGISTRY_INTERVAL, 10) || 15,
  },

  // Database Connection (for metadata storage)
  storage: {
    url: process.env.DATABASE_URL || 'mongodb://localhost:27017/cognify-database-agent',
    maxConnections: parseInt(process.env.DATABASE_MAX_CONNECTIONS, 10) || 10,
    connectionTimeout: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT, 10) || 30000,
    socketTimeout: parseInt(process.env.DATABASE_SOCKET_TIMEOUT, 10) || 30000,
    retryWrites: process.env.DATABASE_RETRY_WRITES !== 'false',
    writeConcern: process.env.DATABASE_W || 'majority',
  },
};

// Validation for production environment
if (config.server.env === 'production') {
  const requiredEnvVars = [
    'OPENAI_API_KEY',
    'JWT_SECRET',
    'REDIS_HOST',
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables for production: ${missingVars.join(', ')}`);
  }
  
  // Ensure JWT secret is strong enough
  if (config.auth.jwt.secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long in production');
  }
  
  // Ensure OpenAI API key is provided
  if (!config.ai.apiKey || config.ai.apiKey.startsWith('your_')) {
    throw new Error('Valid OPENAI_API_KEY is required in production');
  }
}

// Freeze configuration to prevent runtime modifications
Object.freeze(config);

module.exports = config;