import axios from 'axios';
import EventEmitter from 'eventemitter3';
import { ServiceDiscoveryError, ServiceNotFoundError } from '../types/errors.js';

/**
 * Service discovery client for registering and discovering services
 */
class ServiceDiscovery extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      registryUrl: process.env.SERVICE_DISCOVERY_URL || 'http://localhost:3004',
      serviceName: process.env.SERVICE_NAME || 'unknown-service',
      serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
      serviceHost: process.env.SERVICE_HOST || 'localhost',
      servicePort: process.env.SERVICE_PORT || 3000,
      serviceProtocol: process.env.SERVICE_PROTOCOL || 'http',
      heartbeatInterval: 30000, // 30 seconds
      discoveryInterval: 60000, // 1 minute
      retryAttempts: 3,
      retryDelay: 1000,
      timeout: 10000,
      apiKey: process.env.SERVICE_DISCOVERY_API_KEY,
      tags: [],
      metadata: {},
      healthCheckPath: '/health',
      ...options
    };

    this.logger = options.logger;
    this.metrics = options.metrics;
    
    // Service registry state
    this.registered = false;
    this.serviceId = null;
    this.heartbeatTimer = null;
    this.discoveryTimer = null;
    
    // Service cache
    this.serviceCache = new Map();
    this.lastDiscoveryUpdate = new Map();
    
    // Statistics
    this.stats = {
      registrationAttempts: 0,
      successfulRegistrations: 0,
      heartbeatsSent: 0,
      heartbeatFailures: 0,
      discoveryRequests: 0,
      cacheHits: 0,
      errors: 0
    };

    // HTTP client for registry communication
    this.httpClient = axios.create({
      baseURL: this.options.registryUrl,
      timeout: this.options.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Name': this.options.serviceName,
        'X-Service-Version': this.options.serviceVersion
      }
    });

    // Add API key if provided
    if (this.options.apiKey) {
      this.httpClient.defaults.headers['X-API-Key'] = this.options.apiKey;
    }

    // Setup request/response interceptors
    this._setupInterceptors();
  }

  /**
   * Register this service with the service registry
   * @param {Object} serviceInfo - Additional service information
   * @returns {Promise<Object>} Registration result
   */
  async register(serviceInfo = {}) {
    this.stats.registrationAttempts++;
    
    const registrationData = {
      name: this.options.serviceName,
      version: this.options.serviceVersion,
      host: this.options.serviceHost,
      port: parseInt(this.options.servicePort),
      protocol: this.options.serviceProtocol,
      tags: [...this.options.tags, ...(serviceInfo.tags || [])],
      metadata: {
        ...this.options.metadata,
        ...serviceInfo.metadata,
        registeredAt: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform
      },
      healthCheck: {
        path: this.options.healthCheckPath,
        interval: this.options.heartbeatInterval
      },
      ...serviceInfo
    };

    try {
      if (this.logger) {
        this.logger.info('Registering service with discovery', {
          serviceName: this.options.serviceName,
          registryUrl: this.options.registryUrl,
          registrationData
        });
      }

      const response = await this._retryRequest(async () => {
        return await this.httpClient.post('/api/services/register', registrationData);
      });

      this.serviceId = response.data.serviceId;
      this.registered = true;
      this.stats.successfulRegistrations++;

      // Start heartbeat
      this._startHeartbeat();
      
      // Start periodic discovery updates
      this._startDiscoveryUpdates();

      if (this.logger) {
        this.logger.info('Service registered successfully', {
          serviceId: this.serviceId,
          serviceName: this.options.serviceName
        });
      }

      // Record metrics
      if (this.metrics) {
        this.metrics.recordServiceRegistration({
          serviceName: this.options.serviceName,
          success: true
        });
      }

      this.emit('registered', {
        serviceId: this.serviceId,
        serviceName: this.options.serviceName,
        registrationData
      });

      return response.data;
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Service registration failed', {
          serviceName: this.options.serviceName,
          error: error.message
        });
      }

      // Record metrics
      if (this.metrics) {
        this.metrics.recordServiceRegistration({
          serviceName: this.options.serviceName,
          success: false,
          error: error.message
        });
      }

      this.emit('registrationFailed', {
        serviceName: this.options.serviceName,
        error: error.message
      });

      throw new ServiceDiscoveryError(
        `Failed to register service '${this.options.serviceName}': ${error.message}`,
        { originalError: error.message }
      );
    }
  }

  /**
   * Deregister this service from the service registry
   * @returns {Promise<void>}
   */
  async deregister() {
    if (!this.registered || !this.serviceId) {
      if (this.logger) {
        this.logger.warn('Service not registered, skipping deregistration');
      }
      return;
    }

    try {
      if (this.logger) {
        this.logger.info('Deregistering service', {
          serviceId: this.serviceId,
          serviceName: this.options.serviceName
        });
      }

      await this._retryRequest(async () => {
        return await this.httpClient.delete(`/api/services/${this.serviceId}`);
      });

      this._stopHeartbeat();
      this._stopDiscoveryUpdates();
      
      this.registered = false;
      this.serviceId = null;

      if (this.logger) {
        this.logger.info('Service deregistered successfully');
      }

      this.emit('deregistered', {
        serviceName: this.options.serviceName
      });
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Service deregistration failed', {
          serviceId: this.serviceId,
          error: error.message
        });
      }

      throw new ServiceDiscoveryError(
        `Failed to deregister service: ${error.message}`,
        { originalError: error.message }
      );
    }
  }

  /**
   * Discover services by name
   * @param {string} serviceName - Name of the service to discover
   * @param {Object} options - Discovery options
   * @returns {Promise<Array>} Array of service instances
   */
  async discover(serviceName, options = {}) {
    this.stats.discoveryRequests++;
    
    const {
      useCache = true,
      cacheTimeout = this.options.discoveryInterval,
      tags = [],
      version = null,
      healthy = true
    } = options;

    // Check cache first
    if (useCache && this.serviceCache.has(serviceName)) {
      const cached = this.serviceCache.get(serviceName);
      const lastUpdate = this.lastDiscoveryUpdate.get(serviceName) || 0;
      
      if (Date.now() - lastUpdate < cacheTimeout) {
        this.stats.cacheHits++;
        return this._filterServices(cached, { tags, version, healthy });
      }
    }

    try {
      if (this.logger) {
        this.logger.debug('Discovering services', {
          serviceName,
          tags,
          version,
          healthy
        });
      }

      const params = new URLSearchParams();
      if (tags.length > 0) {
        params.append('tags', tags.join(','));
      }
      if (version) {
        params.append('version', version);
      }
      if (healthy !== undefined) {
        params.append('healthy', healthy.toString());
      }

      const response = await this._retryRequest(async () => {
        return await this.httpClient.get(`/api/services/discover/${serviceName}?${params}`);
      });

      const services = response.data.services || [];
      
      // Update cache
      this.serviceCache.set(serviceName, services);
      this.lastDiscoveryUpdate.set(serviceName, Date.now());

      if (this.logger) {
        this.logger.debug('Services discovered', {
          serviceName,
          count: services.length
        });
      }

      // Record metrics
      if (this.metrics) {
        this.metrics.recordServiceDiscovery({
          serviceName,
          instanceCount: services.length,
          success: true
        });
      }

      this.emit('servicesDiscovered', {
        serviceName,
        services,
        count: services.length
      });

      return services;
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Service discovery failed', {
          serviceName,
          error: error.message
        });
      }

      // Record metrics
      if (this.metrics) {
        this.metrics.recordServiceDiscovery({
          serviceName,
          instanceCount: 0,
          success: false,
          error: error.message
        });
      }

      // Return cached services if available
      if (this.serviceCache.has(serviceName)) {
        const cached = this.serviceCache.get(serviceName);
        if (this.logger) {
          this.logger.warn('Using cached services due to discovery failure', {
            serviceName,
            count: cached.length
          });
        }
        return this._filterServices(cached, { tags, version, healthy });
      }

      throw new ServiceNotFoundError(
        `Failed to discover service '${serviceName}': ${error.message}`,
        { originalError: error.message }
      );
    }
  }

  /**
   * Get all registered services
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of all services
   */
  async getAllServices(options = {}) {
    try {
      const params = new URLSearchParams();
      if (options.tags && options.tags.length > 0) {
        params.append('tags', options.tags.join(','));
      }
      if (options.healthy !== undefined) {
        params.append('healthy', options.healthy.toString());
      }

      const response = await this._retryRequest(async () => {
        return await this.httpClient.get(`/api/services?${params}`);
      });

      return response.data.services || [];
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Failed to get all services', {
          error: error.message
        });
      }

      throw new ServiceDiscoveryError(
        `Failed to get all services: ${error.message}`,
        { originalError: error.message }
      );
    }
  }

  /**
   * Send heartbeat to service registry
   * @returns {Promise<void>}
   */
  async sendHeartbeat() {
    if (!this.registered || !this.serviceId) {
      return;
    }

    try {
      this.stats.heartbeatsSent++;
      
      await this._retryRequest(async () => {
        return await this.httpClient.post(`/api/services/${this.serviceId}/heartbeat`, {
          timestamp: new Date().toISOString(),
          metadata: {
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage()
          }
        });
      });

      if (this.logger) {
        this.logger.debug('Heartbeat sent successfully', {
          serviceId: this.serviceId
        });
      }

      this.emit('heartbeatSent', {
        serviceId: this.serviceId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.stats.heartbeatFailures++;
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Heartbeat failed', {
          serviceId: this.serviceId,
          error: error.message
        });
      }

      this.emit('heartbeatFailed', {
        serviceId: this.serviceId,
        error: error.message
      });

      // If heartbeat fails multiple times, try to re-register
      if (this.stats.heartbeatFailures >= 3) {
        if (this.logger) {
          this.logger.warn('Multiple heartbeat failures, attempting re-registration');
        }
        
        this.registered = false;
        this.serviceId = null;
        
        try {
          await this.register();
        } catch (reregisterError) {
          if (this.logger) {
            this.logger.error('Re-registration failed', {
              error: reregisterError.message
            });
          }
        }
      }
    }
  }

  /**
   * Clear service cache
   * @param {string} serviceName - Optional service name to clear specific service
   */
  clearCache(serviceName = null) {
    if (serviceName) {
      this.serviceCache.delete(serviceName);
      this.lastDiscoveryUpdate.delete(serviceName);
    } else {
      this.serviceCache.clear();
      this.lastDiscoveryUpdate.clear();
    }

    if (this.logger) {
      this.logger.info('Service cache cleared', { serviceName });
    }
  }

  /**
   * Get service discovery statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      registered: this.registered,
      serviceId: this.serviceId,
      cachedServices: this.serviceCache.size,
      heartbeatSuccessRate: this.stats.heartbeatsSent > 0 ? 
        ((this.stats.heartbeatsSent - this.stats.heartbeatFailures) / this.stats.heartbeatsSent) * 100 : 0,
      registrationSuccessRate: this.stats.registrationAttempts > 0 ? 
        (this.stats.successfulRegistrations / this.stats.registrationAttempts) * 100 : 0
    };
  }

  /**
   * Close service discovery client
   */
  async close() {
    try {
      await this.deregister();
    } catch (error) {
      if (this.logger) {
        this.logger.error('Error during service discovery close', {
          error: error.message
        });
      }
    }

    this._stopHeartbeat();
    this._stopDiscoveryUpdates();
    this.clearCache();
    this.removeAllListeners();

    if (this.logger) {
      this.logger.info('Service discovery client closed');
    }
  }

  /**
   * Filter services based on criteria
   * @param {Array} services - Services to filter
   * @param {Object} criteria - Filter criteria
   * @returns {Array} Filtered services
   */
  _filterServices(services, criteria) {
    return services.filter(service => {
      // Filter by tags
      if (criteria.tags && criteria.tags.length > 0) {
        const serviceTags = service.tags || [];
        const hasAllTags = criteria.tags.every(tag => serviceTags.includes(tag));
        if (!hasAllTags) return false;
      }

      // Filter by version
      if (criteria.version && service.version !== criteria.version) {
        return false;
      }

      // Filter by health status
      if (criteria.healthy !== undefined && service.healthy !== criteria.healthy) {
        return false;
      }

      return true;
    });
  }

  /**
   * Start heartbeat timer
   */
  _startHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch(error => {
        // Error is already logged in sendHeartbeat
      });
    }, this.options.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Start periodic discovery updates
   */
  _startDiscoveryUpdates() {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
    }

    this.discoveryTimer = setInterval(() => {
      // Refresh cached services
      for (const serviceName of this.serviceCache.keys()) {
        this.discover(serviceName, { useCache: false }).catch(error => {
          // Error is already logged in discover
        });
      }
    }, this.options.discoveryInterval);
  }

  /**
   * Stop discovery updates timer
   */
  _stopDiscoveryUpdates() {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
  }

  /**
   * Setup HTTP client interceptors
   */
  _setupInterceptors() {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        if (this.logger) {
          this.logger.debug('Service discovery request', {
            method: config.method,
            url: config.url,
            data: config.data
          });
        }
        return config;
      },
      (error) => {
        if (this.logger) {
          this.logger.error('Service discovery request error', {
            error: error.message
          });
        }
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        if (this.logger) {
          this.logger.debug('Service discovery response', {
            status: response.status,
            url: response.config.url
          });
        }
        return response;
      },
      (error) => {
        if (this.logger) {
          this.logger.error('Service discovery response error', {
            status: error.response?.status,
            url: error.config?.url,
            error: error.message
          });
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Retry request with exponential backoff
   * @param {Function} requestFn - Request function to retry
   * @returns {Promise} Request result
   */
  async _retryRequest(requestFn) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        if (attempt === this.options.retryAttempts) {
          break;
        }
        
        const delay = this.options.retryDelay * Math.pow(2, attempt - 1);
        
        if (this.logger) {
          this.logger.warn('Service discovery request failed, retrying', {
            attempt,
            maxAttempts: this.options.retryAttempts,
            delay,
            error: error.message
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
}

export default ServiceDiscovery;