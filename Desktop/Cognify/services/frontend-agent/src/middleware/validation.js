const { body, param, query, validationResult } = require('express-validator');
const { logger } = require('../config/logger');
const { tracer } = require('../config/telemetry');

/**
 * Validation middleware for the Frontend AI Agent service
 */
class ValidationMiddleware {
  /**
   * Handle validation errors
   */
  static handleValidationErrors = (req, res, next) => {
    const span = tracer.startSpan('validation.handleErrors');
    
    try {
      const errors = validationResult(req);
      
      if (!errors.isEmpty()) {
        const errorDetails = errors.array().map(error => ({
          field: error.path || error.param,
          message: error.msg,
          value: error.value
        }));

        logger.warn('Validation failed', {
          errors: errorDetails,
          path: req.path,
          method: req.method,
          ip: req.ip
        });

        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errorDetails
        });
      }
      
      next();
    } catch (error) {
      logger.error('Validation error handler failed', {
        error: error.message
      });
      
      return res.status(500).json({
        success: false,
        error: 'Validation processing failed'
      });
    } finally {
      span.end();
    }
  };

  /**
   * Validate task creation request
   */
  static validateTaskCreation = [
    body('type')
      .isIn(['component_generation', 'code_review', 'optimization', 'styling', 'testing', 'refactoring'])
      .withMessage('Invalid task type'),
    body('description')
      .isString()
      .isLength({ min: 10, max: 1000 })
      .withMessage('Description must be between 10 and 1000 characters'),
    body('framework')
      .optional()
      .isIn(['react', 'vue', 'angular', 'svelte', 'vanilla'])
      .withMessage('Invalid framework'),
    body('language')
      .optional()
      .isIn(['javascript', 'typescript', 'jsx', 'tsx'])
      .withMessage('Invalid language'),
    body('styling')
      .optional()
      .isIn(['css', 'scss', 'sass', 'less', 'tailwind', 'styled-components', 'emotion', 'chakra-ui', 'material-ui'])
      .withMessage('Invalid styling option'),
    body('requirements')
      .optional()
      .isArray()
      .withMessage('Requirements must be an array'),
    body('requirements.*')
      .optional()
      .isString()
      .isLength({ min: 1, max: 200 })
      .withMessage('Each requirement must be between 1 and 200 characters'),
    body('constraints')
      .optional()
      .isArray()
      .withMessage('Constraints must be an array'),
    body('constraints.*')
      .optional()
      .isString()
      .isLength({ min: 1, max: 200 })
      .withMessage('Each constraint must be between 1 and 200 characters'),
    body('context')
      .optional()
      .isObject()
      .withMessage('Context must be an object'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Invalid priority level'),
    ValidationMiddleware.handleValidationErrors
  ];

  /**
   * Validate task ID parameter
   */
  static validateTaskId = [
    param('taskId')
      .isUUID()
      .withMessage('Invalid task ID format'),
    ValidationMiddleware.handleValidationErrors
  ];

  /**
   * Validate task progress update
   */
  static validateTaskProgressUpdate = [
    param('taskId')
      .isUUID()
      .withMessage('Invalid task ID format'),
    body('progress')
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage('Progress must be between 0 and 100'),
    body('status')
      .optional()
      .isIn(['pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled'])
      .withMessage('Invalid status'),
    body('result')
      .optional()
      .isObject()
      .withMessage('Result must be an object'),
    body('error')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('Error message must be less than 500 characters'),
    ValidationMiddleware.handleValidationErrors
  ];

  /**
   * Validate component generation request
   */
  static validateComponentGeneration = [
    body('componentName')
      .isString()
      .matches(/^[A-Z][a-zA-Z0-9]*$/)
      .withMessage('Component name must be PascalCase'),
    body('componentType')
      .isIn(['functional', 'class', 'hook'])
      .withMessage('Invalid component type'),
    body('props')
      .optional()
      .isArray()
      .withMessage('Props must be an array'),
    body('props.*.name')
      .optional()
      .isString()
      .matches(/^[a-zA-Z][a-zA-Z0-9]*$/)
      .withMessage('Prop name must be camelCase'),
    body('props.*.type')
      .optional()
      .isString()
      .withMessage('Prop type must be a string'),
    body('props.*.required')
      .optional()
      .isBoolean()
      .withMessage('Prop required must be boolean'),
    body('styling')
      .optional()
      .isObject()
      .withMessage('Styling must be an object'),
    body('features')
      .optional()
      .isArray()
      .withMessage('Features must be an array'),
    ValidationMiddleware.handleValidationErrors
  ];

  /**
   * Validate code optimization request
   */
  static validateCodeOptimization = [
    body('code')
      .isString()
      .isLength({ min: 10, max: 10000 })
      .withMessage('Code must be between 10 and 10000 characters'),
    body('optimizationType')
      .isIn(['performance', 'bundle_size', 'readability', 'accessibility', 'seo'])
      .withMessage('Invalid optimization type'),
    body('targetMetrics')
      .optional()
      .isObject()
      .withMessage('Target metrics must be an object'),
    body('preserveFormatting')
      .optional()
      .isBoolean()
      .withMessage('Preserve formatting must be boolean'),
    ValidationMiddleware.handleValidationErrors
  ];

  /**
   * Validate query parameters for task listing
   */
  static validateTaskQuery = [
    query('status')
      .optional()
      .isIn(['pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled'])
      .withMessage('Invalid status filter'),
    query('type')
      .optional()
      .isIn(['component_generation', 'code_review', 'optimization', 'styling', 'testing', 'refactoring'])
      .withMessage('Invalid type filter'),
    query('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Invalid priority filter'),
    query('framework')
      .optional()
      .isIn(['react', 'vue', 'angular', 'svelte', 'vanilla'])
      .withMessage('Invalid framework filter'),
    query('language')
      .optional()
      .isIn(['javascript', 'typescript', 'jsx', 'tsx'])
      .withMessage('Invalid language filter'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Offset must be non-negative'),
    ValidationMiddleware.handleValidationErrors
  ];

  /**
   * Validate agent capabilities update
   */
  static validateCapabilitiesUpdate = [
    body('capabilities')
      .isObject()
      .withMessage('Capabilities must be an object'),
    body('capabilities.frameworks')
      .optional()
      .isArray()
      .withMessage('Frameworks must be an array'),
    body('capabilities.frameworks.*')
      .optional()
      .isIn(['react', 'vue', 'angular', 'svelte', 'vanilla'])
      .withMessage('Invalid framework in capabilities'),
    body('capabilities.languages')
      .optional()
      .isArray()
      .withMessage('Languages must be an array'),
    body('capabilities.languages.*')
      .optional()
      .isIn(['javascript', 'typescript', 'jsx', 'tsx'])
      .withMessage('Invalid language in capabilities'),
    body('capabilities.styling')
      .optional()
      .isArray()
      .withMessage('Styling options must be an array'),
    body('capabilities.tools')
      .optional()
      .isArray()
      .withMessage('Tools must be an array'),
    ValidationMiddleware.handleValidationErrors
  ];

  /**
   * Validate maintenance mode request
   */
  static validateMaintenanceMode = [
    body('enabled')
      .isBoolean()
      .withMessage('Enabled must be boolean'),
    ValidationMiddleware.handleValidationErrors
  ];

  /**
   * Sanitize input data
   */
  static sanitizeInput = (req, res, next) => {
    const span = tracer.startSpan('validation.sanitizeInput');
    
    try {
      // Recursively sanitize object properties
      const sanitizeObject = (obj) => {
        if (typeof obj !== 'object' || obj === null) {
          return obj;
        }
        
        if (Array.isArray(obj)) {
          return obj.map(sanitizeObject);
        }
        
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'string') {
            // Basic XSS prevention
            sanitized[key] = value
              .replace(/<script[^>]*>.*?<\/script>/gi, '')
              .replace(/<[^>]*>/g, '')
              .trim();
          } else {
            sanitized[key] = sanitizeObject(value);
          }
        }
        return sanitized;
      };

      // Sanitize request body
      if (req.body) {
        req.body = sanitizeObject(req.body);
      }

      // Sanitize query parameters
      if (req.query) {
        req.query = sanitizeObject(req.query);
      }

      next();
    } catch (error) {
      logger.error('Input sanitization failed', {
        error: error.message
      });
      
      return res.status(500).json({
        success: false,
        error: 'Input processing failed'
      });
    } finally {
      span.end();
    }
  };
}

module.exports = { ValidationMiddleware };