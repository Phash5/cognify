const eventBus = require('./eventBus');
const { validateEvent, getLatestVersion } = require('./schemas');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class EventEmitter {
  constructor() {
    this.eventBus = eventBus;
  }

  async initialize() {
    if (!this.eventBus.isConnected) {
      await this.eventBus.connect();
    }
  }

  // Project Events
  async emitProjectCreated(projectData, metadata = {}) {
    const event = {
      id: uuidv4(),
      type: 'project.created',
      version: getLatestVersion('project.created'),
      timestamp: new Date().toISOString(),
      aggregateId: projectData.id,
      aggregateType: 'project',
      payload: {
        projectId: projectData.id,
        metadata: projectData.metadata,
        architecture: projectData.architecture
      },
      metadata: {
        source: 'cognify-server',
        correlationId: metadata.correlationId || uuidv4(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        sessionId: metadata.sessionId,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress
      }
    };

    try {
      validateEvent(event);
      await this.eventBus.publish(event.type, event.payload, event.metadata);
      logger.info(`Project created event emitted: ${projectData.id}`);
    } catch (error) {
      logger.error('Failed to emit project created event:', error);
      throw error;
    }
  }

  async emitProjectUpdated(projectId, changes, previousVersion, metadata = {}) {
    const event = {
      id: uuidv4(),
      type: 'project.updated',
      version: getLatestVersion('project.updated'),
      timestamp: new Date().toISOString(),
      aggregateId: projectId,
      aggregateType: 'project',
      payload: {
        projectId,
        changes,
        previousVersion,
        updatedFields: Object.keys(changes)
      },
      metadata: {
        source: 'cognify-server',
        correlationId: metadata.correlationId || uuidv4(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        sessionId: metadata.sessionId,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress
      }
    };

    try {
      validateEvent(event);
      await this.eventBus.publish(event.type, event.payload, event.metadata);
      logger.info(`Project updated event emitted: ${projectId}`);
    } catch (error) {
      logger.error('Failed to emit project updated event:', error);
      throw error;
    }
  }

  async emitProjectDeleted(projectId, reason, metadata = {}) {
    const event = {
      id: uuidv4(),
      type: 'project.deleted',
      version: getLatestVersion('project.deleted'),
      timestamp: new Date().toISOString(),
      aggregateId: projectId,
      aggregateType: 'project',
      payload: {
        projectId,
        deletedAt: new Date().toISOString(),
        reason
      },
      metadata: {
        source: 'cognify-server',
        correlationId: metadata.correlationId || uuidv4(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        sessionId: metadata.sessionId,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress
      }
    };

    try {
      validateEvent(event);
      await this.eventBus.publish(event.type, event.payload, event.metadata);
      logger.info(`Project deleted event emitted: ${projectId}`);
    } catch (error) {
      logger.error('Failed to emit project deleted event:', error);
      throw error;
    }
  }

  // Conversation Events
  async emitConversationStarted(projectId, conversationId, intent, initialMessage, metadata = {}) {
    const event = {
      id: uuidv4(),
      type: 'conversation.started',
      version: getLatestVersion('conversation.started'),
      timestamp: new Date().toISOString(),
      aggregateId: conversationId,
      aggregateType: 'conversation',
      payload: {
        projectId,
        conversationId,
        intent,
        initialMessage
      },
      metadata: {
        source: 'cognify-server',
        correlationId: metadata.correlationId || uuidv4(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        sessionId: metadata.sessionId,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress
      }
    };

    try {
      validateEvent(event);
      await this.eventBus.publish(event.type, event.payload, event.metadata);
      logger.info(`Conversation started event emitted: ${conversationId}`);
    } catch (error) {
      logger.error('Failed to emit conversation started event:', error);
      throw error;
    }
  }

  async emitMessageAdded(projectId, conversationId, message, metadata = {}) {
    const event = {
      id: uuidv4(),
      type: 'message.added',
      version: getLatestVersion('message.added'),
      timestamp: new Date().toISOString(),
      aggregateId: conversationId,
      aggregateType: 'conversation',
      payload: {
        projectId,
        conversationId,
        message
      },
      metadata: {
        source: 'cognify-server',
        correlationId: metadata.correlationId || uuidv4(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        sessionId: metadata.sessionId,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress
      }
    };

    try {
      validateEvent(event);
      await this.eventBus.publish(event.type, event.payload, event.metadata);
      logger.info(`Message added event emitted: ${message.id}`);
    } catch (error) {
      logger.error('Failed to emit message added event:', error);
      throw error;
    }
  }

  // Deployment Events
  async emitDeploymentInitiated(projectId, deploymentId, environment, triggeredBy, config = {}, metadata = {}) {
    const event = {
      id: uuidv4(),
      type: 'deployment.initiated',
      version: getLatestVersion('deployment.initiated'),
      timestamp: new Date().toISOString(),
      aggregateId: deploymentId,
      aggregateType: 'deployment',
      payload: {
        projectId,
        deploymentId,
        environment,
        triggeredBy,
        branch: config.branch,
        commit: config.commit,
        config
      },
      metadata: {
        source: 'cognify-server',
        correlationId: metadata.correlationId || uuidv4(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        sessionId: metadata.sessionId,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress
      }
    };

    try {
      validateEvent(event);
      await this.eventBus.publish(event.type, event.payload, event.metadata);
      logger.info(`Deployment initiated event emitted: ${deploymentId}`);
    } catch (error) {
      logger.error('Failed to emit deployment initiated event:', error);
      throw error;
    }
  }

  async emitDeploymentCompleted(projectId, deploymentId, status, url, duration, logs = [], metadata = {}) {
    const event = {
      id: uuidv4(),
      type: 'deployment.completed',
      version: getLatestVersion('deployment.completed'),
      timestamp: new Date().toISOString(),
      aggregateId: deploymentId,
      aggregateType: 'deployment',
      payload: {
        projectId,
        deploymentId,
        status,
        url,
        deployedAt: new Date().toISOString(),
        duration,
        logs
      },
      metadata: {
        source: 'cognify-server',
        correlationId: metadata.correlationId || uuidv4(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        sessionId: metadata.sessionId,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress
      }
    };

    try {
      validateEvent(event);
      await this.eventBus.publish(event.type, event.payload, event.metadata);
      logger.info(`Deployment completed event emitted: ${deploymentId}`);
    } catch (error) {
      logger.error('Failed to emit deployment completed event:', error);
      throw error;
    }
  }

  // Build Events
  async emitBuildStarted(projectId, buildId, triggeredBy, buildConfig = {}, metadata = {}) {
    const event = {
      id: uuidv4(),
      type: 'build.started',
      version: getLatestVersion('build.started'),
      timestamp: new Date().toISOString(),
      aggregateId: buildId,
      aggregateType: 'build',
      payload: {
        projectId,
        buildId,
        triggeredBy,
        branch: buildConfig.branch,
        commit: buildConfig.commit,
        buildConfig
      },
      metadata: {
        source: 'cognify-server',
        correlationId: metadata.correlationId || uuidv4(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        sessionId: metadata.sessionId,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress
      }
    };

    try {
      validateEvent(event);
      await this.eventBus.publish(event.type, event.payload, event.metadata);
      logger.info(`Build started event emitted: ${buildId}`);
    } catch (error) {
      logger.error('Failed to emit build started event:', error);
      throw error;
    }
  }

  async emitBuildCompleted(projectId, buildId, status, artifacts = [], logs = [], duration, metadata = {}) {
    const event = {
      id: uuidv4(),
      type: 'build.completed',
      version: getLatestVersion('build.completed'),
      timestamp: new Date().toISOString(),
      aggregateId: buildId,
      aggregateType: 'build',
      payload: {
        projectId,
        buildId,
        status,
        artifacts,
        logs,
        duration,
        completedAt: new Date().toISOString()
      },
      metadata: {
        source: 'cognify-server',
        correlationId: metadata.correlationId || uuidv4(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        sessionId: metadata.sessionId,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress
      }
    };

    try {
      validateEvent(event);
      await this.eventBus.publish(event.type, event.payload, event.metadata);
      logger.info(`Build completed event emitted: ${buildId}`);
    } catch (error) {
      logger.error('Failed to emit build completed event:', error);
      throw error;
    }
  }

  // File Events
  async emitFileCreated(projectId, filePath, content, size, mimeType, createdBy, metadata = {}) {
    const event = {
      id: uuidv4(),
      type: 'file.created',
      version: getLatestVersion('file.created'),
      timestamp: new Date().toISOString(),
      aggregateId: projectId,
      aggregateType: 'file',
      payload: {
        projectId,
        filePath,
        content,
        size,
        mimeType,
        createdBy
      },
      metadata: {
        source: 'cognify-server',
        correlationId: metadata.correlationId || uuidv4(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        sessionId: metadata.sessionId,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress
      }
    };

    try {
      validateEvent(event);
      await this.eventBus.publish(event.type, event.payload, event.metadata);
      logger.info(`File created event emitted: ${filePath}`);
    } catch (error) {
      logger.error('Failed to emit file created event:', error);
      throw error;
    }
  }

  async emitFileUpdated(projectId, filePath, changes, updatedBy, metadata = {}) {
    const event = {
      id: uuidv4(),
      type: 'file.updated',
      version: getLatestVersion('file.updated'),
      timestamp: new Date().toISOString(),
      aggregateId: projectId,
      aggregateType: 'file',
      payload: {
        projectId,
        filePath,
        changes,
        updatedBy
      },
      metadata: {
        source: 'cognify-server',
        correlationId: metadata.correlationId || uuidv4(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        sessionId: metadata.sessionId,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress
      }
    };

    try {
      validateEvent(event);
      await this.eventBus.publish(event.type, event.payload, event.metadata);
      logger.info(`File updated event emitted: ${filePath}`);
    } catch (error) {
      logger.error('Failed to emit file updated event:', error);
      throw error;
    }
  }

  // Generic event emission
  async emit(eventType, payload, metadata = {}) {
    try {
      await this.eventBus.publish(eventType, payload, metadata);
      logger.info(`Event emitted: ${eventType}`);
    } catch (error) {
      logger.error(`Failed to emit event ${eventType}:`, error);
      throw error;
    }
  }

  // Subscribe to events
  async subscribe(eventType, handler) {
    await this.eventBus.subscribe(eventType, handler);
  }

  // Start consuming events
  async startConsumer() {
    await this.eventBus.startConsumer();
  }

  // Get event history
  async getEventHistory(aggregateId, limit = 50) {
    return await this.eventBus.getEventHistory(aggregateId, limit);
  }

  // Health check
  async healthCheck() {
    return await this.eventBus.healthCheck();
  }

  // Disconnect
  async disconnect() {
    await this.eventBus.disconnect();
  }
}

// Singleton instance
const eventEmitter = new EventEmitter();

module.exports = eventEmitter;