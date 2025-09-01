import EventEmitter from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Enhanced EventEmitter with typed events and middleware support
 */
class TypedEventEmitter extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      maxListeners: 100,
      enableWildcards: true,
      enableMiddleware: true,
      enableMetrics: true,
      enableLogging: false,
      namespace: '',
      ...options
    };

    this.logger = options.logger;
    this.metrics = options.metrics;
    
    // Middleware stacks
    this.beforeEmitMiddleware = [];
    this.afterEmitMiddleware = [];
    this.beforeListenMiddleware = [];
    this.afterListenMiddleware = [];
    
    // Event schemas for validation
    this.eventSchemas = new Map();
    
    // Wildcard listeners
    this.wildcardListeners = new Map();
    
    // Event history for debugging
    this.eventHistory = [];
    this.maxHistorySize = options.maxHistorySize || 1000;
    
    // Statistics
    this.stats = {
      eventsEmitted: 0,
      eventsReceived: 0,
      listenersAdded: 0,
      listenersRemoved: 0,
      errors: 0,
      middlewareExecutions: 0
    };

    // Set max listeners
    this.setMaxListeners(this.options.maxListeners);
  }

  /**
   * Register event schema for validation
   * @param {string} eventName - Event name
   * @param {Object} schema - JSON schema for event data
   */
  registerSchema(eventName, schema) {
    this.eventSchemas.set(eventName, schema);
    
    if (this.logger && this.options.enableLogging) {
      this.logger.debug('Event schema registered', {
        eventName,
        namespace: this.options.namespace
      });
    }
  }

  /**
   * Add before-emit middleware
   * @param {Function} middleware - Middleware function
   */
  useBeforeEmit(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    this.beforeEmitMiddleware.push(middleware);
  }

  /**
   * Add after-emit middleware
   * @param {Function} middleware - Middleware function
   */
  useAfterEmit(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    this.afterEmitMiddleware.push(middleware);
  }

  /**
   * Add before-listen middleware
   * @param {Function} middleware - Middleware function
   */
  useBeforeListen(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    this.beforeListenMiddleware.push(middleware);
  }

  /**
   * Add after-listen middleware
   * @param {Function} middleware - Middleware function
   */
  useAfterListen(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    this.afterListenMiddleware.push(middleware);
  }

  /**
   * Emit an event with middleware and validation
   * @param {string} eventName - Event name
   * @param {*} data - Event data
   * @param {Object} metadata - Event metadata
   * @returns {boolean} Success status
   */
  async emit(eventName, data = null, metadata = {}) {
    const eventId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const eventContext = {
      id: eventId,
      name: eventName,
      data,
      metadata: {
        ...metadata,
        timestamp,
        namespace: this.options.namespace,
        emitterId: this.options.emitterId || 'unknown'
      },
      cancelled: false
    };

    try {
      // Execute before-emit middleware
      if (this.options.enableMiddleware) {
        for (const middleware of this.beforeEmitMiddleware) {
          await this._executeMiddleware(middleware, eventContext, 'beforeEmit');
          if (eventContext.cancelled) {
            if (this.logger && this.options.enableLogging) {
              this.logger.debug('Event emission cancelled by middleware', {
                eventId,
                eventName,
                namespace: this.options.namespace
              });
            }
            return false;
          }
        }
      }

      // Validate event data against schema
      if (this.eventSchemas.has(eventName)) {
        const isValid = this._validateEventData(eventName, eventContext.data);
        if (!isValid) {
          throw new Error(`Event data validation failed for '${eventName}'`);
        }
      }

      // Emit the event
      const result = super.emit(eventName, eventContext);
      
      // Handle wildcard listeners
      if (this.options.enableWildcards) {
        this._emitToWildcardListeners(eventName, eventContext);
      }

      // Update statistics
      this.stats.eventsEmitted++;
      
      // Add to event history
      this._addToHistory(eventContext);

      // Execute after-emit middleware
      if (this.options.enableMiddleware) {
        for (const middleware of this.afterEmitMiddleware) {
          await this._executeMiddleware(middleware, eventContext, 'afterEmit');
        }
      }

      // Log event emission
      if (this.logger && this.options.enableLogging) {
        this.logger.debug('Event emitted', {
          eventId,
          eventName,
          listenerCount: this.listenerCount(eventName),
          namespace: this.options.namespace
        });
      }

      // Record metrics
      if (this.metrics && this.options.enableMetrics) {
        this.metrics.recordEventEmission({
          eventName,
          namespace: this.options.namespace,
          listenerCount: this.listenerCount(eventName),
          success: true
        });
      }

      return result;
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Event emission failed', {
          eventId,
          eventName,
          error: error.message,
          namespace: this.options.namespace
        });
      }

      // Record metrics
      if (this.metrics && this.options.enableMetrics) {
        this.metrics.recordEventEmission({
          eventName,
          namespace: this.options.namespace,
          success: false,
          error: error.message
        });
      }

      throw error;
    }
  }

  /**
   * Add event listener with middleware support
   * @param {string} eventName - Event name or pattern
   * @param {Function} listener - Event listener
   * @param {Object} options - Listener options
   * @returns {this} EventEmitter instance
   */
  on(eventName, listener, options = {}) {
    const {
      once = false,
      priority = 'normal',
      filter = null,
      transform = null,
      metadata = {}
    } = options;

    // Wrap listener with middleware and options
    const wrappedListener = this._wrapListener(listener, {
      once,
      priority,
      filter,
      transform,
      metadata,
      eventName
    });

    // Handle wildcard patterns
    if (this.options.enableWildcards && this._isWildcardPattern(eventName)) {
      this._addWildcardListener(eventName, wrappedListener, options);
    } else {
      if (once) {
        super.once(eventName, wrappedListener);
      } else {
        super.on(eventName, wrappedListener);
      }
    }

    this.stats.listenersAdded++;

    if (this.logger && this.options.enableLogging) {
      this.logger.debug('Event listener added', {
        eventName,
        once,
        priority,
        namespace: this.options.namespace
      });
    }

    return this;
  }

  /**
   * Add one-time event listener
   * @param {string} eventName - Event name
   * @param {Function} listener - Event listener
   * @param {Object} options - Listener options
   * @returns {this} EventEmitter instance
   */
  once(eventName, listener, options = {}) {
    return this.on(eventName, listener, { ...options, once: true });
  }

  /**
   * Remove event listener
   * @param {string} eventName - Event name
   * @param {Function} listener - Event listener
   * @returns {this} EventEmitter instance
   */
  off(eventName, listener) {
    // Handle wildcard listeners
    if (this.options.enableWildcards && this._isWildcardPattern(eventName)) {
      this._removeWildcardListener(eventName, listener);
    } else {
      super.off(eventName, listener);
    }

    this.stats.listenersRemoved++;

    if (this.logger && this.options.enableLogging) {
      this.logger.debug('Event listener removed', {
        eventName,
        namespace: this.options.namespace
      });
    }

    return this;
  }

  /**
   * Wait for an event with timeout
   * @param {string} eventName - Event name
   * @param {number} timeout - Timeout in milliseconds
   * @param {Function} filter - Optional filter function
   * @returns {Promise} Promise that resolves with event data
   */
  waitFor(eventName, timeout = 30000, filter = null) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.off(eventName, listener);
        reject(new Error(`Timeout waiting for event '${eventName}'`));
      }, timeout);

      const listener = (eventContext) => {
        if (filter && !filter(eventContext)) {
          return; // Continue waiting
        }
        
        clearTimeout(timeoutId);
        this.off(eventName, listener);
        resolve(eventContext);
      };

      this.once(eventName, listener);
    });
  }

  /**
   * Create a typed event emitter for specific events
   * @param {Object} eventTypes - Event type definitions
   * @returns {Object} Typed event emitter
   */
  createTyped(eventTypes = {}) {
    const typedEmitter = {
      emit: (eventName, data, metadata) => {
        if (eventTypes[eventName]) {
          // Validate against type definition
          const eventType = eventTypes[eventName];
          if (eventType.schema) {
            this.registerSchema(eventName, eventType.schema);
          }
        }
        return this.emit(eventName, data, metadata);
      },
      on: (eventName, listener, options) => {
        return this.on(eventName, listener, options);
      },
      once: (eventName, listener, options) => {
        return this.once(eventName, listener, options);
      },
      off: (eventName, listener) => {
        return this.off(eventName, listener);
      },
      waitFor: (eventName, timeout, filter) => {
        return this.waitFor(eventName, timeout, filter);
      }
    };

    // Add typed methods for each event type
    Object.keys(eventTypes).forEach(eventName => {
      const methodName = `emit${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;
      typedEmitter[methodName] = (data, metadata) => {
        return this.emit(eventName, data, metadata);
      };

      const onMethodName = `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;
      typedEmitter[onMethodName] = (listener, options) => {
        return this.on(eventName, listener, options);
      };
    });

    return typedEmitter;
  }

  /**
   * Wrap listener with middleware and options
   * @param {Function} listener - Original listener
   * @param {Object} options - Listener options
   * @returns {Function} Wrapped listener
   */
  _wrapListener(listener, options) {
    return async (eventContext) => {
      try {
        // Execute before-listen middleware
        if (this.options.enableMiddleware) {
          for (const middleware of this.beforeListenMiddleware) {
            await this._executeMiddleware(middleware, eventContext, 'beforeListen');
            if (eventContext.cancelled) {
              return; // Skip listener execution
            }
          }
        }

        // Apply filter
        if (options.filter && !options.filter(eventContext)) {
          return; // Skip listener execution
        }

        // Apply transform
        let data = eventContext.data;
        if (options.transform) {
          data = options.transform(data, eventContext);
        }

        // Execute listener
        await listener({ ...eventContext, data });
        
        this.stats.eventsReceived++;

        // Execute after-listen middleware
        if (this.options.enableMiddleware) {
          for (const middleware of this.afterListenMiddleware) {
            await this._executeMiddleware(middleware, eventContext, 'afterListen');
          }
        }

        // Record metrics
        if (this.metrics && this.options.enableMetrics) {
          this.metrics.recordEventReception({
            eventName: eventContext.name,
            namespace: this.options.namespace,
            success: true
          });
        }
      } catch (error) {
        this.stats.errors++;
        
        if (this.logger) {
          this.logger.error('Event listener execution failed', {
            eventName: eventContext.name,
            eventId: eventContext.id,
            error: error.message,
            namespace: this.options.namespace
          });
        }

        // Record metrics
        if (this.metrics && this.options.enableMetrics) {
          this.metrics.recordEventReception({
            eventName: eventContext.name,
            namespace: this.options.namespace,
            success: false,
            error: error.message
          });
        }

        // Re-throw error to maintain error handling behavior
        throw error;
      }
    };
  }

  /**
   * Execute middleware function
   * @param {Function} middleware - Middleware function
   * @param {Object} eventContext - Event context
   * @param {string} phase - Middleware phase
   */
  async _executeMiddleware(middleware, eventContext, phase) {
    try {
      this.stats.middlewareExecutions++;
      await middleware(eventContext, phase);
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Middleware execution failed', {
          phase,
          eventName: eventContext.name,
          eventId: eventContext.id,
          error: error.message,
          namespace: this.options.namespace
        });
      }
      
      throw error;
    }
  }

  /**
   * Validate event data against schema
   * @param {string} eventName - Event name
   * @param {*} data - Event data
   * @returns {boolean} Validation result
   */
  _validateEventData(eventName, data) {
    const schema = this.eventSchemas.get(eventName);
    if (!schema) {
      return true; // No schema, assume valid
    }

    // Simple validation - in production, use a proper JSON schema validator
    try {
      if (schema.type && typeof data !== schema.type) {
        return false;
      }
      
      if (schema.required && Array.isArray(schema.required)) {
        for (const field of schema.required) {
          if (data == null || !(field in data)) {
            return false;
          }
        }
      }
      
      return true;
    } catch (error) {
      if (this.logger) {
        this.logger.error('Event data validation error', {
          eventName,
          error: error.message,
          namespace: this.options.namespace
        });
      }
      return false;
    }
  }

  /**
   * Check if event name is a wildcard pattern
   * @param {string} eventName - Event name
   * @returns {boolean} Is wildcard pattern
   */
  _isWildcardPattern(eventName) {
    return eventName.includes('*') || eventName.includes('?');
  }

  /**
   * Add wildcard listener
   * @param {string} pattern - Wildcard pattern
   * @param {Function} listener - Event listener
   * @param {Object} options - Listener options
   */
  _addWildcardListener(pattern, listener, options) {
    if (!this.wildcardListeners.has(pattern)) {
      this.wildcardListeners.set(pattern, []);
    }
    
    this.wildcardListeners.get(pattern).push({
      listener,
      options,
      id: uuidv4()
    });
  }

  /**
   * Remove wildcard listener
   * @param {string} pattern - Wildcard pattern
   * @param {Function} listener - Event listener
   */
  _removeWildcardListener(pattern, listener) {
    const listeners = this.wildcardListeners.get(pattern);
    if (listeners) {
      const index = listeners.findIndex(l => l.listener === listener);
      if (index !== -1) {
        listeners.splice(index, 1);
        if (listeners.length === 0) {
          this.wildcardListeners.delete(pattern);
        }
      }
    }
  }

  /**
   * Emit to wildcard listeners
   * @param {string} eventName - Event name
   * @param {Object} eventContext - Event context
   */
  _emitToWildcardListeners(eventName, eventContext) {
    for (const [pattern, listeners] of this.wildcardListeners) {
      if (this._matchesPattern(eventName, pattern)) {
        for (const { listener, options } of listeners) {
          try {
            listener(eventContext);
            
            // Remove if it's a once listener
            if (options.once) {
              this._removeWildcardListener(pattern, listener);
            }
          } catch (error) {
            this.stats.errors++;
            
            if (this.logger) {
              this.logger.error('Wildcard listener execution failed', {
                pattern,
                eventName,
                error: error.message,
                namespace: this.options.namespace
              });
            }
          }
        }
      }
    }
  }

  /**
   * Check if event name matches wildcard pattern
   * @param {string} eventName - Event name
   * @param {string} pattern - Wildcard pattern
   * @returns {boolean} Match result
   */
  _matchesPattern(eventName, pattern) {
    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(eventName);
  }

  /**
   * Add event to history
   * @param {Object} eventContext - Event context
   */
  _addToHistory(eventContext) {
    this.eventHistory.push({
      ...eventContext,
      timestamp: new Date().toISOString()
    });
    
    // Maintain history size limit
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Get event statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeListeners: this.eventNames().reduce((total, eventName) => {
        return total + this.listenerCount(eventName);
      }, 0),
      wildcardListeners: Array.from(this.wildcardListeners.values())
        .reduce((total, listeners) => total + listeners.length, 0),
      eventHistory: this.eventHistory.length,
      namespace: this.options.namespace
    };
  }

  /**
   * Get event history
   * @param {Object} options - Filter options
   * @returns {Array} Event history
   */
  getHistory(options = {}) {
    const {
      eventName = null,
      limit = 100,
      since = null,
      until = null
    } = options;

    let history = [...this.eventHistory];

    // Filter by event name
    if (eventName) {
      history = history.filter(event => event.name === eventName);
    }

    // Filter by time range
    if (since) {
      const sinceTime = new Date(since).getTime();
      history = history.filter(event => new Date(event.timestamp).getTime() >= sinceTime);
    }
    
    if (until) {
      const untilTime = new Date(until).getTime();
      history = history.filter(event => new Date(event.timestamp).getTime() <= untilTime);
    }

    // Apply limit
    return history.slice(-limit);
  }

  /**
   * Clear event history
   */
  clearHistory() {
    this.eventHistory = [];
  }

  /**
   * Remove all listeners and cleanup
   */
  removeAllListeners(eventName) {
    if (eventName) {
      super.removeAllListeners(eventName);
      
      // Remove wildcard listeners for this event
      for (const [pattern, listeners] of this.wildcardListeners) {
        if (this._matchesPattern(eventName, pattern)) {
          this.wildcardListeners.delete(pattern);
        }
      }
    } else {
      super.removeAllListeners();
      this.wildcardListeners.clear();
    }
    
    return this;
  }
}

export default TypedEventEmitter;