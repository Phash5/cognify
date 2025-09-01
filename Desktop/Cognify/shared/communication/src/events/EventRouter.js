import EventEmitter from 'eventemitter3';
import { createLogger } from '../utils/logger.js';
import { createMetrics } from '../utils/metrics.js';

/**
 * Event router for intelligent routing of events to specialized agents
 */
class EventRouter extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      serviceName: process.env.SERVICE_NAME || 'event-router',
      enableMetrics: process.env.EVENT_ROUTER_METRICS !== 'false',
      enableLogging: process.env.EVENT_ROUTER_LOGGING !== 'false',
      routingStrategy: process.env.EVENT_ROUTING_STRATEGY || 'capability-based', // 'capability-based', 'round-robin', 'load-based'
      maxRetries: parseInt(process.env.EVENT_ROUTER_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.EVENT_ROUTER_RETRY_DELAY) || 1000,
      routingTimeout: parseInt(process.env.EVENT_ROUTING_TIMEOUT) || 30000,
      enablePersistence: process.env.EVENT_ROUTER_PERSISTENCE !== 'false',
      enablePriority: process.env.EVENT_ROUTER_PRIORITY !== 'false',
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

    // Agent registry
    this.agents = new Map();
    
    // Event type to agent mappings
    this.eventMappings = new Map();
    
    // Subscription management
    this.subscriptions = new Map();
    
    // Event queue for persistence
    this.eventQueue = [];
    
    // Routing rules
    this.routingRules = new Map();
    
    // Statistics
    this.stats = {
      eventsRouted: 0,
      eventsDelivered: 0,
      eventsFailed: 0,
      eventsRetried: 0,
      agentsRegistered: 0,
      subscriptionsActive: 0,
      routingErrors: 0
    };

    // Initialize default routing rules
    this._initializeDefaultRules();
    
    if (this.logger) {
      this.logger.info('Event router initialized', {
        serviceName: this.options.serviceName,
        strategy: this.options.routingStrategy
      });
    }
  }

  /**
   * Initialize default routing rules
   */
  _initializeDefaultRules() {
    // Frontend-related events
    this.addRoutingRule('ui.*', {
      targetAgents: ['frontend-agent'],
      priority: 'high',
      timeout: 15000
    });
    
    this.addRoutingRule('component.*', {
      targetAgents: ['frontend-agent'],
      priority: 'medium',
      timeout: 20000
    });
    
    this.addRoutingRule('react.*', {
      targetAgents: ['frontend-agent'],
      priority: 'high',
      timeout: 15000
    });

    // Backend-related events
    this.addRoutingRule('api.*', {
      targetAgents: ['backend-agent'],
      priority: 'high',
      timeout: 25000
    });
    
    this.addRoutingRule('server.*', {
      targetAgents: ['backend-agent'],
      priority: 'medium',
      timeout: 30000
    });
    
    this.addRoutingRule('middleware.*', {
      targetAgents: ['backend-agent'],
      priority: 'medium',
      timeout: 20000
    });

    // Database-related events
    this.addRoutingRule('db.*', {
      targetAgents: ['database-agent'],
      priority: 'high',
      timeout: 20000
    });
    
    this.addRoutingRule('schema.*', {
      targetAgents: ['database-agent'],
      priority: 'medium',
      timeout: 25000
    });
    
    this.addRoutingRule('migration.*', {
      targetAgents: ['database-agent'],
      priority: 'low',
      timeout: 60000
    });

    // DevOps-related events
    this.addRoutingRule('deploy.*', {
      targetAgents: ['devops-agent'],
      priority: 'high',
      timeout: 120000
    });
    
    this.addRoutingRule('infrastructure.*', {
      targetAgents: ['devops-agent'],
      priority: 'medium',
      timeout: 90000
    });
    
    this.addRoutingRule('docker.*', {
      targetAgents: ['devops-agent'],
      priority: 'medium',
      timeout: 60000
    });

    // Multi-agent events (can be handled by multiple agents)
    this.addRoutingRule('task.coordination.*', {
      targetAgents: ['orchestrator'],
      priority: 'high',
      timeout: 30000,
      broadcast: true
    });
    
    this.addRoutingRule('system.*', {
      targetAgents: ['orchestrator', 'devops-agent'],
      priority: 'medium',
      timeout: 45000,
      loadBalance: true
    });
  }

  /**
   * Register an agent with the router
   * @param {string} agentId - Agent identifier
   * @param {Object} agentInfo - Agent information
   */
  registerAgent(agentId, agentInfo = {}) {
    const agent = {
      id: agentId,
      type: agentInfo.type || 'unknown',
      capabilities: agentInfo.capabilities || [],
      endpoint: agentInfo.endpoint,
      status: 'active',
      load: 0,
      lastSeen: Date.now(),
      eventCount: 0,
      errorCount: 0,
      responseTime: 0,
      ...agentInfo
    };

    this.agents.set(agentId, agent);
    this.stats.agentsRegistered++;

    if (this.logger) {
      this.logger.info('Agent registered', {
        agentId,
        type: agent.type,
        capabilities: agent.capabilities,
        serviceName: this.options.serviceName
      });
    }

    if (this.metrics) {
      this.metrics.increment('agents_registered_total', { agent_type: agent.type });
    }

    this.emit('agentRegistered', { agentId, agent });
  }

  /**
   * Unregister an agent
   * @param {string} agentId - Agent identifier
   */
  unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      
      // Remove agent from subscriptions
      for (const [eventPattern, subscribers] of this.subscriptions.entries()) {
        const index = subscribers.findIndex(sub => sub.agentId === agentId);
        if (index !== -1) {
          subscribers.splice(index, 1);
          if (subscribers.length === 0) {
            this.subscriptions.delete(eventPattern);
          }
        }
      }

      if (this.logger) {
        this.logger.info('Agent unregistered', {
          agentId,
          type: agent.type,
          serviceName: this.options.serviceName
        });
      }

      if (this.metrics) {
        this.metrics.increment('agents_unregistered_total', { agent_type: agent.type });
      }

      this.emit('agentUnregistered', { agentId, agent });
    }
  }

  /**
   * Subscribe an agent to event patterns
   * @param {string} agentId - Agent identifier
   * @param {string|Array} eventPatterns - Event patterns to subscribe to
   * @param {Object} options - Subscription options
   */
  subscribe(agentId, eventPatterns, options = {}) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not registered`);
    }

    const patterns = Array.isArray(eventPatterns) ? eventPatterns : [eventPatterns];
    
    patterns.forEach(pattern => {
      if (!this.subscriptions.has(pattern)) {
        this.subscriptions.set(pattern, []);
      }
      
      const subscription = {
        agentId,
        pattern,
        priority: options.priority || 'medium',
        filter: options.filter,
        transform: options.transform,
        createdAt: Date.now(),
        ...options
      };
      
      this.subscriptions.get(pattern).push(subscription);
      this.stats.subscriptionsActive++;

      if (this.logger) {
        this.logger.debug('Agent subscribed to event pattern', {
          agentId,
          pattern,
          priority: subscription.priority,
          serviceName: this.options.serviceName
        });
      }
    });

    if (this.metrics) {
      this.metrics.increment('subscriptions_created_total', { agent_id: agentId });
    }

    this.emit('agentSubscribed', { agentId, patterns, options });
  }

  /**
   * Unsubscribe an agent from event patterns
   * @param {string} agentId - Agent identifier
   * @param {string|Array} eventPatterns - Event patterns to unsubscribe from
   */
  unsubscribe(agentId, eventPatterns) {
    const patterns = Array.isArray(eventPatterns) ? eventPatterns : [eventPatterns];
    
    patterns.forEach(pattern => {
      const subscribers = this.subscriptions.get(pattern);
      if (subscribers) {
        const index = subscribers.findIndex(sub => sub.agentId === agentId);
        if (index !== -1) {
          subscribers.splice(index, 1);
          this.stats.subscriptionsActive--;
          
          if (subscribers.length === 0) {
            this.subscriptions.delete(pattern);
          }

          if (this.logger) {
            this.logger.debug('Agent unsubscribed from event pattern', {
              agentId,
              pattern,
              serviceName: this.options.serviceName
            });
          }
        }
      }
    });

    if (this.metrics) {
      this.metrics.increment('subscriptions_removed_total', { agent_id: agentId });
    }

    this.emit('agentUnsubscribed', { agentId, patterns });
  }

  /**
   * Add a routing rule
   * @param {string} eventPattern - Event pattern to match
   * @param {Object} rule - Routing rule configuration
   */
  addRoutingRule(eventPattern, rule) {
    this.routingRules.set(eventPattern, {
      targetAgents: rule.targetAgents || [],
      priority: rule.priority || 'medium',
      timeout: rule.timeout || this.options.routingTimeout,
      retries: rule.retries || this.options.maxRetries,
      broadcast: rule.broadcast || false,
      loadBalance: rule.loadBalance || false,
      filter: rule.filter,
      transform: rule.transform,
      ...rule
    });

    if (this.logger) {
      this.logger.debug('Routing rule added', {
        eventPattern,
        rule,
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Remove a routing rule
   * @param {string} eventPattern - Event pattern
   */
  removeRoutingRule(eventPattern) {
    const removed = this.routingRules.delete(eventPattern);
    
    if (removed && this.logger) {
      this.logger.debug('Routing rule removed', {
        eventPattern,
        serviceName: this.options.serviceName
      });
    }
    
    return removed;
  }

  /**
   * Route an event to appropriate agents
   * @param {string} eventType - Event type
   * @param {Object} eventData - Event data
   * @param {Object} options - Routing options
   * @returns {Promise<Array>} Routing results
   */
  async routeEvent(eventType, eventData, options = {}) {
    try {
      this.stats.eventsRouted++;
      
      const event = {
        id: options.id || this._generateEventId(),
        type: eventType,
        data: eventData,
        timestamp: Date.now(),
        priority: options.priority || 'medium',
        timeout: options.timeout || this.options.routingTimeout,
        retries: options.retries || this.options.maxRetries,
        source: options.source || this.options.serviceName,
        ...options
      };

      if (this.logger) {
        this.logger.debug('Routing event', {
          eventId: event.id,
          eventType,
          priority: event.priority,
          serviceName: this.options.serviceName
        });
      }

      // Find target agents
      const targetAgents = this._findTargetAgents(event);
      
      if (targetAgents.length === 0) {
        if (this.logger) {
          this.logger.warn('No target agents found for event', {
            eventId: event.id,
            eventType,
            serviceName: this.options.serviceName
          });
        }
        
        this.stats.eventsFailed++;
        return [];
      }

      // Route to agents
      const routingPromises = targetAgents.map(agent => 
        this._routeToAgent(event, agent)
      );

      const results = await Promise.allSettled(routingPromises);
      
      // Process results
      const successfulRoutes = [];
      const failedRoutes = [];
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successfulRoutes.push({
            agent: targetAgents[index],
            result: result.value
          });
          this.stats.eventsDelivered++;
        } else {
          failedRoutes.push({
            agent: targetAgents[index],
            error: result.reason
          });
          this.stats.eventsFailed++;
        }
      });

      if (this.metrics) {
        this.metrics.increment('events_routed_total', { event_type: eventType });
        this.metrics.increment('events_delivered_total', { count: successfulRoutes.length });
        this.metrics.increment('events_failed_total', { count: failedRoutes.length });
      }

      // Handle failed routes
      if (failedRoutes.length > 0 && event.retries > 0) {
        setTimeout(() => {
          this._retryFailedRoutes(event, failedRoutes);
        }, this.options.retryDelay);
      }

      this.emit('eventRouted', {
        event,
        successful: successfulRoutes,
        failed: failedRoutes
      });

      return [...successfulRoutes, ...failedRoutes];
    } catch (error) {
      this.stats.routingErrors++;
      
      if (this.logger) {
        this.logger.error('Event routing failed', {
          eventType,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Find target agents for an event
   * @param {Object} event - Event object
   * @returns {Array} Target agents
   */
  _findTargetAgents(event) {
    const targetAgents = [];
    
    // Check routing rules first
    for (const [pattern, rule] of this.routingRules.entries()) {
      if (this._matchPattern(event.type, pattern)) {
        const ruleAgents = rule.targetAgents
          .map(agentId => this.agents.get(agentId))
          .filter(agent => agent && agent.status === 'active');
        
        if (rule.broadcast) {
          targetAgents.push(...ruleAgents);
        } else if (rule.loadBalance) {
          const selectedAgent = this._selectAgentByLoad(ruleAgents);
          if (selectedAgent) targetAgents.push(selectedAgent);
        } else {
          // Use first available agent
          if (ruleAgents.length > 0) {
            targetAgents.push(ruleAgents[0]);
          }
        }
        
        // If we found agents via rules, use them
        if (targetAgents.length > 0) {
          return targetAgents;
        }
      }
    }
    
    // Fallback to subscription-based routing
    for (const [pattern, subscribers] of this.subscriptions.entries()) {
      if (this._matchPattern(event.type, pattern)) {
        const activeSubscribers = subscribers
          .filter(sub => {
            const agent = this.agents.get(sub.agentId);
            return agent && agent.status === 'active';
          })
          .map(sub => this.agents.get(sub.agentId));
        
        targetAgents.push(...activeSubscribers);
      }
    }
    
    // Remove duplicates
    return [...new Set(targetAgents)];
  }

  /**
   * Select agent based on load
   * @param {Array} agents - Available agents
   * @returns {Object|null} Selected agent
   */
  _selectAgentByLoad(agents) {
    if (agents.length === 0) return null;
    if (agents.length === 1) return agents[0];
    
    // Select agent with lowest load
    return agents.reduce((lowest, current) => 
      current.load < lowest.load ? current : lowest
    );
  }

  /**
   * Route event to a specific agent
   * @param {Object} event - Event object
   * @param {Object} agent - Target agent
   * @returns {Promise} Routing result
   */
  async _routeToAgent(event, agent) {
    const startTime = Date.now();
    
    try {
      // Update agent load
      agent.load++;
      agent.eventCount++;
      agent.lastSeen = Date.now();
      
      // Emit event to agent
      const result = await this._deliverEvent(event, agent);
      
      // Update agent statistics
      const responseTime = Date.now() - startTime;
      agent.responseTime = (agent.responseTime + responseTime) / 2;
      agent.load--;
      
      if (this.logger) {
        this.logger.debug('Event delivered to agent', {
          eventId: event.id,
          agentId: agent.id,
          responseTime,
          serviceName: this.options.serviceName
        });
      }
      
      return result;
    } catch (error) {
      agent.load--;
      agent.errorCount++;
      
      if (this.logger) {
        this.logger.error('Failed to deliver event to agent', {
          eventId: event.id,
          agentId: agent.id,
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Deliver event to agent
   * @param {Object} event - Event object
   * @param {Object} agent - Target agent
   * @returns {Promise} Delivery result
   */
  async _deliverEvent(event, agent) {
    // This is a placeholder for actual event delivery
    // In a real implementation, this would send the event to the agent
    // via HTTP, message queue, or other communication mechanism
    
    return new Promise((resolve, reject) => {
      // Simulate event delivery
      setTimeout(() => {
        if (Math.random() > 0.1) { // 90% success rate
          resolve({
            agentId: agent.id,
            eventId: event.id,
            status: 'delivered',
            timestamp: Date.now()
          });
        } else {
          reject(new Error('Event delivery failed'));
        }
      }, Math.random() * 100); // Random delay
    });
  }

  /**
   * Retry failed routes
   * @param {Object} event - Original event
   * @param {Array} failedRoutes - Failed routes
   */
  async _retryFailedRoutes(event, failedRoutes) {
    if (event.retries <= 0) return;
    
    this.stats.eventsRetried++;
    
    const retryEvent = {
      ...event,
      retries: event.retries - 1,
      retryAttempt: (event.retryAttempt || 0) + 1
    };
    
    if (this.logger) {
      this.logger.debug('Retrying failed event routes', {
        eventId: event.id,
        retryAttempt: retryEvent.retryAttempt,
        failedCount: failedRoutes.length,
        serviceName: this.options.serviceName
      });
    }
    
    const retryPromises = failedRoutes.map(failed => 
      this._routeToAgent(retryEvent, failed.agent)
    );
    
    try {
      await Promise.allSettled(retryPromises);
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
   * Generate unique event ID
   * @returns {string} Event ID
   */
  _generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get router statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      agents: this.agents.size,
      subscriptions: this.subscriptions.size,
      routingRules: this.routingRules.size,
      queueSize: this.eventQueue.length
    };
  }

  /**
   * Get agent information
   * @param {string} agentId - Agent ID (optional)
   * @returns {Object|Array} Agent info
   */
  getAgents(agentId = null) {
    if (agentId) {
      return this.agents.get(agentId);
    }
    
    return Array.from(this.agents.values());
  }

  /**
   * Get active subscriptions
   * @returns {Array} Subscriptions
   */
  getSubscriptions() {
    const subscriptions = [];
    
    for (const [pattern, subscribers] of this.subscriptions.entries()) {
      subscriptions.push({
        pattern,
        subscribers: subscribers.map(sub => ({
          agentId: sub.agentId,
          priority: sub.priority,
          createdAt: sub.createdAt
        }))
      });
    }
    
    return subscriptions;
  }

  /**
   * Health check
   * @returns {Object} Health status
   */
  healthCheck() {
    const activeAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'active').length;
    
    const totalAgents = this.agents.size;
    const healthyRatio = totalAgents > 0 ? activeAgents / totalAgents : 1;
    
    return {
      status: healthyRatio >= 0.5 ? 'healthy' : 'degraded',
      activeAgents,
      totalAgents,
      subscriptions: this.subscriptions.size,
      routingRules: this.routingRules.size,
      stats: this.getStats()
    };
  }

  /**
   * Close the event router
   */
  close() {
    this.agents.clear();
    this.subscriptions.clear();
    this.routingRules.clear();
    this.eventQueue.length = 0;
    this.removeAllListeners();
    
    if (this.logger) {
      this.logger.info('Event router closed', {
        serviceName: this.options.serviceName
      });
    }
  }
}

/**
 * Create an event router instance
 * @param {Object} options - Configuration options
 * @returns {EventRouter} Event router instance
 */
export function createEventRouter(options = {}) {
  return new EventRouter(options);
}

export default EventRouter;