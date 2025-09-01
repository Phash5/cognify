/**
 * Backend AI Agent Service Configuration
 * Centralized configuration management with environment variable support
 */

'use strict';

const path = require('path');
const os = require('os');

// Load environment variables
require('dotenv').config();

// Helper function to parse boolean environment variables
const parseBoolean = (value, defaultValue = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }
  return defaultValue;
};

// Helper function to parse integer environment variables
const parseInteger = (value, defaultValue = 0) => {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

// Helper function to parse array environment variables
const parseArray = (value, defaultValue = []) => {
  if (!value) return defaultValue;
  return value.split(',').map(item => item.trim()).filter(Boolean);
};

const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  isTest: (process.env.NODE_ENV || 'development') === 'test',

  // Server Configuration
  server: {
    port: parseInteger(process.env.PORT, 3002),
    host: process.env.HOST || '0.0.0.0',
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3002',
    timeout: parseInteger(process.env.SERVER_TIMEOUT, 30000),
    keepAliveTimeout: parseInteger(process.env.KEEP_ALIVE_TIMEOUT, 5000),
    headersTimeout: parseInteger(process.env.HEADERS_TIMEOUT, 60000),
    maxHeaderSize: parseInteger(process.env.MAX_HEADER_SIZE, 16384),
    bodyLimit: process.env.BODY_LIMIT || '10mb',
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    filePath: process.env.LOG_FILE_PATH || path.join(process.cwd(), 'logs'),
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD',
    compress: parseBoolean(process.env.LOG_COMPRESS, true),
    colorize: parseBoolean(process.env.LOG_COLORIZE, !config?.isProduction),
    timestamp: parseBoolean(process.env.LOG_TIMESTAMP, true),
    handleExceptions: parseBoolean(process.env.LOG_HANDLE_EXCEPTIONS, true),
    handleRejections: parseBoolean(process.env.LOG_HANDLE_REJECTIONS, true),
  },

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInteger(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInteger(process.env.REDIS_DB, 1), // Different DB from frontend-agent
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'backend-agent:',
    connectTimeout: parseInteger(process.env.REDIS_CONNECT_TIMEOUT, 10000),
    commandTimeout: parseInteger(process.env.REDIS_COMMAND_TIMEOUT, 5000),
    retryDelayOnFailure: parseInteger(process.env.REDIS_RETRY_DELAY_ON_FAILURE, 100),
    maxRetriesPerRequest: parseInteger(process.env.REDIS_MAX_RETRIES_PER_REQUEST, 3),
    maxRetriesOnFailover: parseInteger(process.env.REDIS_MAX_RETRIES_ON_FAILOVER, 5),
    enableOfflineQueue: parseBoolean(process.env.REDIS_ENABLE_OFFLINE_QUEUE, false),
    lazyConnect: parseBoolean(process.env.REDIS_LAZY_CONNECT, true),
    keepAlive: parseInteger(process.env.REDIS_KEEP_ALIVE, 30000),
    family: parseInteger(process.env.REDIS_FAMILY, 4),
  },

  // Cache Configuration
  cache: {
    ttl: parseInteger(process.env.CACHE_TTL, 3600), // 1 hour
    maxSize: parseInteger(process.env.CACHE_MAX_SIZE, 1000),
    checkPeriod: parseInteger(process.env.CACHE_CHECK_PERIOD, 600), // 10 minutes
    deleteOnExpire: parseBoolean(process.env.CACHE_DELETE_ON_EXPIRE, true),
    useClones: parseBoolean(process.env.CACHE_USE_CLONES, false),
    errorOnMissing: parseBoolean(process.env.CACHE_ERROR_ON_MISSING, false),
    stdTTL: parseInteger(process.env.CACHE_STD_TTL, 3600),
  },

  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    organization: process.env.OPENAI_ORGANIZATION || '',
    model: process.env.OPENAI_MODEL || 'gpt-4',
    maxTokens: parseInteger(process.env.OPENAI_MAX_TOKENS, 4000),
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.1,
    topP: parseFloat(process.env.OPENAI_TOP_P) || 1.0,
    frequencyPenalty: parseFloat(process.env.OPENAI_FREQUENCY_PENALTY) || 0.0,
    presencePenalty: parseFloat(process.env.OPENAI_PRESENCE_PENALTY) || 0.0,
    timeout: parseInteger(process.env.OPENAI_TIMEOUT, 30000),
    maxRetries: parseInteger(process.env.OPENAI_MAX_RETRIES, 3),
    retryDelay: parseInteger(process.env.OPENAI_RETRY_DELAY, 1000),
  },

  // Authentication Configuration
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    jwtIssuer: process.env.JWT_ISSUER || 'cognify-backend-agent',
    jwtAudience: process.env.JWT_AUDIENCE || 'cognify-users',
    apiKeyHeader: process.env.API_KEY_HEADER || 'X-API-Key',
    authRequired: parseBoolean(process.env.AUTH_REQUIRED, true),
    bcryptRounds: parseInteger(process.env.BCRYPT_ROUNDS, 12),
    sessionSecret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',
    sessionMaxAge: parseInteger(process.env.SESSION_MAX_AGE, 86400000), // 24 hours
  },

  // Rate Limiting Configuration
  rateLimit: {
    windowMs: parseInteger(process.env.RATE_LIMIT_WINDOW_MS, 900000), // 15 minutes
    maxRequests: parseInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
    skipSuccessfulRequests: parseBoolean(process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS, false),
    skipFailedRequests: parseBoolean(process.env.RATE_LIMIT_SKIP_FAILED_REQUESTS, false),
    standardHeaders: parseBoolean(process.env.RATE_LIMIT_STANDARD_HEADERS, true),
    legacyHeaders: parseBoolean(process.env.RATE_LIMIT_LEGACY_HEADERS, false),
    store: process.env.RATE_LIMIT_STORE || 'redis',
    keyGenerator: process.env.RATE_LIMIT_KEY_GENERATOR || 'ip',
    
    // AI-specific rate limits
    ai: {
      windowMs: parseInteger(process.env.AI_RATE_LIMIT_WINDOW_MS, 3600000), // 1 hour
      maxRequests: parseInteger(process.env.AI_RATE_LIMIT_MAX_REQUESTS, 50),
      points: parseInteger(process.env.AI_RATE_LIMIT_POINTS, 10),
      duration: parseInteger(process.env.AI_RATE_LIMIT_DURATION, 3600), // 1 hour
    },
  },

  // Task Configuration
  tasks: {
    timeout: parseInteger(process.env.TASK_TIMEOUT, 300000), // 5 minutes
    maxRetries: parseInteger(process.env.TASK_MAX_RETRIES, 3),
    retryDelay: parseInteger(process.env.TASK_RETRY_DELAY, 5000),
    cleanupInterval: parseInteger(process.env.TASK_CLEANUP_INTERVAL, 3600000), // 1 hour
    maxConcurrent: parseInteger(process.env.TASK_MAX_CONCURRENT, 10),
    queueSize: parseInteger(process.env.TASK_QUEUE_SIZE, 100),
    priority: {
      high: 1,
      medium: 5,
      low: 10,
    },
  },

  // Backend Code Generation Configuration
  backend: {
    maxCodeLength: parseInteger(process.env.CODE_MAX_LENGTH, 50000),
    timeout: parseInteger(process.env.CODE_TIMEOUT, 60000),
    validationEnabled: parseBoolean(process.env.CODE_VALIDATION_ENABLED, true),
    sanitizationEnabled: parseBoolean(process.env.CODE_SANITIZATION_ENABLED, true),
    analysisEnabled: parseBoolean(process.env.CODE_ANALYSIS_ENABLED, true),
    supportedFrameworks: parseArray(process.env.SUPPORTED_FRAMEWORKS, [
      'express',
      'fastify',
      'koa',
      'nestjs',
      'hapi',
    ]),
    supportedLanguages: parseArray(process.env.SUPPORTED_LANGUAGES, [
      'javascript',
      'typescript',
    ]),
    supportedDatabases: parseArray(process.env.SUPPORTED_DATABASES, [
      'mongodb',
      'postgresql',
      'mysql',
      'redis',
      'sqlite',
    ]),
  },

  // File Upload Configuration
  upload: {
    maxSize: parseInteger(process.env.UPLOAD_MAX_SIZE, 10485760), // 10MB
    allowedTypes: parseArray(process.env.UPLOAD_ALLOWED_TYPES, [
      '.js',
      '.ts',
      '.json',
      '.md',
      '.sql',
      '.env',
      '.yaml',
      '.yml',
    ]),
    tempDir: process.env.UPLOAD_TEMP_DIR || path.join(os.tmpdir(), 'backend-agent'),
    cleanupInterval: parseInteger(process.env.UPLOAD_CLEANUP_INTERVAL, 3600000), // 1 hour
    preservePath: parseBoolean(process.env.UPLOAD_PRESERVE_PATH, false),
  },

  // Security Configuration
  security: {
    cors: {
      origin: parseArray(process.env.CORS_ORIGIN, [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173',
      ]),
      credentials: parseBoolean(process.env.CORS_CREDENTIALS, true),
      methods: parseArray(process.env.CORS_METHODS, ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']),
      allowedHeaders: parseArray(process.env.CORS_ALLOWED_HEADERS, [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'X-Request-ID',
        'X-Correlation-ID',
      ]),
    },
    helmet: {
      enabled: parseBoolean(process.env.HELMET_ENABLED, true),
      contentSecurityPolicy: parseBoolean(process.env.CSP_ENABLED, true),
      hsts: parseBoolean(process.env.HSTS_ENABLED, true),
      xssFilter: parseBoolean(process.env.XSS_PROTECTION_ENABLED, true),
    },
    rateLimitHeaders: parseBoolean(process.env.RATE_LIMIT_HEADERS, true),
  },

  // Telemetry Configuration
  telemetry: {
    enabled: parseBoolean(process.env.TELEMETRY_ENABLED, true),
    serviceName: process.env.TELEMETRY_SERVICE_NAME || 'backend-agent',
    serviceVersion: process.env.TELEMETRY_SERVICE_VERSION || '1.0.0',
    environment: process.env.TELEMETRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    sampleRate: parseFloat(process.env.TELEMETRY_SAMPLE_RATE) || 1.0,
    
    // Jaeger configuration
    jaeger: {
      endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
      agentHost: process.env.JAEGER_AGENT_HOST || 'localhost',
      agentPort: parseInteger(process.env.JAEGER_AGENT_PORT, 6832),
      samplerType: process.env.JAEGER_SAMPLER_TYPE || 'const',
      samplerParam: parseFloat(process.env.JAEGER_SAMPLER_PARAM) || 1,
    },
    
    // Prometheus configuration
    prometheus: {
      enabled: parseBoolean(process.env.PROMETHEUS_ENABLED, true),
      port: parseInteger(process.env.PROMETHEUS_PORT, 9465), // Different port from frontend-agent
      endpoint: process.env.PROMETHEUS_ENDPOINT || '/metrics',
      prefix: process.env.PROMETHEUS_PREFIX || 'backend_agent_',
      collectDefaultMetrics: parseBoolean(process.env.PROMETHEUS_COLLECT_DEFAULT_METRICS, true),
    },
  },

  // Health Check Configuration
  health: {
    interval: parseInteger(process.env.HEALTH_CHECK_INTERVAL, 30000),
    timeout: parseInteger(process.env.HEALTH_CHECK_TIMEOUT, 5000),
    retries: parseInteger(process.env.HEALTH_CHECK_RETRIES, 3),
    gracePeriod: parseInteger(process.env.HEALTH_CHECK_GRACE_PERIOD, 60000),
  },

  // Orchestrator Configuration
  orchestrator: {
    url: process.env.ORCHESTRATOR_URL || 'http://localhost:3000',
    apiKey: process.env.ORCHESTRATOR_API_KEY || '',
    timeout: parseInteger(process.env.ORCHESTRATOR_TIMEOUT, 10000),
    retryAttempts: parseInteger(process.env.ORCHESTRATOR_RETRY_ATTEMPTS, 3),
    retryDelay: parseInteger(process.env.ORCHESTRATOR_RETRY_DELAY, 1000),
    healthCheckInterval: parseInteger(process.env.ORCHESTRATOR_HEALTH_CHECK_INTERVAL, 30000),
  },

  // Service Discovery Configuration
  serviceDiscovery: {
    enabled: parseBoolean(process.env.SERVICE_DISCOVERY_ENABLED, false),
    url: process.env.SERVICE_DISCOVERY_URL || 'http://localhost:8500',
    token: process.env.SERVICE_DISCOVERY_TOKEN || '',
    datacenter: process.env.SERVICE_DISCOVERY_DATACENTER || 'dc1',
    healthCheckInterval: process.env.SERVICE_DISCOVERY_HEALTH_CHECK_INTERVAL || '10s',
    tags: parseArray(process.env.SERVICE_DISCOVERY_TAGS, ['backend', 'ai-agent', 'nodejs']),
  },

  // Database Configuration
  database: {
    url: process.env.DATABASE_URL || 'mongodb://localhost:27017/cognify-backend-agent',
    maxPoolSize: parseInteger(process.env.DATABASE_MAX_POOL_SIZE, 10),
    minPoolSize: parseInteger(process.env.DATABASE_MIN_POOL_SIZE, 2),
    connectTimeoutMS: parseInteger(process.env.DATABASE_CONNECT_TIMEOUT, 10000),
    socketTimeoutMS: parseInteger(process.env.DATABASE_SOCKET_TIMEOUT, 30000),
    serverSelectionTimeoutMS: parseInteger(process.env.DATABASE_SERVER_SELECTION_TIMEOUT, 5000),
    heartbeatFrequencyMS: parseInteger(process.env.DATABASE_HEARTBEAT_FREQUENCY, 10000),
    retryWrites: parseBoolean(process.env.DATABASE_RETRY_WRITES, true),
    retryReads: parseBoolean(process.env.DATABASE_RETRY_READS, true),
  },
};

// Validation
if (config.isProduction) {
  const requiredEnvVars = [
    'OPENAI_API_KEY',
    'JWT_SECRET',
    'SESSION_SECRET',
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

// Freeze configuration in production
if (config.isProduction) {
  Object.freeze(config);
}

module.exports = config;