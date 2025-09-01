/**
 * Validation Utility
 * Input validation and sanitization for the Database AI Agent
 */

'use strict';

const Joi = require('joi');
const { body, param, query, validationResult } = require('express-validator');
const DOMPurify = require('isomorphic-dompurify');
const config = require('../config/config');

// Joi schemas for different validation scenarios
const schemas = {
  // Schema generation validation
  schemaGeneration: Joi.object({
    requirements: Joi.alternatives().try(
      Joi.string().min(10).max(10000).required(),
      Joi.object().required()
    ).required(),
    options: Joi.object({
      databaseType: Joi.string().valid(...config.database.supportedTypes).default(config.database.defaultType),
      orm: Joi.string().valid('mongoose', 'sequelize', 'typeorm', 'prisma', 'knex').default(config.database.defaultORM),
      includeIndexes: Joi.boolean().default(true),
      includeValidation: Joi.boolean().default(true),
      includeRelationships: Joi.boolean().default(true),
      includeSeedData: Joi.boolean().default(false),
      includeQueries: Joi.boolean().default(true),
      includeMigrations: Joi.boolean().default(false),
      codeStyle: Joi.string().valid('standard', 'airbnb', 'google').default(config.database.codeStyle),
      useTypeScript: Joi.boolean().default(false),
      optimizeQueries: Joi.boolean().default(true),
      userId: Joi.string().uuid().optional(),
      sessionId: Joi.string().uuid().optional(),
    }).default({}),
  }),

  // Query optimization validation
  queryOptimization: Joi.object({
    queries: Joi.alternatives().try(
      Joi.string().min(5).max(50000).required(),
      Joi.array().items(Joi.string().min(5).max(10000)).min(1).max(20).required()
    ).required(),
    options: Joi.object({
      databaseType: Joi.string().valid(...config.database.supportedTypes).default(config.database.defaultType),
      includeIndexRecommendations: Joi.boolean().default(true),
      includePerformanceMetrics: Joi.boolean().default(true),
      includeExplanations: Joi.boolean().default(true),
      userId: Joi.string().uuid().optional(),
      sessionId: Joi.string().uuid().optional(),
    }).default({}),
  }),

  // Migration generation validation
  migrationGeneration: Joi.object({
    fromSchema: Joi.alternatives().try(
      Joi.string().min(10).max(50000).required(),
      Joi.object().required()
    ).required(),
    toSchema: Joi.alternatives().try(
      Joi.string().min(10).max(50000).required(),
      Joi.object().required()
    ).required(),
    options: Joi.object({
      databaseType: Joi.string().valid(...config.database.supportedTypes).default(config.database.defaultType),
      includeDataMigration: Joi.boolean().default(false),
      includeRollback: Joi.boolean().default(true),
      safeMode: Joi.boolean().default(true),
      userId: Joi.string().uuid().optional(),
      sessionId: Joi.string().uuid().optional(),
    }).default({}),
  }),

  // Performance analysis validation
  performanceAnalysis: Joi.object({
    schema: Joi.alternatives().try(
      Joi.string().min(10).max(50000).required(),
      Joi.object().required()
    ).required(),
    queries: Joi.alternatives().try(
      Joi.string().min(5).max(50000).required(),
      Joi.array().items(Joi.string().min(5).max(10000)).min(1).max(20).required()
    ).required(),
    options: Joi.object({
      databaseType: Joi.string().valid(...config.database.supportedTypes).default(config.database.defaultType),
      includeIndexAnalysis: Joi.boolean().default(true),
      includeQueryPlan: Joi.boolean().default(true),
      includeBottlenecks: Joi.boolean().default(true),
      includeRecommendations: Joi.boolean().default(true),
      userId: Joi.string().uuid().optional(),
      sessionId: Joi.string().uuid().optional(),
    }).default({}),
  }),

  // Task ID validation
  taskId: Joi.string().uuid().required(),

  // Pagination validation
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('createdAt', 'updatedAt', 'status', 'type').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),

  // Task filters validation
  taskFilters: Joi.object({
    status: Joi.string().valid('pending', 'processing', 'completed', 'failed', 'cancelled').optional(),
    type: Joi.string().valid('schema_generation', 'query_optimization', 'migration_generation', 'performance_analysis').optional(),
    userId: Joi.string().uuid().optional(),
    sessionId: Joi.string().uuid().optional(),
    dateFrom: Joi.date().iso().optional(),
    dateTo: Joi.date().iso().min(Joi.ref('dateFrom')).optional(),
  }),
};

