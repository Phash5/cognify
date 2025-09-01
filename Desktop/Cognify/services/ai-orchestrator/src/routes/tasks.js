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

// Rate limiting for task operations
const taskOperationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs
  message: {
    success: false,
    error: 'Too many task operation requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

// Task queue management
router.get('/queue',
  [
    query('agentType').optional().isIn(['frontend', 'backend', 'database', 'devops']).withMessage('Invalid agent type filter'),
    query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority filter'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { agentType, priority, limit = 50 } = req.query;
      
      let queuedTasks = orchestratorService.getTasks({ status: 'pending' });
      
      // Apply filters
      if (agentType) {
        queuedTasks = queuedTasks.filter(task => task.agentType === agentType);
      }
      
      if (priority) {
        queuedTasks = queuedTasks.filter(task => task.priority === priority);
      }
      
      // Sort by priority and creation time
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
      queuedTasks.sort((a, b) => {
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
      
      // Apply limit
      queuedTasks = queuedTasks.slice(0, parseInt(limit));
      
      res.json({
        success: true,
        data: queuedTasks.map(task => task.toJSON()),
        meta: {
          total: queuedTasks.length,
          filters: { agentType, priority },
          limit: parseInt(limit)
        }
      });
      
    } catch (error) {
      logger.error('Failed to get task queue:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'GET_TASK_QUEUE_FAILED'
      });
    }
  }
);

// Task dependencies management
router.get('/:taskId/dependencies',
  [
    param('taskId').isUUID().withMessage('Invalid task ID')
  ],
  handleValidationErrors,
  async (req, res) => {
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
      
      const dependencies = task.dependencies.map(depId => {
        const depTask = orchestratorService.tasks.get(depId);
        return depTask ? depTask.toJSON() : { id: depId, status: 'not_found' };
      });
      
      const dependents = orchestratorService.getTasks()
        .filter(t => t.dependencies.includes(taskId))
        .map(t => t.toJSON());
      
      res.json({
        success: true,
        data: {
          taskId,
          dependencies,
          dependents,
          canExecute: task.canExecute(orchestratorService.tasks)
        }
      });
      
    } catch (error) {
      logger.error('Failed to get task dependencies:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'GET_TASK_DEPENDENCIES_FAILED'
      });
    }
  }
);

router.post('/:taskId/dependencies',
  taskOperationLimiter,
  [
    param('taskId').isUUID().withMessage('Invalid task ID'),
    body('dependencyId').isUUID().withMessage('Invalid dependency task ID')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { taskId } = req.params;
      const { dependencyId } = req.body;
      
      const task = orchestratorService.tasks.get(taskId);
      const dependencyTask = orchestratorService.tasks.get(dependencyId);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND'
        });
      }
      
      if (!dependencyTask) {
        return res.status(404).json({
          success: false,
          error: 'Dependency task not found',
          code: 'DEPENDENCY_TASK_NOT_FOUND'
        });
      }
      
      if (task.id === dependencyId) {
        return res.status(400).json({
          success: false,
          error: 'Task cannot depend on itself',
          code: 'CIRCULAR_DEPENDENCY'
        });
      }
      
      // Check for circular dependencies
      const wouldCreateCircle = (checkTaskId, targetId, visited = new Set()) => {
        if (visited.has(checkTaskId)) return true;
        if (checkTaskId === targetId) return true;
        
        visited.add(checkTaskId);
        const checkTask = orchestratorService.tasks.get(checkTaskId);
        if (!checkTask) return false;
        
        return checkTask.dependencies.some(depId => wouldCreateCircle(depId, targetId, visited));
      };
      
      if (wouldCreateCircle(dependencyId, taskId)) {
        return res.status(400).json({
          success: false,
          error: 'Adding this dependency would create a circular dependency',
          code: 'CIRCULAR_DEPENDENCY'
        });
      }
      
      // Add dependency
      if (!task.dependencies.includes(dependencyId)) {
        task.dependencies.push(dependencyId);
        
        logger.info('Task dependency added', {
          taskId,
          dependencyId,
          userId: req.user?.id
        });
      }
      
      res.json({
        success: true,
        message: 'Dependency added successfully',
        data: {
          taskId,
          dependencyId,
          canExecute: task.canExecute(orchestratorService.tasks)
        }
      });
      
    } catch (error) {
      logger.error('Failed to add task dependency:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'ADD_TASK_DEPENDENCY_FAILED'
      });
    }
  }
);

