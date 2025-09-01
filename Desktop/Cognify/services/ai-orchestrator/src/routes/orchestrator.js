const express = require('express');
const orchestratorController = require('../controllers/orchestratorController');
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

// Rate limiting
const orchestrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many orchestration requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

const agentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  message: {
    success: false,
    error: 'Too many agent requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

// Orchestration routes
router.post('/orchestrate',
  orchestrationLimiter,
  [
    body('request').notEmpty().withMessage('Request data is required'),
    body('request.type').isIn(['code_generation', 'code_review', 'debugging', 'optimization', 'full_stack_development']).withMessage('Invalid request type'),
    body('request.description').notEmpty().withMessage('Request description is required'),
    body('options').optional().isObject().withMessage('Options must be an object')
  ],
  handleValidationErrors,
  orchestratorController.orchestrateRequest
);

router.get('/orchestrations/:orchestrationId',
  [
    param('orchestrationId').isUUID().withMessage('Invalid orchestration ID')
  ],
  handleValidationErrors,
  orchestratorController.getOrchestration
);

router.get('/orchestrations/:orchestrationId/tasks',
  [
    param('orchestrationId').isUUID().withMessage('Invalid orchestration ID')
  ],
  handleValidationErrors,
  orchestratorController.getOrchestrationTasks
);

// Agent management routes
router.post('/agents',
  agentLimiter,
  [
    body('type').isIn(['frontend', 'backend', 'database', 'devops']).withMessage('Invalid agent type'),
    body('endpoint').isURL().withMessage('Valid endpoint URL is required'),
    body('capabilities').optional().isArray().withMessage('Capabilities must be an array'),
    body('maxConcurrentTasks').optional().isInt({ min: 1, max: 100 }).withMessage('Max concurrent tasks must be between 1 and 100')
  ],
  handleValidationErrors,
  orchestratorController.registerAgent
);

router.delete('/agents/:agentId',
  [
    param('agentId').isUUID().withMessage('Invalid agent ID')
  ],
  handleValidationErrors,
  orchestratorController.unregisterAgent
);

router.get('/agents',
  [
    query('type').optional().isIn(['frontend', 'backend', 'database', 'devops']).withMessage('Invalid agent type filter'),
    query('status').optional().isIn(['online', 'offline', 'busy', 'maintenance']).withMessage('Invalid status filter')
  ],
  handleValidationErrors,
  orchestratorController.getAgents
);

router.get('/agents/:agentId',
  [
    param('agentId').isUUID().withMessage('Invalid agent ID')
  ],
  handleValidationErrors,
  orchestratorController.getAgent
);

router.post('/agents/:agentId/heartbeat',
  [
    param('agentId').isUUID().withMessage('Invalid agent ID'),
    body('status').optional().isIn(['online', 'busy', 'maintenance']).withMessage('Invalid status'),
    body('metrics').optional().isObject().withMessage('Metrics must be an object'),
    body('metrics.currentTaskCount').optional().isInt({ min: 0 }).withMessage('Current task count must be a non-negative integer'),
    body('metrics.averageResponseTime').optional().isFloat({ min: 0 }).withMessage('Average response time must be a non-negative number')
  ],
  handleValidationErrors,
  orchestratorController.updateAgentHeartbeat
);

router.get('/agents/:agentId/stats',
  [
    param('agentId').isUUID().withMessage('Invalid agent ID')
  ],
  handleValidationErrors,
  orchestratorController.getAgentStats
);

// Task management routes
router.post('/tasks',
  orchestrationLimiter,
  [
    body('type').isIn(['code_generation', 'code_review', 'debugging', 'optimization', 'database_design', 'deployment']).withMessage('Invalid task type'),
    body('agentType').isIn(['frontend', 'backend', 'database', 'devops']).withMessage('Invalid agent type'),
    body('request').notEmpty().withMessage('Request data is required'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
    body('dependencies').optional().isArray().withMessage('Dependencies must be an array'),
    body('requirements').optional().isObject().withMessage('Requirements must be an object'),
    body('constraints').optional().isObject().withMessage('Constraints must be an object')
  ],
  handleValidationErrors,
  orchestratorController.createTask
);

router.get('/tasks',
  [
    query('status').optional().isIn(['pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled']).withMessage('Invalid status filter'),
    query('agentType').optional().isIn(['frontend', 'backend', 'database', 'devops']).withMessage('Invalid agent type filter'),
    query('correlationId').optional().isUUID().withMessage('Invalid correlation ID'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
  ],
  handleValidationErrors,
  orchestratorController.getTasks
);

router.get('/tasks/:taskId',
  [
    param('taskId').isUUID().withMessage('Invalid task ID')
  ],
  handleValidationErrors,
  orchestratorController.getTask
);

router.post('/tasks/:taskId/cancel',
  [
    param('taskId').isUUID().withMessage('Invalid task ID'),
    body('reason').optional().isString().withMessage('Reason must be a string')
  ],
  handleValidationErrors,
  orchestratorController.cancelTask
);

router.post('/tasks/:taskId/retry',
  [
    param('taskId').isUUID().withMessage('Invalid task ID')
  ],
  handleValidationErrors,
  orchestratorController.retryTask
);

// Statistics and monitoring routes
router.get('/stats', orchestratorController.getStats);

// Health check route
router.get('/health', orchestratorController.healthCheck);

// Error handling middleware for this router
router.use((error, req, res, next) => {
  console.error('Orchestrator route error:', error);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

module.exports = router;