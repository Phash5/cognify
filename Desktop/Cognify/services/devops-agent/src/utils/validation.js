/**
 * Validation Utility for DevOps AI Agent
 * Provides input validation and sanitization for DevOps operations
 */

'use strict';

const Joi = require('joi');
const { body, param, query, validationResult } = require('express-validator');
const validator = require('validator');
const config = require('../config/config');
const logger = require('./logger');

// Joi schemas for DevOps operations
const schemas = {
  // Deployment generation schema
  deploymentGeneration: Joi.object({
    requirements: Joi.string()
      .min(10)
      .max(10000)
      .required()
      .description('Deployment requirements description'),
    
    options: Joi.object({
      platform: Joi.string()
        .valid(...config.devops.deployment.supportedPlatforms)
        .default('kubernetes')
        .description('Target deployment platform'),
      
      environment: Joi.string()
        .valid('development', 'staging', 'production')
        .default('production')
        .description('Target environment'),
      
      enableRollback: Joi.boolean()
        .default(true)
        .description('Enable rollback strategy'),
      
      replicas: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(3)
        .description('Number of replicas'),
      
      resources: Joi.object({
        cpu: Joi.string()
          .pattern(/^\d+m?$/)
          .default('500m')
          .description('CPU resource limit'),
        
        memory: Joi.string()
          .pattern(/^\d+(Mi|Gi)$/)
          .default('512Mi')
          .description('Memory resource limit'),
      }).default({}),
      
      healthCheck: Joi.object({
        enabled: Joi.boolean().default(true),
        path: Joi.string().default('/health'),
        port: Joi.number().integer().min(1).max(65535).default(8080),
        initialDelaySeconds: Joi.number().integer().min(0).default(30),
        periodSeconds: Joi.number().integer().min(1).default(10),
      }).default({}),
    }).default({}),
  }),

  // Infrastructure generation schema
  infrastructureGeneration: Joi.object({
    requirements: Joi.string()
      .min(10)
      .max(10000)
      .required()
      .description('Infrastructure requirements description'),
    
    options: Joi.object({
      provider: Joi.string()
        .valid(...config.devops.infrastructure.supportedProviders)
        .default('aws')
        .description('Cloud provider'),
      
      tool: Joi.string()
        .valid(...config.devops.infrastructure.supportedTools)
        .default('terraform')
        .description('Infrastructure as Code tool'),
      
      region: Joi.string()
        .min(2)
        .max(50)
        .default('us-east-1')
        .description('Target region'),
      
      enableValidation: Joi.boolean()
        .default(true)
        .description('Enable validation rules'),
      
      enableMonitoring: Joi.boolean()
        .default(true)
        .description('Enable monitoring setup'),
      
      tags: Joi.object()
        .pattern(Joi.string(), Joi.string())
        .default({})
        .description('Resource tags'),
    }).default({}),
  }),

  // Monitoring setup schema
  monitoringSetup: Joi.object({
    requirements: Joi.string()
      .min(10)
      .max(10000)
      .required()
      .description('Monitoring requirements description'),
    
    options: Joi.object({
      platform: Joi.string()
        .valid(...config.devops.monitoring.supportedPlatforms)
        .default('prometheus')
        .description('Monitoring platform'),
      
      alerting: Joi.string()
        .valid(...config.devops.monitoring.supportedAlerting)
        .default('alertmanager')
        .description('Alerting system'),
      
      enableAlerts: Joi.boolean()
        .default(true)
        .description('Enable alert rules'),
      
      enableDashboards: Joi.boolean()
        .default(true)
        .description('Enable dashboard generation'),
      
      retentionPeriod: Joi.string()
        .pattern(/^\d+[hdwmy]$/)
        .default('30d')
        .description('Data retention period'),
      
      scrapeInterval: Joi.string()
        .pattern(/^\d+[sm]$/)
        .default('15s')
        .description('Metrics scrape interval'),
    }).default({}),
  }),

  // Configuration management schema
  configurationGeneration: Joi.object({
    requirements: Joi.string()
      .min(10)
      .max(10000)
      .required()
      .description('Configuration requirements description'),
    
    options: Joi.object({
      tool: Joi.string()
        .valid(...config.devops.configuration.supportedTools)
        .default('ansible')
        .description('Configuration management tool'),
      
      environment: Joi.string()
        .valid('development', 'staging', 'production')
        .default('production')
        .description('Target environment'),
      
      enableVersioning: Joi.boolean()
        .default(true)
        .description('Enable version control'),
      
      enableValidation: Joi.boolean()
        .default(true)
        .description('Enable configuration validation'),
      
      enableRollback: Joi.boolean()
        .default(true)
        .description('Enable rollback procedures'),
    }).default({}),
  }),
};

