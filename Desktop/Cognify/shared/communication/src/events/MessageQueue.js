import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import EventEmitter from 'eventemitter3';

/**
 * Reliable message queue with Redis backend
 */
class MessageQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      queueName: options.queueName || 'default',
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        db: process.env.REDIS_DB || 0,
        keyPrefix: 'queue:',
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      },
      processing: {
        concurrency: 5,
        maxRetries: 3,
        retryDelay: 1000,
        retryBackoff: 'exponential',
        visibilityTimeout: 30000,
        messageTimeout: 300000,
        batchSize: 10
      },
      deadLetter: {
        enabled: true,
        queueName: null, // Will default to `${queueName}-dlq`
        maxRetries: 3
      },
      monitoring: {
        enableMetrics: true,
        enableLogging: true,
        healthCheckInterval: 30000
      },
      ...options
    };

    this.logger = options.logger;
    this.metrics = options.metrics;
    
    // Redis clients
    this.client = null;
    this.subscriber = null;
    this.connected = false;
    
    // Processing state
    this.processing = false;
    this.processors = new Map();
    this.activeJobs = new Map();
    this.messageHandlers = new Map();
    
    // Queue names
    this.queueKey = `${this.options.redis.keyPrefix}${this.options.queueName}`;
    this.processingKey = `${this.queueKey}:processing`;
    this.deadLetterKey = `${this.options.redis.keyPrefix}${this.options.deadLetter.queueName || `${this.options.queueName}-dlq`}`;
    this.statsKey = `${this.queueKey}:stats`;
    
    // Statistics
    this.stats = {
      messagesEnqueued: 0,
      messagesProcessed: 0,
      messagesFailed: 0,
      messagesRetried: 0,
      messagesDeadLettered: 0,
      processingTime: 0,
      errors: 0,
      connectionAttempts: 0
    };

    // Health check timer
    this.healthCheckTimer = null;

    // Initialize Redis connections
    this._initializeRedis();
  }

  /**
   * Initialize Redis connections
   */
  async _initializeRedis() {
    try {
      this.stats.connectionAttempts++;
      
      // Create main client
      this.client = new Redis({
        ...this.options.redis,
        lazyConnect: true
      });

      // Create subscriber client for notifications
      this.subscriber = new Redis({
        ...this.options.redis,
        lazyConnect: true
      });

      // Setup event handlers
      this._setupRedisEventHandlers();

      // Connect to Redis
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect()
      ]);

      this.connected = true;

      // Subscribe to queue notifications
      await this.subscriber.subscribe(`${this.queueKey}:notify`);

      if (this.logger && this.options.monitoring.enableLogging) {
        this.logger.info('MessageQueue connected to Redis', {
          queueName: this.options.queueName,
          host: this.options.redis.host,
          port: this.options.redis.port
        });
      }

      this.emit('connected');

      // Start health check
      if (this.options.monitoring.healthCheckInterval > 0) {
        this._startHealthCheck();
      }
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Failed to connect to Redis', {
          error: error.message,
          queueName: this.options.queueName
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
    // Main client events
    this.client.on('connect', () => {
      if (this.logger && this.options.monitoring.enableLogging) {
        this.logger.debug('Redis client connected');
      }
    });

    this.client.on('error', (error) => {
      this.stats.errors++;
      if (this.logger) {
        this.logger.error('Redis client error', { error: error.message });
      }
      this.emit('clientError', error);
    });

    // Subscriber events
    this.subscriber.on('message', (channel, message) => {
      if (channel === `${this.queueKey}:notify`) {
        this._handleQueueNotification(message);
      }
    });

    this.subscriber.on('error', (error) => {
      this.stats.errors++;
      if (this.logger) {
        this.logger.error('Redis subscriber error', { error: error.message });
      }
      this.emit('subscriberError', error);
    });
  }

  /**
   * Enqueue a message
   * @param {*} data - Message data
   * @param {Object} options - Message options
   * @returns {Promise<string>} Message ID
   */
  async enqueue(data, options = {}) {
    if (!this.connected) {
      throw new Error('MessageQueue not connected to Redis');
    }

    const {
      priority = 0,
      delay = 0,
      maxRetries = this.options.processing.maxRetries,
      timeout = this.options.processing.messageTimeout,
      metadata = {}
    } = options;

    const messageId = uuidv4();
    const timestamp = Date.now();
    const processAt = timestamp + delay;
    
    const message = {
      id: messageId,
      data,
      metadata: {
        ...metadata,
        queueName: this.options.queueName,
        enqueuedAt: timestamp,
        processAt,
        priority,
        maxRetries,
        timeout,
        attempts: 0
      }
    };

    try {
      const score = priority * 1000000 + processAt; // Priority first, then time
      
      // Add to sorted set (priority queue)
      await this.client.zadd(this.queueKey, score, JSON.stringify(message));
      
      // Update statistics
      await this.client.hincrby(this.statsKey, 'enqueued', 1);
      this.stats.messagesEnqueued++;

      // Notify processors
      await this.client.publish(`${this.queueKey}:notify`, 'enqueue');

      if (this.logger && this.options.monitoring.enableLogging) {
        this.logger.debug('Message enqueued', {
          messageId,
          queueName: this.options.queueName,
          priority,
          delay,
          processAt: new Date(processAt).toISOString()
        });
      }

      // Record metrics
      if (this.metrics && this.options.monitoring.enableMetrics) {
        this.metrics.recordMessageEnqueued({
          queueName: this.options.queueName,
          priority,
          delay
        });
      }

      this.emit('messageEnqueued', { messageId, message });
      
      return messageId;
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Failed to enqueue message', {
          messageId,
          error: error.message,
          queueName: this.options.queueName
        });
      }

      throw error;
    }
  }

  /**
   * Register a message processor
   * @param {string} messageType - Message type to process
   * @param {Function} processor - Processor function
   * @param {Object} options - Processor options
   */
  registerProcessor(messageType, processor, options = {}) {
    if (typeof processor !== 'function') {
      throw new Error('Processor must be a function');
    }

    const processorConfig = {
      processor,
      concurrency: options.concurrency || this.options.processing.concurrency,
      maxRetries: options.maxRetries || this.options.processing.maxRetries,
      retryDelay: options.retryDelay || this.options.processing.retryDelay,
      timeout: options.timeout || this.options.processing.messageTimeout,
      ...options
    };

    this.processors.set(messageType, processorConfig);
    
    if (this.logger && this.options.monitoring.enableLogging) {
      this.logger.info('Message processor registered', {
        messageType,
        queueName: this.options.queueName,
        concurrency: processorConfig.concurrency
      });
    }
  }

  /**
   * Start processing messages
   * @returns {Promise<void>}
   */
  async startProcessing() {
    if (!this.connected) {
      throw new Error('MessageQueue not connected to Redis');
    }

    if (this.processing) {
      return; // Already processing
    }

    this.processing = true;
    
    if (this.logger && this.options.monitoring.enableLogging) {
      this.logger.info('Started message processing', {
        queueName: this.options.queueName,
        concurrency: this.options.processing.concurrency
      });
    }

    // Start processing workers
    for (let i = 0; i < this.options.processing.concurrency; i++) {
      this._processMessages().catch(error => {
        if (this.logger) {
          this.logger.error('Processing worker error', {
            workerId: i,
            error: error.message,
            queueName: this.options.queueName
          });
        }
      });
    }

    this.emit('processingStarted');
  }

  /**
   * Stop processing messages
   * @returns {Promise<void>}
   */
  async stopProcessing() {
    this.processing = false;
    
    // Wait for active jobs to complete
    const activeJobIds = Array.from(this.activeJobs.keys());
    if (activeJobIds.length > 0) {
      if (this.logger && this.options.monitoring.enableLogging) {
        this.logger.info('Waiting for active jobs to complete', {
          activeJobs: activeJobIds.length,
          queueName: this.options.queueName
        });
      }

      // Wait up to 30 seconds for jobs to complete
      const timeout = 30000;
      const startTime = Date.now();
      
      while (this.activeJobs.size > 0 && (Date.now() - startTime) < timeout) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (this.logger && this.options.monitoring.enableLogging) {
      this.logger.info('Stopped message processing', {
        queueName: this.options.queueName
      });
    }

    this.emit('processingStopped');
  }

  /**
   * Process messages from the queue
   */
  async _processMessages() {
    while (this.processing && this.connected) {
      try {
        // Get messages ready for processing
        const messages = await this._getMessagesForProcessing();
        
        if (messages.length === 0) {
          // No messages, wait for notification or timeout
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        // Process messages in parallel
        const processingPromises = messages.map(message => 
          this._processMessage(message).catch(error => {
            if (this.logger) {
              this.logger.error('Message processing error', {
                messageId: message.id,
                error: error.message,
                queueName: this.options.queueName
              });
            }
          })
        );

        await Promise.all(processingPromises);
      } catch (error) {
        this.stats.errors++;
        
        if (this.logger) {
          this.logger.error('Processing loop error', {
            error: error.message,
            queueName: this.options.queueName
          });
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Get messages ready for processing
   * @returns {Promise<Array>} Messages to process
   */
  async _getMessagesForProcessing() {
    const now = Date.now();
    const batchSize = this.options.processing.batchSize;
    
    // Get messages that are ready to be processed (score <= now)
    const results = await this.client.zrangebyscore(
      this.queueKey,
      '-inf',
      now,
      'LIMIT',
      0,
      batchSize
    );

    const messages = [];
    
    for (const messageStr of results) {
      try {
        const message = JSON.parse(messageStr);
        
        // Move message to processing set
        const moved = await this.client.eval(`
          local message = ARGV[1]
          local removed = redis.call('ZREM', KEYS[1], message)
          if removed == 1 then
            redis.call('ZADD', KEYS[2], ARGV[2], message)
            return 1
          end
          return 0
        `, 2, this.queueKey, this.processingKey, messageStr, now + this.options.processing.visibilityTimeout);

        if (moved === 1) {
          messages.push(message);
        }
      } catch (error) {
        if (this.logger) {
          this.logger.error('Failed to parse message', {
            error: error.message,
            messageStr: messageStr.substring(0, 200)
          });
        }
      }
    }

    return messages;
  }

  /**
   * Process a single message
   * @param {Object} message - Message to process
   */
  async _processMessage(message) {
    const startTime = Date.now();
    this.activeJobs.set(message.id, { message, startTime });

    try {
      // Find appropriate processor
      const messageType = message.metadata.type || 'default';
      const processorConfig = this.processors.get(messageType) || this.processors.get('default');
      
      if (!processorConfig) {
        throw new Error(`No processor found for message type: ${messageType}`);
      }

      // Execute processor with timeout
      const processingPromise = processorConfig.processor(message.data, message.metadata);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Message processing timeout')), processorConfig.timeout);
      });

      await Promise.race([processingPromise, timeoutPromise]);

      // Message processed successfully
      await this._completeMessage(message);
      
      const processingTime = Date.now() - startTime;
      this.stats.messagesProcessed++;
      this.stats.processingTime += processingTime;

      if (this.logger && this.options.monitoring.enableLogging) {
        this.logger.debug('Message processed successfully', {
          messageId: message.id,
          messageType,
          processingTime,
          queueName: this.options.queueName
        });
      }

      // Record metrics
      if (this.metrics && this.options.monitoring.enableMetrics) {
        this.metrics.recordMessageProcessed({
          queueName: this.options.queueName,
          messageType,
          processingTime,
          success: true
        });
      }

      this.emit('messageProcessed', { message, processingTime });
    } catch (error) {
      await this._handleMessageError(message, error);
    } finally {
      this.activeJobs.delete(message.id);
    }
  }

  /**
   * Complete message processing
   * @param {Object} message - Processed message
   */
  async _completeMessage(message) {
    // Remove from processing set
    await this.client.zrem(this.processingKey, JSON.stringify(message));
    
    // Update statistics
    await this.client.hincrby(this.statsKey, 'processed', 1);
  }

  /**
   * Handle message processing error
   * @param {Object} message - Failed message
   * @param {Error} error - Processing error
   */
  async _handleMessageError(message, error) {
    this.stats.messagesFailed++;
    message.metadata.attempts++;
    message.metadata.lastError = {
      message: error.message,
      stack: error.stack,
      timestamp: Date.now()
    };

    if (this.logger) {
      this.logger.error('Message processing failed', {
        messageId: message.id,
        attempts: message.metadata.attempts,
        maxRetries: message.metadata.maxRetries,
        error: error.message,
        queueName: this.options.queueName
      });
    }

    // Check if we should retry
    if (message.metadata.attempts < message.metadata.maxRetries) {
      await this._retryMessage(message);
    } else {
      await this._deadLetterMessage(message);
    }

    // Record metrics
    if (this.metrics && this.options.monitoring.enableMetrics) {
      this.metrics.recordMessageProcessed({
        queueName: this.options.queueName,
        messageType: message.metadata.type || 'default',
        success: false,
        error: error.message,
        attempts: message.metadata.attempts
      });
    }

    this.emit('messageError', { message, error });
  }

  /**
   * Retry message processing
   * @param {Object} message - Message to retry
   */
  async _retryMessage(message) {
    // Calculate retry delay with exponential backoff
    let retryDelay = this.options.processing.retryDelay;
    
    if (this.options.processing.retryBackoff === 'exponential') {
      retryDelay = retryDelay * Math.pow(2, message.metadata.attempts - 1);
    }

    // Add jitter to prevent thundering herd
    retryDelay += Math.random() * 1000;

    const retryAt = Date.now() + retryDelay;
    message.metadata.processAt = retryAt;
    
    // Remove from processing set
    await this.client.zrem(this.processingKey, JSON.stringify(message));
    
    // Re-add to main queue with new score
    const score = message.metadata.priority * 1000000 + retryAt;
    await this.client.zadd(this.queueKey, score, JSON.stringify(message));
    
    // Update statistics
    await this.client.hincrby(this.statsKey, 'retried', 1);
    this.stats.messagesRetried++;

    if (this.logger && this.options.monitoring.enableLogging) {
      this.logger.info('Message scheduled for retry', {
        messageId: message.id,
        attempts: message.metadata.attempts,
        retryAt: new Date(retryAt).toISOString(),
        retryDelay,
        queueName: this.options.queueName
      });
    }

    this.emit('messageRetried', { message, retryAt, retryDelay });
  }

  /**
   * Move message to dead letter queue
   * @param {Object} message - Failed message
   */
  async _deadLetterMessage(message) {
    if (!this.options.deadLetter.enabled) {
      // Just remove from processing set
      await this.client.zrem(this.processingKey, JSON.stringify(message));
      return;
    }

    message.metadata.deadLetteredAt = Date.now();
    
    // Remove from processing set
    await this.client.zrem(this.processingKey, JSON.stringify(message));
    
    // Add to dead letter queue
    await this.client.zadd(this.deadLetterKey, Date.now(), JSON.stringify(message));
    
    // Update statistics
    await this.client.hincrby(this.statsKey, 'deadLettered', 1);
    this.stats.messagesDeadLettered++;

    if (this.logger && this.options.monitoring.enableLogging) {
      this.logger.warn('Message moved to dead letter queue', {
        messageId: message.id,
        attempts: message.metadata.attempts,
        queueName: this.options.queueName,
        deadLetterQueue: this.deadLetterKey
      });
    }

    this.emit('messageDeadLettered', { message });
  }

  /**
   * Handle queue notification
   * @param {string} message - Notification message
   */
  _handleQueueNotification(message) {
    if (message === 'enqueue') {
      // New message available, wake up processors
      this.emit('newMessage');
    }
  }

  /**
   * Start health check timer
   */
  _startHealthCheck() {
    this.healthCheckTimer = setInterval(async () => {
      try {
        await this._performHealthCheck();
      } catch (error) {
        if (this.logger) {
          this.logger.error('Health check failed', {
            error: error.message,
            queueName: this.options.queueName
          });
        }
      }
    }, this.options.monitoring.healthCheckInterval);
  }

  /**
   * Perform health check
   */
  async _performHealthCheck() {
    // Check for stuck messages in processing set
    const now = Date.now();
    const stuckThreshold = now - (this.options.processing.visibilityTimeout * 2);
    
    const stuckMessages = await this.client.zrangebyscore(
      this.processingKey,
      '-inf',
      stuckThreshold
    );

    if (stuckMessages.length > 0) {
      if (this.logger) {
        this.logger.warn('Found stuck messages, recovering', {
          stuckCount: stuckMessages.length,
          queueName: this.options.queueName
        });
      }

      // Move stuck messages back to main queue
      for (const messageStr of stuckMessages) {
        try {
          const message = JSON.parse(messageStr);
          
          // Remove from processing set
          await this.client.zrem(this.processingKey, messageStr);
          
          // Re-add to main queue
          const score = message.metadata.priority * 1000000 + now;
          await this.client.zadd(this.queueKey, score, messageStr);
        } catch (error) {
          if (this.logger) {
            this.logger.error('Failed to recover stuck message', {
              error: error.message,
              messageStr: messageStr.substring(0, 200)
            });
          }
        }
      }
    }
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>} Queue statistics
   */
  async getStats() {
    if (!this.connected) {
      return this.stats;
    }

    try {
      const [queueSize, processingSize, deadLetterSize, redisStats] = await Promise.all([
        this.client.zcard(this.queueKey),
        this.client.zcard(this.processingKey),
        this.client.zcard(this.deadLetterKey),
        this.client.hgetall(this.statsKey)
      ]);

      return {
        ...this.stats,
        queueSize,
        processingSize,
        deadLetterSize,
        activeJobs: this.activeJobs.size,
        connected: this.connected,
        processing: this.processing,
        redis: {
          enqueued: parseInt(redisStats.enqueued || '0'),
          processed: parseInt(redisStats.processed || '0'),
          retried: parseInt(redisStats.retried || '0'),
          deadLettered: parseInt(redisStats.deadLettered || '0')
        },
        averageProcessingTime: this.stats.messagesProcessed > 0 
          ? this.stats.processingTime / this.stats.messagesProcessed 
          : 0
      };
    } catch (error) {
      if (this.logger) {
        this.logger.error('Failed to get queue stats', {
          error: error.message,
          queueName: this.options.queueName
        });
      }
      return this.stats;
    }
  }

  /**
   * Get queue health status
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: []
    };

    try {
      // Check Redis connection
      await this.client.ping();
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

    // Check processing status
    if (this.processing) {
      health.checks.push({
        name: 'processing',
        status: 'healthy',
        message: 'Message processing is active'
      });
    } else {
      health.status = 'degraded';
      health.checks.push({
        name: 'processing',
        status: 'degraded',
        message: 'Message processing is stopped'
      });
    }

    // Check error rate
    const totalMessages = this.stats.messagesProcessed + this.stats.messagesFailed;
    if (totalMessages > 0) {
      const errorRate = this.stats.messagesFailed / totalMessages;
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
    }

    return health;
  }

  /**
   * Close message queue and cleanup resources
   */
  async close() {
    try {
      // Stop processing
      await this.stopProcessing();

      // Clear health check timer
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = null;
      }

      // Close Redis connections
      if (this.client) {
        await this.client.quit();
      }
      if (this.subscriber) {
        await this.subscriber.quit();
      }

      this.connected = false;
      this.removeAllListeners();

      if (this.logger && this.options.monitoring.enableLogging) {
        this.logger.info('MessageQueue closed', {
          queueName: this.options.queueName
        });
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error('Error closing MessageQueue', {
          error: error.message,
          queueName: this.options.queueName
        });
      }
      throw error;
    }
  }
}

export default MessageQueue;