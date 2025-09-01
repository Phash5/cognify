const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../config/logger');

/**
 * Utility functions for the Frontend AI Agent service
 */

/**
 * Generate a unique ID
 * @param {string} prefix - Optional prefix for the ID
 * @returns {string} Unique identifier
 */
function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const randomBytes = crypto.randomBytes(6).toString('hex');
  return prefix ? `${prefix}_${timestamp}_${randomBytes}` : `${timestamp}_${randomBytes}`;
}

/**
 * Generate a UUID v4
 * @returns {string} UUID v4 string
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Hash a string using SHA-256
 * @param {string} input - String to hash
 * @returns {string} Hexadecimal hash
 */
function hashString(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Generate a secure random token
 * @param {number} length - Length of the token in bytes (default: 32)
 * @returns {string} Hexadecimal token
 */
function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL format
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize filename for safe file operations
 * @param {string} filename - Filename to sanitize
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/**
 * Deep clone an object
 * @param {any} obj - Object to clone
 * @returns {any} Deep cloned object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }
  
  if (typeof obj === 'object') {
    const cloned = {};
    Object.keys(obj).forEach(key => {
      cloned[key] = deepClone(obj[key]);
    });
    return cloned;
  }
  
  return obj;
}

/**
 * Merge objects deeply
 * @param {object} target - Target object
 * @param {object} source - Source object
 * @returns {object} Merged object
 */
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        result[key] = deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  
  return result;
}

/**
 * Debounce function execution
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function execution
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {object} options - Retry options
 * @returns {Promise} Promise that resolves with function result
 */
async function retry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    jitter = true
  } = options;
  
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts) {
        throw error;
      }
      
      let delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
      
      if (jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
      }
      
      logger.warn(`Retry attempt ${attempt} failed, retrying in ${Math.round(delay)}ms`, {
        error: error.message,
        attempt,
        maxAttempts
      });
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format bytes to human readable string
 * @param {number} bytes - Number of bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted string
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds to human readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  }
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  
  return `${seconds}s`;
}

/**
 * Truncate string to specified length
 * @param {string} str - String to truncate
 * @param {number} length - Maximum length
 * @param {string} suffix - Suffix to add when truncated
 * @returns {string} Truncated string
 */
function truncateString(str, length, suffix = '...') {
  if (str.length <= length) {
    return str;
  }
  
  return str.substring(0, length - suffix.length) + suffix;
}

/**
 * Capitalize first letter of string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convert camelCase to kebab-case
 * @param {string} str - CamelCase string
 * @returns {string} kebab-case string
 */
function camelToKebab(str) {
  return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Convert kebab-case to camelCase
 * @param {string} str - kebab-case string
 * @returns {string} camelCase string
 */
function kebabToCamel(str) {
  return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
}

/**
 * Parse query string to object
 * @param {string} queryString - Query string to parse
 * @returns {object} Parsed query object
 */
function parseQueryString(queryString) {
  const params = new URLSearchParams(queryString);
  const result = {};
  
  for (const [key, value] of params) {
    if (result[key]) {
      if (Array.isArray(result[key])) {
        result[key].push(value);
      } else {
        result[key] = [result[key], value];
      }
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Build query string from object
 * @param {object} params - Parameters object
 * @returns {string} Query string
 */
function buildQueryString(params) {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => searchParams.append(key, v));
    } else if (value !== null && value !== undefined) {
      searchParams.append(key, value.toString());
    }
  });
  
  return searchParams.toString();
}

/**
 * Check if file exists
 * @param {string} filePath - Path to file
 * @returns {Promise<boolean>} True if file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists, create if not
 * @param {string} dirPath - Directory path
 * @returns {Promise<void>}
 */
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Read JSON file safely
 * @param {string} filePath - Path to JSON file
 * @returns {Promise<any>} Parsed JSON data
 */
async function readJsonFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error('Failed to read JSON file', { filePath, error: error.message });
    throw error;
  }
}

/**
 * Write JSON file safely
 * @param {string} filePath - Path to JSON file
 * @param {any} data - Data to write
 * @param {object} options - Write options
 * @returns {Promise<void>}
 */