// Express-validator middleware
const validators = {
  // Task ID validation
  taskId: [
    param('taskId')
      .isUUID(4)
      .withMessage('Task ID must be a valid UUID'),
  ],

  // Pagination validation
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Page must be a positive integer between 1 and 1000')
      .toInt(),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be a positive integer between 1 and 100')
      .toInt(),
    
    query('sortBy')
      .optional()
      .isIn(['createdAt', 'updatedAt', 'status', 'type', 'priority'])
      .withMessage('SortBy must be one of: createdAt, updatedAt, status, type, priority'),
    
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('SortOrder must be either asc or desc'),
  ],

  // Task filtering validation
  taskFilter: [
    query('status')
      .optional()
      .isIn(['pending', 'processing', 'completed', 'failed', 'cancelled'])
      .withMessage('Status must be one of: pending, processing, completed, failed, cancelled'),
    
    query('type')
      .optional()
      .isIn(['deployment', 'infrastructure', 'monitoring', 'configuration'])
      .withMessage('Type must be one of: deployment, infrastructure, monitoring, configuration'),
    
    query('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Priority must be one of: low, medium, high, urgent'),
    
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date'),
    
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date'),
  ],

  // Deployment generation validation
  deploymentGeneration: [
    body('requirements')
      .isString()
      .isLength({ min: 10, max: 10000 })
      .withMessage('Requirements must be a string between 10 and 10000 characters')
      .customSanitizer(sanitizeString),
    
    body('options.platform')
      .optional()
      .isIn(config.devops.deployment.supportedPlatforms)
      .withMessage(`Platform must be one of: ${config.devops.deployment.supportedPlatforms.join(', ')}`),
    
    body('options.environment')
      .optional()
      .isIn(['development', 'staging', 'production'])
      .withMessage('Environment must be one of: development, staging, production'),
    
    body('options.enableRollback')
      .optional()
      .isBoolean()
      .withMessage('EnableRollback must be a boolean')
      .toBoolean(),
    
    body('options.replicas')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Replicas must be an integer between 1 and 100')
      .toInt(),
  ],

  // Infrastructure generation validation
  infrastructureGeneration: [
    body('requirements')
      .isString()
      .isLength({ min: 10, max: 10000 })
      .withMessage('Requirements must be a string between 10 and 10000 characters')
      .customSanitizer(sanitizeString),
    
    body('options.provider')
      .optional()
      .isIn(config.devops.infrastructure.supportedProviders)
      .withMessage(`Provider must be one of: ${config.devops.infrastructure.supportedProviders.join(', ')}`),
    
    body('options.tool')
      .optional()
      .isIn(config.devops.infrastructure.supportedTools)
      .withMessage(`Tool must be one of: ${config.devops.infrastructure.supportedTools.join(', ')}`),
    
    body('options.region')
      .optional()
      .isString()
      .isLength({ min: 2, max: 50 })
      .withMessage('Region must be a string between 2 and 50 characters')
      .customSanitizer(sanitizeString),
  ],

  // Monitoring setup validation
  monitoringSetup: [
    body('requirements')
      .isString()
      .isLength({ min: 10, max: 10000 })
      .withMessage('Requirements must be a string between 10 and 10000 characters')
      .customSanitizer(sanitizeString),
    
    body('options.platform')
      .optional()
      .isIn(config.devops.monitoring.supportedPlatforms)
      .withMessage(`Platform must be one of: ${config.devops.monitoring.supportedPlatforms.join(', ')}`),
    
    body('options.alerting')
      .optional()
      .isIn(config.devops.monitoring.supportedAlerting)
      .withMessage(`Alerting must be one of: ${config.devops.monitoring.supportedAlerting.join(', ')}`),
  ],

  // Configuration generation validation
  configurationGeneration: [
    body('requirements')
      .isString()
      .isLength({ min: 10, max: 10000 })
      .withMessage('Requirements must be a string between 10 and 10000 characters')
      .customSanitizer(sanitizeString),
    
    body('options.tool')
      .optional()
      .isIn(config.devops.configuration.supportedTools)
      .withMessage(`Tool must be one of: ${config.devops.configuration.supportedTools.join(', ')}`),
    
    body('options.environment')
      .optional()
      .isIn(['development', 'staging', 'production'])
      .withMessage('Environment must be one of: development, staging, production'),
  ],
};

