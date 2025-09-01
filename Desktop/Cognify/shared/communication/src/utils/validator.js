import Joi from 'joi';
import EventEmitter from 'eventemitter3';

/**
 * Data validator for microservices
 */
class DataValidator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      serviceName: process.env.SERVICE_NAME || 'unknown-service',
      enableCaching: process.env.VALIDATOR_CACHE !== 'false',
      enableMetrics: process.env.VALIDATOR_METRICS !== 'false',
      enableEvents: process.env.VALIDATOR_EVENTS !== 'false',
      cacheSize: parseInt(process.env.VALIDATOR_CACHE_SIZE) || 1000,
      enableStrictMode: process.env.VALIDATOR_STRICT === 'true',
      enableCoercion: process.env.VALIDATOR_COERCION !== 'false',
      enableUnknownKeys: process.env.VALIDATOR_UNKNOWN_KEYS === 'true',
      enablePresence: process.env.VALIDATOR_PRESENCE !== 'false',
      ...options
    };

    this.logger = options.logger;
    
    // Schema storage
    this.schemas = new Map();
    this.compiledSchemas = new Map();
    
    // Validation cache
    this.validationCache = new Map();
    
    // Statistics
    this.stats = {
      validations: 0,
      successes: 0,
      failures: 0,
      cacheHits: 0,
      cacheMisses: 0,
      schemasRegistered: 0,
      errors: 0
    };

    // Initialize common schemas
    this._initializeCommonSchemas();
  }

  /**
   * Initialize common validation schemas
   */
  _initializeCommonSchemas() {
    // HTTP request schemas
    this.registerSchema('http.request', {
      method: Joi.string().valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS').required(),
      url: Joi.string().uri().required(),
      headers: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
      query: Joi.object().optional(),
      body: Joi.any().optional(),
      timeout: Joi.number().positive().optional()
    });

    // HTTP response schemas
    this.registerSchema('http.response', {
      statusCode: Joi.number().integer().min(100).max(599).required(),
      headers: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
      body: Joi.any().optional(),
      duration: Joi.number().positive().optional()
    });

    // Service discovery schemas
    this.registerSchema('service.registration', {
      serviceName: Joi.string().required(),
      version: Joi.string().required(),
      host: Joi.string().hostname().required(),
      port: Joi.number().port().required(),
      protocol: Joi.string().valid('http', 'https', 'tcp', 'udp').default('http'),
      tags: Joi.array().items(Joi.string()).optional(),
      metadata: Joi.object().optional(),
      healthCheckPath: Joi.string().optional()
    });

    // Event schemas
    this.registerSchema('event.emission', {
      eventName: Joi.string().required(),
      payload: Joi.any().optional(),
      metadata: Joi.object().optional(),
      distributed: Joi.boolean().default(false),
      persistent: Joi.boolean().default(false)
    });

    // Message queue schemas
    this.registerSchema('message.enqueue', {
      queueName: Joi.string().required(),
      payload: Joi.any().required(),
      priority: Joi.number().integer().min(0).max(10).default(5),
      delay: Joi.number().integer().min(0).optional(),
      attempts: Joi.number().integer().min(1).max(10).default(3),
      timeout: Joi.number().positive().optional()
    });

    // Configuration schemas
    this.registerSchema('config.value', {
      key: Joi.string().required(),
      value: Joi.any().required(),
      type: Joi.string().valid('string', 'number', 'boolean', 'object', 'array').optional(),
      required: Joi.boolean().default(false),
      sensitive: Joi.boolean().default(false)
    });

    // User/Authentication schemas
    this.registerSchema('auth.credentials', {
      username: Joi.string().alphanum().min(3).max(30).optional(),
      email: Joi.string().email().optional(),
      password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])')).optional(),
      apiKey: Joi.string().optional(),
      token: Joi.string().optional()
    }).or('username', 'email', 'apiKey', 'token');

    // Database operation schemas
    this.registerSchema('db.operation', {
      type: Joi.string().valid('mongodb', 'mysql', 'postgresql', 'redis').required(),
      operation: Joi.string().valid('find', 'insert', 'update', 'delete', 'aggregate').required(),
      collection: Joi.string().required(),
      query: Joi.object().optional(),
      data: Joi.any().optional(),
      options: Joi.object().optional()
    });

    // Pagination schemas
    this.registerSchema('pagination', {
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(1000).default(20),
      sort: Joi.string().optional(),
      order: Joi.string().valid('asc', 'desc').default('asc')
    });

    // File upload schemas
    this.registerSchema('file.upload', {
      filename: Joi.string().required(),
      mimetype: Joi.string().required(),
      size: Joi.number().positive().max(100 * 1024 * 1024).required(), // 100MB max
      encoding: Joi.string().optional(),
      fieldname: Joi.string().optional()
    });

    if (this.logger) {
      this.logger.debug('Common validation schemas initialized', {
        schemas: this.schemas.size,
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Register a validation schema
   * @param {string} name - Schema name
   * @param {Object} schema - Joi schema or plain object
   * @param {Object} options - Schema options
   */
  registerSchema(name, schema, options = {}) {
    try {
      let joiSchema;
      
      if (schema.isJoi) {
        joiSchema = schema;
      } else if (typeof schema === 'object') {
        joiSchema = Joi.object(schema);
      } else {
        throw new Error('Schema must be a Joi schema or plain object');
      }
      
      // Apply global options
      if (this.options.enableStrictMode) {
        joiSchema = joiSchema.strict();
      }
      
      if (!this.options.enableUnknownKeys) {
        joiSchema = joiSchema.unknown(false);
      }
      
      if (this.options.enablePresence) {
        joiSchema = joiSchema.required();
      }
      
      // Apply schema-specific options
      if (options.strict) {
        joiSchema = joiSchema.strict();
      }
      
      if (options.unknown !== undefined) {
        joiSchema = joiSchema.unknown(options.unknown);
      }
      
      this.schemas.set(name, {
        schema: joiSchema,
        options,
        createdAt: Date.now()
      });
      
      // Compile schema for better performance
      this.compiledSchemas.set(name, joiSchema.compile());
      
      this.stats.schemasRegistered++;
      
      if (this.logger) {
        this.logger.debug('Validation schema registered', {
          name,
          options,
          serviceName: this.options.serviceName
        });
      }
      
      if (this.options.enableEvents) {
        this.emit('schemaRegistered', { name, schema: joiSchema, options });
      }
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Failed to register validation schema', {
          name,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Validate data against a schema
   * @param {string} schemaName - Schema name
   * @param {any} data - Data to validate
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  validate(schemaName, data, options = {}) {
    try {
      this.stats.validations++;
      
      // Check cache first
      const cacheKey = this._getCacheKey(schemaName, data, options);
      if (this.options.enableCaching && this.validationCache.has(cacheKey)) {
        this.stats.cacheHits++;
        
        const cachedResult = this.validationCache.get(cacheKey);
        
        if (this.logger) {
          this.logger.debug('Validation cache hit', {
            schemaName,
            cacheKey,
            serviceName: this.options.serviceName
          });
        }
        
        return cachedResult;
      }
      
      this.stats.cacheMisses++;
      
      // Get schema
      const schemaInfo = this.schemas.get(schemaName);
      if (!schemaInfo) {
        throw new Error(`Schema '${schemaName}' not found`);
      }
      
      // Prepare validation options
      const validationOptions = {
        abortEarly: false,
        allowUnknown: this.options.enableUnknownKeys,
        convert: this.options.enableCoercion,
        presence: this.options.enablePresence ? 'required' : 'optional',
        ...options
      };
      
      // Perform validation
      const result = schemaInfo.schema.validate(data, validationOptions);
      
      const validationResult = {
        valid: !result.error,
        value: result.value,
        error: result.error ? this._formatError(result.error) : null,
        warnings: result.warning ? this._formatWarning(result.warning) : null,
        timestamp: Date.now()
      };
      
      // Cache result
      if (this.options.enableCaching) {
        this._cacheResult(cacheKey, validationResult);
      }
      
      // Update statistics
      if (validationResult.valid) {
        this.stats.successes++;
      } else {
        this.stats.failures++;
      }
      
      // Emit events
      if (this.options.enableEvents) {
        this.emit('validation', {
          schemaName,
          data,
          result: validationResult,
          options
        });
        
        if (validationResult.valid) {
          this.emit('validationSuccess', { schemaName, data, result: validationResult });
        } else {
          this.emit('validationFailure', { schemaName, data, result: validationResult });
        }
      }
      
      if (this.logger) {
        this.logger.debug('Data validation completed', {
          schemaName,
          valid: validationResult.valid,
          errors: validationResult.error ? validationResult.error.details.length : 0,
          serviceName: this.options.serviceName
        });
      }
      
      return validationResult;
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Validation error', {
          schemaName,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      return {
        valid: false,
        value: null,
        error: {
          message: error.message,
          details: [{
            message: error.message,
            path: [],
            type: 'validation.error'
          }]
        },
        warnings: null,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Validate and throw on error
   * @param {string} schemaName - Schema name
   * @param {any} data - Data to validate
   * @param {Object} options - Validation options
   * @returns {any} Validated data
   * @throws {Error} Validation error
   */
  validateAndThrow(schemaName, data, options = {}) {
    const result = this.validate(schemaName, data, options);
    
    if (!result.valid) {
      const error = new Error(`Validation failed for schema '${schemaName}'`);
      error.validationResult = result;
      error.details = result.error.details;
      throw error;
    }
    
    return result.value;
  }

  /**
   * Validate multiple data items
   * @param {Array} items - Array of {schemaName, data, options} objects
   * @returns {Array} Array of validation results
   */
  validateMany(items) {
    return items.map(item => {
      const { schemaName, data, options = {} } = item;
      return {
        ...item,
        result: this.validate(schemaName, data, options)
      };
    });
  }

  /**
   * Create a validation middleware for Express
   * @param {string} schemaName - Schema name
   * @param {string} source - Data source ('body', 'query', 'params', 'headers')
   * @param {Object} options - Validation options
   * @returns {Function} Express middleware
   */
  middleware(schemaName, source = 'body', options = {}) {
    return (req, res, next) => {
      try {
        const data = req[source];
        const result = this.validate(schemaName, data, options);
        
        if (!result.valid) {
          return res.status(400).json({
            error: 'Validation failed',
            details: result.error.details,
            timestamp: result.timestamp
          });
        }
        
        // Replace request data with validated/coerced data
        req[source] = result.value;
        
        // Add validation result to request
        req.validationResult = result;
        
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Create a validation decorator for methods
   * @param {string} schemaName - Schema name
   * @param {string} paramIndex - Parameter index to validate (default: 0)
   * @param {Object} options - Validation options
   * @returns {Function} Method decorator
   */
  decorator(schemaName, paramIndex = 0, options = {}) {
    return (target, propertyKey, descriptor) => {
      const originalMethod = descriptor.value;
      
      descriptor.value = function(...args) {
        const dataToValidate = args[paramIndex];
        const result = this.validate(schemaName, dataToValidate, options);
        
        if (!result.valid) {
          const error = new Error(`Validation failed for ${propertyKey}`);
          error.validationResult = result;
          throw error;
        }
        
        // Replace argument with validated data
        args[paramIndex] = result.value;
        
        return originalMethod.apply(this, args);
      };
      
      return descriptor;
    };
  }

  /**
   * Get schema information
   * @param {string} name - Schema name
   * @returns {Object} Schema information
   */
  getSchema(name) {
    return this.schemas.get(name);
  }

  /**
   * Check if schema exists
   * @param {string} name - Schema name
   * @returns {boolean} Schema exists
   */
  hasSchema(name) {
    return this.schemas.has(name);
  }

  /**
   * Remove a schema
   * @param {string} name - Schema name
   * @returns {boolean} Removal success
   */
  removeSchema(name) {
    const removed = this.schemas.delete(name);
    this.compiledSchemas.delete(name);
    
    if (removed && this.logger) {
      this.logger.debug('Validation schema removed', {
        name,
        serviceName: this.options.serviceName
      });
    }
    
    return removed;
  }

  /**
   * Get all schema names
   * @returns {Array<string>} Schema names
   */
  getSchemaNames() {
    return Array.from(this.schemas.keys());
  }

  /**
   * Generate cache key for validation result
   * @param {string} schemaName - Schema name
   * @param {any} data - Data to validate
   * @param {Object} options - Validation options
   * @returns {string} Cache key
   */
  _getCacheKey(schemaName, data, options) {
    const dataHash = this._hashData(data);
    const optionsHash = this._hashData(options);
    return `${schemaName}:${dataHash}:${optionsHash}`;
  }

  /**
   * Simple hash function for data
   * @param {any} data - Data to hash
   * @returns {string} Hash string
   */
  _hashData(data) {
    try {
      const str = JSON.stringify(data);
      let hash = 0;
      
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      
      return hash.toString(36);
    } catch {
      return 'invalid';
    }
  }

  /**
   * Cache validation result
   * @param {string} cacheKey - Cache key
   * @param {Object} result - Validation result
   */
  _cacheResult(cacheKey, result) {
    // Implement LRU cache behavior
    if (this.validationCache.size >= this.options.cacheSize) {
      const firstKey = this.validationCache.keys().next().value;
      this.validationCache.delete(firstKey);
    }
    
    this.validationCache.set(cacheKey, result);
  }

  /**
   * Format Joi validation error
   * @param {Object} error - Joi error object
   * @returns {Object} Formatted error
   */
  _formatError(error) {
    return {
      message: error.message,
      details: error.details.map(detail => ({
        message: detail.message,
        path: detail.path,
        type: detail.type,
        context: detail.context
      }))
    };
  }

  /**
   * Format Joi validation warning
   * @param {Object} warning - Joi warning object
   * @returns {Object} Formatted warning
   */
  _formatWarning(warning) {
    return {
      message: warning.message,
      details: warning.details.map(detail => ({
        message: detail.message,
        path: detail.path,
        type: detail.type
      }))
    };
  }

  /**
   * Clear validation cache
   */
  clearCache() {
    this.validationCache.clear();
    
    if (this.logger) {
      this.logger.debug('Validation cache cleared', {
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Get validation statistics
   * @returns {Object} Validation statistics
   */
  getStats() {
    return {
      ...this.stats,
      schemas: this.schemas.size,
      cacheSize: this.validationCache.size,
      successRate: this.stats.validations > 0 ? this.stats.successes / this.stats.validations : 0,
      cacheHitRate: (this.stats.cacheHits + this.stats.cacheMisses) > 0 ? 
                    this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      validations: 0,
      successes: 0,
      failures: 0,
      cacheHits: 0,
      cacheMisses: 0,
      schemasRegistered: this.stats.schemasRegistered,
      errors: 0
    };
    
    if (this.logger) {
      this.logger.debug('Validation statistics reset', {
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Close validator and cleanup resources
   */
  close() {
    this.schemas.clear();
    this.compiledSchemas.clear();
    this.validationCache.clear();
    this.removeAllListeners();

    if (this.logger) {
      this.logger.info('Data validator closed', {
        serviceName: this.options.serviceName
      });
    }
  }
}

/**
 * Create a validator instance
 * @param {Object} options - Configuration options
 * @returns {DataValidator} Validator instance
 */
export function createValidator(options = {}) {
  return new DataValidator(options);
}

/**
 * Default validator instance
 */
export const defaultValidator = createValidator();

// Export Joi for custom schema creation
export { Joi };

export default {
  DataValidator,
  createValidator,
  defaultValidator,
  Joi
};