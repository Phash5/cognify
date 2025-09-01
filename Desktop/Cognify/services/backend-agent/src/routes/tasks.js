/**
 * Tasks Routes for Backend AI Agent
 * Handles task management, monitoring, and retrieval
 */

'use strict';

const express = require('express');
const { param, query } = require('express-validator');
const createError = require('http-errors');
const config = require('../config/config');
const { BackendService } = require('../services/backendService');
const { authenticateToken, requireRoles, optionalAuth, requireOwnership } = require('../middleware/auth');
const { generalLimiter, dynamicRateLimiter } = require('../middleware/rateLimiter');
const { handleValidationErrors, validators } = require('../utils/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');

const router = express.Router();
const backendService = new BackendService();

/**
 * @swagger
 * components:
 *   schemas:
 *     Task:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         type:
 *           type: string
 *           enum: [api_generation, database_schema, authentication, middleware, testing, optimization, documentation, deployment]
 *         status:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *         priority:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         progress:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *         result:
 *           type: object
 *         error:
 *           type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         completedAt:
 *           type: string
 *           format: date-time
 *         estimatedDuration:
 *           type: number
 *         actualDuration:
 *           type: number
 *         userId:
 *           type: string
 *           format: uuid
 *         sessionId:
 *           type: string
 *           format: uuid
 *     
 *     TaskList:
 *       type: object
 *       properties:
 *         tasks:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Task'
 *         pagination:
 *           type: object
 *           properties:
 *             page:
 *               type: number
 *             limit:
 *               type: number
 *             total:
 *               type: number
 *             pages:
 *               type: number
 */

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: Get tasks
 *     description: Retrieve a list of tasks with optional filtering and pagination
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
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
 *           enum: [api_generation, database_schema, authentication, middleware, testing, optimization, documentation, deployment]
 *         description: Filter by task type
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         description: Filter by task priority
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, priority, status]
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of tasks
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/TaskList'
 */
router.get('/',
  authenticateToken,
  generalLimiter,
  validators.pagination(),
  validators.taskFilters(),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('tasks.get_list');
    
    try {
      const {
        page = 1,
        limit = 20,
        status,
        type,
        priority,
        sort = 'createdAt',
        order = 'desc',
        userId
      } = req.query;
      
      // Users can only see their own tasks unless they're admin
      const effectiveUserId = req.user.roles?.includes('admin') ? userId : req.user.id;
      
      const filters = {
        userId: effectiveUserId,
        ...(status && { status }),
        ...(type && { type }),
        ...(priority && { priority }),
      };
      
      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { [sort]: order === 'desc' ? -1 : 1 },
      };
      
      span.setAttributes({
        'tasks.filters': JSON.stringify(filters),
        'tasks.page': options.page,
        'tasks.limit': options.limit,
        'tasks.sort': sort,
        'tasks.order': order,
        'user.id': req.user.id,
        'user.is_admin': req.user.roles?.includes('admin') || false,
      });
      
      logger.debug('Tasks list requested', {
        userId: req.user.id,
        filters,
        options,
        isAdmin: req.user.roles?.includes('admin'),
      });
      
      const result = await backendService.getTasks(filters, options);
      
      span.setAttributes({
        'tasks.count': result.tasks.length,
        'tasks.total': result.pagination.total,
        'tasks.pages': result.pagination.pages,
      });
      
      res.json({
        success: true,
        data: result,
      });
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  })
);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   get:
 *     summary: Get task by ID
 *     description: Retrieve a specific task by its ID
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
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
 *         description: Task details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Task'
 *       404:
 *         description: Task not found
 */
router.get('/:taskId',
  authenticateToken,
  generalLimiter,
  validators.taskId(),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('tasks.get_by_id');
    
    try {
      const { taskId } = req.params;
      
      span.setAttributes({
        'task.id': taskId,
        'user.id': req.user.id,
      });
      
      logger.debug('Task details requested', {
        taskId,
        userId: req.user.id,
      });
      
      const task = await backendService.getTask(taskId);
      
      if (!task) {
        throw createError(404, 'Task not found');
      }
      
      // Check ownership unless user is admin
      if (!req.user.roles?.includes('admin') && task.userId !== req.user.id) {
        throw createError(403, 'Access denied: Task belongs to another user');
      }
      
      span.setAttributes({
        'task.type': task.type,
        'task.status': task.status,
        'task.priority': task.priority,
        'task.progress': task.progress || 0,
      });
      
      res.json({
        success: true,
        data: task,
      });
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  })
);

/**
 * @swagger
 * /api/tasks/{taskId}/cancel:
 *   post:
 *     summary: Cancel task
 *     description: Cancel a pending or processing task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
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
 *       400:
 *         description: Task cannot be cancelled
 *       404:
 *         description: Task not found
 */
router.post('/:taskId/cancel',
  authenticateToken,
  generalLimiter,
  validators.taskId(),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('tasks.cancel');
    
    try {
      const { taskId } = req.params;
      
      span.setAttributes({
        'task.id': taskId,
        'user.id': req.user.id,
      });
      
      logger.info('Task cancellation requested', {
        taskId,
        userId: req.user.id,
      });
      
      const task = await backendService.getTask(taskId);
      
      if (!task) {
        throw createError(404, 'Task not found');
      }
      
      // Check ownership unless user is admin
      if (!req.user.roles?.includes('admin') && task.userId !== req.user.id) {
        throw createError(403, 'Access denied: Task belongs to another user');
      }
      
      // Check if task can be cancelled
      if (!['pending', 'processing'].includes(task.status)) {
        throw createError(400, `Task cannot be cancelled. Current status: ${task.status}`);
      }
      
      const cancelledTask = await backendService.cancelTask(taskId, req.user.id);
      
      span.setAttributes({
        'task.previous_status': task.status,
        'task.new_status': cancelledTask.status,
      });
      
      logger.info('Task cancelled successfully', {
        taskId,
        userId: req.user.id,
        previousStatus: task.status,
        newStatus: cancelledTask.status,
      });
      
      res.json({
        success: true,
        data: cancelledTask,
        message: 'Task cancelled successfully',
      });
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  })
);

