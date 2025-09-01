const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const Task = require('../models/Task');
const Agent = require('../models/Agent');
const eventEmitter = require('./eventEmitter');
const logger = require('../middleware/logger');
const telemetryService = require('../config/telemetry');

class OrchestratorService {
  constructor() {
    this.agents = new Map(); // agentId -> Agent
    this.tasks = new Map(); // taskId -> Task
    this.taskQueue = []; // Priority queue for pending tasks
    this.activeOrchestrations = new Map(); // orchestrationId -> orchestration data
    this.isRunning = false;
    this.processingInterval = null;
    this.healthCheckInterval = null;
    this.cleanupInterval = null;
  }

  async init() {
    try {
      // Set up event handlers
      this.setupEventHandlers();
      
      // Start processing loops
      this.start();
      
      logger.info('Orchestrator service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize orchestrator service:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    // Listen for agent registration events
    eventEmitter.on('AgentRegistered', async (data, metadata, eventId) => {
      try {
        await this.handleAgentRegistered(data);
      } catch (error) {
        logger.error('Error handling AgentRegistered event:', error);
      }
    });

    // Listen for agent unregistration events
    eventEmitter.on('AgentUnregistered', async (data, metadata, eventId) => {
      try {
        await this.handleAgentUnregistered(data);
      } catch (error) {
        logger.error('Error handling AgentUnregistered event:', error);
      }
    });

    // Listen for task completion events from agents
    eventEmitter.on('TaskCompleted', async (data, metadata, eventId) => {
      try {
        await this.handleTaskCompleted(data);
      } catch (error) {
        logger.error('Error handling TaskCompleted event:', error);
      }
    });

    // Listen for task failure events from agents
    eventEmitter.on('TaskFailed', async (data, metadata, eventId) => {
      try {
        await this.handleTaskFailed(data);
      } catch (error) {
        logger.error('Error handling TaskFailed event:', error);
      }
    });
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Start task processing loop
    this.processingInterval = setInterval(() => {
      this.processTaskQueue();
    }, 1000); // Process every second
    
    // Start health check loop
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, 30000); // Check every 30 seconds
    
    // Start cleanup loop
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 300000); // Cleanup every 5 minutes
    
    logger.serviceLogger.startup('orchestrator', null, {
      taskQueueSize: this.taskQueue.length,
      agentCount: this.agents.size
    });
  }

  stop() {
    this.isRunning = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    logger.serviceLogger.shutdown('orchestrator');
  }

  // Agent Management
  async registerAgent(agentData) {
    try {
      const agent = new Agent(agentData);
      
      // Validate agent
      const validationErrors = agent.validate();
      if (validationErrors.length > 0) {
        throw new Error(`Agent validation failed: ${validationErrors.join(', ')}`);
      }
      
      // Test agent connectivity
      await this.testAgentConnectivity(agent);
      
      // Register agent
      agent.register();
      this.agents.set(agent.id, agent);
      
      // Emit registration event
      await eventEmitter.emitAgentRegistered(agent);
      
      // Track telemetry
      telemetryService.trackAgentOperation('register', agent.type, agent.id, {
        endpoint: agent.endpoint,
        capabilities: agent.capabilities.length
      });
      
      logger.info(`Agent registered: ${agent.id}`, {
        agentId: agent.id,
        agentType: agent.type,
        endpoint: agent.endpoint
      });
      
      return agent;
    } catch (error) {
      logger.error('Failed to register agent:', error);
      throw error;
    }
  }

  async unregisterAgent(agentId) {
    try {
      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      
      // Cancel any active tasks assigned to this agent
      await this.cancelAgentTasks(agentId);
      
      // Unregister agent
      agent.unregister();
      this.agents.delete(agentId);
      
      // Emit unregistration event
      await eventEmitter.emitAgentUnregistered(agentId, agent.type);
      
      // Track telemetry
      telemetryService.trackAgentOperation('unregister', agent.type, agentId);
      
      logger.info(`Agent unregistered: ${agentId}`);
      
      return true;
    } catch (error) {
      logger.error('Failed to unregister agent:', error);
      throw error;
    }
  }

  async testAgentConnectivity(agent) {
    try {
      const response = await axios.get(`${agent.endpoint}/health`, {
        timeout: agent.timeout || 5000
      });
      
      if (response.status !== 200) {
        throw new Error(`Agent health check failed: ${response.status}`);
      }
      
      return true;
    } catch (error) {
      throw new Error(`Agent connectivity test failed: ${error.message}`);
    }
  }

