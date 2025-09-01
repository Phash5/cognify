import LoadBalancer from './LoadBalancer.js';
import { ServiceNotFoundError, ServiceUnavailableError } from '../types/errors.js';
import { HTTP_METHODS } from '../constants/http.js';

/**
 * Service client for inter-service communication with service discovery integration
 */
class ServiceClient {
  constructor(options = {}) {
    this.options = {
      timeout: 30000,
      retries: 3,
      loadBalancingStrategy: 'round_robin',
      healthCheckInterval: 60000,
      cacheTimeout: 300000, // 5 minutes
      ...options
    };

    this.httpClient = options.httpClient;
    this.serviceDiscovery = options.serviceDiscovery;
    this.logger = options.logger;
    this.metrics = options.metrics;

    // Service cache
    this.serviceCache = new Map();
    this.loadBalancers = new Map();
    
    // Health check tracking
    this.healthStatus = new Map();
    this.healthCheckTimers = new Map();

    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      serviceDiscoveryHits: 0,
      cacheHits: 0,
      loadBalancerRotations: 0
    };

    // Start periodic health checks if service discovery is available
    if (this.serviceDiscovery) {
      this._startHealthChecks();
    }
  }

  /**
   * Make a request to a service
   * @param {string} serviceName - Name of the target service
   * @param {string} path - Request path
   * @param {Object} options - Request options
   * @returns {Promise} Response from the service
   */
  async request(serviceName, path, options = {}) {
    this.stats.totalRequests++;
    
    const startTime = Date.now();
    const requestId = options.headers?.['X-Request-ID'] || this._generateRequestId();

    try {
      // Get service instance
      const serviceInstance = await this._getServiceInstance(serviceName);
      
      if (!serviceInstance) {
        throw new ServiceNotFoundError(`Service '${serviceName}' not found`);
      }

      // Build full URL
      const url = this._buildUrl(serviceInstance, path);
      
      // Prepare request options
      const requestOptions = {
        ...options,
        headers: {
          'X-Service-Name': serviceName,
          'X-Request-ID': requestId,
          'X-Client-Version': '1.0.0',
          ...options.headers
        },
        timeout: options.timeout || this.options.timeout
      };

      if (this.logger) {
        this.logger.info('Making service request', {
          serviceName,
          path,
          url,
          method: options.method || 'GET',
          requestId
        });
      }

      // Make the request
      const response = await this.httpClient.request({
        url,
        ...requestOptions
      });

      // Record success
      this.stats.successfulRequests++;
      const duration = Date.now() - startTime;

      // Update service health status
      this._updateServiceHealth(serviceName, serviceInstance, true, duration);

      // Record metrics
      if (this.metrics) {
        this.metrics.recordServiceRequest({
          serviceName,
          path,
          method: options.method || 'GET',
          status: response.status,
          duration,
          success: true
        });
      }

      return response;
    } catch (error) {
      this.stats.failedRequests++;
      const duration = Date.now() - startTime;

      // Update service health status
      const serviceInstance = await this._getServiceInstance(serviceName, false);
      if (serviceInstance) {
        this._updateServiceHealth(serviceName, serviceInstance, false, duration, error);
      }

      // Record metrics
      if (this.metrics) {
        this.metrics.recordServiceRequest({
          serviceName,
          path,
          method: options.method || 'GET',
          status: error.response?.status || 0,
          duration,
          success: false,
          error: error.message
        });
      }

      if (this.logger) {
        this.logger.error('Service request failed', {
          serviceName,
          path,
          error: error.message,
          duration,
          requestId
        });
      }

      throw error;
    }
  }

  /**
   * GET request to a service
   */
  async get(serviceName, path, options = {}) {
    return this.request(serviceName, path, {
      method: HTTP_METHODS.GET,
      ...options
    });
  }

  /**
   * POST request to a service
   */
  async post(serviceName, path, data, options = {}) {
    return this.request(serviceName, path, {
      method: HTTP_METHODS.POST,
      data,
      ...options
    });
  }

  /**
   * PUT request to a service
   */
  async put(serviceName, path, data, options = {}) {
    return this.request(serviceName, path, {
      method: HTTP_METHODS.PUT,
      data,
      ...options
    });
  }

  /**
   * PATCH request to a service
   */
  async patch(serviceName, path, data, options = {}) {
    return this.request(serviceName, path, {
      method: HTTP_METHODS.PATCH,
      data,
      ...options
    });
  }

  /**
   * DELETE request to a service
   */
  async delete(serviceName, path, options = {}) {
    return this.request(serviceName, path, {
      method: HTTP_METHODS.DELETE,
      ...options
    });
  }

  /**
   * Check health of a service
   * @param {string} serviceName - Name of the service
   * @returns {Promise<Object>} Health check result
   */
  async healthCheck(serviceName) {
    try {
      const serviceInstance = await this._getServiceInstance(serviceName);
      
      if (!serviceInstance) {
        return {
          serviceName,
          healthy: false,
          error: 'Service not found'
        };
      }

      const url = this._buildUrl(serviceInstance, '/health');
      const result = await this.httpClient.healthCheck(url);
      
      return {
        serviceName,
        instance: serviceInstance,
        ...result
      };
    } catch (error) {
      return {
        serviceName,
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Get all available instances of a service
   * @param {string} serviceName - Name of the service
   * @returns {Promise<Array>} Array of service instances
   */
  async getServiceInstances(serviceName) {
    if (!this.serviceDiscovery) {
      throw new Error('Service discovery not configured');
    }

    try {
      const instances = await this.serviceDiscovery.discover(serviceName);
      return instances || [];
    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to get service instances', {
          serviceName,
          error: error.message
        });
      }
      return [];
    }
  }

  /**
   * Get a single service instance using load balancing
   * @param {string} serviceName - Name of the service
   * @param {boolean} useCache - Whether to use cached instances
   * @returns {Promise<Object>} Service instance
   */
  async _getServiceInstance(serviceName, useCache = true) {
    // Check cache first
    if (useCache && this.serviceCache.has(serviceName)) {
      const cached = this.serviceCache.get(serviceName);
      if (Date.now() - cached.timestamp < this.options.cacheTimeout) {
        this.stats.cacheHits++;
        return this._selectInstance(serviceName, cached.instances);
      }
    }

    // Get fresh instances from service discovery
    if (this.serviceDiscovery) {
      try {
        const instances = await this.serviceDiscovery.discover(serviceName);
        
        if (instances && instances.length > 0) {
          // Filter healthy instances
          const healthyInstances = instances.filter(instance => 
            !this.healthStatus.has(this._getInstanceKey(instance)) ||
            this.healthStatus.get(this._getInstanceKey(instance)).healthy
          );

          if (healthyInstances.length === 0) {
            throw new ServiceUnavailableError(`No healthy instances of service '${serviceName}' available`);
          }

          // Cache the instances
          this.serviceCache.set(serviceName, {
            instances: healthyInstances,
            timestamp: Date.now()
          });

          this.stats.serviceDiscoveryHits++;
          return this._selectInstance(serviceName, healthyInstances);
        }
      } catch (error) {
        if (this.logger) {
          this.logger.error('Service discovery failed', {
            serviceName,
            error: error.message
          });
        }
      }
    }

    return null;
  }

  /**
   * Select an instance using load balancing
   * @param {string} serviceName - Name of the service
   * @param {Array} instances - Available instances
   * @returns {Object} Selected instance
   */
  _selectInstance(serviceName, instances) {
    if (!instances || instances.length === 0) {
      return null;
    }

    if (instances.length === 1) {
      return instances[0];
    }

    // Get or create load balancer for this service
    if (!this.loadBalancers.has(serviceName)) {
      this.loadBalancers.set(serviceName, new LoadBalancer({
        strategy: this.options.loadBalancingStrategy,
        logger: this.logger
      }));
    }

    const loadBalancer = this.loadBalancers.get(serviceName);
    const selected = loadBalancer.select(instances);
    
    this.stats.loadBalancerRotations++;
    return selected;
  }

  /**
   * Build full URL for a service instance
   * @param {Object} instance - Service instance
   * @param {string} path - Request path
   * @returns {string} Full URL
   */
  _buildUrl(instance, path) {
    const protocol = instance.protocol || 'http';
    const host = instance.host || instance.address;
    const port = instance.port;
    const basePath = instance.basePath || '';
    
    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    return `${protocol}://${host}:${port}${basePath}${normalizedPath}`;
  }

  /**
   * Generate a unique request ID
   * @returns {string} Request ID
   */
  _generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get instance key for health tracking
   * @param {Object} instance - Service instance
   * @returns {string} Instance key
   */
  _getInstanceKey(instance) {
    return `${instance.host}:${instance.port}`;
  }

  /**
   * Update service health status
   * @param {string} serviceName - Name of the service
   * @param {Object} instance - Service instance
   * @param {boolean} healthy - Whether the instance is healthy
   * @param {number} responseTime - Response time in ms
   * @param {Error} error - Error if any
   */
  _updateServiceHealth(serviceName, instance, healthy, responseTime, error = null) {
    const instanceKey = this._getInstanceKey(instance);
    const now = Date.now();
    
    const healthInfo = {
      serviceName,
      instance,
      healthy,
      responseTime,
      lastCheck: now,
      error: error ? error.message : null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0
    };

    // Update consecutive counters
    if (this.healthStatus.has(instanceKey)) {
      const existing = this.healthStatus.get(instanceKey);
      if (healthy) {
        healthInfo.consecutiveSuccesses = existing.consecutiveSuccesses + 1;
        healthInfo.consecutiveFailures = 0;
      } else {
        healthInfo.consecutiveFailures = existing.consecutiveFailures + 1;
        healthInfo.consecutiveSuccesses = 0;
      }
    } else {
      healthInfo.consecutiveSuccesses = healthy ? 1 : 0;
      healthInfo.consecutiveFailures = healthy ? 0 : 1;
    }

    this.healthStatus.set(instanceKey, healthInfo);

    // Record metrics
    if (this.metrics) {
      this.metrics.recordServiceHealth({
        serviceName,
        instance: instanceKey,
        healthy,
        responseTime,
        consecutiveFailures: healthInfo.consecutiveFailures
      });
    }
  }

  /**
   * Start periodic health checks
   */
  _startHealthChecks() {
    const interval = setInterval(async () => {
      try {
        await this._performHealthChecks();
      } catch (error) {
        if (this.logger) {
          this.logger.error('Health check cycle failed', { error: error.message });
        }
      }
    }, this.options.healthCheckInterval);

    this.healthCheckTimers.set('main', interval);
  }

  /**
   * Perform health checks on all cached services
   */
  async _performHealthChecks() {
    const promises = [];
    
    for (const [serviceName] of this.serviceCache) {
      promises.push(this.healthCheck(serviceName));
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  /**
   * Clear service cache
   * @param {string} serviceName - Optional service name to clear specific service
   */
  clearCache(serviceName = null) {
    if (serviceName) {
      this.serviceCache.delete(serviceName);
      this.loadBalancers.delete(serviceName);
    } else {
      this.serviceCache.clear();
      this.loadBalancers.clear();
    }

    if (this.logger) {
      this.logger.info('Service cache cleared', { serviceName });
    }
  }

  /**
   * Get service client statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalRequests > 0 ? 
        (this.stats.successfulRequests / this.stats.totalRequests) * 100 : 0,
      cacheHitRate: this.stats.totalRequests > 0 ? 
        (this.stats.cacheHits / this.stats.totalRequests) * 100 : 0,
      cachedServices: this.serviceCache.size,
      healthyServices: Array.from(this.healthStatus.values()).filter(h => h.healthy).length,
      totalTrackedServices: this.healthStatus.size
    };
  }

  /**
   * Get health status of all tracked services
   * @returns {Array} Array of health status objects
   */
  getHealthStatus() {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Close service client and cleanup resources
   */
  close() {
    // Clear all timers
    for (const timer of this.healthCheckTimers.values()) {
      clearInterval(timer);
    }
    this.healthCheckTimers.clear();

    // Clear caches
    this.serviceCache.clear();
    this.loadBalancers.clear();
    this.healthStatus.clear();

    if (this.logger) {
      this.logger.info('Service client closed');
    }
  }
}

export default ServiceClient;