/**
 * @swagger
 * /api/tasks/{taskId}/retry:
 *   post:
 *     summary: Retry failed task
 *     description: Retry a failed task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
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
 *         description: Task retry initiated
 *       400:
 *         description: Task cannot be retried
 *       404:
 *         description: Task not found
 */
router.post('/:taskId/retry',
  authenticateToken,
  generalLimiter,
  validators.taskId(),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('tasks.retry');
    
    try {
      const { taskId } = req.params;
      
      span.setAttributes({
        'task.id': taskId,
        'user.id': req.user.id,
      });
      
      logger.info('Task retry requested', {
        taskId,
        userId: req.user.id,
      });
      
      const task = await backendService.getTask(taskId);
      
      if (!task) {
        throw createError(404, 'Task not found');
      }
      
      // Check ownership unless user is admin
      if (!req.user.roles?.includes('admin') && task.userId !== req.user.id) {
        throw createError(403, 'Access denied: Task belongs to another user');
      }
      
      // Check if task can be retried
      if (task.status !== 'failed') {
        throw createError(400, `Task cannot be retried. Current status: ${task.status}`);
      }
      
      const retriedTask = await backendService.retryTask(taskId, req.user.id);
      
      span.setAttributes({
        'task.previous_status': task.status,
        'task.new_status': retriedTask.status,
        'task.retry_count': retriedTask.retryCount || 1,
      });
      
      logger.info('Task retry initiated', {
        taskId,
        userId: req.user.id,
        previousStatus: task.status,
        newStatus: retriedTask.status,
        retryCount: retriedTask.retryCount,
      });
      
      res.json({
        success: true,
        data: retriedTask,
        message: 'Task retry initiated successfully',
      });
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  })
);

/**
 * @swagger
 * /api/tasks/{taskId}/result:
 *   get:
 *     summary: Get task result
 *     description: Get the result of a completed task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
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
 *         description: Task result
 *       400:
 *         description: Task not completed
 *       404:
 *         description: Task not found
 */
router.get('/:taskId/result',
  authenticateToken,
  generalLimiter,
  validators.taskId(),
  [
    query('format')
      .optional()
      .isIn(['json', 'raw', 'download'])
      .withMessage('Format must be json, raw, or download'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('tasks.get_result');
    
    try {
      const { taskId } = req.params;
      const { format = 'json' } = req.query;
      
      span.setAttributes({
        'task.id': taskId,
        'result.format': format,
        'user.id': req.user.id,
      });
      
      logger.debug('Task result requested', {
        taskId,
        format,
        userId: req.user.id,
      });
      
      const task = await backendService.getTask(taskId);
      
      if (!task) {
        throw createError(404, 'Task not found');
      }
      
      // Check ownership unless user is admin
      if (!req.user.roles?.includes('admin') && task.userId !== req.user.id) {
        throw createError(403, 'Access denied: Task belongs to another user');
      }
      
      // Check if task is completed
      if (task.status !== 'completed') {
        throw createError(400, `Task not completed. Current status: ${task.status}`);
      }
      
      if (!task.result) {
        throw createError(404, 'Task result not available');
      }
      
      span.setAttributes({
        'task.type': task.type,
        'task.status': task.status,
        'result.has_files': !!(task.result.files && task.result.files.length > 0),
        'result.has_code': !!(task.result.code),
      });
      
      // Handle different result formats
      switch (format) {
        case 'raw':
          res.setHeader('Content-Type', 'text/plain');
          res.send(task.result.code || JSON.stringify(task.result, null, 2));
          break;
          
        case 'download':
          const filename = `${task.type}_${taskId.substring(0, 8)}.zip`;
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          
          // In a real implementation, you would create a zip file with all generated files
          res.json({
            success: true,
            message: 'Download functionality not implemented in this demo',
            data: task.result,
          });
          break;
          
        case 'json':
        default:
          res.json({
            success: true,
            data: {
              taskId: task.id,
              type: task.type,
              status: task.status,
              result: task.result,
              completedAt: task.completedAt,
              duration: task.actualDuration,
            },
          });
          break;
      }
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  })
);

/**
 * @swagger
 * /api/tasks/stats:
 *   get:
 *     summary: Get task statistics
 *     description: Get statistics about user's tasks
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Task statistics
 */
router.get('/stats',
  authenticateToken,
  generalLimiter,
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('tasks.get_stats');
    
    try {
      const userId = req.user.id;
      
      span.setAttributes({
        'user.id': userId,
      });
      
      logger.debug('Task statistics requested', {
        userId,
      });
      
      const stats = await backendService.getTaskStats(userId);
      
      span.setAttributes({
        'stats.total_tasks': stats.totalTasks,
        'stats.completed_tasks': stats.completedTasks,
        'stats.failed_tasks': stats.failedTasks,
        'stats.active_tasks': stats.activeTasks,
      });
      
      res.json({
        success: true,
        data: stats,
      });
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  })
);

module.exports = router;