  // Task Management
  async createTask(taskData) {
    try {
      const task = new Task(taskData);
      
      // Validate task
      const validationErrors = task.validate();
      if (validationErrors.length > 0) {
        throw new Error(`Task validation failed: ${validationErrors.join(', ')}`);
      }
      
      // Store task
      this.tasks.set(task.id, task);
      
      // Add to queue if no dependencies or dependencies are met
      if (task.canExecute(this.getCompletedTaskIds())) {
        this.addToQueue(task);
      }
      
      // Emit task created event
      await eventEmitter.emitTaskCreated(task);
      
      // Track telemetry
      telemetryService.trackTaskOperation('create', task.type, task.id, {
        agentType: task.agentType,
        priority: task.priority
      });
      
      logger.taskLogger.created(task.id, task.type, {
        agentType: task.agentType,
        priority: task.priority
      });
      
      return task;
    } catch (error) {
      logger.error('Failed to create task:', error);
      throw error;
    }
  }

  async orchestrateRequest(request) {
    try {
      const orchestrationId = uuidv4();
      const tasks = await this.analyzeAndCreateTasks(request, orchestrationId);
      
      // Store orchestration
      this.activeOrchestrations.set(orchestrationId, {
        id: orchestrationId,
        request,
        tasks: tasks.map(t => t.id),
        status: 'in_progress',
        createdAt: new Date().toISOString(),
        results: []
      });
      
      // Emit orchestration started event
      await eventEmitter.emitOrchestrationStarted(orchestrationId, tasks);
      
      logger.info(`Orchestration started: ${orchestrationId}`, {
        orchestrationId,
        taskCount: tasks.length
      });
      
      return {
        orchestrationId,
        tasks: tasks.map(t => t.toJSON()),
        status: 'in_progress'
      };
    } catch (error) {
      logger.error('Failed to orchestrate request:', error);
      throw error;
    }
  }

  async analyzeAndCreateTasks(request, orchestrationId) {
    const tasks = [];
    const { type, data, requirements = {} } = request;
    
    switch (type) {
      case 'full_stack_development':
        tasks.push(...await this.createFullStackTasks(data, requirements, orchestrationId));
        break;
      
      case 'code_generation':
        tasks.push(await this.createTask({
          type: 'code_generation',
          agentType: this.determineAgentType(data),
          request: data,
          requirements,
          correlationId: orchestrationId,
          priority: requirements.priority || 'medium'
        }));
        break;
      
      case 'code_review':
        tasks.push(await this.createTask({
          type: 'code_review',
          agentType: this.determineAgentType(data),
          request: data,
          requirements,
          correlationId: orchestrationId,
          priority: requirements.priority || 'medium'
        }));
        break;
      
      case 'debugging':
        tasks.push(await this.createTask({
          type: 'debugging',
          agentType: this.determineAgentType(data),
          request: data,
          requirements,
          correlationId: orchestrationId,
          priority: requirements.priority || 'high'
        }));
        break;
      
      case 'deployment':
        tasks.push(await this.createTask({
          type: 'deployment',
          agentType: 'devops',
          request: data,
          requirements,
          correlationId: orchestrationId,
          priority: requirements.priority || 'high'
        }));
        break;
      
      default:
        throw new Error(`Unknown request type: ${type}`);
    }
    
    return tasks;
  }

  async createFullStackTasks(data, requirements, orchestrationId) {
    const tasks = [];
    
    // Create database schema task
    if (data.database) {
      const dbTask = await this.createTask({
        type: 'database_operation',
        agentType: 'database',
        request: data.database,
        requirements: requirements.database || {},
        correlationId: orchestrationId,
        priority: 'high'
      });
      tasks.push(dbTask);
    }
    
    // Create backend API task
    if (data.backend) {
      const backendTask = await this.createTask({
        type: 'code_generation',
        agentType: 'backend',
        request: data.backend,
        requirements: requirements.backend || {},
        correlationId: orchestrationId,
        dependencies: data.database ? [tasks[tasks.length - 1].id] : [],
        priority: 'high'
      });
      tasks.push(backendTask);
    }
    
    // Create frontend task
    if (data.frontend) {
      const frontendTask = await this.createTask({
        type: 'code_generation',
        agentType: 'frontend',
        request: data.frontend,
        requirements: requirements.frontend || {},
        correlationId: orchestrationId,
        dependencies: data.backend ? [tasks[tasks.length - 1].id] : [],
        priority: 'medium'
      });
      tasks.push(frontendTask);
    }
    
    // Create deployment task
    if (requirements.deploy) {
      const deployTask = await this.createTask({
        type: 'deployment',
        agentType: 'devops',
        request: { components: ['database', 'backend', 'frontend'] },
        requirements: requirements.deployment || {},
        correlationId: orchestrationId,
        dependencies: tasks.map(t => t.id),
        priority: 'medium'
      });
      tasks.push(deployTask);
    }
    
    return tasks;
  }

