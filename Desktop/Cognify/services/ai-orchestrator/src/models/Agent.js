const { v4: uuidv4 } = require('uuid');
const logger = require('../middleware/logger');

class Agent {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.type = data.type; // 'frontend', 'backend', 'database', 'devops'
    this.name = data.name || `${this.type}-agent-${this.id.slice(0, 8)}`;
    this.description = data.description || '';
    this.version = data.version || '1.0.0';
    this.status = data.status || 'offline'; // 'offline', 'online', 'busy', 'error', 'maintenance'
    this.endpoint = data.endpoint; // HTTP endpoint for communication
    this.capabilities = data.capabilities || []; // List of supported capabilities
    this.supportedTaskTypes = data.supportedTaskTypes || []; // Task types this agent can handle
    this.maxConcurrentTasks = data.maxConcurrentTasks || 5; // Maximum concurrent tasks
    this.currentTaskCount = data.currentTaskCount || 0; // Current number of active tasks
    this.priority = data.priority || 50; // Agent priority (0-100, higher = more priority)
    this.loadFactor = data.loadFactor || 0; // Current load factor (0-1)
    this.averageResponseTime = data.averageResponseTime || 0; // Average response time in ms
    this.successRate = data.successRate || 100; // Success rate percentage
    this.totalTasksCompleted = data.totalTasksCompleted || 0;
    this.totalTasksFailed = data.totalTasksFailed || 0;
    this.lastHeartbeat = data.lastHeartbeat || null;
    this.heartbeatInterval = data.heartbeatInterval || 30000; // 30 seconds
    this.timeout = data.timeout || 60000; // 60 seconds
    this.retryAttempts = data.retryAttempts || 3;
    this.metadata = data.metadata || {};
    this.configuration = data.configuration || {};
    this.tags = data.tags || [];
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.lastActiveAt = data.lastActiveAt || null;
    this.registeredAt = data.registeredAt || null;
    this.unregisteredAt = data.unregisteredAt || null;
  }

  // Static factory methods for different agent types
  static createFrontendAgent(endpoint, options = {}) {
    return new Agent({
      type: 'frontend',
      endpoint,
      capabilities: [
        'react_component_generation',
        'ui_design',
        'responsive_layout',
        'state_management',
        'routing',
        'form_handling',
        'css_styling',
        'accessibility',
        'performance_optimization'
      ],
      supportedTaskTypes: [
        'code_generation',
        'code_review',
        'debugging',
        'optimization',
        'ui_design',
        'component_creation'
      ],
      configuration: {
        framework: options.framework || 'react',
        styleLibrary: options.styleLibrary || 'tailwind',
        stateManagement: options.stateManagement || 'context',
        buildTool: options.buildTool || 'vite'
      },
      ...options
    });
  }

  static createBackendAgent(endpoint, options = {}) {
    return new Agent({
      type: 'backend',
      endpoint,
      capabilities: [
        'api_development',
        'database_integration',
        'authentication',
        'middleware_creation',
        'error_handling',
        'validation',
        'testing',
        'documentation',
        'security',
        'performance_optimization'
      ],
      supportedTaskTypes: [
        'code_generation',
        'code_review',
        'debugging',
        'optimization',
        'api_creation',
        'middleware_creation',
        'testing'
      ],
      configuration: {
        runtime: options.runtime || 'nodejs',
        framework: options.framework || 'express',
        database: options.database || 'mongodb',
        authentication: options.authentication || 'jwt'
      },
      ...options
    });
  }

  static createDatabaseAgent(endpoint, options = {}) {
    return new Agent({
      type: 'database',
      endpoint,
      capabilities: [
        'schema_design',
        'query_optimization',
        'indexing',
        'migration_scripts',
        'data_validation',
        'backup_strategies',
        'performance_tuning',
        'security_configuration'
      ],
      supportedTaskTypes: [
        'database_operation',
        'schema_design',
        'query_optimization',
        'migration',
        'data_analysis'
      ],
      configuration: {
        dbType: options.dbType || 'mongodb',
        version: options.version || 'latest',
        clustering: options.clustering || false,
        replication: options.replication || false
      },
      ...options
    });
  }

  static createDevOpsAgent(endpoint, options = {}) {
    return new Agent({
      type: 'devops',
      endpoint,
      capabilities: [
        'containerization',
        'orchestration',
        'ci_cd_pipeline',
        'monitoring_setup',
        'logging_configuration',
        'security_scanning',
        'infrastructure_as_code',
        'deployment_automation'
      ],
      supportedTaskTypes: [
        'deployment',
        'infrastructure_setup',
        'monitoring_configuration',
        'security_audit',
        'performance_analysis'
      ],
      configuration: {
        platform: options.platform || 'docker',
        orchestrator: options.orchestrator || 'kubernetes',
        cicd: options.cicd || 'github-actions',
        monitoring: options.monitoring || 'prometheus'
      },
      ...options
    });
  }

  // Instance methods
  register() {
    this.status = 'online';
    this.registeredAt = new Date().toISOString();
    this.lastHeartbeat = new Date().toISOString();
    this.lastActiveAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    
    logger.agentLogger.registered(this.id, this.type, {
      endpoint: this.endpoint,
      capabilities: this.capabilities.length
    });
  }

  unregister() {
    this.status = 'offline';
    this.unregisteredAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    
    logger.agentLogger.unregistered(this.id, this.type, {
      totalTasksCompleted: this.totalTasksCompleted,
      successRate: this.successRate
    });
  }

  updateHeartbeat() {
    this.lastHeartbeat = new Date().toISOString();
    this.lastActiveAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    
    if (this.status === 'offline') {
      this.status = 'online';
    }
  }

  assignTask(taskId) {
    if (this.currentTaskCount >= this.maxConcurrentTasks) {
      throw new Error(`Agent ${this.id} is at maximum capacity`);
    }
    
    this.currentTaskCount++;
    this.loadFactor = this.currentTaskCount / this.maxConcurrentTasks;
    this.lastActiveAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    
    if (this.currentTaskCount >= this.maxConcurrentTasks) {
      this.status = 'busy';
    }
    
    logger.debug(`Task assigned to agent: ${this.id}`, {
      agentId: this.id,
      taskId,
      currentLoad: this.currentTaskCount,
      maxCapacity: this.maxConcurrentTasks
    });
  }

  completeTask(taskId, responseTime) {
    if (this.currentTaskCount > 0) {
      this.currentTaskCount--;
    }
    
    this.totalTasksCompleted++;
    this.loadFactor = this.currentTaskCount / this.maxConcurrentTasks;
    this.lastActiveAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    
    // Update average response time
    if (responseTime) {
      this.averageResponseTime = (
        (this.averageResponseTime * (this.totalTasksCompleted - 1) + responseTime) /
        this.totalTasksCompleted
      );
    }
    
    // Update success rate
    const totalTasks = this.totalTasksCompleted + this.totalTasksFailed;
    this.successRate = (this.totalTasksCompleted / totalTasks) * 100;
    
    if (this.status === 'busy' && this.currentTaskCount < this.maxConcurrentTasks) {
      this.status = 'online';
    }
    
    logger.debug(`Task completed by agent: ${this.id}`, {
      agentId: this.id,
      taskId,
      responseTime,
      successRate: this.successRate
    });
  }

  failTask(taskId, error) {
    if (this.currentTaskCount > 0) {
      this.currentTaskCount--;
    }
    
    this.totalTasksFailed++;
    this.loadFactor = this.currentTaskCount / this.maxConcurrentTasks;
    this.lastActiveAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    
    // Update success rate
    const totalTasks = this.totalTasksCompleted + this.totalTasksFailed;
    this.successRate = (this.totalTasksCompleted / totalTasks) * 100;
    
    if (this.status === 'busy' && this.currentTaskCount < this.maxConcurrentTasks) {
      this.status = 'online';
    }
    
    logger.agentLogger.error(this.id, this.type, error, {
      taskId,
      successRate: this.successRate
    });
  }

  setError(error) {
    this.status = 'error';
    this.metadata.lastError = {
      message: error.message,
      timestamp: new Date().toISOString()
    };
    this.updatedAt = new Date().toISOString();
    
    logger.agentLogger.error(this.id, this.type, error);
  }

  setMaintenance(reason = 'Scheduled maintenance') {
    this.status = 'maintenance';
    this.metadata.maintenanceReason = reason;
    this.metadata.maintenanceStarted = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    
    logger.info(`Agent entering maintenance: ${this.id}`, {
      agentId: this.id,
      reason
    });
  }

  exitMaintenance() {
    this.status = 'online';
    this.metadata.maintenanceEnded = new Date().toISOString();
    delete this.metadata.maintenanceReason;
    this.updatedAt = new Date().toISOString();
    
    logger.info(`Agent exiting maintenance: ${this.id}`, {
      agentId: this.id
    });
  }

  canHandleTask(taskType) {
    return this.supportedTaskTypes.includes(taskType) && 
           this.status === 'online' && 
           this.currentTaskCount < this.maxConcurrentTasks;
  }

  hasCapability(capability) {
    return this.capabilities.includes(capability);
  }

  isHealthy() {
    if (this.status === 'offline' || this.status === 'error') {
      return false;
    }
    
    if (!this.lastHeartbeat) {
      return false;
    }
    
    const now = new Date();
    const lastHeartbeat = new Date(this.lastHeartbeat);
    const timeSinceHeartbeat = now - lastHeartbeat;
    
    return timeSinceHeartbeat < (this.heartbeatInterval * 2); // Allow 2x heartbeat interval
  }

  isAvailable() {
    return this.isHealthy() && 
           this.status === 'online' && 
           this.currentTaskCount < this.maxConcurrentTasks;
  }

  getScore(taskType, priority = 'medium') {
    if (!this.canHandleTask(taskType)) {
      return 0;
    }
    
    let score = this.priority; // Base score from agent priority
    
    // Adjust for load factor (prefer less loaded agents)
    score *= (1 - this.loadFactor);
    
    // Adjust for success rate
    score *= (this.successRate / 100);
    
    // Adjust for response time (prefer faster agents)
    if (this.averageResponseTime > 0) {
      const responseTimeFactor = Math.max(0.1, 1 - (this.averageResponseTime / 10000)); // Normalize to 10s
      score *= responseTimeFactor;
    }
    
    // Adjust for task priority
    const priorityMultipliers = {
      low: 0.8,
      medium: 1.0,
      high: 1.2,
      urgent: 1.5
    };
    score *= priorityMultipliers[priority] || 1.0;
    
    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }

  updateConfiguration(config) {
    this.configuration = { ...this.configuration, ...config };
    this.updatedAt = new Date().toISOString();
    
    logger.info(`Agent configuration updated: ${this.id}`, {
      agentId: this.id,
      configuration: config
    });
  }

  addCapability(capability) {
    if (!this.capabilities.includes(capability)) {
      this.capabilities.push(capability);
      this.updatedAt = new Date().toISOString();
    }
  }

  removeCapability(capability) {
    const index = this.capabilities.indexOf(capability);
    if (index > -1) {
      this.capabilities.splice(index, 1);
      this.updatedAt = new Date().toISOString();
    }
  }

  addSupportedTaskType(taskType) {
    if (!this.supportedTaskTypes.includes(taskType)) {
      this.supportedTaskTypes.push(taskType);
      this.updatedAt = new Date().toISOString();
    }
  }

  removeSupportedTaskType(taskType) {
    const index = this.supportedTaskTypes.indexOf(taskType);
    if (index > -1) {
      this.supportedTaskTypes.splice(index, 1);
      this.updatedAt = new Date().toISOString();
    }
  }

  getStats() {
    const totalTasks = this.totalTasksCompleted + this.totalTasksFailed;
    
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      currentLoad: this.currentTaskCount,
      maxCapacity: this.maxConcurrentTasks,
      loadFactor: this.loadFactor,
      totalTasks,
      completedTasks: this.totalTasksCompleted,
      failedTasks: this.totalTasksFailed,
      successRate: this.successRate,
      averageResponseTime: this.averageResponseTime,
      isHealthy: this.isHealthy(),
      isAvailable: this.isAvailable(),
      uptime: this.registeredAt ? new Date() - new Date(this.registeredAt) : 0
    };
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      description: this.description,
      version: this.version,
      status: this.status,
      endpoint: this.endpoint,
      capabilities: this.capabilities,
      supportedTaskTypes: this.supportedTaskTypes,
      maxConcurrentTasks: this.maxConcurrentTasks,
      currentTaskCount: this.currentTaskCount,
      priority: this.priority,
      loadFactor: this.loadFactor,
      averageResponseTime: this.averageResponseTime,
      successRate: this.successRate,
      totalTasksCompleted: this.totalTasksCompleted,
      totalTasksFailed: this.totalTasksFailed,
      lastHeartbeat: this.lastHeartbeat,
      heartbeatInterval: this.heartbeatInterval,
      timeout: this.timeout,
      retryAttempts: this.retryAttempts,
      metadata: this.metadata,
      configuration: this.configuration,
      tags: this.tags,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastActiveAt: this.lastActiveAt,
      registeredAt: this.registeredAt,
      unregisteredAt: this.unregisteredAt
    };
  }

  static fromJSON(data) {
    return new Agent(data);
  }

  // Validation methods
  validate() {
    const errors = [];
    
    if (!this.type) {
      errors.push('Agent type is required');
    }
    
    if (!['frontend', 'backend', 'database', 'devops'].includes(this.type)) {
      errors.push('Invalid agent type');
    }
    
    if (!this.endpoint) {
      errors.push('Agent endpoint is required');
    }
    
    if (!Array.isArray(this.capabilities)) {
      errors.push('Capabilities must be an array');
    }
    
    if (!Array.isArray(this.supportedTaskTypes)) {
      errors.push('Supported task types must be an array');
    }
    
    if (this.maxConcurrentTasks <= 0) {
      errors.push('Max concurrent tasks must be greater than 0');
    }
    
    if (this.priority < 0 || this.priority > 100) {
      errors.push('Priority must be between 0 and 100');
    }
    
    return errors;
  }

  isValid() {
    return this.validate().length === 0;
  }
}

module.exports = Agent;