import EventEmitter from 'eventemitter3';
import { createLogger } from '../utils/logger.js';
import { createMetrics } from '../utils/metrics.js';

/**
 * Subscription manager for handling complex event subscriptions and filtering
 */
class SubscriptionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      serviceName: process.env.SERVICE_NAME || 'subscription-manager',
      enableMetrics: process.env.SUBSCRIPTION_METRICS !== 'false',
      enableLogging: process.env.SUBSCRIPTION_LOGGING !== 'false',
      maxSubscriptionsPerAgent: parseInt(process.env.MAX_SUBSCRIPTIONS_PER_AGENT) || 100,
      subscriptionTtl: parseInt(process.env.SUBSCRIPTION_TTL) || 3600000, // 1 hour
      enableFiltering: process.env.SUBSCRIPTION_FILTERING !== 'false',
      enableTransformation: process.env.SUBSCRIPTION_TRANSFORMATION !== 'false',
      enablePersistence: process.env.SUBSCRIPTION_PERSISTENCE !== 'false',
      cleanupInterval: parseInt(process.env.SUBSCRIPTION_CLEANUP_INTERVAL) || 300000, // 5 minutes
      ...options
    };

    // Initialize logger and metrics
    this.logger = options.logger || (this.options.enableLogging ? createLogger({
      serviceName: this.options.serviceName
    }) : null);
    
    this.metrics = options.metrics || (this.options.enableMetrics ? createMetrics({
      serviceName: this.options.serviceName,
      logger: this.logger
    }) : null);

    // Subscription storage
    this.subscriptions = new Map(); // subscriptionId -> subscription
    this.agentSubscriptions = new Map(); // agentId -> Set of subscriptionIds
    this.patternSubscriptions = new Map(); // pattern -> Set of subscriptionIds
    this.topicSubscriptions = new Map(); // topic -> Set of subscriptionIds
    
    // Subscription filters and transformers
    this.filters = new Map();
    this.transformers = new Map();
    
    // Statistics
    this.stats = {
      subscriptionsCreated: 0,
      subscriptionsRemoved: 0,
      subscriptionsActive: 0,
      subscriptionsExpired: 0,
      eventsFiltered: 0,
      eventsTransformed: 0,
      filterErrors: 0,
      transformErrors: 0
    };

    // Start cleanup interval
    if (this.options.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this._cleanupExpiredSubscriptions();
      }, this.options.cleanupInterval);
    }
    
    if (this.logger) {
      this.logger.info('Subscription manager initialized', {
        serviceName: this.options.serviceName,
        maxSubscriptionsPerAgent: this.options.maxSubscriptionsPerAgent
      });
    }
  }

  /**
   * Create a subscription
   * @param {string} agentId - Agent identifier
   * @param {Object} subscriptionConfig - Subscription configuration
   * @returns {string} Subscription ID
   */
  createSubscription(agentId, subscriptionConfig) {
    const {
      pattern,
      topic,
      filter,
      transform,
      priority = 'medium',
      ttl = this.options.subscriptionTtl,
      metadata = {}
    } = subscriptionConfig;

    // Validate subscription limits
    const agentSubs = this.agentSubscriptions.get(agentId) || new Set();
    if (agentSubs.size >= this.options.maxSubscriptionsPerAgent) {
      throw new Error(`Agent ${agentId} has reached maximum subscription limit`);
    }

    // Generate subscription ID
    const subscriptionId = this._generateSubscriptionId();
    
    // Create subscription object
    const subscription = {
      id: subscriptionId,
      agentId,
      pattern,
      topic,
      filter,
      transform,
      priority,
      ttl,
      metadata,
      createdAt: Date.now(),
      expiresAt: ttl > 0 ? Date.now() + ttl : null,
      lastUsed: Date.now(),
      eventCount: 0,
      filterCount: 0,
      transformCount: 0,
      errorCount: 0
    };

    // Store subscription
    this.subscriptions.set(subscriptionId, subscription);
    
    // Update agent subscriptions
    if (!this.agentSubscriptions.has(agentId)) {
      this.agentSubscriptions.set(agentId, new Set());
    }
    this.agentSubscriptions.get(agentId).add(subscriptionId);
    
    // Update pattern subscriptions
    if (pattern) {
      if (!this.patternSubscriptions.has(pattern)) {
        this.patternSubscriptions.set(pattern, new Set());
      }
      this.patternSubscriptions.get(pattern).add(subscriptionId);
    }
    
    // Update topic subscriptions
    if (topic) {
      if (!this.topicSubscriptions.has(topic)) {
        this.topicSubscriptions.set(topic, new Set());
      }
      this.topicSubscriptions.get(topic).add(subscriptionId);
    }

    // Register custom filter if provided
    if (filter && typeof filter === 'function') {
      this.filters.set(subscriptionId, filter);
    }
    
    // Register custom transformer if provided
    if (transform && typeof transform === 'function') {
      this.transformers.set(subscriptionId, transform);
    }

    // Update statistics
    this.stats.subscriptionsCreated++;
    this.stats.subscriptionsActive++;

    if (this.logger) {
      this.logger.debug('Subscription created', {
        subscriptionId,
        agentId,
        pattern,
        topic,
        priority,
        serviceName: this.options.serviceName
      });
    }

    if (this.metrics) {
      this.metrics.increment('subscriptions_created_total', {
        agent_id: agentId,
        priority
      });
    }

    this.emit('subscriptionCreated', { subscriptionId, subscription });
    
    return subscriptionId;
  }

  /**
   * Remove a subscription
   * @param {string} subscriptionId - Subscription ID
   * @returns {boolean} Success status
   */
  removeSubscription(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    // Remove from main storage
    this.subscriptions.delete(subscriptionId);
    
    // Remove from agent subscriptions
    const agentSubs = this.agentSubscriptions.get(subscription.agentId);
    if (agentSubs) {
      agentSubs.delete(subscriptionId);
      if (agentSubs.size === 0) {
        this.agentSubscriptions.delete(subscription.agentId);
      }
    }
    
    // Remove from pattern subscriptions
    if (subscription.pattern) {
      const patternSubs = this.patternSubscriptions.get(subscription.pattern);
      if (patternSubs) {
        patternSubs.delete(subscriptionId);
        if (patternSubs.size === 0) {
          this.patternSubscriptions.delete(subscription.pattern);
        }
      }
    }
    
    // Remove from topic subscriptions
    if (subscription.topic) {
      const topicSubs = this.topicSubscriptions.get(subscription.topic);
      if (topicSubs) {
        topicSubs.delete(subscriptionId);
        if (topicSubs.size === 0) {
          this.topicSubscriptions.delete(subscription.topic);
        }
      }
    }

    // Remove custom filter and transformer
    this.filters.delete(subscriptionId);
    this.transformers.delete(subscriptionId);

    // Update statistics
    this.stats.subscriptionsRemoved++;
    this.stats.subscriptionsActive--;

    if (this.logger) {
      this.logger.debug('Subscription removed', {
        subscriptionId,
        agentId: subscription.agentId,
        serviceName: this.options.serviceName
      });
    }

    if (this.metrics) {
      this.metrics.increment('subscriptions_removed_total', {
        agent_id: subscription.agentId
      });
    }

    this.emit('subscriptionRemoved', { subscriptionId, subscription });
    
    return true;
  }

  /**
   * Remove all subscriptions for an agent
   * @param {string} agentId - Agent ID
   * @returns {number} Number of subscriptions removed
   */
  removeAgentSubscriptions(agentId) {
    const agentSubs = this.agentSubscriptions.get(agentId);
    if (!agentSubs) {
      return 0;
    }

    const subscriptionIds = Array.from(agentSubs);
    let removedCount = 0;
    
    subscriptionIds.forEach(subscriptionId => {
      if (this.removeSubscription(subscriptionId)) {
        removedCount++;
      }
    });

    if (this.logger) {
      this.logger.debug('Agent subscriptions removed', {
        agentId,
        removedCount,
        serviceName: this.options.serviceName
      });
    }

    return removedCount;
  }

  /**
   * Find matching subscriptions for an event
   * @param {Object} event - Event object
   * @returns {Array} Matching subscriptions
   */
  findMatchingSubscriptions(event) {
    const matchingSubscriptions = new Set();
    
    // Match by pattern
    if (event.type) {
      for (const [pattern, subscriptionIds] of this.patternSubscriptions.entries()) {
        if (this._matchPattern(event.type, pattern)) {
          subscriptionIds.forEach(id => matchingSubscriptions.add(id));
        }
      }
    }
    
    // Match by topic
    if (event.topic) {
      const topicSubs = this.topicSubscriptions.get(event.topic);
      if (topicSubs) {
        topicSubs.forEach(id => matchingSubscriptions.add(id));
      }
    }

    // Convert to subscription objects and filter
    const subscriptions = Array.from(matchingSubscriptions)
      .map(id => this.subscriptions.get(id))
      .filter(sub => sub && !this._isExpired(sub))
      .filter(sub => this._applyFilter(sub, event))
      .sort((a, b) => this._comparePriority(a.priority, b.priority));

    return subscriptions;
  }

  /**
   * Apply filters and transformations to an event for a subscription
   * @param {Object} subscription - Subscription object
   * @param {Object} event - Event object
   * @returns {Object|null} Processed event or null if filtered out
   */
  processEvent(subscription, event) {
    try {
      // Update subscription usage
      subscription.lastUsed = Date.now();
      subscription.eventCount++;

      // Apply filter
      if (!this._applyFilter(subscription, event)) {
        subscription.filterCount++;
        this.stats.eventsFiltered++;
        return null;
      }

      // Apply transformation
      let processedEvent = event;
      if (this.options.enableTransformation && subscription.transform) {
        processedEvent = this._applyTransform(subscription, event);
        if (processedEvent) {
          subscription.transformCount++;
          this.stats.eventsTransformed++;
        }
      }

      return processedEvent;
    } catch (error) {
      subscription.errorCount++;
      
      if (this.logger) {
        this.logger.error('Event processing failed', {
          subscriptionId: subscription.id,
          eventId: event.id,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      return null;
    }
  }

  /**
   * Apply filter to event
   * @param {Object} subscription - Subscription object
   * @param {Object} event - Event object
   * @returns {boolean} Filter result
   */
  _applyFilter(subscription, event) {
    if (!this.options.enableFiltering || !subscription.filter) {
      return true;
    }

    try {
      // Built-in filters
      if (typeof subscription.filter === 'object') {
        return this._applyBuiltInFilter(subscription.filter, event);
      }
      
      // Custom filter function
      if (typeof subscription.filter === 'function') {
        return subscription.filter(event, subscription);
      }
      
      // Registered filter function
      const filterFn = this.filters.get(subscription.id);
      if (filterFn) {
        return filterFn(event, subscription);
      }
      
      return true;
    } catch (error) {
      this.stats.filterErrors++;
      
      if (this.logger) {
        this.logger.error('Filter application failed', {
          subscriptionId: subscription.id,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      return false;
    }
  }

  /**
   * Apply built-in filter
   * @param {Object} filter - Filter configuration
   * @param {Object} event - Event object
   * @returns {boolean} Filter result
   */
  _applyBuiltInFilter(filter, event) {
    // Priority filter
    if (filter.priority && event.priority) {
      const priorityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
      const eventPriority = priorityOrder[event.priority] || 0;
      const filterPriority = priorityOrder[filter.priority] || 0;
      
      if (eventPriority < filterPriority) {
        return false;
      }
    }
    
    // Source filter
    if (filter.source && event.source !== filter.source) {
      return false;
    }
    
    // Data filters
    if (filter.data) {
      for (const [key, value] of Object.entries(filter.data)) {
        if (event.data && event.data[key] !== value) {
          return false;
        }
      }
    }
    
    // Metadata filters
    if (filter.metadata) {
      for (const [key, value] of Object.entries(filter.metadata)) {
        if (event.metadata && event.metadata[key] !== value) {
          return false;
        }
      }
    }
    
    // Time range filter
    if (filter.timeRange) {
      const eventTime = event.timestamp || Date.now();
      if (filter.timeRange.start && eventTime < filter.timeRange.start) {
        return false;
      }
      if (filter.timeRange.end && eventTime > filter.timeRange.end) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Apply transformation to event
   * @param {Object} subscription - Subscription object
   * @param {Object} event - Event object
   * @returns {Object} Transformed event
   */
  _applyTransform(subscription, event) {
    try {
      // Built-in transformations
      if (typeof subscription.transform === 'object') {
        return this._applyBuiltInTransform(subscription.transform, event);
      }
      
      // Custom transform function
      if (typeof subscription.transform === 'function') {
        return subscription.transform(event, subscription);
      }
      
      // Registered transform function
      const transformFn = this.transformers.get(subscription.id);
      if (transformFn) {
        return transformFn(event, subscription);
      }
      
      return event;
    } catch (error) {
      this.stats.transformErrors++;
      
      if (this.logger) {
        this.logger.error('Transform application failed', {
          subscriptionId: subscription.id,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      return event;
    }
  }

  /**
   * Apply built-in transformation
   * @param {Object} transform - Transform configuration
   * @param {Object} event - Event object
   * @returns {Object} Transformed event
   */
  _applyBuiltInTransform(transform, event) {
    let transformedEvent = { ...event };
    
    // Field mapping
    if (transform.fieldMapping) {
      const newData = {};
      for (const [oldField, newField] of Object.entries(transform.fieldMapping)) {
        if (event.data && event.data[oldField] !== undefined) {
          newData[newField] = event.data[oldField];
        }
      }
      transformedEvent.data = { ...transformedEvent.data, ...newData };
    }
    
    // Field selection
    if (transform.selectFields && event.data) {
      const selectedData = {};
      transform.selectFields.forEach(field => {
        if (event.data[field] !== undefined) {
          selectedData[field] = event.data[field];
        }
      });
      transformedEvent.data = selectedData;
    }
    
    // Add metadata
    if (transform.addMetadata) {
      transformedEvent.metadata = {
        ...transformedEvent.metadata,
        ...transform.addMetadata
      };
    }
    
    // Format transformation
    if (transform.format) {
      switch (transform.format) {
        case 'flatten':
          transformedEvent = this._flattenEvent(transformedEvent);
          break;
        case 'normalize':
          transformedEvent = this._normalizeEvent(transformedEvent);
          break;
      }
    }
    
    return transformedEvent;
  }

  /**
   * Flatten event structure
   * @param {Object} event - Event object
   * @returns {Object} Flattened event
   */
  _flattenEvent(event) {
    const flattened = { ...event };
    
    if (event.data && typeof event.data === 'object') {
      const flatData = {};
      this._flattenObject(event.data, flatData, '');
      flattened.data = flatData;
    }
    
    return flattened;
  }

  /**
   * Flatten object recursively
   * @param {Object} obj - Object to flatten
   * @param {Object} result - Result object
   * @param {string} prefix - Key prefix
   */
  _flattenObject(obj, result, prefix) {
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this._flattenObject(value, result, newKey);
      } else {
        result[newKey] = value;
      }
    }
  }

  /**
   * Normalize event structure
   * @param {Object} event - Event object
   * @returns {Object} Normalized event
   */
  _normalizeEvent(event) {
    return {
      id: event.id,
      type: event.type,
      timestamp: event.timestamp || Date.now(),
      source: event.source,
      data: event.data || {},
      metadata: event.metadata || {}
    };
  }

  /**
   * Check if subscription is expired
   * @param {Object} subscription - Subscription object
   * @returns {boolean} Expiration status
   */
  _isExpired(subscription) {
    return subscription.expiresAt && Date.now() > subscription.expiresAt;
  }

  /**
   * Compare subscription priorities
   * @param {string} priority1 - First priority
   * @param {string} priority2 - Second priority
   * @returns {number} Comparison result
   */
  _comparePriority(priority1, priority2) {
    const priorityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
    const p1 = priorityOrder[priority1] || 0;
    const p2 = priorityOrder[priority2] || 0;
    return p2 - p1; // Higher priority first
  }

  /**
   * Match event type against pattern
   * @param {string} eventType - Event type
   * @param {string} pattern - Pattern to match
   * @returns {boolean} Match result
   */
  _matchPattern(eventType, pattern) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(eventType);
  }

  /**
   * Generate unique subscription ID
   * @returns {string} Subscription ID
   */
  _generateSubscriptionId() {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up expired subscriptions
   */
  _cleanupExpiredSubscriptions() {
    const now = Date.now();
    const expiredSubscriptions = [];
    
    for (const [id, subscription] of this.subscriptions.entries()) {
      if (this._isExpired(subscription)) {
        expiredSubscriptions.push(id);
      }
    }
    
    expiredSubscriptions.forEach(id => {
      this.removeSubscription(id);
      this.stats.subscriptionsExpired++;
    });
    
    if (expiredSubscriptions.length > 0 && this.logger) {
      this.logger.debug('Expired subscriptions cleaned up', {
        count: expiredSubscriptions.length,
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Get subscription by ID
   * @param {string} subscriptionId - Subscription ID
   * @returns {Object|null} Subscription object
   */
  getSubscription(subscriptionId) {
    return this.subscriptions.get(subscriptionId) || null;
  }

  /**
   * Get subscriptions for an agent
   * @param {string} agentId - Agent ID
   * @returns {Array} Agent subscriptions
   */
  getAgentSubscriptions(agentId) {
    const subscriptionIds = this.agentSubscriptions.get(agentId);
    if (!subscriptionIds) {
      return [];
    }
    
    return Array.from(subscriptionIds)
      .map(id => this.subscriptions.get(id))
      .filter(sub => sub && !this._isExpired(sub));
  }

  /**
   * Get all active subscriptions
   * @returns {Array} All subscriptions
   */
  getAllSubscriptions() {
    return Array.from(this.subscriptions.values())
      .filter(sub => !this._isExpired(sub));
  }

  /**
   * Get subscription statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      subscriptionsActive: this.subscriptions.size,
      agentsWithSubscriptions: this.agentSubscriptions.size,
      uniquePatterns: this.patternSubscriptions.size,
      uniqueTopics: this.topicSubscriptions.size
    };
  }

  /**
   * Health check
   * @returns {Object} Health status
   */
  healthCheck() {
    const totalSubscriptions = this.subscriptions.size;
    const activeSubscriptions = this.getAllSubscriptions().length;
    const healthyRatio = totalSubscriptions > 0 ? activeSubscriptions / totalSubscriptions : 1;
    
    return {
      status: healthyRatio >= 0.8 ? 'healthy' : 'degraded',
      totalSubscriptions,
      activeSubscriptions,
      expiredSubscriptions: totalSubscriptions - activeSubscriptions,
      stats: this.getStats()
    };
  }

  /**
   * Close the subscription manager
   */
  close() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    this.subscriptions.clear();
    this.agentSubscriptions.clear();
    this.patternSubscriptions.clear();
    this.topicSubscriptions.clear();
    this.filters.clear();
    this.transformers.clear();
    this.removeAllListeners();
    
    if (this.logger) {
      this.logger.info('Subscription manager closed', {
        serviceName: this.options.serviceName
      });
    }
  }
}

/**
 * Create a subscription manager instance
 * @param {Object} options - Configuration options
 * @returns {SubscriptionManager} Subscription manager instance
 */
export function createSubscriptionManager(options = {}) {
  return new SubscriptionManager(options);
}

export default SubscriptionManager;