  determineAgentType(data) {
    // Simple heuristics to determine agent type
    if (data.language) {
      const frontendLanguages = ['javascript', 'typescript', 'jsx', 'tsx'];
      const backendLanguages = ['javascript', 'typescript', 'python', 'java', 'go'];
      
      if (data.framework) {
        const frontendFrameworks = ['react', 'vue', 'angular', 'svelte'];
        const backendFrameworks = ['express', 'fastify', 'koa', 'nestjs'];
        
        if (frontendFrameworks.includes(data.framework.toLowerCase())) {
          return 'frontend';
        }
        if (backendFrameworks.includes(data.framework.toLowerCase())) {
          return 'backend';
        }
      }
      
      if (data.type === 'component' || data.type === 'ui') {
        return 'frontend';
      }
      if (data.type === 'api' || data.type === 'service') {
        return 'backend';
      }
    }
    
    if (data.database || data.schema) {
      return 'database';
    }
    
    if (data.deployment || data.infrastructure) {
      return 'devops';
    }
    
    return 'backend'; // Default
  }

  // Task Queue Management
  addToQueue(task) {
    // Insert task in priority order
    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
    const taskPriority = priorityOrder[task.priority] || 2;
    
    let insertIndex = this.taskQueue.length;
    for (let i = 0; i < this.taskQueue.length; i++) {
      const queueTaskPriority = priorityOrder[this.taskQueue[i].priority] || 2;
      if (taskPriority > queueTaskPriority) {
        insertIndex = i;
        break;
      }
    }
    
    this.taskQueue.splice(insertIndex, 0, task);
    
    logger.debug(`Task added to queue: ${task.id}`, {
      taskId: task.id,
      priority: task.priority,
      queuePosition: insertIndex,
      queueSize: this.taskQueue.length
    });
  }

  async processTaskQueue() {
    if (this.taskQueue.length === 0) return;
    
    const task = this.taskQueue[0];
    
    // Check if task dependencies are met
    if (!task.canExecute(this.getCompletedTaskIds())) {
      return;
    }
    
    // Find available agent
    const agent = this.findBestAgent(task);
    if (!agent) {
      return; // No available agents
    }
    
    // Remove task from queue
    this.taskQueue.shift();
    
    // Assign task to agent
    await this.assignTaskToAgent(task, agent);
  }

  findBestAgent(task) {
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => agent.canHandleTask(task.type))
      .sort((a, b) => b.getScore(task.type, task.priority) - a.getScore(task.type, task.priority));
    
