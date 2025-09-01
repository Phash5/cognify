/**
 * DevOps AI Agent Task Routes
 * Handles task management, monitoring, and result retrieval
 */

'use strict';

const express = require('express');
const config = require('../config/config');
const { DevOpsService } = require('../services/devopsService');
const { CacheService } = require('../services/cacheService');
const logger = require('../utils/logger');
const { TelemetryService } = require('../utils/telemetry');
const {
  authenticate,
  createRateLimit,
  handleValidationErrors,
} = require('../middleware');
const {
  validators,
} = require('../utils/validation');

const router = express.Router();

// Initialize services
const devopsService = new DevOpsService();
const cacheService = new CacheService();
const telemetry = new TelemetryService();

// Rate limiting for task operations
const taskRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    error: 'Too many task requests',
    retryAfter: 60,
    timestamp: new Date().toISOString(),
  },
});

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: Get task list
 *     description: Retrieve a list of DevOps tasks with filtering and pagination
 *     tags: [Tasks]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of tasks per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *         description: Filter by task status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [deployment, infrastructure, monitoring, configuration]
 *         description: Filter by task type
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         description: Filter by task priority
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, status, type, priority]
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter tasks created after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter tasks created before this date
 *     responses:
 *       200:
 *         description: Task list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tasks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                       status:
 *                         type: string
 *                       priority:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                       progress:
 *                         type: number
 *                       estimatedCompletion:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/',
  authenticate,
  taskRateLimit,
  validators.pagination,
  validators.taskFilter,
  handleValidationErrors,
  async (req, res, next) => {
    const span = telemetry.startSpan('get_task_list');
    
    try {
      const {
        page = 1,
        limit = 20,
        status,
        type,
        priority,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        startDate,
        endDate,
      } = req.query;
      
      logger.logRequest('Getting task list', {
        requestId: req.requestId,
        userId: req.auth?.user?.sub,
        filters: { status, type, priority, startDate, endDate },
        pagination: { page, limit },
        sorting: { sortBy, sortOrder },
      });
      
      // Build cache key
      const cacheKey = `tasks:list:${JSON.stringify({
        page,
        limit,
        status,
        type,
        priority,
        sortBy,
        sortOrder,
        startDate,
        endDate,
        userId: req.auth?.user?.sub,
      })}`;
      
      // Try to get from cache
      let result = await cacheService.get(cacheKey);
      
      if (!result) {
        // Get tasks from service
        const tasks = await devopsService.getTasks({
          page: parseInt(page),
          limit: parseInt(limit),
          status,
          type,
          priority,
          sortBy,
          sortOrder,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          userId: req.auth?.user?.sub,
        });
        
        result = {
          tasks: tasks.data,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: tasks.total,
            pages: Math.ceil(tasks.total / limit),
          },
          timestamp: new Date().toISOString(),
        };
        
        // Cache for 30 seconds
        await cacheService.set(cacheKey, result, 30);
      }
      
      telemetry.incrementCounter('task_list_requests_total', {
        status: status || 'all',
        type: type || 'all',
      });
      
      res.json(result);
      
      logger.logRequest('Task list retrieved successfully', {
        requestId: req.requestId,
        count: result.tasks.length,
        total: result.pagination.total,
      });
      
    } catch (error) {
      span.recordException(error);
      telemetry.incrementCounter('task_list_errors_total', {
        error_type: error.name || 'UnknownError',
      });
      next(error);
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   get:
 *     summary: Get task details
 *     description: Retrieve detailed information about a specific task
 *     tags: [Tasks]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Task ID
 *     responses:
 *       200:
 *         description: Task details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 task:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     type:
 *                       type: string
 *                     status:
 *                       type: string
 *                     priority:
 *                       type: string
 *                     requirements:
 *                       type: string
 *                     options:
 *                       type: object
 *                     result:
 *                       type: object
 *                     error:
 *                       type: string
 *                     progress:
 *                       type: number
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     completedAt:
 *                       type: string
 *                       format: date-time
 *                     estimatedCompletion:
 *                       type: string
 *                       format: date-time
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid task ID
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Task not found
 *       500:
 *         description: Internal server error
 */
router.get('/:taskId',
  authenticate,
  taskRateLimit,
  validators.taskId,
  handleValidationErrors,
  async (req, res, next) => {
    const span = telemetry.startSpan('get_task_details');
    
    try {
      const { taskId } = req.params;
      
      logger.logRequest('Getting task details', {
        requestId: req.requestId,
        taskId,
        userId: req.auth?.user?.sub,
      });
      
      // Get task details
      const task = await devopsService.getTaskStatus(taskId);
      
      if (!task) {
        const error = new Error('Task not found');
        error.name = 'NotFoundError';
        throw error;
      }
      
      // Check if user has access to this task
      if (task.userId && task.userId !== req.auth?.user?.sub) {
        const error = new Error('Access denied');
        error.name = 'ForbiddenError';
        throw error;
      }
      
      telemetry.incrementCounter('task_details_requests_total', {
        status: task.status,
        type: task.type,
      });
      
      res.json({
        task,
        timestamp: new Date().toISOString(),
      });
      
      logger.logRequest('Task details retrieved successfully', {
        requestId: req.requestId,
        taskId,
        status: task.status,
      });
      
    } catch (error) {
      span.recordException(error);
      telemetry.incrementCounter('task_details_errors_total', {
        error_type: error.name || 'UnknownError',
      });
      next(error);
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/tasks/{taskId}/cancel:
 *   post:
 *     summary: Cancel task
 *     description: Cancel a pending or processing task
 *     tags: [Tasks]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Task ID
 *     responses:
 *       200:
 *         description: Task cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 taskId:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid task ID or task cannot be cancelled
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Task not found
 *       500:
 *         description: Internal server error
 */
router.post('/:taskId/cancel',
  authenticate,
  taskRateLimit,
  validators.taskId,
  handleValidationErrors,
  async (req, res, next) => {
    const span = telemetry.startSpan('cancel_task');
    
    try {
      const { taskId } = req.params;
      
      logger.logRequest('Cancelling task', {
        requestId: req.requestId,
        taskId,
        userId: req.auth?.user?.sub,
      });
      
      // Cancel task
      const result = await devopsService.cancelTask(taskId, req.auth?.user?.sub);
      
      if (!result.success) {
        const error = new Error(result.message || 'Failed to cancel task');
        error.name = result.error || 'ConflictError';
        throw error;
      }
      
      telemetry.incrementCounter('task_cancellations_total', {
        type: result.type || 'unknown',
      });
      
      res.json({
        message: 'Task cancelled successfully',
        taskId,
        timestamp: new Date().toISOString(),
      });
      
      logger.logRequest('Task cancelled successfully', {
        requestId: req.requestId,
        taskId,
      });
      
    } catch (error) {
      span.recordException(error);
      telemetry.incrementCounter('task_cancellation_errors_total', {
        error_type: error.name || 'UnknownError',
      });
      next(error);
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/tasks/{taskId}/retry:
 *   post:
 *     summary: Retry failed task
 *     description: Retry a failed task with the same parameters
 *     tags: [Tasks]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Task ID
 *     responses:
 *       200:
 *         description: Task retry initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 newTaskId:
 *                   type: string
 *                 originalTaskId:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid task ID or task cannot be retried
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Task not found
 *       500:
 *         description: Internal server error
 */
router.post('/:taskId/retry',
  authenticate,
  taskRateLimit,
  validators.taskId,
  handleValidationErrors,
  async (req, res, next) => {
    const span = telemetry.startSpan('retry_task');
    
    try {
      const { taskId } = req.params;
      
      logger.logRequest('Retrying task', {
        requestId: req.requestId,
        taskId,
        userId: req.auth?.user?.sub,
      });
      
      // Retry task
      const result = await devopsService.retryTask(taskId, req.auth?.user?.sub);
      
      if (!result.success) {
        const error = new Error(result.message || 'Failed to retry task');
        error.name = result.error || 'ConflictError';
        throw error;
      }
      
      telemetry.incrementCounter('task_retries_total', {
        type: result.type || 'unknown',
      });
      
      res.json({
        message: 'Task retry initiated successfully',
        newTaskId: result.newTaskId,
        originalTaskId: taskId,
        timestamp: new Date().toISOString(),
      });
      
      logger.logRequest('Task retry initiated successfully', {
        requestId: req.requestId,
        originalTaskId: taskId,
        newTaskId: result.newTaskId,
      });
      
    } catch (error) {
      span.recordException(error);
      telemetry.incrementCounter('task_retry_errors_total', {
        error_type: error.name || 'UnknownError',
      });
      next(error);
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/tasks/{taskId}/result:
 *   get:
 *     summary: Get task result
 *     description: Retrieve the result of a completed task
 *     tags: [Tasks]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Task ID
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, raw, download]
 *           default: json
 *         description: Result format
 *     responses:
 *       200:
 *         description: Task result retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 result:
 *                   type: object
 *                 completedAt:
 *                   type: string
 *                   format: date-time
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *           text/plain:
 *             schema:
 *               type: string
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid task ID or task not completed
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Task not found
 *       500:
 *         description: Internal server error
 */
router.get('/:taskId/result',
  authenticate,
  taskRateLimit,
  validators.taskId,
  handleValidationErrors,
  async (req, res, next) => {
    const span = telemetry.startSpan('get_task_result');
    
    try {
      const { taskId } = req.params;
      const { format = 'json' } = req.query;
      
      logger.logRequest('Getting task result', {
        requestId: req.requestId,
        taskId,
        format,
        userId: req.auth?.user?.sub,
      });
      
      // Get task result
      const task = await devopsService.getTaskStatus(taskId);
      
      if (!task) {
        const error = new Error('Task not found');
        error.name = 'NotFoundError';
        throw error;
      }
      
      // Check if user has access to this task
      if (task.userId && task.userId !== req.auth?.user?.sub) {
        const error = new Error('Access denied');
        error.name = 'ForbiddenError';
        throw error;
      }
      
      if (task.status !== 'completed') {
        const error = new Error('Task not completed');
        error.name = 'ConflictError';
        throw error;
      }
      
      telemetry.incrementCounter('task_result_requests_total', {
        format,
        type: task.type,
      });
      
      // Handle different formats
      if (format === 'raw') {
        res.setHeader('Content-Type', 'text/plain');
        res.send(task.result?.content || JSON.stringify(task.result, null, 2));
      } else if (format === 'download') {
        const filename = `${task.type}-${taskId}.txt`;
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(task.result?.content || JSON.stringify(task.result, null, 2));
      } else {
        res.json({
          taskId,
          status: task.status,
          result: task.result,
          completedAt: task.completedAt,
          timestamp: new Date().toISOString(),
        });
      }
      
      logger.logRequest('Task result retrieved successfully', {
        requestId: req.requestId,
        taskId,
        format,
      });
      
    } catch (error) {
      span.recordException(error);
      telemetry.incrementCounter('task_result_errors_total', {
        error_type: error.name || 'UnknownError',
      });
      next(error);
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/tasks/stats:
 *   get:
 *     summary: Get task statistics
 *     description: Retrieve statistics about tasks (counts by status, type, etc.)
 *     tags: [Tasks]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *           default: day
 *         description: Time period for statistics
 *     responses:
 *       200:
 *         description: Task statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 period:
 *                   type: string
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     byStatus:
 *                       type: object
 *                     byType:
 *                       type: object
 *                     byPriority:
 *                       type: object
 *                     averageCompletionTime:
 *                       type: number
 *                     successRate:
 *                       type: number
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/stats',
  authenticate,
  taskRateLimit,
  async (req, res, next) => {
    const span = telemetry.startSpan('get_task_stats');
    
    try {
      const { period = 'day' } = req.query;
      
      logger.logRequest('Getting task statistics', {
        requestId: req.requestId,
        period,
        userId: req.auth?.user?.sub,
      });
      
      // Build cache key
      const cacheKey = `tasks:stats:${period}:${req.auth?.user?.sub || 'global'}`;
      
      // Try to get from cache
      let stats = await cacheService.get(cacheKey);
      
      if (!stats) {
        // Get statistics from service
        stats = await devopsService.getTaskStatistics({
          period,
          userId: req.auth?.user?.sub,
        });
        
        // Cache for 5 minutes
        await cacheService.set(cacheKey, stats, 300);
      }
      
      telemetry.incrementCounter('task_stats_requests_total', {
        period,
      });
      
      res.json({
        period,
        stats,
        timestamp: new Date().toISOString(),
      });
      
      logger.logRequest('Task statistics retrieved successfully', {
        requestId: req.requestId,
        period,
        total: stats.total,
      });
      
    } catch (error) {
      span.recordException(error);
      telemetry.incrementCounter('task_stats_errors_total', {
        error_type: error.name || 'UnknownError',
      });
      next(error);
    } finally {
      span.end();
    }
  }
);

module.exports = router;