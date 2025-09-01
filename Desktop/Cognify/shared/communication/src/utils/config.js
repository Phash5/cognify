import EventEmitter from 'eventemitter3';
import { readFileSync, existsSync, watchFile, unwatchFile } from 'fs';
import { resolve, join } from 'path';

/**
 * Configuration manager for microservices
 */
class ConfigManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      serviceName: process.env.SERVICE_NAME || 'unknown-service',
      environment: process.env.NODE_ENV || 'development',
      configDir: process.env.CONFIG_DIR || './config',
      enableFileWatch: process.env.CONFIG_WATCH !== 'false',
      enableEnvOverrides: process.env.CONFIG_ENV_OVERRIDES !== 'false',
      enableRemoteConfig: process.env.CONFIG_REMOTE === 'true',
      remoteConfigUrl: process.env.CONFIG_REMOTE_URL,
      refreshInterval: parseInt(process.env.CONFIG_REFRESH_INTERVAL) || 300000, // 5 minutes
      enableValidation: true,
      enableCaching: true,
      enableEncryption: process.env.CONFIG_ENCRYPTION === 'true',
      encryptionKey: process.env.CONFIG_ENCRYPTION_KEY,
      ...options
    };

    this.logger = options.logger;
    
    // Configuration storage
    this.config = new Map();
    this.schemas = new Map();
    this.watchers = new Map();
    
    // File modification times for change detection
    this.fileMtimes = new Map();
    
    // Remote config cache
    this.remoteConfigCache = new Map();
    
    // Statistics
    this.stats = {
      loadsFromFile: 0,
      loadsFromRemote: 0,
      loadsFromCache: 0,
      validationErrors: 0,
      fileWatchEvents: 0,
      remoteConfigErrors: 0,
      lastRefresh: null
    };

    // Refresh timer for remote config
    this.refreshTimer = null;
    
    // Initialize configuration
    this._initialize();
  }

  /**
   * Initialize configuration manager
   */
  async _initialize() {
    try {
      // Load default configuration
      await this._loadDefaultConfig();
      
      // Load environment-specific configuration
      await this._loadEnvironmentConfig();
      
      // Load service-specific configuration
      await this._loadServiceConfig();
      
      // Apply environment variable overrides
      if (this.options.enableEnvOverrides) {
        this._applyEnvOverrides();
      }
      
      // Start file watching
      if (this.options.enableFileWatch) {
        this._startFileWatching();
      }
      
      // Start remote config refresh
      if (this.options.enableRemoteConfig && this.options.remoteConfigUrl) {
        this._startRemoteConfigRefresh();
      }

      if (this.logger) {
        this.logger.info('Configuration manager initialized', {
          environment: this.options.environment,
          serviceName: this.options.serviceName,
          configKeys: Array.from(this.config.keys()).length
        });
      }
      
      this.emit('initialized', {
        environment: this.options.environment,
        serviceName: this.options.serviceName,
        configKeys: Array.from(this.config.keys())
      });
    } catch (error) {
      if (this.logger) {
        this.logger.error('Configuration initialization failed', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Load default configuration
   */
  async _loadDefaultConfig() {
    const defaultConfigPath = join(this.options.configDir, 'default.json');
    await this._loadConfigFile(defaultConfigPath, 'default');
  }

  /**
   * Load environment-specific configuration
   */
  async _loadEnvironmentConfig() {
    const envConfigPath = join(this.options.configDir, `${this.options.environment}.json`);
    await this._loadConfigFile(envConfigPath, this.options.environment);
  }

  /**
   * Load service-specific configuration
   */
  async _loadServiceConfig() {
    const serviceConfigPath = join(this.options.configDir, `${this.options.serviceName}.json`);
    await this._loadConfigFile(serviceConfigPath, this.options.serviceName);
  }

  /**
   * Load configuration from file
   * @param {string} filePath - Configuration file path
   * @param {string} namespace - Configuration namespace
   */
  async _loadConfigFile(filePath, namespace) {
    try {
      const absolutePath = resolve(filePath);
      
      if (!existsSync(absolutePath)) {
        if (this.logger) {
          this.logger.debug('Configuration file not found', {
            path: absolutePath,
            namespace,
            serviceName: this.options.serviceName
          });
        }
        return;
      }
      
      const content = readFileSync(absolutePath, 'utf8');
      const config = JSON.parse(content);
      
      // Decrypt if encryption is enabled
      const decryptedConfig = this.options.enableEncryption ? 
        this._decryptConfig(config) : config;
      
      // Merge with existing configuration
      this._mergeConfig(decryptedConfig, namespace);
      
      // Track file modification time
      const stats = require('fs').statSync(absolutePath);
      this.fileMtimes.set(absolutePath, stats.mtime.getTime());
      
      this.stats.loadsFromFile++;
      
      if (this.logger) {
        this.logger.debug('Configuration loaded from file', {
          path: absolutePath,
          namespace,
          keys: Object.keys(decryptedConfig).length,
          serviceName: this.options.serviceName
        });
      }
      
      this.emit('configLoaded', {
        source: 'file',
        path: absolutePath,
        namespace,
        config: decryptedConfig
      });
    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to load configuration file', {
          path: filePath,
          namespace,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      // Don't throw for missing optional config files
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Apply environment variable overrides
   */
  _applyEnvOverrides() {
    const envPrefix = `${this.options.serviceName.toUpperCase().replace(/-/g, '_')}_`;
    
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(envPrefix)) {
        const configKey = key.substring(envPrefix.length).toLowerCase().replace(/_/g, '.');
        const parsedValue = this._parseEnvValue(value);
        
        this._setNestedValue(this.config, configKey, parsedValue);
        
        if (this.logger) {
          this.logger.debug('Environment override applied', {
            envKey: key,
            configKey,
            value: parsedValue,
            serviceName: this.options.serviceName
          });
        }
      }
    }
  }

  /**
   * Parse environment variable value
   * @param {string} value - Environment variable value
   * @returns {any} Parsed value
   */
  _parseEnvValue(value) {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // Handle boolean strings
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
      
      // Handle numeric strings
      if (/^\d+$/.test(value)) return parseInt(value, 10);
      if (/^\d*\.\d+$/.test(value)) return parseFloat(value);
      
      // Return as string
      return value;
    }
  }

  /**
   * Set nested value in configuration
   * @param {Map} config - Configuration map
   * @param {string} path - Dot-separated path
   * @param {any} value - Value to set
   */
  _setNestedValue(config, path, value) {
    const parts = path.split('.');
    const key = parts[0];
    
    if (parts.length === 1) {
      config.set(key, value);
    } else {
      if (!config.has(key)) {
        config.set(key, new Map());
      }
      
      const nested = config.get(key);
      if (nested instanceof Map) {
        this._setNestedValue(nested, parts.slice(1).join('.'), value);
      }
    }
  }

  /**
   * Merge configuration into existing config
   * @param {Object} newConfig - New configuration
   * @param {string} namespace - Configuration namespace
   */
  _mergeConfig(newConfig, namespace) {
    for (const [key, value] of Object.entries(newConfig)) {
      const configKey = namespace === 'default' ? key : `${namespace}.${key}`;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Merge nested objects
        if (!this.config.has(configKey)) {
          this.config.set(configKey, new Map());
        }
        
        const existing = this.config.get(configKey);
        if (existing instanceof Map) {
          this._mergeNestedConfig(existing, value);
        } else {
          this.config.set(configKey, this._objectToMap(value));
        }
      } else {
        this.config.set(configKey, value);
      }
    }
  }

  /**
   * Merge nested configuration
   * @param {Map} existing - Existing configuration map
   * @param {Object} newConfig - New configuration object
   */
  _mergeNestedConfig(existing, newConfig) {
    for (const [key, value] of Object.entries(newConfig)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        if (!existing.has(key)) {
          existing.set(key, new Map());
        }
        
        const nested = existing.get(key);
        if (nested instanceof Map) {
          this._mergeNestedConfig(nested, value);
        } else {
          existing.set(key, this._objectToMap(value));
        }
      } else {
        existing.set(key, value);
      }
    }
  }

  /**
   * Convert object to Map recursively
   * @param {Object} obj - Object to convert
   * @returns {Map} Converted map
   */
  _objectToMap(obj) {
    const map = new Map();
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        map.set(key, this._objectToMap(value));
      } else {
        map.set(key, value);
      }
    }
    
    return map;
  }

  /**
   * Start file watching for configuration changes
   */
  _startFileWatching() {
    const configFiles = [
      join(this.options.configDir, 'default.json'),
      join(this.options.configDir, `${this.options.environment}.json`),
      join(this.options.configDir, `${this.options.serviceName}.json`)
    ];
    
    for (const filePath of configFiles) {
      const absolutePath = resolve(filePath);
      
      if (existsSync(absolutePath)) {
        watchFile(absolutePath, { interval: 1000 }, (curr, prev) => {
          this._handleFileChange(absolutePath, curr, prev);
        });
        
        this.watchers.set(absolutePath, true);
      }
    }
    
    if (this.logger) {
      this.logger.debug('File watching started', {
        files: Array.from(this.watchers.keys()),
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Handle configuration file change
   * @param {string} filePath - Changed file path
   * @param {Object} curr - Current file stats
   * @param {Object} prev - Previous file stats
   */
  async _handleFileChange(filePath, curr, prev) {
    try {
      const currentMtime = curr.mtime.getTime();
      const previousMtime = this.fileMtimes.get(filePath) || 0;
      
      if (currentMtime > previousMtime) {
        this.stats.fileWatchEvents++;
        
        if (this.logger) {
          this.logger.info('Configuration file changed, reloading', {
            path: filePath,
            serviceName: this.options.serviceName
          });
        }
        
        // Determine namespace from file name
        const fileName = require('path').basename(filePath, '.json');
        const namespace = fileName === 'default' ? 'default' : 
                         fileName === this.options.environment ? this.options.environment :
                         this.options.serviceName;
        
        await this._loadConfigFile(filePath, namespace);
        
        this.emit('configChanged', {
          source: 'file',
          path: filePath,
          namespace
        });
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to handle file change', {
          path: filePath,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
    }
  }

  /**
   * Start remote configuration refresh
   */
  _startRemoteConfigRefresh() {
    this.refreshTimer = setInterval(async () => {
      try {
        await this._refreshRemoteConfig();
      } catch (error) {
        this.stats.remoteConfigErrors++;
        
        if (this.logger) {
          this.logger.error('Remote config refresh failed', {
            error: error.message,
            serviceName: this.options.serviceName
          });
        }
      }
    }, this.options.refreshInterval);
    
    // Initial load
    this._refreshRemoteConfig().catch(error => {
      this.stats.remoteConfigErrors++;
      
      if (this.logger) {
        this.logger.error('Initial remote config load failed', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
    });
  }

  /**
   * Refresh remote configuration
   */
  async _refreshRemoteConfig() {
    try {
      // Note: In a real implementation, you would make HTTP requests to a config service
      // const response = await fetch(`${this.options.remoteConfigUrl}/${this.options.serviceName}`);
      // const remoteConfig = await response.json();
      
      // For now, we'll simulate remote config
      const remoteConfig = {};
      
      this._mergeConfig(remoteConfig, 'remote');
      
      this.stats.loadsFromRemote++;
      this.stats.lastRefresh = Date.now();
      
      if (this.logger) {
        this.logger.debug('Remote configuration refreshed', {
          url: this.options.remoteConfigUrl,
          keys: Object.keys(remoteConfig).length,
          serviceName: this.options.serviceName
        });
      }
      
      this.emit('configLoaded', {
        source: 'remote',
        url: this.options.remoteConfigUrl,
        config: remoteConfig
      });
    } catch (error) {
      throw new Error(`Remote config refresh failed: ${error.message}`);
    }
  }

  /**
   * Get configuration value
   * @param {string} key - Configuration key (dot-separated path)
   * @param {any} defaultValue - Default value if key not found
   * @returns {any} Configuration value
   */
  get(key, defaultValue = undefined) {
    try {
      const value = this._getNestedValue(this.config, key);
      
      if (value !== undefined) {
        // Validate if schema exists
        if (this.options.enableValidation && this.schemas.has(key)) {
          const isValid = this._validateValue(key, value);
          if (!isValid) {
            this.stats.validationErrors++;
            
            if (this.logger) {
              this.logger.warn('Configuration validation failed', {
                key,
                value,
                serviceName: this.options.serviceName
              });
            }
            
            return defaultValue;
          }
        }
        
        return value;
      }
      
      return defaultValue;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Configuration get error', {
          key,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      return defaultValue;
    }
  }

  /**
   * Get nested value from configuration
   * @param {Map} config - Configuration map
   * @param {string} path - Dot-separated path
   * @returns {any} Configuration value
   */
  _getNestedValue(config, path) {
    const parts = path.split('.');
    let current = config;
    
    for (const part of parts) {
      if (current instanceof Map && current.has(part)) {
        current = current.get(part);
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  /**
   * Set configuration value
   * @param {string} key - Configuration key
   * @param {any} value - Configuration value
   * @returns {boolean} Success status
   */
  set(key, value) {
    try {
      // Validate if schema exists
      if (this.options.enableValidation && this.schemas.has(key)) {
        const isValid = this._validateValue(key, value);
        if (!isValid) {
          this.stats.validationErrors++;
          return false;
        }
      }
      
      this._setNestedValue(this.config, key, value);
      
      this.emit('configSet', { key, value });
      
      if (this.logger) {
        this.logger.debug('Configuration value set', {
          key,
          value,
          serviceName: this.options.serviceName
        });
      }
      
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Configuration set error', {
          key,
          value,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      return false;
    }
  }

  /**
   * Check if configuration key exists
   * @param {string} key - Configuration key
   * @returns {boolean} Exists status
   */
  has(key) {
    return this._getNestedValue(this.config, key) !== undefined;
  }

  /**
   * Delete configuration key
   * @param {string} key - Configuration key
   * @returns {boolean} Success status
   */
  delete(key) {
    try {
      const parts = key.split('.');
      const lastKey = parts.pop();
      const parentPath = parts.join('.');
      
      const parent = parentPath ? this._getNestedValue(this.config, parentPath) : this.config;
      
      if (parent instanceof Map && parent.has(lastKey)) {
        parent.delete(lastKey);
        
        this.emit('configDeleted', { key });
        
        if (this.logger) {
          this.logger.debug('Configuration key deleted', {
            key,
            serviceName: this.options.serviceName
          });
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Configuration delete error', {
          key,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      return false;
    }
  }

  /**
   * Get all configuration keys
   * @returns {Array<string>} Configuration keys
   */
  keys() {
    return this._getAllKeys(this.config, '');
  }

  /**
   * Get all keys recursively
   * @param {Map} config - Configuration map
   * @param {string} prefix - Key prefix
   * @returns {Array<string>} All keys
   */
  _getAllKeys(config, prefix) {
    const keys = [];
    
    for (const [key, value] of config) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (value instanceof Map) {
        keys.push(...this._getAllKeys(value, fullKey));
      } else {
        keys.push(fullKey);
      }
    }
    
    return keys;
  }

  /**
   * Get configuration as plain object
   * @returns {Object} Configuration object
   */
  toObject() {
    return this._mapToObject(this.config);
  }

  /**
   * Convert Map to plain object recursively
   * @param {Map} map - Map to convert
   * @returns {Object} Plain object
   */
  _mapToObject(map) {
    const obj = {};
    
    for (const [key, value] of map) {
      if (value instanceof Map) {
        obj[key] = this._mapToObject(value);
      } else {
        obj[key] = value;
      }
    }
    
    return obj;
  }

  /**
   * Register configuration schema for validation
   * @param {string} key - Configuration key
   * @param {Object} schema - JSON schema
   */
  registerSchema(key, schema) {
    this.schemas.set(key, schema);
    
    if (this.logger) {
      this.logger.debug('Configuration schema registered', {
        key,
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Validate configuration value against schema
   * @param {string} key - Configuration key
   * @param {any} value - Value to validate
   * @returns {boolean} Validation result
   */
  _validateValue(key, value) {
    const schema = this.schemas.get(key);
    if (!schema) return true;
    
    // Simple validation - in a real implementation, use a proper JSON schema validator
    try {
      if (schema.type && typeof value !== schema.type) {
        return false;
      }
      
      if (schema.required && (value === undefined || value === null)) {
        return false;
      }
      
      if (schema.enum && !schema.enum.includes(value)) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Decrypt configuration if encryption is enabled
   * @param {Object} config - Encrypted configuration
   * @returns {Object} Decrypted configuration
   */
  _decryptConfig(config) {
    // Note: In a real implementation, you would use proper encryption/decryption
    // For now, just return the config as-is
    return config;
  }

  /**
   * Get configuration statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      configKeys: this.config.size,
      schemas: this.schemas.size,
      watchers: this.watchers.size,
      environment: this.options.environment,
      serviceName: this.options.serviceName
    };
  }

  /**
   * Reload all configuration
   */
  async reload() {
    try {
      // Clear existing configuration
      this.config.clear();
      
      // Reload all configuration sources
      await this._loadDefaultConfig();
      await this._loadEnvironmentConfig();
      await this._loadServiceConfig();
      
      if (this.options.enableEnvOverrides) {
        this._applyEnvOverrides();
      }
      
      if (this.options.enableRemoteConfig && this.options.remoteConfigUrl) {
        await this._refreshRemoteConfig();
      }
      
      this.emit('configReloaded');
      
      if (this.logger) {
        this.logger.info('Configuration reloaded', {
          keys: this.config.size,
          serviceName: this.options.serviceName
        });
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error('Configuration reload failed', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Close configuration manager
   */
  close() {
    // Stop file watching
    for (const filePath of this.watchers.keys()) {
      unwatchFile(filePath);
    }
    this.watchers.clear();
    
    // Stop remote config refresh
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    this.removeAllListeners();

    if (this.logger) {
      this.logger.info('Configuration manager closed', {
        serviceName: this.options.serviceName
      });
    }
  }
}

/**
 * Create a configuration manager instance
 * @param {Object} options - Configuration options
 * @returns {ConfigManager} Configuration manager instance
 */
export function createConfig(options = {}) {
  return new ConfigManager(options);
}

/**
 * Default configuration manager instance
 */
export const defaultConfig = createConfig();

export default {
  ConfigManager,
  createConfig,
  defaultConfig
};