    return availableAgents[0] || null;
  }

  async assignTaskToAgent(task, agent) {
    try {
      // Assign task
      task.assign(agent.id);
      agent.assignTask(task.id);
      
      // Emit task assigned event
      await eventEmitter.emitTaskAssigned(task, agent.id);
      
      // Send task to agent
      const startTime = Date.now();
      const response = await axios.post(`${agent.endpoint}/tasks`, {
        task: task.toJSON()
      }, {
        timeout: agent.timeout || 60000,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': task.correlationId
        }
      });
      
      const responseTime = Date.now() - startTime;
      
      // Track telemetry
      telemetryService.trackAgentOperation('request', agent.type, agent.id, {
        taskId: task.id,
        responseTime
      });
      
      logger.agentLogger.request(agent.id, agent.type, {
        taskId: task.id,
        responseTime
      });
      
      // Start task
      task.start();
      
    } catch (error) {
      // Handle assignment failure
      task.fail(error);
      agent.failTask(task.id, error);
      
      // Track telemetry
      telemetryService.trackTaskOperation('fail', task.type, task.id, {
        error: error.message
      });
      
      logger.error(`Failed to assign task ${task.id} to agent ${agent.id}:`, error);
      
      // Retry task if possible
      if (task.retryCount < task.maxRetries) {
        task.retry();
        this.addToQueue(task);
      }
    }
  }

  // Event Handlers
  async handleAgentRegistered(data) {
    logger.info(`Received agent registration: ${data.agentId}`);
    // Agent is already registered in registerAgent method
  }

  async handleAgentUnregistered(data) {
    logger.info(`Received agent unregistration: ${data.agentId}`);
    // Agent is already unregistered in unregisterAgent method
  }

  async handleTaskCompleted(data) {
    try {
      const task = this.tasks.get(data.taskId);
      const agent = this.agents.get(data.agentId);
      
      if (!task || !agent) {
        logger.warn(`Task or agent not found for completion event: ${data.taskId}`);
        return;
      }
      
      // Complete task
      task.complete(data.result);
      agent.completeTask(data.taskId, data.duration);
      
      // Track telemetry
      telemetryService.trackTaskOperation('complete', task.type, task.id, {
        duration: data.duration
      });
      
      // Check for dependent tasks
      await this.checkDependentTasks(task.id);
      
      // Check orchestration completion
      await this.checkOrchestrationCompletion(task.correlationId);
      
    } catch (error) {
      logger.error('Error handling task completion:', error);
    }
  }

  async handleTaskFailed(data) {
    try {
      const task = this.tasks.get(data.taskId);
      const agent = this.agents.get(data.agentId);
      
      if (!task || !agent) {
        logger.warn(`Task or agent not found for failure event: ${data.taskId}`);
        return;
      }
      
      // Fail task
      const error = new Error(data.error.message);
      error.code = data.error.code;
      task.fail(error);
      agent.failTask(data.taskId, error);
      
      // Track telemetry
      telemetryService.trackTaskOperation('fail', task.type, task.id, {
        error: data.error.message
      });
      
      // Retry task if possible
      if (task.retryCount < task.maxRetries) {
        task.retry();
        this.addToQueue(task);
      } else {
        // Check orchestration completion (with failure)
        await this.checkOrchestrationCompletion(task.correlationId);
      }
      
    } catch (error) {
      logger.error('Error handling task failure:', error);
    }
  }

  async checkDependentTasks(completedTaskId) {
    const dependentTasks = Array.from(this.tasks.values())
      .filter(task => 
        task.status === 'pending' && 
        task.dependencies.includes(completedTaskId) &&
        task.canExecute(this.getCompletedTaskIds())
      );
    
    for (const task of dependentTasks) {
      this.addToQueue(task);
    }
  }

  async checkOrchestrationCompletion(correlationId) {
    const orchestration = this.activeOrchestrations.get(correlationId);
    if (!orchestration) return;
    
    const orchestrationTasks = orchestration.tasks.map(id => this.tasks.get(id)).filter(Boolean);
    const completedTasks = orchestrationTasks.filter(t => t.status === 'completed');
    const failedTasks = orchestrationTasks.filter(t => t.status === 'failed' && t.retryCount >= t.maxRetries);
    
    if (completedTasks.length + failedTasks.length === orchestrationTasks.length) {
      // Orchestration completed
      orchestration.status = 'completed';
      orchestration.completedAt = new Date().toISOString();
      orchestration.results = orchestrationTasks.map(t => ({
        taskId: t.id,
        status: t.status,
        result: t.result,
        error: t.error
      }));
      
      // Emit orchestration completed event
      await eventEmitter.emitOrchestrationCompleted(correlationId, orchestration.results);
      
      logger.info(`Orchestration completed: ${correlationId}`, {
        orchestrationId: correlationId,
        totalTasks: orchestrationTasks.length,
        completedTasks: completedTasks.length,
        failedTasks: failedTasks.length
      });
    }
  }

  // Utility Methods
  getCompletedTaskIds() {
    return Array.from(this.tasks.values())
      .filter(task => task.status === 'completed')
      .map(task => task.id);
  }

  async cancelAgentTasks(agentId) {
    const agentTasks = Array.from(this.tasks.values())
      .filter(task => task.agentId === agentId && 
                     ['assigned', 'in_progress'].includes(task.status));
    
    for (const task of agentTasks) {
      task.cancel('Agent unregistered');
      
      // Re-queue task if it can be retried
      if (task.retryCount < task.maxRetries) {
        task.retry();
        this.addToQueue(task);
      }
    }
  }

  async performHealthChecks() {
    const unhealthyAgents = [];
    
    for (const agent of this.agents.values()) {
      if (!agent.isHealthy()) {
        unhealthyAgents.push(agent);
        agent.setError(new Error('Health check failed'));
      }
    }
    
    if (unhealthyAgents.length > 0) {
      logger.warn(`Found ${unhealthyAgents.length} unhealthy agents`, {
        unhealthyAgents: unhealthyAgents.map(a => ({ id: a.id, type: a.type }))
      });
    }
  }

  async performCleanup() {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    // Clean up old completed tasks
    const oldTasks = Array.from(this.tasks.values())
      .filter(task => 
        ['completed', 'failed', 'cancelled'].includes(task.status) &&
        (now - new Date(task.updatedAt)) > maxAge
      );
    
    for (const task of oldTasks) {
      this.tasks.delete(task.id);
    }
    
    // Clean up old orchestrations
    const oldOrchestrations = Array.from(this.activeOrchestrations.values())
      .filter(orch => 
        orch.status === 'completed' &&
        (now - new Date(orch.completedAt || orch.createdAt)) > maxAge
      );
    
    for (const orch of oldOrchestrations) {
      this.activeOrchestrations.delete(orch.id);
    }
    
    if (oldTasks.length > 0 || oldOrchestrations.length > 0) {
      logger.info('Cleanup completed', {
        tasksRemoved: oldTasks.length,
        orchestrationsRemoved: oldOrchestrations.length
      });
    }
  }

  // API Methods
  getAgents() {
    return Array.from(this.agents.values()).map(agent => agent.toJSON());
  }

  getAgent(agentId) {
    const agent = this.agents.get(agentId);
    return agent ? agent.toJSON() : null;
  }

  getTasks(filters = {}) {
    let tasks = Array.from(this.tasks.values());
    
    if (filters.status) {
      tasks = tasks.filter(task => task.status === filters.status);
    }
    
    if (filters.agentType) {
      tasks = tasks.filter(task => task.agentType === filters.agentType);
    }
    
    if (filters.correlationId) {
      tasks = tasks.filter(task => task.correlationId === filters.correlationId);
    }
    
    return tasks.map(task => task.toJSON());
  }

  getTask(taskId) {
    const task = this.tasks.get(taskId);
    return task ? task.toJSON() : null;
  }

  getOrchestration(orchestrationId) {
    return this.activeOrchestrations.get(orchestrationId) || null;
  }

  getStats() {
    const agents = Array.from(this.agents.values());
    const tasks = Array.from(this.tasks.values());
    
    return {
      agents: {
        total: agents.length,
        online: agents.filter(a => a.status === 'online').length,
        busy: agents.filter(a => a.status === 'busy').length,
        offline: agents.filter(a => a.status === 'offline').length,
        error: agents.filter(a => a.status === 'error').length
      },
      tasks: {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'pending').length,
        assigned: tasks.filter(t => t.status === 'assigned').length,
        inProgress: tasks.filter(t => t.status === 'in_progress').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        failed: tasks.filter(t => t.status === 'failed').length,
        cancelled: tasks.filter(t => t.status === 'cancelled').length
      },
      queue: {
        size: this.taskQueue.length,
        highPriority: this.taskQueue.filter(t => ['urgent', 'high'].includes(t.priority)).length
      },
      orchestrations: {
        active: this.activeOrchestrations.size
      }
    };
  }

  async healthCheck() {
    try {
      const stats = this.getStats();
      
      return {
        status: 'healthy',
        service: 'orchestrator',
        timestamp: new Date().toISOString(),
        details: {
          isRunning: this.isRunning,
          ...stats
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'orchestrator',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async shutdown() {
    try {
      this.stop();
      
      // Cancel all pending tasks
      for (const task of this.tasks.values()) {
        if (['pending', 'assigned', 'in_progress'].includes(task.status)) {
          task.cancel('Service shutdown');
        }
      }
      
      logger.info('Orchestrator service shutdown completed');
    } catch (error) {
      logger.error('Error during orchestrator shutdown:', error);
      throw error;
    }
  }
}

module.exports = new OrchestratorService();