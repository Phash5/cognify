const Redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class EventBus {
  constructor() {
    this.client = null;
    this.subscribers = new Map();
    this.isConnected = false;
    this.streamName = 'cognify:events';
    this.consumerGroup = 'cognify-processors';
    this.consumerName = `consumer-${process.pid}-${Date.now()}`;
  }

  async connect() {
    try {
      this.client = Redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis server connection refused');
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.client.on('error', (err) => {
        logger.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Connected to Redis');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
      });

      await this.client.connect();
      await this.initializeStream();
      
      logger.info('EventBus connected and initialized');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async initializeStream() {
    try {
      // Create consumer group if it doesn't exist
      await this.client.xGroupCreate(this.streamName, this.consumerGroup, '0', {
        MKSTREAM: true
      });
      logger.info(`Consumer group '${this.consumerGroup}' created for stream '${this.streamName}'`);
    } catch (error) {
      if (error.message.includes('BUSYGROUP')) {
        logger.info(`Consumer group '${this.consumerGroup}' already exists`);
      } else {
        logger.error('Failed to create consumer group:', error);
        throw error;
      }
    }
  }

  async publish(eventType, payload, metadata = {}) {
    if (!this.isConnected) {
      throw new Error('EventBus not connected');
    }

    const event = {
      id: uuidv4(),
      type: eventType,
      version: '1.0',
      timestamp: new Date().toISOString(),
      aggregateId: payload.projectId || payload.id || uuidv4(),
      aggregateType: this.extractAggregateType(eventType),
      payload: JSON.stringify(payload),
      metadata: JSON.stringify({
        source: 'cognify-server',
        correlationId: metadata.correlationId || uuidv4(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        ...metadata
      })
    };

    try {
      const result = await this.client.xAdd(this.streamName, '*', event);
      logger.info(`Event published: ${eventType}`, { eventId: event.id, streamId: result });
      return result;
    } catch (error) {
      logger.error('Failed to publish event:', error);
      throw error;
    }
  }

  async subscribe(eventType, handler) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType).push(handler);
    logger.info(`Subscribed to event type: ${eventType}`);
  }

  async startConsumer() {
    if (!this.isConnected) {
      throw new Error('EventBus not connected');
    }

    logger.info(`Starting consumer: ${this.consumerName}`);
    
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
        if (error.message.includes('NOGROUP')) {
          logger.warn('Consumer group does not exist, reinitializing...');
          await this.initializeStream();
        } else {
          logger.error('Error in consume loop:', error);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retrying
        }
      }
    }
  }

  async processMessage(message) {
    try {
      const event = {
        id: message.message.id,
        type: message.message.type,
        version: message.message.version,
        timestamp: message.message.timestamp,
        aggregateId: message.message.aggregateId,
        aggregateType: message.message.aggregateType,
        payload: JSON.parse(message.message.payload),
        metadata: JSON.parse(message.message.metadata)
      };

      logger.debug(`Processing event: ${event.type}`, { eventId: event.id });

      // Find and execute handlers
      const handlers = this.subscribers.get(event.type) || [];
      const promises = handlers.map(handler => 
        this.executeHandler(handler, event)
      );

      await Promise.allSettled(promises);

      // Acknowledge the message
      await this.client.xAck(this.streamName, this.consumerGroup, message.id);
      logger.debug(`Message acknowledged: ${message.id}`);

    } catch (error) {
      logger.error('Error processing message:', error);
      // In a production system, you might want to implement dead letter queue here
    }
  }

  async executeHandler(handler, event) {
    try {
      await handler(event);
      logger.debug(`Handler executed successfully for event: ${event.type}`);
    } catch (error) {
      logger.error(`Handler failed for event ${event.type}:`, error);
      // In production, you might want to implement retry logic or dead letter queue
    }
  }

  extractAggregateType(eventType) {
    const parts = eventType.split('.');
    return parts[0] || 'unknown';
  }

  async getEventHistory(aggregateId, limit = 50) {
    if (!this.isConnected) {
      throw new Error('EventBus not connected');
    }

    try {
      const messages = await this.client.xRange(this.streamName, '-', '+', { COUNT: limit });
      
      return messages
        .map(message => ({
          id: message.message.id,
          type: message.message.type,
          version: message.message.version,
          timestamp: message.message.timestamp,
          aggregateId: message.message.aggregateId,
          aggregateType: message.message.aggregateType,
          payload: JSON.parse(message.message.payload),
          metadata: JSON.parse(message.message.metadata)
        }))
        .filter(event => event.aggregateId === aggregateId)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } catch (error) {
      logger.error('Failed to get event history:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      this.isConnected = false;
      await this.client.disconnect();
      logger.info('EventBus disconnected');
    }
  }

  // Health check method
  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: 'unhealthy', message: 'Not connected to Redis' };
      }
      
      await this.client.ping();
      return { status: 'healthy', message: 'Connected to Redis' };
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }
}

// Singleton instance
const eventBus = new EventBus();

module.exports = eventBus;