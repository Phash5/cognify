/**
 * Validation Service for Frontend AI Agent
 * Handles input validation and code validation
 */

'use strict';

const Joi = require('joi');
const validator = require('validator');
const sanitizeHtml = require('sanitize-html');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const telemetryService = require('./telemetryService');

class ValidationService {
  constructor() {
    this.schemas = this.initializeSchemas();
    this.codeValidators = this.initializeCodeValidators();
    this.sanitizeOptions = {
      allowedTags: [],
      allowedAttributes: {},
      disallowedTagsMode: 'discard',
    };
  }

  /**
   * Initialize Joi validation schemas
   */
  initializeSchemas() {
    return {
      componentOptions: Joi.object({
        name: Joi.string().pattern(/^[A-Z][a-zA-Z0-9]*$/).required()
          .messages({
            'string.pattern.base': 'Component name must be PascalCase and start with uppercase letter',
          }),
        type: Joi.string().valid('functional', 'class', 'hook', 'hoc', 'context', 'provider').default('functional'),
        framework: Joi.string().valid('react', 'vue', 'angular', 'svelte', 'next', 'nuxt').default('react'),
        props: Joi.array().items(
          Joi.object({
            name: Joi.string().pattern(/^[a-zA-Z][a-zA-Z0-9]*$/).required(),
            type: Joi.string().required(),
            required: Joi.boolean().default(false),
            description: Joi.string().optional(),
            defaultValue: Joi.any().optional(),
          })
        ).default([]),
        styling: Joi.string().valid('css', 'scss', 'sass', 'less', 'styled-components', 'emotion', 'tailwind').default('css'),
        features: Joi.array().items(Joi.string()).default([]),
        description: Joi.string().max(1000).optional(),
        accessibility: Joi.boolean().default(true),
        responsive: Joi.boolean().default(true),
        testable: Joi.boolean().default(true),
      }),

      hookOptions: Joi.object({
        name: Joi.string().pattern(/^use[A-Z][a-zA-Z0-9]*$/).required()
          .messages({
            'string.pattern.base': 'Hook name must start with "use" followed by PascalCase',
          }),
        type: Joi.string().valid('state', 'effect', 'context', 'reducer', 'callback', 'memo', 'ref', 'custom').default('custom'),
        parameters: Joi.array().items(
          Joi.object({
            name: Joi.string().pattern(/^[a-zA-Z][a-zA-Z0-9]*$/).required(),
            type: Joi.string().required(),
            required: Joi.boolean().default(false),
            description: Joi.string().optional(),
            defaultValue: Joi.any().optional(),
          })
        ).default([]),
        returnType: Joi.string().optional(),
        description: Joi.string().max(1000).optional(),
        dependencies: Joi.array().items(Joi.string()).default([]),
        async: Joi.boolean().default(false),
      }),

      styleOptions: Joi.object({
        type: Joi.string().valid('css', 'scss', 'sass', 'less', 'styled-components', 'emotion').default('css'),
        framework: Joi.string().valid('vanilla', 'bootstrap', 'tailwind', 'material-ui', 'ant-design', 'chakra-ui').default('vanilla'),
        selectors: Joi.array().items(Joi.string()).default([]),
        properties: Joi.array().items(Joi.string()).default([]),
        responsive: Joi.boolean().default(false),
        theme: Joi.object().optional(),
        description: Joi.string().max(1000).optional(),
        accessibility: Joi.boolean().default(true),
        darkMode: Joi.boolean().default(false),
      }),

      taskData: Joi.object({
        id: Joi.string().uuid().optional(),
        type: Joi.string().valid(
          'generate_component',
          'generate_hook',
          'generate_styles',
          'optimize_code',
          'review_code',
          'generate_tests',
          'refactor_code'
        ).required(),
        priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
        description: Joi.string().max(2000).required(),
        requirements: Joi.object().optional(),
        context: Joi.object().optional(),
        metadata: Joi.object().optional(),
        timeout: Joi.number().integer().min(1000).max(3600000).default(300000), // 5 minutes default
      }),

      codeInput: Joi.object({
        code: Joi.string().max(100000).required(), // 100KB max
        language: Joi.string().valid('javascript', 'typescript', 'jsx', 'tsx', 'css', 'scss', 'html').required(),
        framework: Joi.string().optional(),
        filePath: Joi.string().optional(),
        encoding: Joi.string().valid('utf8', 'ascii', 'base64').default('utf8'),
      }),

      userInput: Joi.object({
        userId: Joi.string().uuid().optional(),
        sessionId: Joi.string().uuid().optional(),
        input: Joi.string().max(10000).required(),
        type: Joi.string().valid('text', 'code', 'file').default('text'),
        metadata: Joi.object().optional(),
      }),
    };
  }

