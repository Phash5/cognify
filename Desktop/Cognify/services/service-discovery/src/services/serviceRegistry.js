/**
 * Service Registry
 * Core service for managing service registration, discovery, and health monitoring
 */

'use strict';

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const cron = require('node-cron');
const Redis = require('ioredis');
const config = require('../config/config');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');

class ServiceRegistry extends EventEmitter {
  constructor() {
    super();
    
    // In-memory service registry
    this.services = new Map();
    this.serviceInstances = new Map();
    this.healthChecks = new Map();
    this.loadBalancers = new Map();
    
    // Redis client for persistence
    this.redis = null;
    this.isRedisConnected = false;
    
    // Metrics
    this.metrics = {
      totalServices: 0,
      totalInstances: 0,
      healthyInstances: 0,
      unhealthyInstances: 0,
      registrations: 0,
      deregistrations: 0,
      discoveries: 0,
      healthChecks: 0,
      errors: 0,
    };
    
    // Load balancing strategies
    this.loadBalancingStrategies = {
      round_robin: this.roundRobinStrategy.bind(this),
      least_connections: this.leastConnectionsStrategy.bind(this),
      random: this.randomStrategy.bind(this),
      weighted: this.weightedStrategy.bind(this),
    };
    
    this.init();
  }

  /**
   * Initialize the service registry
   */
  async init() {
    try {
      // Initialize Redis if enabled
      if (config.redis.enabled) {
        await this.initRedis();
      }
      
      // Start background tasks
      this.startHealthCheckScheduler();
      this.startCleanupScheduler();
      this.startMetricsCollector();
      
      // Load persisted services from Redis
      if (this.isRedisConnected) {
        await this.loadPersistedServices();
      }
      
      logger.info('Service Registry initialized successfully', {
        redisEnabled: config.redis.enabled,
        redisConnected: this.isRedisConnected,
        healthCheckInterval: config.registry.healthCheckInterval,
        cleanupInterval: config.registry.cleanupInterval,
      });
      
    } catch (error) {
      logger.error('Failed to initialize Service Registry', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Initialize Redis connection
   */
  async initRedis() {
    try {
      this.redis = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        keyPrefix: config.redis.keyPrefix,
        connectTimeout: config.redis.connectTimeout,
        commandTimeout: config.redis.commandTimeout,
        retryDelayOnFailover: config.redis.retryDelay,
        maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
        lazyConnect: config.redis.lazyConnect,
        keepAlive: config.redis.keepAlive,
      });
      
      this.redis.on('connect', () => {
        this.isRedisConnected = true;
        logger.info('Redis connected for service registry');
      });
      
      this.redis.on('error', (error) => {
        this.isRedisConnected = false;
        logger.error('Redis connection error', { error: error.message });
      });
      
      this.redis.on('close', () => {
        this.isRedisConnected = false;
        logger.warn('Redis connection closed');
      });
      
      await this.redis.connect();
      
    } catch (error) {
      logger.error('Failed to initialize Redis', { error: error.message });
      this.isRedisConnected = false;
    }
  }

  /**
   * Register a service instance
   */
  async registerService(serviceData) {
    const span = telemetryService.startSpan('service_registry_register');
    
    try {
      // Validate service data
      this.validateServiceData(serviceData);
      
      const instanceId = uuidv4();
      const registrationTime = new Date();
      
      const serviceInstance = {
        id: instanceId,
        name: serviceData.name,
        version: serviceData.version || '1.0.0',
        host: serviceData.host,
        port: serviceData.port,
        protocol: serviceData.protocol || 'http',
        healthCheckUrl: serviceData.healthCheckUrl || `${serviceData.protocol || 'http'}://${serviceData.host}:${serviceData.port}/health`,
        metadata: serviceData.metadata || {},
        tags: serviceData.tags || [],
        zone: serviceData.zone || config.registry.zones.default,
        weight: serviceData.weight || 1,
        status: 'healthy',
        registeredAt: registrationTime,
        lastHeartbeat: registrationTime,
        lastHealthCheck: null,
        healthCheckFailures: 0,
        connections: 0,
        ttl: serviceData.ttl || config.registry.defaultTtl,
      };
      
      // Store in memory
      this.serviceInstances.set(instanceId, serviceInstance);
      
      // Update service list
      if (!this.services.has(serviceData.name)) {
        this.services.set(serviceData.name, {
          name: serviceData.name,
          instances: new Set(),
          loadBalancer: {
            strategy: config.registry.loadBalancing.strategy,
            currentIndex: 0,
          },
        });
        this.metrics.totalServices++;
      }
      
      this.services.get(serviceData.name).instances.add(instanceId);
      this.metrics.totalInstances++;
      this.metrics.healthyInstances++;
      this.metrics.registrations++;
      
      // Persist to Redis
      if (this.isRedisConnected) {
        await this.persistServiceInstance(serviceInstance);
      }
      
      // Schedule initial health check
      this.scheduleHealthCheck(instanceId);
      
      // Emit registration event
      this.emit('service:registered', {
        instanceId,
        serviceName: serviceData.name,
        instance: serviceInstance,
      });
      
      logger.info('Service registered successfully', {
        instanceId,
        serviceName: serviceData.name,
        host: serviceData.host,
        port: serviceData.port,
        zone: serviceInstance.zone,
      });
      
      span.setAttributes({
        'service.name': serviceData.name,
        'service.instance_id': instanceId,
        'service.host': serviceData.host,
        'service.port': serviceData.port,
      });
      
      return {
        instanceId,
        status: 'registered',
        heartbeatInterval: config.registry.heartbeatInterval,
        ttl: serviceInstance.ttl,
      };
      
    } catch (error) {
      this.metrics.errors++;
      span.recordException(error);
      
      logger.error('Service registration failed', {
        serviceName: serviceData?.name,
        error: error.message,
        stack: error.stack,
      });
      
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Deregister a service instance
   */
  async deregisterService(instanceId) {
    const span = telemetryService.startSpan('service_registry_deregister');
    
    try {
      const serviceInstance = this.serviceInstances.get(instanceId);
      
      if (!serviceInstance) {
        throw new Error(`Service instance ${instanceId} not found`);
      }
      
      const serviceName = serviceInstance.name;
      
      // Remove from memory
      this.serviceInstances.delete(instanceId);
      
      // Update service list
      const service = this.services.get(serviceName);
      if (service) {
        service.instances.delete(instanceId);
        
        // Remove service if no instances left
        if (service.instances.size === 0) {
          this.services.delete(serviceName);
          this.metrics.totalServices--;
        }
      }
      
      // Update metrics
      this.metrics.totalInstances--;
      if (serviceInstance.status === 'healthy') {
        this.metrics.healthyInstances--;
      } else {
        this.metrics.unhealthyInstances--;
      }
      this.metrics.deregistrations++;
      
      // Remove from Redis
      if (this.isRedisConnected) {
        await this.removePersistedServiceInstance(instanceId);
      }
      
      // Cancel health checks
      this.cancelHealthCheck(instanceId);
      
      // Emit deregistration event
      this.emit('service:deregistered', {
        instanceId,
        serviceName,
        instance: serviceInstance,
      });
      
      logger.info('Service deregistered successfully', {
        instanceId,
        serviceName,
        host: serviceInstance.host,
        port: serviceInstance.port,
      });
      
      span.setAttributes({
        'service.name': serviceName,
        'service.instance_id': instanceId,
      });
      
      return {
        status: 'deregistered',
        instanceId,
        serviceName,
      };
      
    } catch (error) {
      this.metrics.errors++;
      span.recordException(error);
      
      logger.error('Service deregistration failed', {
        instanceId,
        error: error.message,
      });
      
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Discover services by name
   */
  async discoverServices(serviceName, options = {}) {
    const span = telemetryService.startSpan('service_registry_discover');
    
    try {
      this.metrics.discoveries++;
      
      const service = this.services.get(serviceName);
      
      if (!service || service.instances.size === 0) {
        return {
          serviceName,
          instances: [],
          totalInstances: 0,
          healthyInstances: 0,
        };
      }
      
      // Get all instances
      const instances = Array.from(service.instances)
        .map(instanceId => this.serviceInstances.get(instanceId))
        .filter(instance => instance); // Filter out null instances
      
      // Filter by health status
      let filteredInstances = instances;
      if (options.healthyOnly !== false) {
        filteredInstances = instances.filter(instance => instance.status === 'healthy');
      }
      
      // Filter by zone
      if (options.zone) {
        filteredInstances = filteredInstances.filter(instance => instance.zone === options.zone);
      }
      
      // Filter by tags
      if (options.tags && options.tags.length > 0) {
        filteredInstances = filteredInstances.filter(instance => 
          options.tags.every(tag => instance.tags.includes(tag))
        );
      }
      
      // Filter by version
      if (options.version) {
        filteredInstances = filteredInstances.filter(instance => instance.version === options.version);
      }
      
      // Apply load balancing if requested
      if (options.loadBalance && filteredInstances.length > 1) {
        const strategy = options.strategy || config.registry.loadBalancing.strategy;
        const selectedInstance = this.applyLoadBalancing(serviceName, filteredInstances, strategy);
        filteredInstances = selectedInstance ? [selectedInstance] : [];
      }
      
      // Format response
      const response = {
        serviceName,
        instances: filteredInstances.map(instance => ({
          id: instance.id,
          host: instance.host,
          port: instance.port,
          protocol: instance.protocol,
          version: instance.version,
          status: instance.status,
          metadata: instance.metadata,
          tags: instance.tags,
          zone: instance.zone,
          weight: instance.weight,
          connections: instance.connections,
          lastHealthCheck: instance.lastHealthCheck,
          url: `${instance.protocol}://${instance.host}:${instance.port}`,
        })),
        totalInstances: instances.length,
        healthyInstances: instances.filter(i => i.status === 'healthy').length,
        loadBalancing: {
          strategy: config.registry.loadBalancing.strategy,
          applied: options.loadBalance || false,
        },
      };
      
      span.setAttributes({
        'service.name': serviceName,
        'service.instances_found': response.instances.length,
        'service.total_instances': response.totalInstances,
        'service.healthy_instances': response.healthyInstances,
      });
      
      logger.debug('Service discovery completed', {
        serviceName,
        instancesFound: response.instances.length,
        totalInstances: response.totalInstances,
        healthyInstances: response.healthyInstances,
        options,
      });
      
      return response;
      
    } catch (error) {
      this.metrics.errors++;
      span.recordException(error);
      
      logger.error('Service discovery failed', {
        serviceName,
        error: error.message,
        options,
      });
      
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Update service heartbeat
   */
  async updateHeartbeat(instanceId) {
    try {
      const serviceInstance = this.serviceInstances.get(instanceId);
      
      if (!serviceInstance) {
        throw new Error(`Service instance ${instanceId} not found`);
      }
      
      serviceInstance.lastHeartbeat = new Date();
      
      // Reset health check failures on successful heartbeat
      if (serviceInstance.healthCheckFailures > 0) {
        serviceInstance.healthCheckFailures = 0;
        
        // Mark as healthy if it was unhealthy
        if (serviceInstance.status === 'unhealthy') {
          serviceInstance.status = 'healthy';
          this.metrics.healthyInstances++;
          this.metrics.unhealthyInstances--;
          
          this.emit('service:health_restored', {
            instanceId,
            serviceName: serviceInstance.name,
            instance: serviceInstance,
          });
        }
      }
      
      // Persist to Redis
      if (this.isRedisConnected) {
        await this.persistServiceInstance(serviceInstance);
      }
      
      logger.debug('Heartbeat updated', {
        instanceId,
        serviceName: serviceInstance.name,
        lastHeartbeat: serviceInstance.lastHeartbeat,
      });
      
      return {
        status: 'success',
        instanceId,
        lastHeartbeat: serviceInstance.lastHeartbeat,
      };
      
    } catch (error) {
      this.metrics.errors++;
      
      logger.error('Heartbeat update failed', {
        instanceId,
        error: error.message,
      });
      
      throw error;
    }
  }

  /**
   * Get all registered services
   */
  getAllServices() {
    const services = {};
    
    for (const [serviceName, service] of this.services) {
      const instances = Array.from(service.instances)
        .map(instanceId => this.serviceInstances.get(instanceId))
        .filter(instance => instance);
      
      services[serviceName] = {
        name: serviceName,
        totalInstances: instances.length,
        healthyInstances: instances.filter(i => i.status === 'healthy').length,
        unhealthyInstances: instances.filter(i => i.status === 'unhealthy').length,
        instances: instances.map(instance => ({
          id: instance.id,
          host: instance.host,
          port: instance.port,
          protocol: instance.protocol,
          version: instance.version,
          status: instance.status,
          zone: instance.zone,
          registeredAt: instance.registeredAt,
          lastHeartbeat: instance.lastHeartbeat,
          lastHealthCheck: instance.lastHealthCheck,
        })),
      };
    }
    
    return services;
  }

  /**
   * Get service registry metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      services: this.services.size,
      instances: this.serviceInstances.size,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Validate service registration data
   */
  validateServiceData(serviceData) {
    if (!serviceData.name) {
      throw new Error('Service name is required');
    }
    
    if (!serviceData.host) {
      throw new Error('Service host is required');
    }
    
    if (!serviceData.port || !Number.isInteger(serviceData.port) || serviceData.port <= 0) {
      throw new Error('Valid service port is required');
    }
    
    if (config.registry.allowedServices.length > 0 && 
        !config.registry.allowedServices.includes(serviceData.name)) {
      throw new Error(`Service ${serviceData.name} is not allowed`);
    }
    
    if (serviceData.protocol && !['http', 'https', 'tcp', 'grpc'].includes(serviceData.protocol)) {
      throw new Error('Invalid protocol. Supported: http, https, tcp, grpc');
    }
  }

  /**
   * Apply load balancing strategy
   */
  applyLoadBalancing(serviceName, instances, strategy) {
    const loadBalancer = this.loadBalancers.get(serviceName) || { currentIndex: 0 };
    this.loadBalancers.set(serviceName, loadBalancer);
    
    const strategyFunction = this.loadBalancingStrategies[strategy] || this.loadBalancingStrategies.round_robin;
    return strategyFunction(instances, loadBalancer);
  }

  /**
   * Round robin load balancing strategy
   */
  roundRobinStrategy(instances, loadBalancer) {
    if (instances.length === 0) return null;
    
    const instance = instances[loadBalancer.currentIndex % instances.length];
    loadBalancer.currentIndex = (loadBalancer.currentIndex + 1) % instances.length;
    
    return instance;
  }

  /**
   * Least connections load balancing strategy
   */
  leastConnectionsStrategy(instances) {
    if (instances.length === 0) return null;
    
    return instances.reduce((least, current) => 
      current.connections < least.connections ? current : least
    );
  }

  /**
   * Random load balancing strategy
   */
  randomStrategy(instances) {
    if (instances.length === 0) return null;
    
    const randomIndex = Math.floor(Math.random() * instances.length);
    return instances[randomIndex];
  }

  /**
   * Weighted load balancing strategy
   */
  weightedStrategy(instances) {
    if (instances.length === 0) return null;
    
    const totalWeight = instances.reduce((sum, instance) => sum + instance.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const instance of instances) {
      random -= instance.weight;
      if (random <= 0) {
        return instance;
      }
    }
    
    return instances[instances.length - 1];
  }

  /**
   * Perform health check on a service instance
   */
  async performHealthCheck(instanceId) {
    const serviceInstance = this.serviceInstances.get(instanceId);
    
    if (!serviceInstance) {
      return;
    }
    
    try {
      this.metrics.healthChecks++;
      
      const response = await axios.get(serviceInstance.healthCheckUrl, {
        timeout: config.healthCheck.timeout,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      
      // Health check passed
      serviceInstance.lastHealthCheck = new Date();
      serviceInstance.healthCheckFailures = 0;
      
      if (serviceInstance.status === 'unhealthy') {
        serviceInstance.status = 'healthy';
        this.metrics.healthyInstances++;
        this.metrics.unhealthyInstances--;
        
        this.emit('service:health_restored', {
          instanceId,
          serviceName: serviceInstance.name,
          instance: serviceInstance,
        });
        
        logger.info('Service health restored', {
          instanceId,
          serviceName: serviceInstance.name,
          host: serviceInstance.host,
          port: serviceInstance.port,
        });
      }
      
    } catch (error) {
      // Health check failed
      serviceInstance.healthCheckFailures++;
      serviceInstance.lastHealthCheck = new Date();
      
      if (serviceInstance.healthCheckFailures >= config.registry.maxRetries) {
        if (serviceInstance.status === 'healthy') {
          serviceInstance.status = 'unhealthy';
          this.metrics.healthyInstances--;
          this.metrics.unhealthyInstances++;
          
          this.emit('service:health_failed', {
            instanceId,
            serviceName: serviceInstance.name,
            instance: serviceInstance,
            error: error.message,
          });
          
          logger.warn('Service marked as unhealthy', {
            instanceId,
            serviceName: serviceInstance.name,
            host: serviceInstance.host,
            port: serviceInstance.port,
            failures: serviceInstance.healthCheckFailures,
            error: error.message,
          });
        }
      }
    }
    
    // Persist updated instance
    if (this.isRedisConnected) {
      await this.persistServiceInstance(serviceInstance);
    }
  }

  /**
   * Schedule health check for a service instance
   */
  scheduleHealthCheck(instanceId) {
    if (!config.healthCheck.enabled) {
      return;
    }
    
    const interval = setInterval(async () => {
      await this.performHealthCheck(instanceId);
    }, config.healthCheck.interval);
    
    this.healthChecks.set(instanceId, interval);
  }

  /**
   * Cancel health check for a service instance
   */
  cancelHealthCheck(instanceId) {
    const interval = this.healthChecks.get(instanceId);
    if (interval) {
      clearInterval(interval);
      this.healthChecks.delete(instanceId);
    }
  }

  /**
   * Start health check scheduler
   */
  startHealthCheckScheduler() {
    if (!config.healthCheck.enabled) {
      return;
    }
    
    // Run health checks every minute
    cron.schedule('*/1 * * * *', async () => {
      logger.debug('Running scheduled health checks', {
        totalInstances: this.serviceInstances.size,
      });
      
      const healthCheckPromises = Array.from(this.serviceInstances.keys())
        .map(instanceId => this.performHealthCheck(instanceId));
      
      await Promise.allSettled(healthCheckPromises);
    });
    
    logger.info('Health check scheduler started', {
      interval: config.healthCheck.interval,
      timeout: config.healthCheck.timeout,
      maxRetries: config.registry.maxRetries,
    });
  }

  /**
   * Start cleanup scheduler
   */
  startCleanupScheduler() {
    // Clean up expired services every 2 minutes
    cron.schedule('*/2 * * * *', async () => {
      await this.cleanupExpiredServices();
    });
    
    logger.info('Cleanup scheduler started', {
      interval: config.registry.cleanupInterval,
      defaultTtl: config.registry.defaultTtl,
    });
  }

  /**
   * Start metrics collector
   */
  startMetricsCollector() {
    if (!config.monitoring.enabled) {
      return;
    }
    
    // Collect metrics every minute
    cron.schedule('*/1 * * * *', () => {
      this.collectMetrics();
    });
    
    logger.info('Metrics collector started', {
      interval: config.monitoring.metricsInterval,
    });
  }

  /**
   * Clean up expired services
   */
  async cleanupExpiredServices() {
    const now = new Date();
    const expiredInstances = [];
    
    for (const [instanceId, instance] of this.serviceInstances) {
      const timeSinceHeartbeat = now - instance.lastHeartbeat;
      const ttlMs = instance.ttl * 1000;
      
      if (timeSinceHeartbeat > ttlMs) {
        expiredInstances.push(instanceId);
      }
    }
    
    if (expiredInstances.length > 0) {
      logger.info('Cleaning up expired services', {
        expiredCount: expiredInstances.length,
        instances: expiredInstances,
      });
      
      for (const instanceId of expiredInstances) {
        try {
          await this.deregisterService(instanceId);
        } catch (error) {
          logger.error('Failed to cleanup expired service', {
            instanceId,
            error: error.message,
          });
        }
      }
    }
  }

  /**
   * Collect metrics
   */
  collectMetrics() {
    // Update current metrics
    this.metrics.totalServices = this.services.size;
    this.metrics.totalInstances = this.serviceInstances.size;
    
    let healthyCount = 0;
    let unhealthyCount = 0;
    
    for (const instance of this.serviceInstances.values()) {
      if (instance.status === 'healthy') {
        healthyCount++;
      } else {
        unhealthyCount++;
      }
    }
    
    this.metrics.healthyInstances = healthyCount;
    this.metrics.unhealthyInstances = unhealthyCount;
    
    // Emit metrics event
    this.emit('metrics:collected', this.metrics);
  }

  /**
   * Persist service instance to Redis
   */
  async persistServiceInstance(serviceInstance) {
    if (!this.isRedisConnected) {
      return;
    }
    
    try {
      const key = `instance:${serviceInstance.id}`;
      const data = JSON.stringify(serviceInstance);
      
      await this.redis.setex(key, serviceInstance.ttl, data);
      
    } catch (error) {
      logger.error('Failed to persist service instance', {
        instanceId: serviceInstance.id,
        error: error.message,
      });
    }
  }

  /**
   * Remove persisted service instance from Redis
   */
  async removePersistedServiceInstance(instanceId) {
    if (!this.isRedisConnected) {
      return;
    }
    
    try {
      const key = `instance:${instanceId}`;
      await this.redis.del(key);
      
    } catch (error) {
      logger.error('Failed to remove persisted service instance', {
        instanceId,
        error: error.message,
      });
    }
  }

  /**
   * Load persisted services from Redis
   */
  async loadPersistedServices() {
    if (!this.isRedisConnected) {
      return;
    }
    
    try {
      const keys = await this.redis.keys('instance:*');
      
      if (keys.length === 0) {
        logger.info('No persisted services found in Redis');
        return;
      }
      
      const pipeline = this.redis.pipeline();
      keys.forEach(key => pipeline.get(key));
      
      const results = await pipeline.exec();
      let loadedCount = 0;
      
      for (let i = 0; i < results.length; i++) {
        const [error, data] = results[i];
        
        if (error || !data) {
          continue;
        }
        
        try {
          const serviceInstance = JSON.parse(data);
          
          // Check if instance is still valid (not expired)
          const now = new Date();
          const timeSinceHeartbeat = now - new Date(serviceInstance.lastHeartbeat);
          const ttlMs = serviceInstance.ttl * 1000;
          
          if (timeSinceHeartbeat <= ttlMs) {
            // Restore instance
            this.serviceInstances.set(serviceInstance.id, serviceInstance);
            
            // Update service list
            if (!this.services.has(serviceInstance.name)) {
              this.services.set(serviceInstance.name, {
                name: serviceInstance.name,
                instances: new Set(),
                loadBalancer: {
                  strategy: config.registry.loadBalancing.strategy,
                  currentIndex: 0,
                },
              });
            }
            
            this.services.get(serviceInstance.name).instances.add(serviceInstance.id);
            
            // Schedule health check
            this.scheduleHealthCheck(serviceInstance.id);
            
            loadedCount++;
          } else {
            // Remove expired instance from Redis
            await this.redis.del(keys[i]);
          }
          
        } catch (parseError) {
          logger.error('Failed to parse persisted service instance', {
            key: keys[i],
            error: parseError.message,
          });
        }
      }
      
      logger.info('Loaded persisted services from Redis', {
        totalKeys: keys.length,
        loadedInstances: loadedCount,
        services: this.services.size,
      });
      
    } catch (error) {
      logger.error('Failed to load persisted services', {
        error: error.message,
      });
    }
  }

  /**
   * Get health status of the registry
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      services: this.services.size,
      instances: this.serviceInstances.size,
      healthyInstances: this.metrics.healthyInstances,
      unhealthyInstances: this.metrics.unhealthyInstances,
      redis: {
        enabled: config.redis.enabled,
        connected: this.isRedisConnected,
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Shutdown the service registry
   */
  async shutdown() {
    logger.info('Shutting down Service Registry');
    
    // Cancel all health checks
    for (const interval of this.healthChecks.values()) {
      clearInterval(interval);
    }
    this.healthChecks.clear();
    
    // Close Redis connection
    if (this.redis) {
      await this.redis.quit();
    }
    
    // Clear in-memory data
    this.services.clear();
    this.serviceInstances.clear();
    this.loadBalancers.clear();
    
    logger.info('Service Registry shutdown completed');
  }
}

module.exports = ServiceRegistry;