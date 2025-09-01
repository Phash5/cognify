const { v4: uuidv4 } = require('uuid');
const logger = require('../middleware/logger');

class Task {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.type = data.type; // 'code_generation', 'code_review', 'debugging', 'optimization', etc.
    this.agentType = data.agentType; // 'frontend', 'backend', 'database', 'devops'
    this.priority = data.priority || 'medium'; // 'low', 'medium', 'high', 'urgent'
    this.status = data.status || 'pending'; // 'pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled'
    this.request = data.request; // Original request data
    this.context = data.context || {}; // Additional context for the task
    this.requirements = data.requirements || {}; // Specific requirements
    this.constraints = data.constraints || {}; // Constraints and limitations
    this.dependencies = data.dependencies || []; // Task dependencies
    this.agentId = data.agentId || null; // Assigned agent ID
    this.result = data.result || null; // Task result
    this.error = data.error || null; // Error information if failed
    this.progress = data.progress || 0; // Progress percentage (0-100)
    this.estimatedDuration = data.estimatedDuration || null; // Estimated duration in ms
    this.actualDuration = data.actualDuration || null; // Actual duration in ms
    this.retryCount = data.retryCount || 0; // Number of retry attempts
    this.maxRetries = data.maxRetries || 3; // Maximum retry attempts
    this.correlationId = data.correlationId || uuidv4(); // For tracking related operations
    this.userId = data.userId || null; // User who initiated the task
    this.sessionId = data.sessionId || null; // Session identifier
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.assignedAt = data.assignedAt || null;
    this.startedAt = data.startedAt || null;
    this.completedAt = data.completedAt || null;
    this.failedAt = data.failedAt || null;
    this.metadata = data.metadata || {}; // Additional metadata
  }

  // Static factory methods
  static createCodeGenerationTask(request, agentType = 'backend', options = {}) {
    return new Task({
      type: 'code_generation',
      agentType,
      request,
      priority: options.priority || 'medium',
      requirements: {
        language: options.language || 'javascript',
        framework: options.framework,
        style: options.style || 'modern',
        testing: options.testing || false,
        documentation: options.documentation || false
      },
      constraints: {
        maxLines: options.maxLines || 1000,
        timeout: options.timeout || 30000,
        complexity: options.complexity || 'medium'
      },
      ...options
    });
  }

  static createCodeReviewTask(code, agentType = 'backend', options = {}) {
    return new Task({
      type: 'code_review',
      agentType,
      request: { code, reviewType: options.reviewType || 'comprehensive' },
      priority: options.priority || 'medium',
      requirements: {
        checkSecurity: options.checkSecurity || true,
        checkPerformance: options.checkPerformance || true,
        checkBestPractices: options.checkBestPractices || true,
        checkTesting: options.checkTesting || false
      },
      ...options
    });
  }

  static createDebuggingTask(code, error, agentType = 'backend', options = {}) {
    return new Task({
      type: 'debugging',
      agentType,
      request: { code, error, description: options.description },
      priority: options.priority || 'high',
      requirements: {
        fixType: options.fixType || 'comprehensive',
        preserveLogic: options.preserveLogic || true,
        addLogging: options.addLogging || false
      },
      ...options
    });
  }

  static createOptimizationTask(code, agentType = 'backend', options = {}) {
    return new Task({
      type: 'optimization',
      agentType,
      request: { code, optimizationType: options.optimizationType || 'performance' },
      priority: options.priority || 'medium',
      requirements: {
        targetMetric: options.targetMetric || 'performance',
        preserveFunctionality: options.preserveFunctionality || true,
        maintainReadability: options.maintainReadability || true
      },
      ...options
    });
  }

  static createDatabaseTask(operation, schema, agentType = 'database', options = {}) {
    return new Task({
      type: 'database_operation',
      agentType,
      request: { operation, schema, query: options.query },
      priority: options.priority || 'medium',
      requirements: {
        dbType: options.dbType || 'mongodb',
        optimization: options.optimization || true,
        validation: options.validation || true
      },
      ...options
    });
  }

  static createDeploymentTask(config, agentType = 'devops', options = {}) {
    return new Task({
      type: 'deployment',
      agentType,
      request: { config, environment: options.environment || 'development' },
      priority: options.priority || 'high',
      requirements: {
        platform: options.platform || 'docker',
        monitoring: options.monitoring || true,
        rollback: options.rollback || true
      },
      ...options
    });
  }

  // Instance methods
  assign(agentId) {
    this.agentId = agentId;
    this.status = 'assigned';
    this.assignedAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    
    logger.taskLogger.started(this.id, this.type, {
      agentId,
      agentType: this.agentType
    });
  }

  start() {
    if (this.status !== 'assigned') {
      throw new Error(`Cannot start task with status: ${this.status}`);
    }
    
    this.status = 'in_progress';
    this.startedAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    
    logger.taskLogger.started(this.id, this.type, {
      agentId: this.agentId,
      agentType: this.agentType
    });
  }

  updateProgress(progress, message = '') {
    if (progress < 0 || progress > 100) {
      throw new Error('Progress must be between 0 and 100');
    }
    
    this.progress = progress;
    this.updatedAt = new Date().toISOString();
    
    if (message) {
      this.metadata.progressMessage = message;
    }
    
    logger.taskLogger.progress(this.id, this.type, progress, {
      message,
      agentId: this.agentId
    });
  }

  complete(result) {
    this.status = 'completed';
    this.result = result;
    this.progress = 100;
    this.completedAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    
    if (this.startedAt) {
      this.actualDuration = new Date(this.completedAt) - new Date(this.startedAt);
    }
    
    logger.taskLogger.completed(this.id, this.type, this.actualDuration, {
      agentId: this.agentId,
      agentType: this.agentType,
      resultSize: JSON.stringify(result).length
    });
  }

  fail(error) {
    this.status = 'failed';
    this.error = {
      message: error.message,
      code: error.code || 'TASK_EXECUTION_ERROR',
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
    this.failedAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    
    logger.taskLogger.failed(this.id, this.type, error, {
      agentId: this.agentId,
      agentType: this.agentType,
      retryCount: this.retryCount
    });
  }

  cancel(reason = 'Cancelled by user') {
    this.status = 'cancelled';
    this.metadata.cancellationReason = reason;
    this.updatedAt = new Date().toISOString();
    
    logger.info(`Task cancelled: ${this.id}`, {
      taskId: this.id,
      taskType: this.type,
      reason,
      agentId: this.agentId
    });
  }

  retry() {
    if (this.retryCount >= this.maxRetries) {
      throw new Error(`Maximum retry attempts (${this.maxRetries}) exceeded`);
    }
    
    this.retryCount++;
    this.status = 'pending';
    this.agentId = null;
    this.error = null;
    this.progress = 0;
    this.assignedAt = null;
    this.startedAt = null;
    this.failedAt = null;
    this.updatedAt = new Date().toISOString();
    
    logger.info(`Task retry: ${this.id}`, {
      taskId: this.id,
      taskType: this.type,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries
    });
  }

  addDependency(taskId) {
    if (!this.dependencies.includes(taskId)) {
      this.dependencies.push(taskId);
      this.updatedAt = new Date().toISOString();
    }
  }

  removeDependency(taskId) {
    const index = this.dependencies.indexOf(taskId);
    if (index > -1) {
      this.dependencies.splice(index, 1);
      this.updatedAt = new Date().toISOString();
    }
  }

  canExecute(completedTasks = []) {
    // Check if all dependencies are completed
    return this.dependencies.every(depId => completedTasks.includes(depId));
  }

  isExpired() {
    if (!this.estimatedDuration) return false;
    
    const now = new Date();
    const createdTime = new Date(this.createdAt);
    const expiredTime = new Date(createdTime.getTime() + this.estimatedDuration * 2); // 2x estimated duration
    
    return now > expiredTime;
  }

  getDuration() {
    if (this.actualDuration) {
      return this.actualDuration;
    }
    
    if (this.startedAt) {
      const endTime = this.completedAt || this.failedAt || new Date().toISOString();
      return new Date(endTime) - new Date(this.startedAt);
    }
    
    return null;
  }

  getAge() {
    return new Date() - new Date(this.createdAt);
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      agentType: this.agentType,
      priority: this.priority,
      status: this.status,
      request: this.request,
      context: this.context,
      requirements: this.requirements,
      constraints: this.constraints,
      dependencies: this.dependencies,
      agentId: this.agentId,
      result: this.result,
      error: this.error,
      progress: this.progress,
      estimatedDuration: this.estimatedDuration,
      actualDuration: this.actualDuration,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      correlationId: this.correlationId,
      userId: this.userId,
      sessionId: this.sessionId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      assignedAt: this.assignedAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      failedAt: this.failedAt,
      metadata: this.metadata
    };
  }

  static fromJSON(data) {
    return new Task(data);
  }

  // Validation methods
  validate() {
    const errors = [];
    
    if (!this.type) {
      errors.push('Task type is required');
    }
    
    if (!this.agentType) {
      errors.push('Agent type is required');
    }
    
    if (!this.request) {
      errors.push('Task request is required');
    }
    
    if (!['low', 'medium', 'high', 'urgent'].includes(this.priority)) {
      errors.push('Invalid priority level');
    }
    
    if (!['pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled'].includes(this.status)) {
      errors.push('Invalid status');
    }
    
    return errors;
  }

  isValid() {
    return this.validate().length === 0;
  }
}

module.exports = Task;