router.delete('/:taskId/dependencies/:dependencyId',
  [
    param('taskId').isUUID().withMessage('Invalid task ID'),
    param('dependencyId').isUUID().withMessage('Invalid dependency task ID')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { taskId, dependencyId } = req.params;
      
      const task = orchestratorService.tasks.get(taskId);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND'
        });
      }
      
      const dependencyIndex = task.dependencies.indexOf(dependencyId);
      
      if (dependencyIndex === -1) {
        return res.status(404).json({
          success: false,
          error: 'Dependency not found',
          code: 'DEPENDENCY_NOT_FOUND'
        });
      }
      
      // Remove dependency
      task.dependencies.splice(dependencyIndex, 1);
      
      logger.info('Task dependency removed', {
        taskId,
        dependencyId,
        userId: req.user?.id
      });
      
      res.json({
        success: true,
        message: 'Dependency removed successfully',
        data: {
          taskId,
          dependencyId,
          canExecute: task.canExecute(orchestratorService.tasks)
        }
      });
      
    } catch (error) {
      logger.error('Failed to remove task dependency:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'REMOVE_TASK_DEPENDENCY_FAILED'
      });
    }
  }
);

// Task progress tracking
router.post('/:taskId/progress',
  taskOperationLimiter,
  [
    param('taskId').isUUID().withMessage('Invalid task ID'),
    body('progress').isFloat({ min: 0, max: 100 }).withMessage('Progress must be between 0 and 100'),
    body('message').optional().isString().withMessage('Message must be a string'),
    body('metadata').optional().isObject().withMessage('Metadata must be an object')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { taskId } = req.params;
      const { progress, message, metadata = {} } = req.body;
      
      const task = orchestratorService.tasks.get(taskId);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND'
        });
      }
      
      if (task.status !== 'in_progress') {
        return res.status(400).json({
          success: false,
          error: 'Task is not in progress',
          code: 'INVALID_TASK_STATUS'
        });
      }
      
      // Update progress
      task.updateProgress(progress, message, metadata);
      
      logger.info('Task progress updated', {
        taskId,
        progress,
        message,
        agentId: task.assignedAgent
      });
      
      res.json({
        success: true,
        message: 'Progress updated successfully',
        data: {
          taskId,
          progress,
          updatedAt: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('Failed to update task progress:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'TASK_PROGRESS_UPDATE_FAILED'
      });
    }
  }
);

// Task execution logs
router.get('/:taskId/logs',
  [
    param('taskId').isUUID().withMessage('Invalid task ID'),
    query('level').optional().isIn(['debug', 'info', 'warn', 'error']).withMessage('Invalid log level'),
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { taskId } = req.params;
      const { level, limit = 100 } = req.query;
      
      const task = orchestratorService.tasks.get(taskId);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND'
        });
      }
      
      let logs = task.executionLogs || [];
      
      // Filter by log level
      if (level) {
        logs = logs.filter(log => log.level === level);
      }
      
      // Apply limit (most recent first)
      logs = logs.slice(-parseInt(limit)).reverse();
      
      res.json({
        success: true,
        data: logs,
        meta: {
          taskId,
          total: logs.length,
          filters: { level },
          limit: parseInt(limit)
        }
      });
      
    } catch (error) {
      logger.error('Failed to get task logs:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'GET_TASK_LOGS_FAILED'
      });
    }
  }
);

router.post('/:taskId/logs',
  taskOperationLimiter,
  [
    param('taskId').isUUID().withMessage('Invalid task ID'),
    body('level').isIn(['debug', 'info', 'warn', 'error']).withMessage('Invalid log level'),
    body('message').notEmpty().withMessage('Log message is required'),
    body('metadata').optional().isObject().withMessage('Metadata must be an object')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { taskId } = req.params;
      const { level, message, metadata = {} } = req.body;
      
      const task = orchestratorService.tasks.get(taskId);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND'
        });
      }
      
      // Initialize logs array if not exists
      if (!task.executionLogs) {
        task.executionLogs = [];
      }
      
      // Add log entry
      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        metadata,
        agentId: task.assignedAgent
      };
      
      task.executionLogs.push(logEntry);
      
      // Keep only last 1000 log entries to prevent memory issues
      if (task.executionLogs.length > 1000) {
        task.executionLogs = task.executionLogs.slice(-1000);
      }
      
      res.json({
        success: true,
        message: 'Log entry added successfully',
        data: logEntry
      });
      
    } catch (error) {
      logger.error('Failed to add task log:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'ADD_TASK_LOG_FAILED'
      });
    }
  }
);

