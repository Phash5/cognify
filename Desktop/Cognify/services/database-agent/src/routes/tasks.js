/**
 * Database AI Agent Task Routes
 * API endpoints for managing and monitoring database development tasks
 */

'use strict';

const express = require('express');
const { param, query } = require('express-validator');
const { DatabaseService } = require('../services/databaseService');
const { authenticate, requireRoles, requireOwnership } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');
const {
  validateTaskId,
  validatePagination,
  validateTaskFilters,
  validateRequest,
} = require('../utils/validation');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');

const router = express.Router();
const databaseService = new DatabaseService();

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: Get database tasks
 *     description: Retrieve a list of database development tasks with filtering and pagination
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
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
 *           enum: [pending, running, completed, failed, cancelled]
 *         description: Filter by task status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [schema_generation, query_optimization, migration_generation, performance_analysis]
 *         description: Filter by task type
 *       - in: query
 *         name: databaseType
 *         schema:
 *           type: string
 *           enum: [mongodb, postgresql, mysql, sqlite]
 *         description: Filter by database type
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID (admin only)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, status, type]
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Tasks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     tasks:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Task'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       400:
 *         description: Invalid query parameters
 *       403:
 *         description: Insufficient permissions
 */
router.get('/',
  authenticate,
  generalLimiter,
  validatePagination,
  validateTaskFilters,
  validateRequest,
  async (req, res, next) => {
    const span = telemetryService.startSpan('tasks.get_tasks');
    
    try {
      const {
        page = 1,
        limit = 20,
        status,
        type,
        databaseType,
        userId,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;
      
      span.setAttributes({
        'request.page': parseInt(page),
        'request.limit': parseInt(limit),
        'request.status': status,
        'request.type': type,
        'request.database_type': databaseType,
        'request.user_id': req.user?.id,
        'request.filter_user_id': userId,
      });
      
      // Build filters
      const filters = {};
      
      if (status) filters.status = status;
      if (type) filters.type = type;
      if (databaseType) filters.databaseType = databaseType;
      
      // Handle user filtering
      if (userId) {
        // Only admins can filter by other users
        if (req.user.role !== 'admin' && userId !== req.user.id) {
          span.setAttributes({ 'error.type': 'insufficient_permissions' });
          return res.status(403).json({
            success: false,
            error: {
              type: 'AuthorizationError',
              message: 'Cannot access other users\' tasks',
            },
          });
        }
        filters.userId = userId;
      } else {
        // Non-admin users can only see their own tasks
        if (req.user.role !== 'admin') {
          filters.userId = req.user.id;
        }
      }
      
      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder,
      };
      
      logger.api('Tasks list requested', {
        userId: req.user?.id,
        filters,
        options,
        requestId: req.id,
      });
      
      const result = await databaseService.getTasks(filters, options);
      
      span.setAttributes({
        'response.success': true,
        'response.tasks_count': result.tasks.length,
        'response.total_count': result.pagination.total,
      });
      
      telemetryService.incrementCounter('tasks_list_requests_total', {
        user_role: req.user?.role || 'anonymous',
        has_filters: Object.keys(filters).length > 0,
      });
      
      span.end();
      
      res.json({
        success: true,
        data: result,
      });
      
    } catch (error) {
      span.recordException(error);
      span.end();
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   get:
 *     summary: Get task details
 *     description: Retrieve detailed information about a specific database task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *     responses:
 *       200:
 *         description: Task details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/TaskDetails'
 *       404:
 *         description: Task not found
 *       403:
 *         description: Access denied
 */
router.get('/:taskId',
  authenticate,
  generalLimiter,
  validateTaskId,
  validateRequest,
  requireOwnership('taskId', 'userId'),
  async (req, res, next) => {
    const span = telemetryService.startSpan('tasks.get_task_details');
    
    try {
      const { taskId } = req.params;
      
      span.setAttributes({
        'request.task_id': taskId,
        'request.user_id': req.user?.id,
      });
      
      logger.api('Task details requested', {
        userId: req.user?.id,
        taskId,
        requestId: req.id,
      });
      
      const task = await databaseService.getTask(taskId);
      
      if (!task) {
        span.setAttributes({ 'error.type': 'task_not_found' });
        return res.status(404).json({
          success: false,
          error: {
            type: 'NotFoundError',
            message: 'Task not found',
          },
        });
      }
      
      // Check ownership (unless admin)
      if (req.user.role !== 'admin' && task.userId !== req.user.id) {
        span.setAttributes({ 'error.type': 'access_denied' });
        return res.status(403).json({
          success: false,
          error: {
            type: 'AuthorizationError',
            message: 'Access denied',
          },
        });
      }
      
      span.setAttributes({
        'response.success': true,
        'task.status': task.status,
        'task.type': task.type,
      });
      
      telemetryService.incrementCounter('task_details_requests_total', {
        task_type: task.type,
        task_status: task.status,
        user_role: req.user?.role || 'anonymous',
      });
      
      span.end();
      
      res.json({
        success: true,
        data: task,
      });
      
    } catch (error) {
      span.recordException(error);
      span.end();
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/tasks/{taskId}/cancel:
 *   post:
 *     summary: Cancel task
 *     description: Cancel a running or pending database task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *     responses:
 *       200:
 *         description: Task cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     taskId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     cancelledAt:
 *                       type: string
 *       400:
 *         description: Task cannot be cancelled
 *       404:
 *         description: Task not found
 *       403:
 *         description: Access denied
 */
router.post('/:taskId/cancel',
  authenticate,
  generalLimiter,
  validateTaskId,
  validateRequest,
  async (req, res, next) => {
    const span = telemetryService.startSpan('tasks.cancel_task');
    
    try {
      const { taskId } = req.params;
      
      span.setAttributes({
        'request.task_id': taskId,
        'request.user_id': req.user?.id,
      });
      
      logger.api('Task cancellation requested', {
        userId: req.user?.id,
        taskId,
        requestId: req.id,
      });
      
      const result = await databaseService.cancelTask(taskId, req.user.id);
      
      span.setAttributes({
        'response.success': true,
        'task.status': result.status,
      });
      
      telemetryService.incrementCounter('task_cancellation_requests_total', {
        user_role: req.user?.role || 'anonymous',
      });
      
      span.end();
      
      res.json({
        success: true,
        data: result,
      });
      
    } catch (error) {
      span.recordException(error);
      span.end();
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/tasks/{taskId}/retry:
 *   post:
 *     summary: Retry failed task
 *     description: Retry a failed database task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *     responses:
 *       200:
 *         description: Task retry initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     taskId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     retriedAt:
 *                       type: string
 *       400:
 *         description: Task cannot be retried
 *       404:
 *         description: Task not found
 *       403:
 *         description: Access denied
 */
router.post('/:taskId/retry',
  authenticate,
  generalLimiter,
  validateTaskId,
  validateRequest,
  async (req, res, next) => {
    const span = telemetryService.startSpan('tasks.retry_task');
    
    try {
      const { taskId } = req.params;
      
      span.setAttributes({
        'request.task_id': taskId,
        'request.user_id': req.user?.id,
      });
      
      logger.api('Task retry requested', {
        userId: req.user?.id,
        taskId,
        requestId: req.id,
      });
      
      const result = await databaseService.retryTask(taskId, req.user.id);
      
      span.setAttributes({
        'response.success': true,
        'task.status': result.status,
      });
      
      telemetryService.incrementCounter('task_retry_requests_total', {
        user_role: req.user?.role || 'anonymous',
      });
      
      span.end();
      
      res.json({
        success: true,
        data: result,
      });
      
    } catch (error) {
      span.recordException(error);
      span.end();
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/tasks/{taskId}/result:
 *   get:
 *     summary: Get task result
 *     description: Retrieve the result of a completed database task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, raw]
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
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *           text/plain:
 *             schema:
 *               type: string
 *       404:
 *         description: Task not found or no result available
 *       403:
 *         description: Access denied
 */
router.get('/:taskId/result',
  authenticate,
  generalLimiter,
  validateTaskId,
  [
    query('format')
      .optional()
      .isIn(['json', 'raw'])
      .withMessage('Format must be json or raw'),
  ],
  validateRequest,
  async (req, res, next) => {
    const span = telemetryService.startSpan('tasks.get_task_result');
    
    try {
      const { taskId } = req.params;
      const { format = 'json' } = req.query;
      
      span.setAttributes({
        'request.task_id': taskId,
        'request.format': format,
        'request.user_id': req.user?.id,
      });
      
      logger.api('Task result requested', {
        userId: req.user?.id,
        taskId,
        format,
        requestId: req.id,
      });
      
      const result = await databaseService.getTaskResult(taskId, req.user.id);
      
      if (!result) {
        span.setAttributes({ 'error.type': 'result_not_found' });
        return res.status(404).json({
          success: false,
          error: {
            type: 'NotFoundError',
            message: 'Task result not found',
          },
        });
      }
      
      span.setAttributes({
        'response.success': true,
        'response.format': format,
      });
      
      telemetryService.incrementCounter('task_result_requests_total', {
        format,
        user_role: req.user?.role || 'anonymous',
      });
      
      span.end();
      
      if (format === 'raw') {
        res.set('Content-Type', 'text/plain');
        res.send(result.content || result.code || JSON.stringify(result, null, 2));
      } else {
        res.json({
          success: true,
          data: result,
        });
      }
      
    } catch (error) {
      span.recordException(error);
      span.end();
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/tasks/{taskId}/download:
 *   get:
 *     summary: Download task result
 *     description: Download the result of a completed database task as a file
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *     responses:
 *       200:
 *         description: Task result file
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Task not found or no result available
 *       403:
 *         description: Access denied
 */
router.get('/:taskId/download',
  authenticate,
  generalLimiter,
  validateTaskId,
  validateRequest,
  async (req, res, next) => {
    const span = telemetryService.startSpan('tasks.download_task_result');
    
    try {
      const { taskId } = req.params;
      
      span.setAttributes({
        'request.task_id': taskId,
        'request.user_id': req.user?.id,
      });
      
      logger.api('Task result download requested', {
        userId: req.user?.id,
        taskId,
        requestId: req.id,
      });
      
      const task = await databaseService.getTask(taskId);
      
      if (!task) {
        span.setAttributes({ 'error.type': 'task_not_found' });
        return res.status(404).json({
          success: false,
          error: {
            type: 'NotFoundError',
            message: 'Task not found',
          },
        });
      }
      
      // Check ownership
      if (req.user.role !== 'admin' && task.userId !== req.user.id) {
        span.setAttributes({ 'error.type': 'access_denied' });
        return res.status(403).json({
          success: false,
          error: {
            type: 'AuthorizationError',
            message: 'Access denied',
          },
        });
      }
      
      if (!task.result) {
        span.setAttributes({ 'error.type': 'no_result' });
        return res.status(404).json({
          success: false,
          error: {
            type: 'NotFoundError',
            message: 'Task result not available',
          },
        });
      }
      
      const content = task.result.content || task.result.code || JSON.stringify(task.result, null, 2);
      const filename = `${task.type}_${taskId}_${Date.now()}.txt`;
      
      span.setAttributes({
        'response.success': true,
        'response.filename': filename,
        'response.content_length': content.length,
      });
      
      telemetryService.incrementCounter('task_download_requests_total', {
        task_type: task.type,
        user_role: req.user?.role || 'anonymous',
      });
      
      span.end();
      
      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': Buffer.byteLength(content, 'utf8'),
      });
      
      res.send(content);
      
    } catch (error) {
      span.recordException(error);
      span.end();
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/tasks/stats:
 *   get:
 *     summary: Get task statistics
 *     description: Retrieve statistics about database tasks
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *           default: day
 *         description: Statistics period
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID (admin only)
 *     responses:
 *       200:
 *         description: Task statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: string
 *                     totalTasks:
 *                       type: number
 *                     tasksByStatus:
 *                       type: object
 *                     tasksByType:
 *                       type: object
 *                     averageExecutionTime:
 *                       type: number
 *       403:
 *         description: Insufficient permissions
 */
router.get('/stats',
  authenticate,
  generalLimiter,
  [
    query('period')
      .optional()
      .isIn(['hour', 'day', 'week', 'month'])
      .withMessage('Invalid period'),
    query('userId')
      .optional()
      .isString()
      .withMessage('User ID must be a string'),
  ],
  validateRequest,
  async (req, res, next) => {
    const span = telemetryService.startSpan('tasks.get_stats');
    
    try {
      const { period = 'day', userId } = req.query;
      
      span.setAttributes({
        'request.period': period,
        'request.user_id': req.user?.id,
        'request.filter_user_id': userId,
      });
      
      // Handle user filtering
      let targetUserId = null;
      if (userId) {
        if (req.user.role !== 'admin' && userId !== req.user.id) {
          span.setAttributes({ 'error.type': 'insufficient_permissions' });
          return res.status(403).json({
            success: false,
            error: {
              type: 'AuthorizationError',
              message: 'Cannot access other users\' statistics',
            },
          });
        }
        targetUserId = userId;
      } else if (req.user.role !== 'admin') {
        targetUserId = req.user.id;
      }
      
      logger.api('Task statistics requested', {
        userId: req.user?.id,
        period,
        targetUserId,
        requestId: req.id,
      });
      
      const stats = await databaseService.getTaskStats(period, targetUserId);
      
      span.setAttributes({
        'response.success': true,
        'stats.total_tasks': stats.totalTasks,
        'stats.period': period,
      });
      
      telemetryService.incrementCounter('task_stats_requests_total', {
        period,
        user_role: req.user?.role || 'anonymous',
      });
      
      span.end();
      
      res.json({
        success: true,
        data: stats,
      });
      
    } catch (error) {
      span.recordException(error);
      span.end();
      next(error);
    }
  }
);

module.exports = router;