async function writeJsonFile(filePath, data, options = {}) {
  const { indent = 2, ensureDirectory = true } = options;
  
  try {
    if (ensureDirectory) {
      await ensureDir(path.dirname(filePath));
    }
    
    const jsonString = JSON.stringify(data, null, indent);
    await fs.writeFile(filePath, jsonString, 'utf8');
  } catch (error) {
    logger.error('Failed to write JSON file', { filePath, error: error.message });
    throw error;
  }
}

/**
 * Get file extension from filename
 * @param {string} filename - Filename
 * @returns {string} File extension (without dot)
 */
function getFileExtension(filename) {
  return path.extname(filename).slice(1).toLowerCase();
}

/**
 * Get filename without extension
 * @param {string} filename - Filename
 * @returns {string} Filename without extension
 */
function getFilenameWithoutExtension(filename) {
  return path.basename(filename, path.extname(filename));
}

/**
 * Validate object against schema
 * @param {any} obj - Object to validate
 * @param {object} schema - Validation schema
 * @returns {object} Validation result
 */
function validateObject(obj, schema) {
  const errors = [];
  
  // Check required fields
  if (schema.required) {
    schema.required.forEach(field => {
      if (!(field in obj) || obj[field] === null || obj[field] === undefined) {
        errors.push(`Required field '${field}' is missing`);
      }
    });
  }
  
  // Check field types
  if (schema.properties) {
    Object.entries(schema.properties).forEach(([field, fieldSchema]) => {
      if (field in obj) {
        const value = obj[field];
        const expectedType = fieldSchema.type;
        
        if (expectedType && typeof value !== expectedType) {
          errors.push(`Field '${field}' should be of type '${expectedType}', got '${typeof value}'`);
        }
        
        // Check enum values
        if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
          errors.push(`Field '${field}' should be one of: ${fieldSchema.enum.join(', ')}`);
        }
        
        // Check string length
        if (expectedType === 'string' && fieldSchema.minLength && value.length < fieldSchema.minLength) {
          errors.push(`Field '${field}' should be at least ${fieldSchema.minLength} characters long`);
        }
        
        if (expectedType === 'string' && fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
          errors.push(`Field '${field}' should be at most ${fieldSchema.maxLength} characters long`);
        }
        
        // Check number range
        if (expectedType === 'number' && fieldSchema.min !== undefined && value < fieldSchema.min) {
          errors.push(`Field '${field}' should be at least ${fieldSchema.min}`);
        }
        
        if (expectedType === 'number' && fieldSchema.max !== undefined && value > fieldSchema.max) {
          errors.push(`Field '${field}' should be at most ${fieldSchema.max}`);
        }
      }
    });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculate percentage
 * @param {number} value - Current value
 * @param {number} total - Total value
 * @param {number} decimals - Number of decimal places
 * @returns {number} Percentage
 */
function calculatePercentage(value, total, decimals = 2) {
  if (total === 0) return 0;
  return Math.round((value / total) * 100 * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Get current timestamp in ISO format
 * @returns {string} ISO timestamp
 */
function getCurrentTimestamp() {
  return new Date().toISOString();
}

/**
 * Get timestamp for a specific offset
 * @param {number} offsetMs - Offset in milliseconds
 * @returns {string} ISO timestamp
 */
function getTimestampWithOffset(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

/**
 * Check if string is JSON
 * @param {string} str - String to check
 * @returns {boolean} True if valid JSON
 */
function isValidJson(str) {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe JSON parse with default value
 * @param {string} str - JSON string
 * @param {any} defaultValue - Default value if parsing fails
 * @returns {any} Parsed JSON or default value
 */
function safeJsonParse(str, defaultValue = null) {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

module.exports = {
  generateId,
  generateUUID,
  hashString,
  generateToken,
  isValidEmail,
  isValidUrl,
  sanitizeFilename,
  deepClone,
  deepMerge,
  debounce,
  throttle,
  retry,
  sleep,
  formatBytes,
  formatDuration,
  truncateString,
  capitalize,
  camelToKebab,
  kebabToCamel,
  parseQueryString,
  buildQueryString,
  fileExists,
  ensureDir,
  readJsonFile,
  writeJsonFile,
  getFileExtension,
  getFilenameWithoutExtension,
  validateObject,
  calculatePercentage,
  getCurrentTimestamp,
  getTimestampWithOffset,
  isValidJson,
  safeJsonParse
};