// Express-validator middleware
const validators = {
  // Task ID parameter validation
  taskIdParam: [
    param('taskId')
      .isUUID()
      .withMessage('Task ID must be a valid UUID'),
  ],

  // Pagination query validation
  paginationQuery: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('sortBy')
      .optional()
      .isIn(['createdAt', 'updatedAt', 'status', 'type'])
      .withMessage('Invalid sort field'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc'),
  ],

  // Task filters validation
  taskFiltersQuery: [
    query('status')
      .optional()
      .isIn(['pending', 'processing', 'completed', 'failed', 'cancelled'])
      .withMessage('Invalid status filter'),
    query('type')
      .optional()
      .isIn(['schema_generation', 'query_optimization', 'migration_generation', 'performance_analysis'])
      .withMessage('Invalid type filter'),
    query('userId')
      .optional()
      .isUUID()
      .withMessage('User ID must be a valid UUID'),
    query('sessionId')
      .optional()
      .isUUID()
      .withMessage('Session ID must be a valid UUID'),
    query('dateFrom')
      .optional()
      .isISO8601()
      .withMessage('Date from must be a valid ISO 8601 date'),
    query('dateTo')
      .optional()
      .isISO8601()
      .withMessage('Date to must be a valid ISO 8601 date'),
  ],

  // Schema generation validation
  schemaGenerationBody: [
    body('requirements')
      .notEmpty()
      .withMessage('Requirements are required')
      .custom((value) => {
        if (typeof value === 'string') {
          if (value.length < 10 || value.length > 10000) {
            throw new Error('Requirements string must be between 10 and 10000 characters');
          }
        } else if (typeof value !== 'object') {
          throw new Error('Requirements must be a string or object');
        }
        return true;
      }),
    body('options.databaseType')
      .optional()
      .isIn(config.database.supportedTypes)
      .withMessage(`Database type must be one of: ${config.database.supportedTypes.join(', ')}`),
    body('options.orm')
      .optional()
      .isIn(['mongoose', 'sequelize', 'typeorm', 'prisma', 'knex'])
      .withMessage('ORM must be one of: mongoose, sequelize, typeorm, prisma, knex'),
    body('options.codeStyle')
      .optional()
      .isIn(['standard', 'airbnb', 'google'])
      .withMessage('Code style must be one of: standard, airbnb, google'),
  ],

  // Query optimization validation
  queryOptimizationBody: [
    body('queries')
      .notEmpty()
      .withMessage('Queries are required')
      .custom((value) => {
        if (typeof value === 'string') {
          if (value.length < 5 || value.length > 50000) {
            throw new Error('Query string must be between 5 and 50000 characters');
          }
        } else if (Array.isArray(value)) {
          if (value.length < 1 || value.length > 20) {
            throw new Error('Query array must contain between 1 and 20 queries');
          }
          for (const query of value) {
            if (typeof query !== 'string' || query.length < 5 || query.length > 10000) {
              throw new Error('Each query must be a string between 5 and 10000 characters');
            }
          }
        } else {
          throw new Error('Queries must be a string or array of strings');
        }
        return true;
      }),
  ],

  // Migration generation validation
  migrationGenerationBody: [
    body('fromSchema')
      .notEmpty()
      .withMessage('From schema is required')
      .custom((value) => {
        if (typeof value === 'string') {
          if (value.length < 10 || value.length > 50000) {
            throw new Error('From schema string must be between 10 and 50000 characters');
          }
        } else if (typeof value !== 'object') {
          throw new Error('From schema must be a string or object');
        }
        return true;
      }),
    body('toSchema')
      .notEmpty()
      .withMessage('To schema is required')
      .custom((value) => {
        if (typeof value === 'string') {
          if (value.length < 10 || value.length > 50000) {
            throw new Error('To schema string must be between 10 and 50000 characters');
          }
        } else if (typeof value !== 'object') {
          throw new Error('To schema must be a string or object');
        }
        return true;
      }),
  ],

  // Performance analysis validation
  performanceAnalysisBody: [
    body('schema')
      .notEmpty()
      .withMessage('Schema is required')
      .custom((value) => {
        if (typeof value === 'string') {
          if (value.length < 10 || value.length > 50000) {
            throw new Error('Schema string must be between 10 and 50000 characters');
          }
        } else if (typeof value !== 'object') {
          throw new Error('Schema must be a string or object');
        }
        return true;
      }),
    body('queries')
      .notEmpty()
      .withMessage('Queries are required')
      .custom((value) => {
        if (typeof value === 'string') {
          if (value.length < 5 || value.length > 50000) {
            throw new Error('Query string must be between 5 and 50000 characters');
          }
        } else if (Array.isArray(value)) {
          if (value.length < 1 || value.length > 20) {
            throw new Error('Query array must contain between 1 and 20 queries');
          }
          for (const query of value) {
            if (typeof query !== 'string' || query.length < 5 || query.length > 10000) {
              throw new Error('Each query must be a string between 5 and 10000 characters');
            }
          }
        } else {
          throw new Error('Queries must be a string or array of strings');
        }
        return true;
      }),
  ],
};