// Utility functions

/**
 * Validate data against Joi schema
 */
function validateSchema(data, schemaName) {
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
    
    logger.logValidation('Schema validation failed', {
      schema: schemaName,
      errors: details,
    });
    
    const validationError = new Error('Validation failed');
    validationError.name = 'ValidationError';
    validationError.details = details;
    throw validationError;
  }
  
  return value;
}

/**
 * Handle express-validator errors
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const details = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value,
      location: error.location,
    }));
    
    logger.logValidation('Express validation failed', {
      url: req.url,
      method: req.method,
      errors: details,
    });
    
    return res.status(400).json({
      error: 'Validation failed',
      details,
      timestamp: new Date().toISOString(),
    });
  }
  
  next();
}

/**
 * Sanitize string input
 */
function sanitizeString(value) {
  if (typeof value !== 'string') {
    return value;
  }
  
  // Remove null bytes
  value = value.replace(/\0/g, '');
  
  // Trim whitespace
  value = value.trim();
  
  // Escape HTML entities
  value = validator.escape(value);
  
  return value;
}

/**
 * Sanitize code input (less aggressive than string sanitization)
 */
function sanitizeCode(value) {
  if (typeof value !== 'string') {
    return value;
  }
  
  // Remove null bytes
  value = value.replace(/\0/g, '');
  
  // Trim whitespace
  value = value.trim();
  
  // Don't escape HTML entities for code as it may contain valid syntax
  
  return value;
}

/**
 * Sanitize object recursively
 */
function sanitizeObject(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Validate platform configuration
 */
function validatePlatformConfig(platform, config) {
  const platformConfigs = {
    kubernetes: {
      requiredFields: ['namespace', 'image'],
      optionalFields: ['replicas', 'resources', 'service'],
    },
    docker: {
      requiredFields: ['image'],
      optionalFields: ['ports', 'volumes', 'environment'],
    },
    'docker-compose': {
      requiredFields: ['services'],
      optionalFields: ['networks', 'volumes'],
    },
  };
  
  const platformConfig = platformConfigs[platform];
  if (!platformConfig) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  
  // Check required fields
  for (const field of platformConfig.requiredFields) {
    if (!config[field]) {
      throw new Error(`Missing required field for ${platform}: ${field}`);
    }
  }
  
  return true;
}

/**
 * Validate environment variables
 */
function validateEnvironmentVariables(envVars) {
  if (!envVars || typeof envVars !== 'object') {
    return true;
  }
  
  const invalidKeys = [];
  const invalidValues = [];
  
  for (const [key, value] of Object.entries(envVars)) {
    // Validate key format
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      invalidKeys.push(key);
    }
    
    // Validate value (should not contain null bytes)
    if (typeof value === 'string' && value.includes('\0')) {
      invalidValues.push(key);
    }
  }
  
  if (invalidKeys.length > 0) {
    throw new Error(`Invalid environment variable keys: ${invalidKeys.join(', ')}`);
  }
  
  if (invalidValues.length > 0) {
    throw new Error(`Invalid environment variable values: ${invalidValues.join(', ')}`);
  }
  
  return true;
}

/**
 * Validate resource specifications
 */
function validateResourceSpecs(resources) {
  if (!resources || typeof resources !== 'object') {
    return true;
  }
  
  const { cpu, memory } = resources;
  
  // Validate CPU format
  if (cpu && !/^\d+m?$/.test(cpu)) {
    throw new Error('Invalid CPU format. Use format like "500m" or "2"');
  }
  
  // Validate memory format
  if (memory && !/^\d+(Mi|Gi|Ki)$/.test(memory)) {
    throw new Error('Invalid memory format. Use format like "512Mi" or "2Gi"');
  }
  
  return true;
}

/**
 * Validate API path
 */
function validateApiPath(path) {
  if (!path || typeof path !== 'string') {
    throw new Error('API path must be a non-empty string');
  }
  
  // Check for path traversal attempts
  if (path.includes('..') || path.includes('~')) {
    throw new Error('Invalid API path: path traversal detected');
  }
  
  // Check for valid HTTP path format
  if (!/^\/[a-zA-Z0-9\/_-]*$/.test(path)) {
    throw new Error('Invalid API path format');
  }
  
  return true;
}

module.exports = {
  schemas,
  validators,
  validateSchema,
  handleValidationErrors,
  sanitizeString,
  sanitizeCode,
  sanitizeObject,
  validatePlatformConfig,
  validateEnvironmentVariables,
  validateResourceSpecs,
  validateApiPath,
};