const express = require('express');
const orchestratorService = require('../services/orchestratorService');
const logger = require('../middleware/logger');
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array(),
      code: 'VALIDATION_ERROR'
    });
  }
  next();
};

// Rate limiting for agent operations
const agentOperationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: {
    success: false,
    error: 'Too many agent operation requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

// Agent discovery and capabilities
router.get('/discover',
  [
    query('type').optional().isIn(['frontend', 'backend', 'database', 'devops']).withMessage('Invalid agent type'),
    query('capability').optional().isString().withMessage('Capability must be a string'),
    query('status').optional().isIn(['online', 'busy']).withMessage('Invalid status filter')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { type, capability, status } = req.query;
      
      let agents = orchestratorService.getAgents();
      
      // Filter by type
      if (type) {
        agents = agents.filter(agent => agent.type === type);
      }
      
      // Filter by capability
      if (capability) {
        agents = agents.filter(agent => 
          agent.capabilities.some(cap => 
            cap.toLowerCase().includes(capability.toLowerCase())
          )
        );
      }
      
      // Filter by status (only online and busy agents are discoverable)
      const validStatuses = status ? [status] : ['online', 'busy'];
      agents = agents.filter(agent => validStatuses.includes(agent.status));
      
      // Sort by load factor (least loaded first)
      agents.sort((a, b) => a.loadFactor - b.loadFactor);
      
      res.json({
        success: true,
        data: agents.map(agent => ({
          id: agent.id,
          type: agent.type,
          endpoint: agent.endpoint,
          capabilities: agent.capabilities,
          status: agent.status,
          loadFactor: agent.loadFactor,
          averageResponseTime: agent.averageResponseTime,
          lastHeartbeat: agent.lastHeartbeat
        })),
        meta: {
          total: agents.length,
          filters: { type, capability, status }
        }
      });
      
    } catch (error) {
      logger.error('Failed to discover agents:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'AGENT_DISCOVERY_FAILED'
      });
    }
  }
);

// Agent capabilities management
router.get('/capabilities',
  async (req, res) => {
    try {
      const agents = orchestratorService.getAgents();
      
      // Aggregate all capabilities by agent type
      const capabilitiesByType = {};
      
      agents.forEach(agent => {
        if (!capabilitiesByType[agent.type]) {
          capabilitiesByType[agent.type] = new Set();
        }
        
        agent.capabilities.forEach(capability => {
          capabilitiesByType[agent.type].add(capability);
        });
      });
      
      // Convert sets to arrays
      Object.keys(capabilitiesByType).forEach(type => {
        capabilitiesByType[type] = Array.from(capabilitiesByType[type]);
      });
      
      res.json({
        success: true,
        data: capabilitiesByType
      });
      
    } catch (error) {
      logger.error('Failed to get agent capabilities:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'GET_CAPABILITIES_FAILED'
      });
    }
  }
);

// Agent task assignment
router.post('/:agentId/assign',
  agentOperationLimiter,
  [
    param('agentId').isUUID().withMessage('Invalid agent ID'),
    body('taskId').isUUID().withMessage('Invalid task ID')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { agentId } = req.params;
      const { taskId } = req.body;
      
      const agent = orchestratorService.agents.get(agentId);
      const task = orchestratorService.tasks.get(taskId);
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        });
      }
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND'
        });
      }
      
      if (task.status !== 'pending') {
        return res.status(400).json({
          success: false,
          error: 'Task is not in pending status',
          code: 'INVALID_TASK_STATUS'
        });
      }
      
      if (agent.status !== 'online') {
        return res.status(400).json({
          success: false,
          error: 'Agent is not available',
          code: 'AGENT_NOT_AVAILABLE'
        });
      }
      
      // Check if agent can handle this task type
      if (!agent.supportedTaskTypes.includes(task.type)) {
        return res.status(400).json({
          success: false,
          error: 'Agent does not support this task type',
          code: 'UNSUPPORTED_TASK_TYPE'
        });
      }
      
      // Assign task to agent
      task.assignTo(agentId);
      agent.assignTask(taskId);
      
      logger.info('Task assigned to agent', {
        taskId,
        agentId,
        taskType: task.type,
        agentType: agent.type
      });
      
      res.json({
        success: true,
        message: 'Task assigned successfully',
        data: {
          taskId,
          agentId,
          assignedAt: task.assignedAt
        }
      });
      
    } catch (error) {
      logger.error('Failed to assign task to agent:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'TASK_ASSIGNMENT_FAILED'
      });
    }
  }
);

// Agent task completion
router.post('/:agentId/complete',
  agentOperationLimiter,
  [
    param('agentId').isUUID().withMessage('Invalid agent ID'),
    body('taskId').isUUID().withMessage('Invalid task ID'),
    body('result').notEmpty().withMessage('Task result is required'),
    body('metrics').optional().isObject().withMessage('Metrics must be an object')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { agentId } = req.params;
      const { taskId, result, metrics = {} } = req.body;
      
      const agent = orchestratorService.agents.get(agentId);
      const task = orchestratorService.tasks.get(taskId);
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        });
      }
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND'
        });
      }
      
      if (task.assignedAgent !== agentId) {
        return res.status(400).json({
          success: false,
          error: 'Task is not assigned to this agent',
          code: 'TASK_NOT_ASSIGNED'
        });
      }
      
      if (!['assigned', 'in_progress'].includes(task.status)) {
        return res.status(400).json({
          success: false,
          error: 'Task is not in a completable status',
          code: 'INVALID_TASK_STATUS'
        });
      }
      
      // Complete the task
      task.complete(result, metrics);
      agent.completeTask(taskId, metrics.responseTime);
      
      logger.info('Task completed by agent', {
        taskId,
        agentId,
        duration: task.getDuration(),
        responseTime: metrics.responseTime
      });
      
      res.json({
        success: true,
        message: 'Task completed successfully',
        data: {
          taskId,
          agentId,
          completedAt: task.completedAt,
          duration: task.getDuration()
        }
      });
      
    } catch (error) {
      logger.error('Failed to complete task:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'TASK_COMPLETION_FAILED'
      });
    }
  }
);

