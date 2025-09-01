/**
 * Validation Utility for Backend AI Agent
 * Provides comprehensive input validation schemas and middleware
 */

'use strict';

const Joi = require('joi');
const { body, param, query, validationResult } = require('express-validator');
const createError = require('http-errors');
const logger = require('./logger');

// Common validation patterns
const patterns = {
  objectId: /^[0-9a-fA-F]{24}$/,
  uuid: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  semver: /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
  port: /^([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$/,
  ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  filename: /^[a-zA-Z0-9._-]+$/,
  packageName: /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/,
};

// Supported frameworks and databases
const supportedFrameworks = ['express', 'fastify', 'koa', 'nestjs', 'hapi', 'restify'];
const supportedDatabases = ['mongodb', 'postgresql', 'mysql', 'redis', 'sqlite', 'dynamodb'];
const supportedAuthTypes = ['jwt', 'oauth2', 'basic', 'apikey', 'session', 'passport'];
const supportedTestFrameworks = ['jest', 'mocha', 'vitest', 'ava', 'tap'];
const supportedDeploymentTargets = ['docker', 'kubernetes', 'aws', 'gcp', 'azure', 'heroku', 'vercel', 'netlify'];

// Joi schemas for complex validation
const schemas = {
  // Task creation schema
  createTask: Joi.object({
    type: Joi.string().valid(
      'api_generation',
      'database_schema',
      'authentication',
      'middleware',
      'testing',
      'optimization',
      'documentation',
      'deployment'
    ).required(),
    
    description: Joi.string().min(10).max(2000).required(),
    
    requirements: Joi.object({
      framework: Joi.string().valid(...supportedFrameworks),
      database: Joi.string().valid(...supportedDatabases),
      authType: Joi.string().valid(...supportedAuthTypes),
      testFramework: Joi.string().valid(...supportedTestFrameworks),
      deploymentTarget: Joi.string().valid(...supportedDeploymentTargets),
      features: Joi.array().items(Joi.string().max(100)).max(20),
      constraints: Joi.array().items(Joi.string().max(200)).max(10),
      performance: Joi.object({
        maxResponseTime: Joi.number().positive().max(30000),
        maxMemoryUsage: Joi.number().positive().max(8192),
        concurrentUsers: Joi.number().positive().max(100000),
      }),
      security: Joi.object({
        encryption: Joi.boolean(),
        rateLimit: Joi.boolean(),
        cors: Joi.boolean(),
        helmet: Joi.boolean(),
        validation: Joi.boolean(),
      }),
    }).required(),
    
    context: Joi.object({
      existingCode: Joi.string().max(50000),
      dependencies: Joi.array().items(
        Joi.string().pattern(patterns.packageName)
      ).max(50),
      environment: Joi.string().valid('development', 'staging', 'production'),
      version: Joi.string().pattern(patterns.semver),
    }),
    
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
    
    metadata: Joi.object({
      userId: Joi.string().pattern(patterns.uuid),
      sessionId: Joi.string().pattern(patterns.uuid),
      source: Joi.string().valid('api', 'ui', 'cli', 'webhook'),
      tags: Joi.array().items(Joi.string().max(50)).max(10),
    }),
  }),
  
  // API generation schema
  apiGeneration: Joi.object({
    endpoints: Joi.array().items(
      Joi.object({
        path: Joi.string().pattern(/^\/[a-zA-Z0-9\/_-]*$/).required(),
        method: Joi.string().valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE').required(),
        description: Joi.string().max(500),
        parameters: Joi.array().items(
          Joi.object({
            name: Joi.string().pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/).required(),
            type: Joi.string().valid('string', 'number', 'boolean', 'array', 'object').required(),
            required: Joi.boolean().default(false),
            description: Joi.string().max(200),
            validation: Joi.object({
              min: Joi.number(),
              max: Joi.number(),
              pattern: Joi.string(),
              enum: Joi.array().items(Joi.string()),
            }),
          })
        ).max(20),
        responses: Joi.array().items(
          Joi.object({
            status: Joi.number().integer().min(100).max(599).required(),
            description: Joi.string().max(200),
            schema: Joi.object(),
          })
        ).max(10),
        middleware: Joi.array().items(Joi.string().max(100)).max(10),
        authentication: Joi.boolean().default(false),
        rateLimit: Joi.object({
          requests: Joi.number().positive().max(10000),
          window: Joi.number().positive().max(3600000), // 1 hour in ms
        }),
      })
    ).min(1).max(50).required(),
    
    framework: Joi.string().valid(...supportedFrameworks).required(),
    database: Joi.string().valid(...supportedDatabases),
    includeValidation: Joi.boolean().default(true),
    includeErrorHandling: Joi.boolean().default(true),
    includeLogging: Joi.boolean().default(true),
    includeTests: Joi.boolean().default(false),
    includeDocumentation: Joi.boolean().default(false),
  }),
  
  // Database schema generation
  databaseSchema: Joi.object({
    database: Joi.string().valid(...supportedDatabases).required(),
    
    models: Joi.array().items(
      Joi.object({
        name: Joi.string().pattern(/^[A-Z][a-zA-Z0-9]*$/).required(),
        fields: Joi.array().items(
          Joi.object({
            name: Joi.string().pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/).required(),
            type: Joi.string().valid(
              'string', 'number', 'boolean', 'date', 'array', 'object',
              'objectId', 'uuid', 'email', 'url', 'text', 'json'
            ).required(),
            required: Joi.boolean().default(false),
            unique: Joi.boolean().default(false),
            index: Joi.boolean().default(false),
            default: Joi.any(),
            validation: Joi.object({
              min: Joi.number(),
              max: Joi.number(),
              pattern: Joi.string(),
              enum: Joi.array(),
            }),
            relationship: Joi.object({
              type: Joi.string().valid('oneToOne', 'oneToMany', 'manyToOne', 'manyToMany'),
              model: Joi.string().pattern(/^[A-Z][a-zA-Z0-9]*$/),
              foreignKey: Joi.string(),
            }),
          })
        ).min(1).max(50).required(),
        
        indexes: Joi.array().items(
          Joi.object({
            fields: Joi.array().items(Joi.string()).min(1).max(5).required(),
            unique: Joi.boolean().default(false),
            sparse: Joi.boolean().default(false),
            name: Joi.string().max(100),
          })
        ).max(10),
        
        options: Joi.object({
          timestamps: Joi.boolean().default(true),
          softDelete: Joi.boolean().default(false),
          versioning: Joi.boolean().default(false),
        }),
      })
    ).min(1).max(20).required(),
    
    includeSeeds: Joi.boolean().default(false),
    includeMigrations: Joi.boolean().default(true),
    includeValidation: Joi.boolean().default(true),
  }),
  
  // Authentication configuration
  authentication: Joi.object({
    type: Joi.string().valid(...supportedAuthTypes).required(),
    
    config: Joi.object({
      // JWT specific
      jwtSecret: Joi.string().min(32).max(256),
      jwtExpiration: Joi.string().pattern(/^\d+[smhd]$/),
      refreshToken: Joi.boolean(),
      
      // OAuth2 specific
      clientId: Joi.string().max(100),
      clientSecret: Joi.string().max(100),
      redirectUri: Joi.string().uri(),
      scopes: Joi.array().items(Joi.string().max(50)).max(20),
      
      // Session specific
      sessionSecret: Joi.string().min(32).max(256),
      sessionStore: Joi.string().valid('memory', 'redis', 'mongodb'),
      
      // Rate limiting
      rateLimit: Joi.object({
        requests: Joi.number().positive().max(1000),
        window: Joi.number().positive().max(3600000),
      }),
    }),
    
    features: Joi.object({
      registration: Joi.boolean().default(true),
      login: Joi.boolean().default(true),
      logout: Joi.boolean().default(true),
      passwordReset: Joi.boolean().default(false),
      emailVerification: Joi.boolean().default(false),
      twoFactor: Joi.boolean().default(false),
      socialLogin: Joi.array().items(
        Joi.string().valid('google', 'facebook', 'github', 'twitter')
      ).max(5),
    }),
    
    userModel: Joi.object({
      fields: Joi.array().items(Joi.string().max(50)).max(20),
      roles: Joi.array().items(Joi.string().max(50)).max(10),
      permissions: Joi.array().items(Joi.string().max(50)).max(50),
    }),
  }),
  
  // Code optimization request
  optimization: Joi.object({
    code: Joi.string().min(10).max(100000).required(),
    language: Joi.string().valid('javascript', 'typescript', 'python', 'java', 'go').required(),
    
    optimizationTypes: Joi.array().items(
      Joi.string().valid(
        'performance',
        'memory',
        'readability',
        'security',
        'maintainability',
        'testability'
      )
    ).min(1).max(6).required(),
    
    constraints: Joi.object({
      preserveApi: Joi.boolean().default(true),
      maxComplexity: Joi.number().positive().max(20),
      targetNodeVersion: Joi.string().pattern(patterns.semver),
      browserSupport: Joi.array().items(Joi.string().max(50)).max(10),
    }),
    
    context: Joi.object({
      framework: Joi.string().max(50),
      dependencies: Joi.array().items(Joi.string().max(100)).max(50),
      environment: Joi.string().valid('development', 'production'),
    }),
  }),
};

