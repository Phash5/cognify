const Redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const logger = require('../middleware/logger');
const telemetryService = require('../config/telemetry');

class EventEmitter {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.isConnected = false;
    this.eventHandlers = new Map();
    this.streamName = 'cognify:orchestrator:events';
    this.consumerGroup = 'orchestrator-group';
    this.consumerName = `orchestrator-${process.env.HOSTNAME || 'local'}-${Date.now()}`;
  }

  async init() {
    try {
      // Create Redis clients
      this.client = Redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        retry_delay_on_failure: 100,
        max_retry_delay: 5000,
        retry_unfulfilled_commands: true
      });

      this.subscriber = this.client.duplicate();

      // Set up error handlers
      this.client.on('error', (err) => {
        logger.error('Redis client error:', err);
        this.isConnected = false;
      });

      this.subscriber.on('error', (err) => {
        logger.error('Redis subscriber error:', err);
      });

      // Set up connection handlers
      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        logger.warn('Redis client disconnected');
        this.isConnected = false;
      });

      // Connect to Redis
      await this.client.connect();
      await this.subscriber.connect();

      // Create consumer group if it doesn't exist
      try {
        await this.client.xGroupCreate(this.streamName, this.consumerGroup, '0', {
          MKSTREAM: true
        });
        logger.info(`Created consumer group: ${this.consumerGroup}`);
      } catch (error) {
        if (error.message.includes('BUSYGROUP')) {
          logger.debug(`Consumer group already exists: ${this.consumerGroup}`);
        } else {
          throw error;
        }
      }

      // Start consuming events
      this.startConsuming();

      logger.info('Event emitter initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize event emitter:', error);
      throw error;
    }
  }

  async emit(eventType, data, metadata = {}) {
    if (!this.isConnected) {
      throw new Error('Event emitter not connected to Redis');
    }

    try {
      const eventId = uuidv4();
      const timestamp = new Date().toISOString();
      
      const eventData = {
        id: eventId,
        type: eventType,
        timestamp,
        source: 'ai-orchestrator',
        data: JSON.stringify(data),
        metadata: JSON.stringify({
          version: '1.0.0',
          correlationId: metadata.correlationId || uuidv4(),
          ...metadata
        })
      };

      // Add to Redis stream
      await this.client.xAdd(this.streamName, '*', eventData);

      // Track telemetry
      telemetryService.trackEventOperation('publish', eventType, {
        eventId,
        source: 'ai-orchestrator'
      });

      logger.eventLogger.published(eventType, eventId, { data, metadata });

      return eventId;
    } catch (error) {
      logger.error('Failed to emit event:', error);
      throw error;
    }
  }

  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
    logger.debug(`Registered handler for event type: ${eventType}`);
  }

  off(eventType, handler) {
    if (this.eventHandlers.has(eventType)) {
      const handlers = this.eventHandlers.get(eventType);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        logger.debug(`Unregistered handler for event type: ${eventType}`);
      }
    }
  }

  async startConsuming() {
    logger.info('Starting event consumption...');
    
    // Process pending messages first
    await this.processPendingMessages();
    
    // Start consuming new messages
    this.consumeLoop();
  }

  async processPendingMessages() {
    try {
      const pendingMessages = await this.client.xReadGroup(
        this.consumerGroup,
        this.consumerName,
        [{ key: this.streamName, id: '0' }],
        { COUNT: 10, BLOCK: 0 }
      );

      if (pendingMessages && pendingMessages.length > 0) {
        for (const stream of pendingMessages) {
          for (const message of stream.messages) {
            await this.processMessage(message);
          }
        }
      }
    } catch (error) {
      logger.error('Error processing pending messages:', error);
    }
  }

  async consumeLoop() {
    while (this.isConnected) {
      try {
        const messages = await this.client.xReadGroup(
          this.consumerGroup,
          this.consumerName,
          [{ key: this.streamName, id: '>' }],
          { COUNT: 5, BLOCK: 1000 }
        );

        if (messages && messages.length > 0) {
          for (const stream of messages) {
            for (const message of stream.messages) {
              await this.processMessage(message);
            }
          }
        }
      } catch (error) {
        if (this.isConnected) {
          logger.error('Error in consume loop:', error);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  }

  async processMessage(message) {
    try {
      const { id: messageId, message: fields } = message;
      const eventType = fields.type;
      const eventId = fields.id;
      
      // Parse event data
      const data = JSON.parse(fields.data || '{}');
      const metadata = JSON.parse(fields.metadata || '{}');
      
      // Track telemetry
      telemetryService.trackEventOperation('consume', eventType, {
        eventId,
        messageId
      });

      logger.eventLogger.consumed(eventType, eventId, { messageId });

      // Execute handlers
      if (this.eventHandlers.has(eventType)) {
        const handlers = this.eventHandlers.get(eventType);
        
        for (const handler of handlers) {
          try {
            await handler(data, metadata, eventId);
          } catch (handlerError) {
            logger.error(`Handler error for event ${eventType}:`, handlerError);
          }
        }
      }

      // Acknowledge message
      await this.client.xAck(this.streamName, this.consumerGroup, messageId);
      
    } catch (error) {
      logger.error('Error processing message:', error);
    }
  }

  // Orchestrator-specific event emitters
  async emitTaskCreated(task) {
    return this.emit('TaskCreated', {
      taskId: task.id,
      taskType: task.type,
      agentType: task.agentType,
      priority: task.priority,
      status: task.status,
      createdAt: task.createdAt,
      request: task.request
    }, {
      correlationId: task.correlationId,
      userId: task.userId
    });
  }

  async emitTaskAssigned(task, agentId) {
    return this.emit('TaskAssigned', {
      taskId: task.id,
      taskType: task.type,
      agentId,
      agentType: task.agentType,
      assignedAt: new Date().toISOString()
    }, {
      correlationId: task.correlationId,
      userId: task.userId
    });
  }

  async emitTaskCompleted(task, result) {
    return this.emit('TaskCompleted', {
      taskId: task.id,
      taskType: task.type,
      agentId: task.agentId,
      agentType: task.agentType,
      status: task.status,
      result,
      completedAt: new Date().toISOString(),
      duration: task.duration
    }, {
      correlationId: task.correlationId,
      userId: task.userId
    });
  }

  async emitTaskFailed(task, error) {
    return this.emit('TaskFailed', {
      taskId: task.id,
      taskType: task.type,
      agentId: task.agentId,
      agentType: task.agentType,
      status: task.status,
      error: {
        message: error.message,
        code: error.code || 'UNKNOWN_ERROR'
      },
      failedAt: new Date().toISOString()
    }, {
      correlationId: task.correlationId,
      userId: task.userId
    });
  }

  async emitAgentRegistered(agent) {
    return this.emit('AgentRegistered', {
      agentId: agent.id,
      agentType: agent.type,
      capabilities: agent.capabilities,
      endpoint: agent.endpoint,
      status: agent.status,
      registeredAt: new Date().toISOString()
    });
  }

  async emitAgentUnregistered(agentId, agentType) {
    return this.emit('AgentUnregistered', {
      agentId,
      agentType,
      unregisteredAt: new Date().toISOString()
    });
  }

  async emitOrchestrationStarted(orchestrationId, tasks) {
    return this.emit('OrchestrationStarted', {
      orchestrationId,
      taskCount: tasks.length,
      taskTypes: [...new Set(tasks.map(t => t.type))],
      startedAt: new Date().toISOString()
    });
  }

  async emitOrchestrationCompleted(orchestrationId, results) {
    return this.emit('OrchestrationCompleted', {
      orchestrationId,
      taskCount: results.length,
      successCount: results.filter(r => r.status === 'completed').length,
      failureCount: results.filter(r => r.status === 'failed').length,
      completedAt: new Date().toISOString()
    });
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.isConnected) {
        return {
          status: 'unhealthy',
          service: 'event-emitter',
          error: 'Not connected to Redis',
          timestamp: new Date().toISOString()
        };
      }

      // Test Redis connection
      await this.client.ping();
      
      return {
        status: 'healthy',
        service: 'event-emitter',
        timestamp: new Date().toISOString(),
        details: {
          connected: this.isConnected,
          streamName: this.streamName,
          consumerGroup: this.consumerGroup,
          consumerName: this.consumerName,
          handlerCount: this.eventHandlers.size
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'event-emitter',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async shutdown() {
    try {
      this.isConnected = false;
      
      if (this.client) {
        await this.client.quit();
      }
      
      if (this.subscriber) {
        await this.subscriber.quit();
      }
      
      logger.info('Event emitter shutdown completed');
    } catch (error) {
      logger.error('Error during event emitter shutdown:', error);
      throw error;
    }
  }
}

module.exports = new EventEmitter();