  /**
   * Initialize code validators
   */
  initializeCodeValidators() {
    return {
      javascript: {
        patterns: {
          // Security patterns to detect
          dangerous: [
            /eval\s*\(/,
            /Function\s*\(/,
            /setTimeout\s*\(\s*["']/,
            /setInterval\s*\(\s*["']/,
            /document\.write\s*\(/,
            /innerHTML\s*=/,
            /outerHTML\s*=/,
            /execScript\s*\(/,
            /javascript:/,
            /vbscript:/,
            /data:text\/html/,
          ],
          // Best practices
          recommended: [
            /console\.(log|warn|error|debug)/,
            /debugger/,
            /alert\s*\(/,
            /confirm\s*\(/,
            /prompt\s*\(/,
          ],
        },
        syntax: {
          // Basic syntax checks
          brackets: /[\{\}\[\]\(\)]/g,
          quotes: /["'`]/g,
          semicolons: /;/g,
        },
      },
      css: {
        patterns: {
          dangerous: [
            /javascript:/,
            /vbscript:/,
            /expression\s*\(/,
            /behavior\s*:/,
            /binding\s*:/,
            /@import\s+url\s*\(\s*["']?javascript:/,
          ],
          recommended: [
            /!important/,
            /position\s*:\s*fixed/,
            /z-index\s*:\s*\d{4,}/,
          ],
        },
      },
    };
  }

  /**
   * Validate component options
   */
  async validateComponentOptions(options) {
    const requestId = uuidv4();
    const requestLogger = logger.addRequestId(requestId);

    return telemetryService.withSpan('validation.component_options', async (span) => {
      try {
        span.setAttributes({
          'validation.type': 'component_options',
          'validation.component_name': options.name || 'unknown',
        });

        const { error, value } = this.schemas.componentOptions.validate(options, {
          abortEarly: false,
          stripUnknown: true,
        });

        const result = {
          isValid: !error,
          errors: error ? error.details.map(detail => detail.message) : [],
          warnings: [],
          sanitizedValue: value,
        };

        // Additional custom validations
        if (value) {
          // Check for reserved words
          const reservedWords = ['React', 'Component', 'Element', 'Fragment', 'useState', 'useEffect'];
          if (reservedWords.includes(value.name)) {
            result.warnings.push(`Component name "${value.name}" is a reserved word`);
          }

          // Validate prop names
          if (value.props) {
            const propNames = value.props.map(p => p.name);
            const duplicates = propNames.filter((name, index) => propNames.indexOf(name) !== index);
            if (duplicates.length > 0) {
              result.errors.push(`Duplicate prop names: ${duplicates.join(', ')}`);
              result.isValid = false;
            }
          }
        }

        requestLogger.validation('component_options', result.isValid, result.errors);
        telemetryService.recordError('validation_error', 'component_options');

        return result;
      } catch (error) {
        requestLogger.logError(error, { operation: 'validate_component_options' });
        throw error;
      }
    });
  }

  /**
   * Validate hook options
   */
  async validateHookOptions(options) {
    const requestId = uuidv4();
    const requestLogger = logger.addRequestId(requestId);

    return telemetryService.withSpan('validation.hook_options', async (span) => {
      try {
        span.setAttributes({
          'validation.type': 'hook_options',
          'validation.hook_name': options.name || 'unknown',
        });

        const { error, value } = this.schemas.hookOptions.validate(options, {
          abortEarly: false,
          stripUnknown: true,
        });

        const result = {
          isValid: !error,
          errors: error ? error.details.map(detail => detail.message) : [],
          warnings: [],
          sanitizedValue: value,
        };

        // Additional custom validations
        if (value) {
          // Check for React hooks rules
          if (value.name && !value.name.startsWith('use')) {
            result.errors.push('Hook name must start with "use"');
            result.isValid = false;
          }

          // Validate parameter names
          if (value.parameters) {
            const paramNames = value.parameters.map(p => p.name);
            const duplicates = paramNames.filter((name, index) => paramNames.indexOf(name) !== index);
            if (duplicates.length > 0) {
              result.errors.push(`Duplicate parameter names: ${duplicates.join(', ')}`);
              result.isValid = false;
            }
          }
        }

        requestLogger.validation('hook_options', result.isValid, result.errors);

        return result;
      } catch (error) {
        requestLogger.logError(error, { operation: 'validate_hook_options' });
        throw error;
      }
    });
  }

  /**
   * Validate style options
   */
  async validateStyleOptions(options) {
    const requestId = uuidv4();
    const requestLogger = logger.addRequestId(requestId);

    return telemetryService.withSpan('validation.style_options', async (span) => {
      try {
        span.setAttributes({
          'validation.type': 'style_options',
          'validation.style_type': options.type || 'unknown',
        });

        const { error, value } = this.schemas.styleOptions.validate(options, {
          abortEarly: false,
          stripUnknown: true,
        });

        const result = {
          isValid: !error,
          errors: error ? error.details.map(detail => detail.message) : [],
          warnings: [],
          sanitizedValue: value,
        };

        // Additional custom validations
        if (value) {
          // Validate CSS selectors
          if (value.selectors) {
            for (const selector of value.selectors) {
              if (!this.isValidCssSelector(selector)) {
                result.warnings.push(`Invalid CSS selector: ${selector}`);
              }
            }
          }
        }

        requestLogger.validation('style_options', result.isValid, result.errors);

        return result;
      } catch (error) {
        requestLogger.logError(error, { operation: 'validate_style_options' });
        throw error;
      }
    });
  }

  /**
   * Validate generated code
   */
  async validateGeneratedCode(code, language) {
    const requestId = uuidv4();
    const requestLogger = logger.addRequestId(requestId);

    return telemetryService.withSpan('validation.generated_code', async (span) => {
      try {
        span.setAttributes({
          'validation.type': 'generated_code',
          'validation.language': language,
          'validation.code_length': code.length,
        });

        const result = {
          isValid: true,
          errors: [],
          warnings: [],
          securityIssues: [],
          suggestions: [],
        };

        // Basic validation
        if (!code || typeof code !== 'string') {
          result.errors.push('Code must be a non-empty string');
          result.isValid = false;
          return result;
        }

        if (code.length > 100000) {
          result.errors.push('Code is too large (max 100KB)');
          result.isValid = false;
        }

        // Language-specific validation
        const validator = this.codeValidators[language];
        if (validator) {
          // Check for dangerous patterns
          if (validator.patterns.dangerous) {
            for (const pattern of validator.patterns.dangerous) {
              if (pattern.test(code)) {
                result.securityIssues.push(`Potentially dangerous pattern detected: ${pattern.source}`);
              }
            }
          }

          // Check for recommended patterns to avoid
          if (validator.patterns.recommended) {
            for (const pattern of validator.patterns.recommended) {
              if (pattern.test(code)) {
                result.warnings.push(`Consider avoiding: ${pattern.source}`);
              }
            }
          }

          // Basic syntax validation for JavaScript
          if (language === 'javascript' || language === 'jsx') {
            const syntaxCheck = this.validateJavaScriptSyntax(code);
            if (!syntaxCheck.isValid) {
              result.errors.push(...syntaxCheck.errors);
              result.isValid = false;
            }
          }

          // Basic syntax validation for CSS
          if (language === 'css' || language === 'scss') {
            const syntaxCheck = this.validateCssSyntax(code);
            if (!syntaxCheck.isValid) {
              result.errors.push(...syntaxCheck.errors);
              result.isValid = false;
            }
          }
        }

        // Security validation
        if (result.securityIssues.length > 0) {
          result.warnings.push('Security issues detected - review carefully before use');
        }

        requestLogger.validation('generated_code', result.isValid, result.errors, {
          language,
          codeLength: code.length,
          securityIssues: result.securityIssues.length,
          warnings: result.warnings.length,
        });

        return result;
      } catch (error) {
        requestLogger.logError(error, { operation: 'validate_generated_code' });
        throw error;
      }
    });
  }

  /**
   * Validate task data
   */
  async validateTaskData(taskData) {
    const { error, value } = this.schemas.taskData.validate(taskData, {
      abortEarly: false,
      stripUnknown: true,
    });

    return {
      isValid: !error,
      errors: error ? error.details.map(detail => detail.message) : [],
      sanitizedValue: value,
    };
  }

  /**
   * Validate user input
   */
  async validateUserInput(input) {
    const { error, value } = this.schemas.userInput.validate(input, {
      abortEarly: false,
      stripUnknown: true,
    });

    const result = {
      isValid: !error,
      errors: error ? error.details.map(detail => detail.message) : [],
      sanitizedValue: value,
    };

    // Sanitize input content
    if (value && value.input) {
      result.sanitizedValue.input = this.sanitizeInput(value.input);
    }

    return result;
  }

  /**
   * Sanitize user input
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }

    // Remove HTML tags
    let sanitized = sanitizeHtml(input, this.sanitizeOptions);
    
    // Escape special characters
    sanitized = validator.escape(sanitized);
    
    // Remove potential script injections
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/vbscript:/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=/gi, '');
    
    return sanitized;
  }

  /**
   * Validate JavaScript syntax
   */
  validateJavaScriptSyntax(code) {
    const result = {
      isValid: true,
      errors: [],
    };

    try {
      // Basic bracket matching
      const brackets = { '(': ')', '[': ']', '{': '}' };
      const stack = [];
      const chars = code.split('');
      
      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        
        if (brackets[char]) {
          stack.push({ char: brackets[char], pos: i });
        } else if (Object.values(brackets).includes(char)) {
          if (stack.length === 0) {
            result.errors.push(`Unmatched closing bracket '${char}' at position ${i}`);
            result.isValid = false;
          } else {
            const last = stack.pop();
            if (last.char !== char) {
              result.errors.push(`Mismatched brackets at position ${i}`);
              result.isValid = false;
            }
          }
        }
      }
      
      if (stack.length > 0) {
        result.errors.push(`Unclosed brackets: ${stack.map(s => s.char).join(', ')}`);
        result.isValid = false;
      }

      // Try to parse as JavaScript (basic check)
      try {
        new Function(code);
      } catch (syntaxError) {
        result.errors.push(`Syntax error: ${syntaxError.message}`);
        result.isValid = false;
      }
    } catch (error) {
      result.errors.push(`Validation error: ${error.message}`);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate CSS syntax
   */
  validateCssSyntax(code) {
    const result = {
      isValid: true,
      errors: [],
    };

    try {
      // Basic bracket matching for CSS
      const openBraces = (code.match(/\{/g) || []).length;
      const closeBraces = (code.match(/\}/g) || []).length;
      
      if (openBraces !== closeBraces) {
        result.errors.push(`Mismatched braces: ${openBraces} opening, ${closeBraces} closing`);
        result.isValid = false;
      }

      // Check for basic CSS structure
      const rules = code.split('}').filter(rule => rule.trim());
      for (const rule of rules) {
        if (rule.includes('{')) {
          const [selector, declarations] = rule.split('{');
          
          if (!selector.trim()) {
            result.errors.push('Empty CSS selector found');
            result.isValid = false;
          }
          
          if (declarations) {
            const props = declarations.split(';').filter(prop => prop.trim());
            for (const prop of props) {
              if (prop.trim() && !prop.includes(':')) {
                result.errors.push(`Invalid CSS property: ${prop.trim()}`);
                result.isValid = false;
              }
            }
          }
        }
      }
    } catch (error) {
      result.errors.push(`CSS validation error: ${error.message}`);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Check if CSS selector is valid
   */
  isValidCssSelector(selector) {
    try {
      // Basic CSS selector validation
      const validSelectorPattern = /^[a-zA-Z0-9\s\-_#.\[\]="':(),>+~*]+$/;
      return validSelectorPattern.test(selector);
    } catch {
      return false;
    }
  }

  /**
   * Validate file path
   */
  validateFilePath(filePath) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!filePath || typeof filePath !== 'string') {
      result.errors.push('File path must be a non-empty string');
      result.isValid = false;
      return result;
    }

    // Check for dangerous path patterns
    const dangerousPatterns = [
      /\.\./,  // Directory traversal
      /^\//, // Absolute paths
      /[<>:"|?*]/, // Invalid filename characters
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, // Windows reserved names
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(filePath)) {
        result.errors.push(`Potentially dangerous file path pattern: ${pattern.source}`);
        result.isValid = false;
      }
    }

    // Check file extension
    const allowedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.sass', '.less', '.html', '.json'];
    const extension = filePath.substring(filePath.lastIndexOf('.'));
    
    if (!allowedExtensions.includes(extension.toLowerCase())) {
      result.warnings.push(`Unusual file extension: ${extension}`);
    }

    return result;
  }

  /**
   * Get validation statistics
   */
  getValidationStats() {
    return {
      schemasLoaded: Object.keys(this.schemas).length,
      validatorsLoaded: Object.keys(this.codeValidators).length,
      uptime: process.uptime(),
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      schemas: Object.keys(this.schemas),
      validators: Object.keys(this.codeValidators),
      stats: this.getValidationStats(),
    };
  }
}

module.exports = new ValidationService();