// Express-validator middleware factories
const validators = {
  // Task ID validation
  taskId: () => [
    param('taskId')
      .matches(patterns.uuid)
      .withMessage('Task ID must be a valid UUID'),
  ],
  
  // Pagination validation
  pagination: () => [
    query('page')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Page must be a positive integer between 1 and 1000'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be a positive integer between 1 and 100'),
    
    query('sort')
      .optional()
      .isIn(['createdAt', 'updatedAt', 'priority', 'status'])
      .withMessage('Sort field must be one of: createdAt, updatedAt, priority, status'),
    
    query('order')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Order must be either asc or desc'),
  ],
  
  // Task filtering
  taskFilters: () => [
    query('status')
      .optional()
      .isIn(['pending', 'processing', 'completed', 'failed', 'cancelled'])
      .withMessage('Status must be a valid task status'),
    
    query('type')
      .optional()
      .isIn([
        'api_generation',
        'database_schema',
        'authentication',
        'middleware',
        'testing',
        'optimization',
        'documentation',
        'deployment'
      ])
      .withMessage('Type must be a valid task type'),
    
    query('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priority must be a valid priority level'),
    
    query('userId')
      .optional()
      .matches(patterns.uuid)
      .withMessage('User ID must be a valid UUID'),
  ],
  
  // File upload validation
  fileUpload: () => [
    body('filename')
      .matches(patterns.filename)
      .withMessage('Filename contains invalid characters'),
    
    body('size')
      .isInt({ min: 1, max: 10485760 }) // 10MB max
      .withMessage('File size must be between 1 byte and 10MB'),
    
    body('mimeType')
      .isIn([
        'text/plain',
        'text/javascript',
        'application/javascript',
        'application/json',
        'text/markdown',
        'application/zip'
      ])
      .withMessage('File type not supported'),
  ],
  
  // Code analysis validation
  codeAnalysis: () => [
    body('code')
      .isLength({ min: 10, max: 100000 })
      .withMessage('Code must be between 10 and 100,000 characters'),
    
    body('language')
      .isIn(['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'php'])
      .withMessage('Language not supported'),
    
    body('analysisType')
      .isIn(['syntax', 'security', 'performance', 'quality', 'complexity'])
      .withMessage('Analysis type not supported'),
  ],
};

// Joi validation middleware
function validateSchema(schema, property = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    
    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));
      
      logger.warn('Validation error', {
        property,
        errors: details,
        originalData: req[property],
      });
      
      return next(createError(400, 'Validation failed', {
        details,
        type: 'validation_error',
      }));
    }
    
    // Replace the original data with validated and sanitized data
    req[property] = value;
    next();
  };
}

