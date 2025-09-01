const orchestratorService = require('../services/orchestratorService');
const logger = require('../middleware/logger');
const telemetryService = require('../config/telemetry');

class OrchestratorController {
  // Orchestration endpoints
  async orchestrateRequest(req, res) {
    const span = telemetryService.createSpan('orchestrator.orchestrate_request');
    
    try {
      const { request, options = {} } = req.body;
      
      if (!request) {
        return res.status(400).json({
          success: false,
          error: 'Request data is required',
          code: 'MISSING_REQUEST_DATA'
        });
      }
      
      // Add user context
      request.userId = req.user?.id;
      request.sessionId = req.sessionId;
      
      span.setAttributes({
        'request.type': request.type,
        'request.userId': request.userId,
        'request.sessionId': request.sessionId
      });
      
      const result = await orchestratorService.orchestrateRequest(request);
      
      logger.info('Request orchestrated successfully', {
        orchestrationId: result.orchestrationId,
        taskCount: result.tasks.length,
        userId: request.userId
      });
      
      res.status(201).json({
        success: true,
        data: result
      });
      
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to orchestrate request:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'ORCHESTRATION_FAILED'
      });
    } finally {
      span.end();
    }
  }
  
  async getOrchestration(req, res) {
    try {
      const { orchestrationId } = req.params;
      
      const orchestration = orchestratorService.getOrchestration(orchestrationId);
      
      if (!orchestration) {
        return res.status(404).json({
          success: false,
          error: 'Orchestration not found',
          code: 'ORCHESTRATION_NOT_FOUND'
        });
      }
      
      res.json({
        success: true,
        data: orchestration
      });
      
    } catch (error) {
      logger.error('Failed to get orchestration:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'GET_ORCHESTRATION_FAILED'
      });
    }
  }
  
  async getOrchestrationTasks(req, res) {
    try {
      const { orchestrationId } = req.params;
      
      const tasks = orchestratorService.getTasks({ correlationId: orchestrationId });
      
      res.json({
        success: true,
        data: tasks
      });
      
    } catch (error) {
      logger.error('Failed to get orchestration tasks:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'GET_ORCHESTRATION_TASKS_FAILED'
      });
    }
  }
  
  // Agent management endpoints
  async registerAgent(req, res) {
    const span = telemetryService.createSpan('orchestrator.register_agent');
    
    try {
      const agentData = req.body;
      
      if (!agentData.type || !agentData.endpoint) {
        return res.status(400).json({
          success: false,
          error: 'Agent type and endpoint are required',
          code: 'MISSING_AGENT_DATA'
        });
      }
      
      span.setAttributes({
        'agent.type': agentData.type,
        'agent.endpoint': agentData.endpoint
      });
      
      const agent = await orchestratorService.registerAgent(agentData);
      
      logger.info('Agent registered successfully', {
        agentId: agent.id,
        agentType: agent.type,
        endpoint: agent.endpoint
      });
      
      res.status(201).json({
        success: true,
        data: agent.toJSON()
      });
      
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to register agent:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'AGENT_REGISTRATION_FAILED'
      });
    } finally {
      span.end();
    }
  }
  
  async unregisterAgent(req, res) {
    const span = telemetryService.createSpan('orchestrator.unregister_agent');
    
    try {
      const { agentId } = req.params;
      
      span.setAttributes({
        'agent.id': agentId
      });
      
      await orchestratorService.unregisterAgent(agentId);
      
      logger.info('Agent unregistered successfully', {
        agentId
      });
      
      res.json({
        success: true,
        message: 'Agent unregistered successfully'
      });
      
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to unregister agent:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'AGENT_UNREGISTRATION_FAILED'
      });
    } finally {
      span.end();
    }
  }
  
  async getAgents(req, res) {
    try {
      const { type, status } = req.query;
      
      let agents = orchestratorService.getAgents();
      
      // Apply filters
      if (type) {
        agents = agents.filter(agent => agent.type === type);
      }
      
      if (status) {
        agents = agents.filter(agent => agent.status === status);
      }
      
      res.json({
        success: true,
        data: agents,
        meta: {
          total: agents.length,
          filters: { type, status }
        }
      });
      
    } catch (error) {
      logger.error('Failed to get agents:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'GET_AGENTS_FAILED'
      });
    }
  }
  
  async getAgent(req, res) {
    try {
      const { agentId } = req.params;
      
      const agent = orchestratorService.getAgent(agentId);
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        });
      }
      
      res.json({
        success: true,
        data: agent
      });
      
    } catch (error) {
      logger.error('Failed to get agent:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'GET_AGENT_FAILED'
      });
    }
  }
  
  async updateAgentHeartbeat(req, res) {
    try {
      const { agentId } = req.params;
      const { status, metrics = {} } = req.body;
      
      const agent = orchestratorService.agents.get(agentId);
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        });
      }
      
      // Update heartbeat
      agent.updateHeartbeat();
      
      // Update status if provided
      if (status && ['online', 'busy', 'maintenance'].includes(status)) {
        agent.status = status;
      }
      
      // Update metrics if provided
      if (metrics.currentTaskCount !== undefined) {
        agent.currentTaskCount = metrics.currentTaskCount;
        agent.loadFactor = agent.currentTaskCount / agent.maxConcurrentTasks;
      }
      
      if (metrics.averageResponseTime !== undefined) {
        agent.averageResponseTime = metrics.averageResponseTime;
      }
      
      res.json({
        success: true,
        message: 'Heartbeat updated successfully'
      });
      
    } catch (error) {
      logger.error('Failed to update agent heartbeat:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'HEARTBEAT_UPDATE_FAILED'
      });
    }
  }
  
  // Task management endpoints
  async createTask(req, res) {
    const span = telemetryService.createSpan('orchestrator.create_task');
    
    try {
      const taskData = req.body;
      
      if (!taskData.type || !taskData.agentType || !taskData.request) {
        return res.status(400).json({
          success: false,
          error: 'Task type, agent type, and request are required',
          code: 'MISSING_TASK_DATA'
        });
      }
      
      // Add user context
      taskData.userId = req.user?.id;
      taskData.sessionId = req.sessionId;
      
      span.setAttributes({
        'task.type': taskData.type,
        'task.agentType': taskData.agentType,
        'task.userId': taskData.userId
      });
      
      const task = await orchestratorService.createTask(taskData);
      
      logger.info('Task created successfully', {
        taskId: task.id,
        taskType: task.type,
        agentType: task.agentType,
        userId: taskData.userId
      });
      
      res.status(201).json({
        success: true,
        data: task.toJSON()
      });
      
    } catch (error) {
      span.recordException(error);
      logger.error('Failed to create task:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'TASK_CREATION_FAILED'
      });
    } finally {
      span.end();
    }
  }
  
  async getTasks(req, res) {
    try {
      const { status, agentType, correlationId, limit = 50, offset = 0 } = req.query;
      
      const filters = {};
      if (status) filters.status = status;
      if (agentType) filters.agentType = agentType;
      if (correlationId) filters.correlationId = correlationId;
      
      let tasks = orchestratorService.getTasks(filters);
      
      // Apply pagination
      const total = tasks.length;
      tasks = tasks.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
      
      res.json({
        success: true,
        data: tasks,
        meta: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          filters
        }
      });
      
    } catch (error) {
      logger.error('Failed to get tasks:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'GET_TASKS_FAILED'
      });
    }
  }
  
  async getTask(req, res) {
    try {
      const { taskId } = req.params;
      
      const task = orchestratorService.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND'
        });
      }
      
      res.json({
        success: true,
        data: task
      });
      
    } catch (error) {
      logger.error('Failed to get task:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'GET_TASK_FAILED'
      });
    }
  }
  
  async cancelTask(req, res) {
    try {
      const { taskId } = req.params;
      const { reason = 'Cancelled by user' } = req.body;
      
      const task = orchestratorService.tasks.get(taskId);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND'
        });
      }
      
      if (!['pending', 'assigned', 'in_progress'].includes(task.status)) {
        return res.status(400).json({
          success: false,
          error: 'Task cannot be cancelled in current status',
          code: 'INVALID_TASK_STATUS'
        });
      }
      
      task.cancel(reason);
      
      logger.info('Task cancelled successfully', {
        taskId,
        reason,
        userId: req.user?.id
      });
      
      res.json({
        success: true,
        message: 'Task cancelled successfully'
      });
      
    } catch (error) {
      logger.error('Failed to cancel task:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'TASK_CANCELLATION_FAILED'
      });
    }
  }
  
  async retryTask(req, res) {
    try {
      const { taskId } = req.params;
      
      const task = orchestratorService.tasks.get(taskId);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND'
        });
      }
      
      if (task.status !== 'failed') {
        return res.status(400).json({
          success: false,
          error: 'Only failed tasks can be retried',
          code: 'INVALID_TASK_STATUS'
        });
      }
      
      if (task.retryCount >= task.maxRetries) {
        return res.status(400).json({
          success: false,
          error: 'Maximum retry attempts exceeded',
          code: 'MAX_RETRIES_EXCEEDED'
        });
      }
      
      task.retry();
      orchestratorService.addToQueue(task);
      
      logger.info('Task retry initiated', {
        taskId,
        retryCount: task.retryCount,
        userId: req.user?.id
      });
      
      res.json({
        success: true,
        message: 'Task retry initiated successfully',
        data: task.toJSON()
      });
      
    } catch (error) {
      logger.error('Failed to retry task:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'TASK_RETRY_FAILED'
      });
    }
  }
  
  // Statistics and monitoring endpoints
  async getStats(req, res) {
    try {
      const stats = orchestratorService.getStats();
      
      res.json({
        success: true,
        data: stats
      });
      
    } catch (error) {
      logger.error('Failed to get stats:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'GET_STATS_FAILED'
      });
    }
  }
  
  async getAgentStats(req, res) {
    try {
      const { agentId } = req.params;
      
      const agent = orchestratorService.agents.get(agentId);
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        });
      }
      
      const stats = agent.getStats();
      
      res.json({
        success: true,
        data: stats
      });
      
    } catch (error) {
      logger.error('Failed to get agent stats:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'GET_AGENT_STATS_FAILED'
      });
    }
  }
  
  // Health check endpoint
  async healthCheck(req, res) {
    try {
      const health = await orchestratorService.healthCheck();
      
      const statusCode = health.status === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json({
        success: health.status === 'healthy',
        data: health
      });
      
    } catch (error) {
      logger.error('Health check failed:', error);
      
      res.status(503).json({
        success: false,
        data: {
          status: 'unhealthy',
          service: 'orchestrator',
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  }
}

module.exports = new OrchestratorController();