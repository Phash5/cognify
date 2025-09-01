import EventEmitter from 'eventemitter3';
import { createLogger } from '../utils/logger.js';
import { createMetrics } from '../utils/metrics.js';
import { createEventRouter } from './EventRouter.js';
import { createSubscriptionManager } from './SubscriptionManager.js';

/**
 * Enhanced event bus with intelligent routing and subscription management
 */
class EnhancedEventBus extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      serviceName: process.env.SERVICE_NAME || 'enhanced-event-bus',
      enableMetrics: process.env.EVENT_BUS_METRICS !== 'false',
      enableLogging: process.env.EVENT_BUS_LOGGING !== 'false',
      enableRouting: process.env.EVENT_BUS_ROUTING !== 'false',
      enableSubscriptions: process.env.EVENT_BUS_SUBSCRIPTIONS !== 'false',
      enablePersistence: process.env.EVENT_BUS_PERSISTENCE !== 'false',
      enableReplay: process.env.EVENT_BUS_REPLAY !== 'false',
      maxEventHistory: parseInt(process.env.EVENT_BUS_MAX_HISTORY) || 1000,
      eventTtl: parseInt(process.env.EVENT_BUS_EVENT_TTL) || 3600000, // 1 hour
      batchSize: parseInt(process.env.EVENT_BUS_BATCH_SIZE) || 100,
      flushInterval: parseInt(process.env.EVENT_BUS_FLUSH_INTERVAL) || 5000,
      enableDeadLetter: process.env.EVENT_BUS_DEAD_LETTER !== 'false',
      maxRetries: parseInt(process.env.EVENT_BUS_MAX_RETRIES) || 3,
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

    // Initialize event router
    this.eventRouter = options.eventRouter || (this.options.enableRouting ? createEventRouter({
      serviceName: `${this.options.serviceName}-router`,
      logger: this.logger,
      metrics: this.metrics
    }) : null);

    // Initialize subscription manager
    this.subscriptionManager = options.subscriptionManager || (this.options.enableSubscriptions ? createSubscriptionManager({
      serviceName: `${this.options.serviceName}-subscriptions`,
      logger: this.logger,
      metrics: this.metrics
    }) : null);

    // Event storage
    this.eventHistory = [];
    this.deadLetterQueue = [];
    this.pendingEvents = new Map();
    this.eventBatches = new Map();
    
    // Agent registry
    this.agents = new Map();
    
    // Statistics
    this.stats = {
      eventsPublished: 0,
      eventsDelivered: 0,
      eventsFailed: 0,
      eventsRetried: 0,
      eventsReplayed: 0,
      batchesProcessed: 0,
      deadLetterEvents: 0,
      agentsConnected: 0
    };

    // Setup event router integration
    if (this.eventRouter) {
      this.eventRouter.on('eventRouted', (data) => {
        this._handleRoutedEvent(data);
      });
      
      this.eventRouter.on('agentRegistered', (data) => {
        this.emit('agentRegistered', data);
      });
      
      this.eventRouter.on('agentUnregistered', (data) => {
        this.emit('agentUnregistered', data);
      });
    }

    // Setup subscription manager integration
    if (this.subscriptionManager) {
      this.subscriptionManager.on('subscriptionCreated', (data) => {
        this.emit('subscriptionCreated', data);
      });
      
      this.subscriptionManager.on('subscriptionRemoved', (data) => {
        this.emit('subscriptionRemoved', data);
      });
    }

    // Start batch processing
    if (this.options.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this._processBatches();
      }, this.options.flushInterval);
    }
    
    if (this.logger) {
      this.logger.info('Enhanced event bus initialized', {
        serviceName: this.options.serviceName,
        enableRouting: this.options.enableRouting,
        enableSubscriptions: this.options.enableSubscriptions
      });
    }
  }

  /**
   * Register an agent with the event bus
   * @param {string} agentId - Agent identifier
   * @param {Object} agentInfo - Agent information
   */
  registerAgent(agentId, agentInfo = {}) {
    const agent = {
      id: agentId,
      type: agentInfo.type || 'unknown',
      capabilities: agentInfo.capabilities || [],
      endpoint: agentInfo.endpoint,
      status: 'connected',
      connectedAt: Date.now(),
      lastSeen: Date.now(),
      eventCount: 0,
      subscriptionCount: 0,
      ...agentInfo
    };

    this.agents.set(agentId, agent);
    this.stats.agentsConnected++;

    // Register with event router
    if (this.eventRouter) {
      this.eventRouter.registerAgent(agentId, agentInfo);
    }

    if (this.logger) {
      this.logger.info('Agent registered with event bus', {
        agentId,
        type: agent.type,
        capabilities: agent.capabilities,
        serviceName: this.options.serviceName
      });
    }

    if (this.metrics) {
      this.metrics.increment('agents_connected_total', { agent_type: agent.type });
    }

    this.emit('agentConnected', { agentId, agent });
  }

  /**
   * Unregister an agent
   * @param {string} agentId - Agent identifier
   */
  unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      this.stats.agentsConnected--;

      // Unregister from event router
      if (this.eventRouter) {
        this.eventRouter.unregisterAgent(agentId);
      }

      // Remove agent subscriptions
      if (this.subscriptionManager) {
        this.subscriptionManager.removeAgentSubscriptions(agentId);
      }

      if (this.logger) {
        this.logger.info('Agent unregistered from event bus', {
          agentId,
          type: agent.type,
          serviceName: this.options.serviceName
        });
      }

      if (this.metrics) {
        this.metrics.increment('agents_disconnected_total', { agent_type: agent.type });
      }

      this.emit('agentDisconnected', { agentId, agent });
    }
  }

  /**
   * Subscribe an agent to event patterns
   * @param {string} agentId - Agent identifier
   * @param {string|Array} eventPatterns - Event patterns to subscribe to
   * @param {Object} options - Subscription options
   * @returns {string} Subscription ID
   */
  subscribe(agentId, eventPatterns, options = {}) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not registered`);
    }

    let subscriptionId;
    
    // Create subscription with subscription manager
    if (this.subscriptionManager) {
      const patterns = Array.isArray(eventPatterns) ? eventPatterns : [eventPatterns];
      subscriptionId = this.subscriptionManager.createSubscription(agentId, {
        pattern: patterns[0], // Primary pattern
        ...options
      });
      
      // Subscribe to additional patterns
      if (patterns.length > 1) {
        patterns.slice(1).forEach(pattern => {
          this.subscriptionManager.createSubscription(agentId, {
            pattern,
            ...options
          });
        });
      }
    }
    
    // Subscribe with event router
    if (this.eventRouter) {
      this.eventRouter.subscribe(agentId, eventPatterns, options);
    }

    // Update agent statistics
    agent.subscriptionCount++;
    agent.lastSeen = Date.now();

    if (this.logger) {
      this.logger.debug('Agent subscribed to event patterns', {
        agentId,
        eventPatterns,
        subscriptionId,
        serviceName: this.options.serviceName
      });
    }

    return subscriptionId;
  }

  /**
   * Unsubscribe an agent from event patterns
   * @param {string} agentId - Agent identifier
   * @param {string|Array} eventPatterns - Event patterns to unsubscribe from
   */
  unsubscribe(agentId, eventPatterns) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    // Unsubscribe from event router
    if (this.eventRouter) {
      this.eventRouter.unsubscribe(agentId, eventPatterns);
    }

    // Update agent statistics
    agent.subscriptionCount = Math.max(0, agent.subscriptionCount - 1);
    agent.lastSeen = Date.now();

    if (this.logger) {
      this.logger.debug('Agent unsubscribed from event patterns', {
        agentId,
        eventPatterns,
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Publish an event
   * @param {string} eventType - Event type
   * @param {Object} eventData - Event data
   * @param {Object} options - Publishing options
   * @returns {Promise<Object>} Publishing result
   */
  async publish(eventType, eventData, options = {}) {
    try {
      const event = {
        id: options.id || this._generateEventId(),
        type: eventType,
        data: eventData,
        timestamp: Date.now(),
        source: options.source || this.options.serviceName,
        priority: options.priority || 'medium',
        topic: options.topic,
        metadata: options.metadata || {},
        ...options
      };

      this.stats.eventsPublished++;

      if (this.logger) {
        this.logger.debug('Publishing event', {
          eventId: event.id,
          eventType,
          priority: event.priority,
          serviceName: this.options.serviceName
        });
      }

      // Store in history if enabled
      if (this.options.enablePersistence) {
        this._storeEvent(event);
      }

      // Process with subscription manager
      let processedSubscriptions = [];
      if (this.subscriptionManager) {
        const matchingSubscriptions = this.subscriptionManager.findMatchingSubscriptions(event);
        
        processedSubscriptions = matchingSubscriptions.map(subscription => {
          const processedEvent = this.subscriptionManager.processEvent(subscription, event);
          return {
            subscription,
            event: processedEvent,
            agentId: subscription.agentId
          };
        }).filter(result => result.event !== null);
      }

      // Route event
      let routingResults = [];
      if (this.eventRouter) {
        routingResults = await this.eventRouter.routeEvent(eventType, eventData, options);
      }

      // Emit to local listeners
      this.emit(eventType, event);
      this.emit('*', event);

      // Handle batching
      if (options.batch) {
        this._addToBatch(options.batch, event);
      }

      if (this.metrics) {
        this.metrics.increment('events_published_total', {
          event_type: eventType,
          priority: event.priority
        });
      }

      const result = {
        eventId: event.id,
        subscriptions: processedSubscriptions.length,
        routes: routingResults.length,
        successful: routingResults.filter(r => !r.error).length,
        failed: routingResults.filter(r => r.error).length
      };

      this.emit('eventPublished', { event, result });

      return result;
    } catch (error) {
      this.stats.eventsFailed++;
      
      if (this.logger) {
        this.logger.error('Event publishing failed', {
          eventType,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Publish multiple events in batch
   * @param {Array} events - Array of events to publish
   * @param {Object} options - Batch options
   * @returns {Promise<Array>} Publishing results
   */
  async publishBatch(events, options = {}) {
    const batchId = options.batchId || this._generateBatchId();
    const results = [];

    if (this.logger) {
      this.logger.debug('Publishing event batch', {
        batchId,
        eventCount: events.length,
        serviceName: this.options.serviceName
      });
    }

    for (const eventConfig of events) {
      try {
        const result = await this.publish(
          eventConfig.type,
          eventConfig.data,
          {
            ...eventConfig.options,
            batchId
          }
        );
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }

    this.stats.batchesProcessed++;

    if (this.metrics) {
      this.metrics.increment('event_batches_processed_total', {
        batch_size: events.length
      });
    }

    return results;
  }

  /**
   * Replay events from history
   * @param {Object} criteria - Replay criteria
   * @returns {Promise<Array>} Replay results
   */
  async replayEvents(criteria = {}) {
    if (!this.options.enableReplay) {
      throw new Error('Event replay is disabled');
    }

    const {
      fromTimestamp,
      toTimestamp,
      eventTypes,
      agentId,
      limit = 100
    } = criteria;

    // Filter events based on criteria
    let eventsToReplay = this.eventHistory.filter(event => {
      if (fromTimestamp && event.timestamp < fromTimestamp) return false;
      if (toTimestamp && event.timestamp > toTimestamp) return false;
      if (eventTypes && !eventTypes.includes(event.type)) return false;
      return true;
    });

    // Limit results
    eventsToReplay = eventsToReplay.slice(0, limit);

    if (this.logger) {
      this.logger.info('Replaying events', {
        eventCount: eventsToReplay.length,
        criteria,
        serviceName: this.options.serviceName
      });
    }

    const replayResults = [];
    
    for (const event of eventsToReplay) {
      try {
        // Create replay event
        const replayEvent = {
          ...event,
          id: this._generateEventId(),
          isReplay: true,
          originalEventId: event.id,
          replayTimestamp: Date.now()
        };

        // Republish event
        const result = await this.publish(
          replayEvent.type,
          replayEvent.data,
          {
            ...replayEvent,
            source: `${this.options.serviceName}-replay`
          }
        );

        replayResults.push({ success: true, event: replayEvent, result });
        this.stats.eventsReplayed++;
      } catch (error) {
        replayResults.push({
          success: false,
          event,
          error: error.message
        });
      }
    }

    if (this.metrics) {
      this.metrics.increment('events_replayed_total', {
        count: replayResults.filter(r => r.success).length
      });
    }

    return replayResults;
  }

  /**
   * Handle routed event from event router
   * @param {Object} data - Routed event data
   */
  _handleRoutedEvent(data) {
    const { event, successful, failed } = data;
    
    this.stats.eventsDelivered += successful.length;
    this.stats.eventsFailed += failed.length;

    // Handle failed deliveries
    if (failed.length > 0) {
      this._handleFailedDeliveries(event, failed);
    }

    // Update agent statistics
    successful.forEach(result => {
      const agent = this.agents.get(result.agent.id);
      if (agent) {
        agent.eventCount++;
        agent.lastSeen = Date.now();
      }
    });
  }

  /**
   * Handle failed event deliveries
   * @param {Object} event - Original event
   * @param {Array} failures - Failed deliveries
   */
  _handleFailedDeliveries(event, failures) {
    if (this.options.enableDeadLetter) {
      const deadLetterEvent = {
        ...event,
        failedAt: Date.now(),
        failures: failures.map(f => ({
          agentId: f.agent.id,
          error: f.error.message
        })),
        retryCount: (event.retryCount || 0) + 1
      };

      // Add to dead letter queue if max retries exceeded
      if (deadLetterEvent.retryCount >= this.options.maxRetries) {
        this.deadLetterQueue.push(deadLetterEvent);
        this.stats.deadLetterEvents++;
        
        if (this.logger) {
          this.logger.warn('Event moved to dead letter queue', {
            eventId: event.id,
            retryCount: deadLetterEvent.retryCount,
            serviceName: this.options.serviceName
          });
        }
      } else {
        // Schedule retry
        setTimeout(() => {
          this._retryEvent(deadLetterEvent);
        }, 1000 * Math.pow(2, deadLetterEvent.retryCount)); // Exponential backoff
      }
    }
  }

  /**
   * Retry failed event
   * @param {Object} event - Event to retry
   */
  async _retryEvent(event) {
    try {
      this.stats.eventsRetried++;
      
      if (this.logger) {
        this.logger.debug('Retrying event', {
          eventId: event.id,
          retryCount: event.retryCount,
          serviceName: this.options.serviceName
        });
      }

      await this.publish(event.type, event.data, {
        ...event,
        isRetry: true,
        originalEventId: event.id
      });
    } catch (error) {
      if (this.logger) {
        this.logger.error('Event retry failed', {
          eventId: event.id,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
    }
  }

  /**
   * Store event in history
   * @param {Object} event - Event to store
   */
  _storeEvent(event) {
    this.eventHistory.push(event);
    
    // Maintain history size limit
    if (this.eventHistory.length > this.options.maxEventHistory) {
      this.eventHistory.shift();
    }
    
    // Remove expired events
    const now = Date.now();
    this.eventHistory = this.eventHistory.filter(
      e => now - e.timestamp < this.options.eventTtl
    );
  }

  /**
   * Add event to batch
   * @param {string} batchId - Batch identifier
   * @param {Object} event - Event to add
   */
  _addToBatch(batchId, event) {
    if (!this.eventBatches.has(batchId)) {
      this.eventBatches.set(batchId, []);
    }
    
    this.eventBatches.get(batchId).push(event);
    
    // Auto-process batch if it reaches max size
    const batch = this.eventBatches.get(batchId);
    if (batch.length >= this.options.batchSize) {
      this._processBatch(batchId);
    }
  }

  /**
   * Process all pending batches
   */
  _processBatches() {
    for (const batchId of this.eventBatches.keys()) {
      this._processBatch(batchId);
    }
  }

  /**
   * Process a specific batch
   * @param {string} batchId - Batch identifier
   */
  _processBatch(batchId) {
    const batch = this.eventBatches.get(batchId);
    if (!batch || batch.length === 0) {
      return;
    }

    if (this.logger) {
      this.logger.debug('Processing event batch', {
        batchId,
        eventCount: batch.length,
        serviceName: this.options.serviceName
      });
    }

    this.emit('batchProcessed', { batchId, events: batch });
    this.eventBatches.delete(batchId);
  }

  /**
   * Generate unique event ID
   * @returns {string} Event ID
   */
  _generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique batch ID
   * @returns {string} Batch ID
   */
  _generateBatchId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get event bus statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const routerStats = this.eventRouter ? this.eventRouter.getStats() : {};
    const subscriptionStats = this.subscriptionManager ? this.subscriptionManager.getStats() : {};
    
    return {
      ...this.stats,
      eventHistory: this.eventHistory.length,
      deadLetterQueue: this.deadLetterQueue.length,
      pendingBatches: this.eventBatches.size,
      router: routerStats,
      subscriptions: subscriptionStats
    };
  }

  /**
   * Get connected agents
   * @returns {Array} Connected agents
   */
  getAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Get dead letter queue
   * @returns {Array} Dead letter events
   */
  getDeadLetterQueue() {
    return [...this.deadLetterQueue];
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue() {
    const count = this.deadLetterQueue.length;
    this.deadLetterQueue.length = 0;
    
    if (this.logger) {
      this.logger.info('Dead letter queue cleared', {
        eventCount: count,
        serviceName: this.options.serviceName
      });
    }
    
    return count;
  }

  /**
   * Health check
   * @returns {Object} Health status
   */
  healthCheck() {
    const routerHealth = this.eventRouter ? this.eventRouter.healthCheck() : { status: 'disabled' };
    const subscriptionHealth = this.subscriptionManager ? this.subscriptionManager.healthCheck() : { status: 'disabled' };
    
    const connectedAgents = this.agents.size;
    const deadLetterSize = this.deadLetterQueue.length;
    
    let status = 'healthy';
    if (routerHealth.status === 'degraded' || subscriptionHealth.status === 'degraded') {
      status = 'degraded';
    }
    if (deadLetterSize > 100) {
      status = 'degraded';
    }
    
    return {
      status,
      connectedAgents,
      deadLetterSize,
      router: routerHealth,
      subscriptions: subscriptionHealth,
      stats: this.getStats()
    };
  }

  /**
   * Close the enhanced event bus
   */
  close() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    if (this.eventRouter) {
      this.eventRouter.close();
    }
    
    if (this.subscriptionManager) {
      this.subscriptionManager.close();
    }
    
    this.agents.clear();
    this.eventHistory.length = 0;
    this.deadLetterQueue.length = 0;
    this.pendingEvents.clear();
    this.eventBatches.clear();
    this.removeAllListeners();
    
    if (this.logger) {
      this.logger.info('Enhanced event bus closed', {
        serviceName: this.options.serviceName
      });
    }
  }
}

/**
 * Create an enhanced event bus instance
 * @param {Object} options - Configuration options
 * @returns {EnhancedEventBus} Enhanced event bus instance
 */
export function createEnhancedEventBus(options = {}) {
  return new EnhancedEventBus(options);
}

export default EnhancedEventBus;