// Express-validator error handling middleware
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const details = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value,
      location: error.location,
    }));
    
    logger.warn('Express validation error', {
      errors: details,
      path: req.path,
      method: req.method,
    });
    
    return next(createError(400, 'Validation failed', {
      details,
      type: 'validation_error',
    }));
  }
  
  next();
}

// Sanitization utilities
const sanitizers = {
  // Sanitize string input
  sanitizeString: (str, maxLength = 1000) => {
    if (typeof str !== 'string') return '';
    
    return str
      .trim()
      .slice(0, maxLength)
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .replace(/\s+/g, ' '); // Normalize whitespace
  },
  
  // Sanitize code input
  sanitizeCode: (code) => {
    if (typeof code !== 'string') return '';
    
    // Remove potentially dangerous patterns
    return code
      .replace(/eval\s*\(/gi, 'EVAL_REMOVED(')
      .replace(/Function\s*\(/gi, 'FUNCTION_REMOVED(')
      .replace(/setTimeout\s*\(/gi, 'SETTIMEOUT_REMOVED(')
      .replace(/setInterval\s*\(/gi, 'SETINTERVAL_REMOVED(')
      .slice(0, 100000); // Limit size
  },
  
  // Sanitize object recursively
  sanitizeObject: (obj, maxDepth = 5, currentDepth = 0) => {
    if (currentDepth >= maxDepth || obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.slice(0, 100).map(item => 
        sanitizers.sanitizeObject(item, maxDepth, currentDepth + 1)
      );
    }
    
    const sanitized = {};
    const keys = Object.keys(obj).slice(0, 50); // Limit number of keys
    
    for (const key of keys) {
      const sanitizedKey = sanitizers.sanitizeString(key, 100);
      if (sanitizedKey) {
        sanitized[sanitizedKey] = sanitizers.sanitizeObject(
          obj[key], 
          maxDepth, 
          currentDepth + 1
        );
      }
    }
    
    return sanitized;
  },
};

// Custom validation functions
const customValidators = {
  // Validate package.json content
  isValidPackageJson: (str) => {
    try {
      const pkg = JSON.parse(str);
      return pkg.name && pkg.version && typeof pkg.name === 'string';
    } catch {
      return false;
    }
  },
  
  // Validate environment variables
  isValidEnvVar: (str) => {
    return /^[A-Z][A-Z0-9_]*$/.test(str);
  },
  
  // Validate API endpoint path
  isValidApiPath: (str) => {
    return /^\/[a-zA-Z0-9\/_-]*$/.test(str) && str.length <= 200;
  },
  
  // Validate database connection string
  isValidConnectionString: (str) => {
    // Basic validation for common database connection strings
    const patterns = [
      /^mongodb:\/\//, // MongoDB
      /^postgresql:\/\//, // PostgreSQL
      /^mysql:\/\//, // MySQL
      /^redis:\/\//, // Redis
    ];
    
    return patterns.some(pattern => pattern.test(str));
  },
};

module.exports = {
  patterns,
  schemas,
  validators,
  validateSchema,
  handleValidationErrors,
  sanitizers,
  customValidators,
  supportedFrameworks,
  supportedDatabases,
  supportedAuthTypes,
  supportedTestFrameworks,
  supportedDeploymentTargets,
};