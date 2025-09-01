const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');
const { logger, logServiceError } = require('../config/logger');
const { trackTask } = require('../config/telemetry');

class EventEmitter {
  constructor() {
    this.redis = null;
    this.subscriber = null;
    this.publisher = null;
    this.isConnected = false;
    this.eventHandlers = new Map();
    this.consumerGroup = 'frontend-agent-group';
    this.consumerName = `frontend-agent-${process.env.HOSTNAME || 'local'}-${Date.now()}`;
    this.streamKey = 'cognify:events';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
  }

  async initialize() {
    try {
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB) || 0,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      };

      // Create Redis instances
      this.publisher = new Redis(redisConfig);
      this.subscriber = new Redis(redisConfig);
      this.redis = new Redis(redisConfig);

      // Set up event handlers
      this.setupEventHandlers();

      // Connect to Redis
      await Promise.all([
        this.publisher.connect(),
        this.subscriber.connect(),
        this.redis.connect()
      ]);

      // Create consumer group if it doesn't exist
      await this.createConsumerGroup();

      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      logger.info('Event emitter initialized successfully', {
        consumerGroup: this.consumerGroup,
        consumerName: this.consumerName,
        streamKey: this.streamKey
      });

      // Start consuming events
      this.startConsuming();

    } catch (error) {
      logServiceError(error, 'Event emitter initialization');
      await this.handleReconnection();
    }
  }

  setupEventHandlers() {
    const instances = [this.publisher, this.subscriber, this.redis];
    
    instances.forEach(instance => {
      if (instance) {
        instance.on('error', (error) => {
          logServiceError(error, 'Redis connection error');
          this.isConnected = false;
        });

        instance.on('close', () => {
          logger.warn('Redis connection closed');
          this.isConnected = false;
          this.handleReconnection();
        });

        instance.on('reconnecting', () => {
          logger.info('Redis reconnecting...');
        });

        instance.on('connect', () => {
          logger.info('Redis connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
        });
      }
    });
  }

  async createConsumerGroup() {
    try {
      await this.redis.xgroup('CREATE', this.streamKey, this.consumerGroup, '0', 'MKSTREAM');
      logger.info(`Consumer group '${this.consumerGroup}' created`);
    } catch (error) {
      if (error.message.includes('BUSYGROUP')) {
        logger.debug(`Consumer group '${this.consumerGroup}' already exists`);
      } else {
        throw error;
      }
    }
  }

  async handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    logger.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.initialize();
    }, delay);
  }

  async emit(eventType, data, metadata = {}) {
    if (!this.isConnected || !this.publisher) {
      logger.warn('Cannot emit event: Redis not connected', { eventType, data });
      return false;
    }

    try {
      const eventId = uuidv4();
      const timestamp = new Date().toISOString();
      
      const eventData = {
        id: eventId,
        type: eventType,
        source: 'frontend-agent',
        timestamp,
        data: JSON.stringify(data),
        metadata: JSON.stringify({
          agentId: process.env.AGENT_ID || 'frontend-agent',
          version: process.env.npm_package_version || '1.0.0',
          ...metadata
        })
      };

      await this.publisher.xadd(this.streamKey, '*', ...Object.entries(eventData).flat());
      
      logger.debug('Event emitted', {
        eventId,
        eventType,
        dataSize: JSON.stringify(data).length
      });

      // Track telemetry
      trackTask('event_emission', null, true);
      
      return eventId;
    } catch (error) {
      logServiceError(error, `Emitting event: ${eventType}`);
      trackTask('event_emission', null, false);
      return false;
    }
  }

  async subscribe(eventType, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Event handler must be a function');
    }

    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }

    this.eventHandlers.get(eventType).add(handler);
    
    logger.info(`Subscribed to event type: ${eventType}`);
  }

  async unsubscribe(eventType, handler) {
    if (this.eventHandlers.has(eventType)) {
      this.eventHandlers.get(eventType).delete(handler);
      
      if (this.eventHandlers.get(eventType).size === 0) {
        this.eventHandlers.delete(eventType);
      }
    }
    
    logger.info(`Unsubscribed from event type: ${eventType}`);
  }

  async startConsuming() {
    if (!this.isConnected || !this.subscriber) {
      return;
    }

    try {
      while (this.isConnected) {
        const events = await this.subscriber.xreadgroup(
          'GROUP', this.consumerGroup, this.consumerName,
          'COUNT', 10,
          'BLOCK', 1000,
          'STREAMS', this.streamKey, '>'
        );

        if (events && events.length > 0) {
          for (const [stream, messages] of events) {
            for (const [messageId, fields] of messages) {
              await this.processEvent(messageId, fields);
            }
          }
        }
      }
    } catch (error) {
      if (this.isConnected) {
        logServiceError(error, 'Event consumption');
        setTimeout(() => this.startConsuming(), 5000);
      }
    }
  }

  async processEvent(messageId, fields) {
    try {
      const eventData = this.parseEventFields(fields);
      
      // Skip events from this agent to avoid loops
      const metadata = JSON.parse(eventData.metadata || '{}');
      if (metadata.agentId === (process.env.AGENT_ID || 'frontend-agent')) {
        await this.acknowledgeEvent(messageId);
        return;
      }

      logger.debug('Processing event', {
        messageId,
        eventType: eventData.type,
        source: eventData.source
      });

      // Find and execute handlers
      const handlers = this.eventHandlers.get(eventData.type);
      if (handlers && handlers.size > 0) {
        const data = JSON.parse(eventData.data || '{}');
        
        for (const handler of handlers) {
          try {
            await handler(data, eventData, metadata);
          } catch (handlerError) {
            logServiceError(handlerError, `Event handler for ${eventData.type}`);
          }
        }
      }

      // Acknowledge the event
      await this.acknowledgeEvent(messageId);
      
      trackTask('event_processing', null, true);
      
    } catch (error) {
      logServiceError(error, `Processing event ${messageId}`);
      trackTask('event_processing', null, false);
    }
  }

  parseEventFields(fields) {
    const eventData = {};
    for (let i = 0; i < fields.length; i += 2) {
      eventData[fields[i]] = fields[i + 1];
    }
    return eventData;
  }

  async acknowledgeEvent(messageId) {
    try {
      await this.redis.xack(this.streamKey, this.consumerGroup, messageId);
    } catch (error) {
      logServiceError(error, `Acknowledging event ${messageId}`);
    }
  }

  // Frontend-specific event emitters
  async emitTaskStarted(taskId, taskType, agentId) {
    return this.emit('task.started', {
      taskId,
      taskType,
      agentId,
      agentType: 'frontend'
    });
  }

  async emitTaskCompleted(taskId, result, metrics) {
    return this.emit('task.completed', {
      taskId,
      result,
      metrics,
      agentType: 'frontend'
    });
  }

  async emitTaskFailed(taskId, error, context) {
    return this.emit('task.failed', {
      taskId,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      context,
      agentType: 'frontend'
    });
  }

  async emitCodeGenerated(taskId, files, metrics) {
    return this.emit('code.generated', {
      taskId,
      files: files.map(f => ({
        path: f.path,
        type: f.type,
        size: f.content ? f.content.length : 0
      })),
      metrics,
      agentType: 'frontend'
    });
  }

  async emitComponentGenerated(taskId, componentName, props, metrics) {
    return this.emit('component.generated', {
      taskId,
      componentName,
      propsCount: props ? props.length : 0,
      metrics,
      agentType: 'frontend'
    });
  }

  async emitOptimizationCompleted(taskId, optimizationType, before, after, improvement) {
    return this.emit('optimization.completed', {
      taskId,
      optimizationType,
      before,
      after,
      improvement,
      agentType: 'frontend'
    });
  }

  async emitAgentStatusChanged(status, metrics) {
    return this.emit('agent.status_changed', {
      agentId: process.env.AGENT_ID || 'frontend-agent',
      agentType: 'frontend',
      status,
      metrics,
      timestamp: new Date().toISOString()
    });
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: 'unhealthy', message: 'Redis not connected' };
      }

      await this.redis.ping();
      
      return {
        status: 'healthy',
        consumerGroup: this.consumerGroup,
        consumerName: this.consumerName,
        streamKey: this.streamKey,
        subscribedEvents: Array.from(this.eventHandlers.keys())
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message
      };
    }
  }

  // Graceful shutdown
  async shutdown() {
    try {
      logger.info('Shutting down event emitter...');
      
      this.isConnected = false;
      
      if (this.publisher) {
        await this.publisher.quit();
      }
      
      if (this.subscriber) {
        await this.subscriber.quit();
      }
      
      if (this.redis) {
        await this.redis.quit();
      }
      
      logger.info('Event emitter shutdown complete');
    } catch (error) {
      logServiceError(error, 'Event emitter shutdown');
    }
  }
}

module.exports = EventEmitter;