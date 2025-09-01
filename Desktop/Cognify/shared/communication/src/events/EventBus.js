import EventEmitter from 'eventemitter3';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

/**
 * Distributed event bus for inter-service communication
 */
class EventBus extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      serviceName: process.env.SERVICE_NAME || 'unknown-service',
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        db: process.env.REDIS_DB || 0,
        keyPrefix: 'events:',
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      },
      namespace: 'cognify',
      enableLocalEvents: true,
      enableDistributedEvents: true,
      messageTimeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      ...options
    };

    this.logger = options.logger;
    this.metrics = options.metrics;
    
    // Redis clients
    this.publisher = null;
    this.subscriber = null;
    this.connected = false;
    
    // Event tracking
    this.subscriptions = new Map();
    this.pendingMessages = new Map();
    this.messageHandlers = new Map();
    
    // Statistics
    this.stats = {
      localEventsEmitted: 0,
      distributedEventsEmitted: 0,
      eventsReceived: 0,
      subscriptions: 0,
      errors: 0,
      connectionAttempts: 0,
      reconnections: 0
    };

    // Initialize Redis connections if distributed events are enabled
    if (this.options.enableDistributedEvents) {
      this._initializeRedis();
    }
  }

  /**
   * Initialize Redis connections
   */
  async _initializeRedis() {
    try {
      this.stats.connectionAttempts++;
      
      // Create publisher client
      this.publisher = new Redis({
        ...this.options.redis,
        lazyConnect: true
      });

      // Create subscriber client
      this.subscriber = new Redis({
        ...this.options.redis,
        lazyConnect: true
      });

      // Setup event handlers
      this._setupRedisEventHandlers();

      // Connect to Redis
      await Promise.all([
        this.publisher.connect(),
        this.subscriber.connect()
      ]);

      this.connected = true;

      if (this.logger) {
        this.logger.info('EventBus connected to Redis', {
          host: this.options.redis.host,
          port: this.options.redis.port,
          serviceName: this.options.serviceName
        });
      }

      this.emit('connected');
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Failed to connect to Redis', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }

      this.emit('connectionError', error);
      throw error;
    }
  }

  /**
   * Setup Redis event handlers
   */
  _setupRedisEventHandlers() {
    // Publisher events
    this.publisher.on('connect', () => {
      if (this.logger) {
        this.logger.debug('Redis publisher connected');
      }
    });

    this.publisher.on('error', (error) => {
      this.stats.errors++;
      if (this.logger) {
        this.logger.error('Redis publisher error', { error: error.message });
      }
      this.emit('publisherError', error);
    });

    this.publisher.on('reconnecting', () => {
      this.stats.reconnections++;
      if (this.logger) {
        this.logger.info('Redis publisher reconnecting');
      }
    });

    // Subscriber events
    this.subscriber.on('connect', () => {
      if (this.logger) {
        this.logger.debug('Redis subscriber connected');
      }
    });

    this.subscriber.on('error', (error) => {
      this.stats.errors++;
      if (this.logger) {
        this.logger.error('Redis subscriber error', { error: error.message });
      }
      this.emit('subscriberError', error);
    });

    this.subscriber.on('reconnecting', () => {
      this.stats.reconnections++;
      if (this.logger) {
        this.logger.info('Redis subscriber reconnecting');
      }
    });

    // Message handling
    this.subscriber.on('message', (channel, message) => {
      this._handleDistributedMessage(channel, message);
    });

    this.subscriber.on('pmessage', (pattern, channel, message) => {
      this._handleDistributedMessage(channel, message, pattern);
    });
  }

  /**
   * Emit an event (local and/or distributed)
   * @param {string} eventName - Name of the event
   * @param {*} data - Event data
   * @param {Object} options - Emission options
   * @returns {Promise<boolean>} Success status
   */
  async emit(eventName, data = null, options = {}) {
    const {
      local = this.options.enableLocalEvents,
      distributed = this.options.enableDistributedEvents,
      timeout = this.options.messageTimeout,
      persistent = false,
      priority = 'normal',
      metadata = {}
    } = options;

    const eventId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const eventMessage = {
      id: eventId,
      name: eventName,
      data,
      metadata: {
        ...metadata,
        serviceName: this.options.serviceName,
        timestamp,
        priority,
        persistent
      }
    };

    let success = true;

    try {
      // Emit local event
      if (local) {
        super.emit(eventName, eventMessage);
        this.stats.localEventsEmitted++;
        
        if (this.logger) {
          this.logger.debug('Local event emitted', {
            eventId,
            eventName,
            serviceName: this.options.serviceName
          });
        }
      }

      // Emit distributed event
      if (distributed && this.connected) {
        await this._emitDistributedEvent(eventName, eventMessage, options);
        this.stats.distributedEventsEmitted++;
        
        if (this.logger) {
          this.logger.debug('Distributed event emitted', {
            eventId,
            eventName,
            serviceName: this.options.serviceName
          });
        }
      }

      // Record metrics
      if (this.metrics) {
        this.metrics.recordEventEmission({
          eventName,
          serviceName: this.options.serviceName,
          local,
          distributed,
          success: true
        });
      }

      return true;
    } catch (error) {
      this.stats.errors++;
      success = false;
      
      if (this.logger) {
        this.logger.error('Event emission failed', {
          eventId,
          eventName,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }

      // Record metrics
      if (this.metrics) {
        this.metrics.recordEventEmission({
          eventName,
          serviceName: this.options.serviceName,
          local,
          distributed,
          success: false,
          error: error.message
        });
      }

      throw error;
    }
  }

  /**
   * Subscribe to an event
   * @param {string} eventName - Name of the event or pattern
   * @param {Function} handler - Event handler function
   * @param {Object} options - Subscription options
   * @returns {string} Subscription ID
   */
  async subscribe(eventName, handler, options = {}) {
    const {
      local = this.options.enableLocalEvents,
      distributed = this.options.enableDistributedEvents,
      pattern = false,
      once = false,
      priority = 'normal'
    } = options;

    const subscriptionId = uuidv4();
    
    const subscription = {
      id: subscriptionId,
      eventName,
      handler,
      options: { local, distributed, pattern, once, priority },
      createdAt: new Date().toISOString(),
      serviceName: this.options.serviceName
    };

    this.subscriptions.set(subscriptionId, subscription);
    this.stats.subscriptions++;

    try {
      // Subscribe to local events
      if (local) {
        if (once) {
          super.once(eventName, handler);
        } else {
          super.on(eventName, handler);
        }
      }

      // Subscribe to distributed events
      if (distributed && this.connected) {
        await this._subscribeDistributedEvent(eventName, subscriptionId, options);
      }

      if (this.logger) {
        this.logger.info('Event subscription created', {
          subscriptionId,
          eventName,
          pattern,
          local,
          distributed,
          serviceName: this.options.serviceName
        });
      }

      // Record metrics
      if (this.metrics) {
        this.metrics.recordEventSubscription({
          eventName,
          serviceName: this.options.serviceName,
          local,
          distributed,
          pattern
        });
      }

      return subscriptionId;
    } catch (error) {
      this.stats.errors++;
      
      // Clean up on error
      this.subscriptions.delete(subscriptionId);
      
      if (this.logger) {
        this.logger.error('Event subscription failed', {
          eventName,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }

      throw error;
    }
  }

  /**
   * Unsubscribe from an event
   * @param {string} subscriptionId - Subscription ID
   * @returns {Promise<boolean>} Success status
   */
  async unsubscribe(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    
    if (!subscription) {
      if (this.logger) {
        this.logger.warn('Subscription not found', { subscriptionId });
      }
      return false;
    }

    try {
      // Unsubscribe from local events
      if (subscription.options.local) {
        super.off(subscription.eventName, subscription.handler);
      }

      // Unsubscribe from distributed events
      if (subscription.options.distributed && this.connected) {
        await this._unsubscribeDistributedEvent(subscription.eventName, subscription.options);
      }

      this.subscriptions.delete(subscriptionId);
      
      if (this.logger) {
        this.logger.info('Event subscription removed', {
          subscriptionId,
          eventName: subscription.eventName,
          serviceName: this.options.serviceName
        });
      }

      return true;
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Event unsubscription failed', {
          subscriptionId,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }

      throw error;
    }
  }

  /**
   * Emit distributed event via Redis
   * @param {string} eventName - Event name
   * @param {Object} eventMessage - Event message
   * @param {Object} options - Emission options
   */
  async _emitDistributedEvent(eventName, eventMessage, options = {}) {
    const channel = this._getChannelName(eventName);
    const message = JSON.stringify(eventMessage);

    if (options.persistent) {
      // Store persistent message
      const key = `${this.options.redis.keyPrefix}persistent:${eventName}:${eventMessage.id}`;
      await this.publisher.setex(key, options.ttl || 3600, message);
    }

    await this.publisher.publish(channel, message);
  }

  /**
   * Subscribe to distributed event via Redis
   * @param {string} eventName - Event name or pattern
   * @param {string} subscriptionId - Subscription ID
   * @param {Object} options - Subscription options
   */
  async _subscribeDistributedEvent(eventName, subscriptionId, options = {}) {
    const channel = this._getChannelName(eventName);
    
    if (options.pattern) {
      await this.subscriber.psubscribe(channel);
    } else {
      await this.subscriber.subscribe(channel);
    }

    // Store handler mapping
    this.messageHandlers.set(channel, {
      subscriptionId,
      handler: this.subscriptions.get(subscriptionId).handler,
      options
    });
  }

  /**
   * Unsubscribe from distributed event via Redis
   * @param {string} eventName - Event name or pattern
   * @param {Object} options - Subscription options
   */
  async _unsubscribeDistributedEvent(eventName, options = {}) {
    const channel = this._getChannelName(eventName);
    
    if (options.pattern) {
      await this.subscriber.punsubscribe(channel);
    } else {
      await this.subscriber.unsubscribe(channel);
    }

    this.messageHandlers.delete(channel);
  }

  /**
   * Handle distributed message from Redis
   * @param {string} channel - Redis channel
   * @param {string} message - Message content
   * @param {string} pattern - Pattern (for pattern subscriptions)
   */
  _handleDistributedMessage(channel, message, pattern = null) {
    try {
      const eventMessage = JSON.parse(message);
      
      // Skip messages from same service to avoid loops
      if (eventMessage.metadata?.serviceName === this.options.serviceName) {
        return;
      }

      this.stats.eventsReceived++;
      
      const handlerInfo = this.messageHandlers.get(channel);
      if (handlerInfo && handlerInfo.handler) {
        // Call the handler
        handlerInfo.handler(eventMessage);
        
        // Remove subscription if it's a 'once' subscription
        if (handlerInfo.options.once) {
          this.unsubscribe(handlerInfo.subscriptionId).catch(error => {
            if (this.logger) {
              this.logger.error('Failed to remove once subscription', {
                error: error.message,
                subscriptionId: handlerInfo.subscriptionId
              });
            }
          });
        }
      }

      if (this.logger) {
        this.logger.debug('Distributed event received', {
          eventId: eventMessage.id,
          eventName: eventMessage.name,
          channel,
          pattern,
          fromService: eventMessage.metadata?.serviceName
        });
      }

      // Record metrics
      if (this.metrics) {
        this.metrics.recordEventReception({
          eventName: eventMessage.name,
          serviceName: this.options.serviceName,
          fromService: eventMessage.metadata?.serviceName,
          distributed: true
        });
      }
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Failed to handle distributed message', {
          channel,
          error: error.message,
          message: message.substring(0, 200) // Log first 200 chars
        });
      }
    }
  }

  /**
   * Get Redis channel name for event
   * @param {string} eventName - Event name
   * @returns {string} Channel name
   */
  _getChannelName(eventName) {
    return `${this.options.namespace}:${eventName}`;
  }

  /**
   * Get event bus statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      connected: this.connected,
      activeSubscriptions: this.subscriptions.size,
      messageHandlers: this.messageHandlers.size,
      serviceName: this.options.serviceName
    };
  }

  /**
   * Get active subscriptions
   * @returns {Array} Array of subscription info
   */
  getSubscriptions() {
    return Array.from(this.subscriptions.values()).map(sub => ({
      id: sub.id,
      eventName: sub.eventName,
      options: sub.options,
      createdAt: sub.createdAt,
      serviceName: sub.serviceName
    }));
  }

  /**
   * Check if event bus is healthy
   * @returns {Object} Health status
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: []
    };

    // Check Redis connection
    if (this.options.enableDistributedEvents) {
      try {
        await Promise.all([
          this.publisher.ping(),
          this.subscriber.ping()
        ]);
        
        health.checks.push({
          name: 'redis_connection',
          status: 'healthy',
          message: 'Redis connection is active'
        });
      } catch (error) {
        health.status = 'unhealthy';
        health.checks.push({
          name: 'redis_connection',
          status: 'unhealthy',
          message: `Redis connection failed: ${error.message}`
        });
      }
    }

    // Check error rate
    const errorRate = this.stats.errors / Math.max(1, this.stats.localEventsEmitted + this.stats.distributedEventsEmitted);
    if (errorRate > 0.1) { // More than 10% error rate
      health.status = 'degraded';
      health.checks.push({
        name: 'error_rate',
        status: 'degraded',
        message: `High error rate: ${(errorRate * 100).toFixed(2)}%`
      });
    } else {
      health.checks.push({
        name: 'error_rate',
        status: 'healthy',
        message: `Error rate: ${(errorRate * 100).toFixed(2)}%`
      });
    }

    return health;
  }

  /**
   * Close event bus and cleanup resources
   */
  async close() {
    try {
      // Unsubscribe from all events
      const subscriptionIds = Array.from(this.subscriptions.keys());
      await Promise.all(
        subscriptionIds.map(id => this.unsubscribe(id).catch(() => {}))
      );

      // Close Redis connections
      if (this.publisher) {
        await this.publisher.quit();
      }
      if (this.subscriber) {
        await this.subscriber.quit();
      }

      this.connected = false;
      this.removeAllListeners();

      if (this.logger) {
        this.logger.info('EventBus closed', {
          serviceName: this.options.serviceName
        });
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error('Error closing EventBus', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      throw error;
    }
  }
}

export default EventBus;