// Task templates and presets
router.get('/templates',
  [
    query('agentType').optional().isIn(['frontend', 'backend', 'database', 'devops']).withMessage('Invalid agent type filter'),
    query('category').optional().isString().withMessage('Category must be a string')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { agentType, category } = req.query;
      
      // Define task templates
      const templates = {
        frontend: [
          {
            id: 'react-component',
            name: 'React Component Creation',
            description: 'Create a new React component with props, state, and styling',
            category: 'component',
            defaultRequirements: {
              framework: 'React',
              styling: 'CSS Modules',
              testing: 'Jest + React Testing Library'
            },
            defaultConstraints: {
              maxFileSize: '50KB',
              accessibility: 'WCAG 2.1 AA',
              browserSupport: 'Modern browsers'
            }
          },
          {
            id: 'ui-optimization',
            name: 'UI Performance Optimization',
            description: 'Optimize React components for better performance',
            category: 'optimization',
            defaultRequirements: {
              metrics: ['LCP', 'FID', 'CLS'],
              tools: ['React DevTools', 'Lighthouse']
            }
          }
        ],
        backend: [
          {
            id: 'api-endpoint',
            name: 'REST API Endpoint',
            description: 'Create a new REST API endpoint with validation and documentation',
            category: 'api',
            defaultRequirements: {
              framework: 'Express.js',
              validation: 'Joi',
              documentation: 'OpenAPI/Swagger'
            },
            defaultConstraints: {
              responseTime: '<200ms',
              security: 'OWASP compliant',
              rateLimit: '100 req/min'
            }
          },
          {
            id: 'database-integration',
            name: 'Database Integration',
            description: 'Integrate database operations with proper error handling',
            category: 'database',
            defaultRequirements: {
              orm: 'Mongoose',
              transactions: true,
              indexing: 'Optimized'
            }
          }
        ],
        database: [
          {
            id: 'schema-design',
            name: 'Database Schema Design',
            description: 'Design and implement database schema with relationships',
            category: 'schema',
            defaultRequirements: {
              normalization: '3NF',
              indexing: 'Performance optimized',
              constraints: 'Data integrity'
            }
          },
          {
            id: 'query-optimization',
            name: 'Query Optimization',
            description: 'Optimize database queries for better performance',
            category: 'optimization',
            defaultRequirements: {
              analysis: 'Execution plan',
              indexing: 'Strategic',
              caching: 'Query result caching'
            }
          }
        ],
        devops: [
          {
            id: 'docker-setup',
            name: 'Docker Configuration',
            description: 'Create Docker configuration for application deployment',
            category: 'containerization',
            defaultRequirements: {
              baseImage: 'Alpine Linux',
              multiStage: true,
              security: 'Non-root user'
            }
          },
          {
            id: 'ci-cd-pipeline',
            name: 'CI/CD Pipeline',
            description: 'Set up continuous integration and deployment pipeline',
            category: 'automation',
            defaultRequirements: {
              testing: 'Automated',
              deployment: 'Blue-green',
              monitoring: 'Health checks'
            }
          }
        ]
      };
      
      let result = templates;
      
      // Filter by agent type
      if (agentType) {
        result = { [agentType]: templates[agentType] || [] };
      }
      
      // Filter by category
      if (category) {
        Object.keys(result).forEach(type => {
          result[type] = result[type].filter(template => 
            template.category === category
          );
        });
      }
      
      res.json({
        success: true,
        data: result,
        meta: {
          filters: { agentType, category }
        }
      });
      
    } catch (error) {
      logger.error('Failed to get task templates:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'GET_TASK_TEMPLATES_FAILED'
      });
    }
  }
);

// Bulk task operations
router.post('/bulk/cancel',
  taskOperationLimiter,
  [
    body('taskIds').isArray({ min: 1, max: 50 }).withMessage('Task IDs array is required (max 50)'),
    body('taskIds.*').isUUID().withMessage('All task IDs must be valid UUIDs'),
    body('reason').optional().isString().withMessage('Reason must be a string')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { taskIds, reason = 'Bulk cancellation' } = req.body;
      
      const results = {
        cancelled: [],
        failed: [],
        notFound: []
      };
      
      for (const taskId of taskIds) {
        const task = orchestratorService.tasks.get(taskId);
        
        if (!task) {
          results.notFound.push(taskId);
          continue;
        }
        
        if (!['pending', 'assigned', 'in_progress'].includes(task.status)) {
          results.failed.push({ taskId, reason: 'Invalid status for cancellation' });
          continue;
        }
        
        try {
          task.cancel(reason);
          results.cancelled.push(taskId);
        } catch (error) {
          results.failed.push({ taskId, reason: error.message });
        }
      }
      
      logger.info('Bulk task cancellation completed', {
        requested: taskIds.length,
        cancelled: results.cancelled.length,
        failed: results.failed.length,
        notFound: results.notFound.length,
        userId: req.user?.id
      });
      
      res.json({
        success: true,
        message: 'Bulk cancellation completed',
        data: results
      });
      
    } catch (error) {
      logger.error('Failed to perform bulk task cancellation:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'BULK_TASK_CANCELLATION_FAILED'
      });
    }
  }
);

// Error handling middleware for this router
router.use((error, req, res, next) => {
  logger.error('Task route error:', error);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

module.exports = router;