// Utility functions
const utils = {
  /**
   * Validate data against a Joi schema
   */
  validateSchema: (data, schemaName) => {
    const schema = schemas[schemaName];
    if (!schema) {
      throw new Error(`Schema '${schemaName}' not found`);
    }
    
    const { error, value } = schema.validate(data, {
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
      
      throw new ValidationError('Validation failed', details);
    }
    
    return value;
  },

  /**
   * Express middleware to handle validation errors
   */
  handleValidationErrors: (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const details = errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value,
        location: error.location,
      }));
      
      return res.status(400).json({
        success: false,
        error: {
          type: 'ValidationError',
          message: 'Request validation failed',
          details,
        },
      });
    }
    
    next();
  },

  /**
   * Sanitize string input
   */
  sanitizeString: (input, options = {}) => {
    if (typeof input !== 'string') {
      return input;
    }
    
    let sanitized = input;
    
    // Remove HTML tags if specified
    if (options.removeHtml !== false) {
      sanitized = DOMPurify.sanitize(sanitized, { ALLOWED_TAGS: [] });
    }
    
    // Trim whitespace
    if (options.trim !== false) {
      sanitized = sanitized.trim();
    }
    
    // Limit length
    if (options.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength);
    }
    
    return sanitized;
  },

  /**
   * Sanitize code input
   */
  sanitizeCode: (code, options = {}) => {
    if (typeof code !== 'string') {
      return code;
    }
    
    let sanitized = code;
    
    // Remove potentially dangerous patterns
    const dangerousPatterns = [
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /setTimeout\s*\(/gi,
      /setInterval\s*\(/gi,
      /process\s*\./gi,
      /require\s*\(/gi,
      /import\s*\(/gi,
      /__dirname/gi,
      /__filename/gi,
    ];
    
    if (options.removeDangerous !== false) {
      for (const pattern of dangerousPatterns) {
        sanitized = sanitized.replace(pattern, '/* REMOVED */');
      }
    }
    
    // Limit length
    if (options.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength);
    }
    
    return sanitized;
  },

  /**
   * Sanitize object recursively
   */
  sanitizeObject: (obj, options = {}) => {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => utils.sanitizeObject(item, options));
    }
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key
      const sanitizedKey = utils.sanitizeString(key, { maxLength: 100 });
      
      // Sanitize value based on type
      if (typeof value === 'string') {
        sanitized[sanitizedKey] = utils.sanitizeString(value, options);
      } else if (typeof value === 'object') {
        sanitized[sanitizedKey] = utils.sanitizeObject(value, options);
      } else {
        sanitized[sanitizedKey] = value;
      }
    }
    
    return sanitized;
  },

  /**
   * Validate database connection string
   */
  validateConnectionString: (connectionString, databaseType) => {
    const patterns = {
      mongodb: /^mongodb(?:\+srv)?:\/\/(?:[^:]+:[^@]+@)?[^/]+(?:\/[^?]+)?(?:\?.*)?$/,
      postgresql: /^postgres(?:ql)?:\/\/(?:[^:]+:[^@]+@)?[^/]+(?:\/[^?]+)?(?:\?.*)?$/,
      mysql: /^mysql:\/\/(?:[^:]+:[^@]+@)?[^/]+(?:\/[^?]+)?(?:\?.*)?$/,
      sqlite: /^sqlite:\/\/.*\.db$/,
    };
    
    const pattern = patterns[databaseType.toLowerCase()];
    if (!pattern) {
      throw new Error(`Unsupported database type: ${databaseType}`);
    }
    
    if (!pattern.test(connectionString)) {
      throw new Error(`Invalid ${databaseType} connection string format`);
    }
    
    return true;
  },

  /**
   * Validate environment variables
   */
  validateEnvironment: (envVars) => {
    const required = [
      'NODE_ENV',
      'PORT',
      'OPENAI_API_KEY',
    ];
    
    const missing = required.filter(key => !envVars[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    // Validate specific formats
    if (envVars.PORT && (isNaN(envVars.PORT) || envVars.PORT < 1 || envVars.PORT > 65535)) {
      throw new Error('PORT must be a valid port number (1-65535)');
    }
    
    if (envVars.NODE_ENV && !['development', 'production', 'test'].includes(envVars.NODE_ENV)) {
      throw new Error('NODE_ENV must be one of: development, production, test');
    }
    
    return true;
  },

  /**
   * Validate API path
   */
  validateApiPath: (path) => {
    const pathRegex = /^\/(api\/)?[a-zA-Z0-9\-_\/]*[a-zA-Z0-9\-_]$/;
    
    if (!pathRegex.test(path)) {
      throw new Error('Invalid API path format');
    }
    
    if (path.length > 200) {
      throw new Error('API path too long (max 200 characters)');
    }
    
    return true;
  },
};

// Custom error class for validation errors
class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
    this.statusCode = 400;
  }
}

module.exports = {
  schemas,
  validators,
  utils,
  ValidationError,
};