// Agent task failure
router.post('/:agentId/fail',
  agentOperationLimiter,
  [
    param('agentId').isUUID().withMessage('Invalid agent ID'),
    body('taskId').isUUID().withMessage('Invalid task ID'),
    body('error').notEmpty().withMessage('Error information is required'),
    body('retryable').optional().isBoolean().withMessage('Retryable must be a boolean')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { agentId } = req.params;
      const { taskId, error: taskError, retryable = true } = req.body;
      
      const agent = orchestratorService.agents.get(agentId);
      const task = orchestratorService.tasks.get(taskId);
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        });
      }
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND'
        });
      }
      
      if (task.assignedAgent !== agentId) {
        return res.status(400).json({
          success: false,
          error: 'Task is not assigned to this agent',
          code: 'TASK_NOT_ASSIGNED'
        });
      }
      
      if (!['assigned', 'in_progress'].includes(task.status)) {
        return res.status(400).json({
          success: false,
          error: 'Task is not in a failable status',
          code: 'INVALID_TASK_STATUS'
        });
      }
      
      // Fail the task
      task.fail(taskError, retryable);
      agent.failTask(taskId);
      
      // If retryable and under retry limit, add back to queue
      if (retryable && task.retryCount < task.maxRetries) {
        setTimeout(() => {
          task.retry();
          orchestratorService.addToQueue(task);
        }, Math.pow(2, task.retryCount) * 1000); // Exponential backoff
      }
      
      logger.error('Task failed by agent', {
        taskId,
        agentId,
        error: taskError,
        retryable,
        retryCount: task.retryCount
      });
      
      res.json({
        success: true,
        message: 'Task failure recorded successfully',
        data: {
          taskId,
          agentId,
          failedAt: task.failedAt,
          retryable,
          willRetry: retryable && task.retryCount < task.maxRetries
        }
      });
      
    } catch (error) {
      logger.error('Failed to record task failure:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'TASK_FAILURE_RECORDING_FAILED'
      });
    }
  }
);

// Agent status update
router.post('/:agentId/status',
  agentOperationLimiter,
  [
    param('agentId').isUUID().withMessage('Invalid agent ID'),
    body('status').isIn(['online', 'busy', 'maintenance', 'offline']).withMessage('Invalid status'),
    body('reason').optional().isString().withMessage('Reason must be a string')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { agentId } = req.params;
      const { status, reason } = req.body;
      
      const agent = orchestratorService.agents.get(agentId);
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        });
      }
      
      const previousStatus = agent.status;
      agent.status = status;
      agent.updateHeartbeat();
      
      // If going offline or maintenance, handle assigned tasks
      if (['offline', 'maintenance'].includes(status)) {
        const assignedTasks = orchestratorService.getTasks({ assignedAgent: agentId, status: ['assigned', 'in_progress'] });
        
        assignedTasks.forEach(task => {
          if (status === 'maintenance') {
            // For maintenance, just mark tasks as pending to be reassigned
            task.status = 'pending';
            task.assignedAgent = null;
            task.assignedAt = null;
            orchestratorService.addToQueue(task);
          } else {
            // For offline, fail tasks that were in progress
            if (task.status === 'in_progress') {
              task.fail(`Agent went offline: ${reason || 'No reason provided'}`, true);
            } else {
              task.status = 'pending';
              task.assignedAgent = null;
              task.assignedAt = null;
              orchestratorService.addToQueue(task);
            }
          }
        });
      }
      
      logger.info('Agent status updated', {
        agentId,
        previousStatus,
        newStatus: status,
        reason,
        affectedTasks: status === 'offline' || status === 'maintenance' ? 
          orchestratorService.getTasks({ assignedAgent: agentId }).length : 0
      });
      
      res.json({
        success: true,
        message: 'Agent status updated successfully',
        data: {
          agentId,
          previousStatus,
          newStatus: status,
          updatedAt: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('Failed to update agent status:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'AGENT_STATUS_UPDATE_FAILED'
      });
    }
  }
);

// Agent metrics reporting
router.post('/:agentId/metrics',
  agentOperationLimiter,
  [
    param('agentId').isUUID().withMessage('Invalid agent ID'),
    body('metrics').isObject().withMessage('Metrics object is required'),
    body('metrics.cpuUsage').optional().isFloat({ min: 0, max: 100 }).withMessage('CPU usage must be between 0 and 100'),
    body('metrics.memoryUsage').optional().isFloat({ min: 0, max: 100 }).withMessage('Memory usage must be between 0 and 100'),
    body('metrics.activeConnections').optional().isInt({ min: 0 }).withMessage('Active connections must be non-negative'),
    body('metrics.queueSize').optional().isInt({ min: 0 }).withMessage('Queue size must be non-negative')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { agentId } = req.params;
      const { metrics } = req.body;
      
      const agent = orchestratorService.agents.get(agentId);
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        });
      }
      
      // Update agent metrics
      agent.updateMetrics(metrics);
      agent.updateHeartbeat();
      
      res.json({
        success: true,
        message: 'Agent metrics updated successfully'
      });
      
    } catch (error) {
      logger.error('Failed to update agent metrics:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'AGENT_METRICS_UPDATE_FAILED'
      });
    }
  }
);

// Error handling middleware for this router
router.use((error, req, res, next) => {
  logger.error('Agent route error:', error);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

module.exports = router;