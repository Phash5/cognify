const express = require('express');
const { TaskController } = require('../controllers/taskController');
const { AuthMiddleware } = require('../middleware/auth');
const { ValidationMiddleware } = require('../middleware/validation');
const { rateLimiterMiddleware } = require('../middleware/rateLimiter');
const { logger } = require('../config/logger');

const router = express.Router();
const taskController = new TaskController();

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Create a new task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TaskRequest'
 *     responses:
 *       201:
 *         description: Task created successfully
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
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     type:
 *                       type: string
 *                     status:
 *                       type: string
 *                     priority:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     estimatedDuration:
 *                       type: number
 *                     complexity:
 *                       type: number
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/',
  rateLimiterMiddleware.taskCreationLimiter(),
  AuthMiddleware.verifyToken,
  ValidationMiddleware.sanitizeInput,
  ValidationMiddleware.validateTaskCreation,
  taskController.createTask
);

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: Get all tasks with optional filtering
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, assigned, in_progress, completed, failed, cancelled]
 *         description: Filter by task status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [component_generation, code_review, optimization, styling, testing, refactoring]
 *         description: Filter by task type
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         description: Filter by priority
 *       - in: query
 *         name: framework
 *         schema:
 *           type: string
 *           enum: [react, vue, angular, svelte, vanilla]
 *         description: Filter by framework
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           enum: [javascript, typescript, jsx, tsx]
 *         description: Filter by language
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of tasks to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of tasks to skip
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
 *                         $ref: '#/components/schemas/TaskResult'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         offset:
 *                           type: integer
 *                         hasMore:
 *                           type: boolean
 *       401:
 *         description: Unauthorized
 */
router.get('/',
  rateLimiterMiddleware.generalLimiter(),
  AuthMiddleware.verifyToken,
  ValidationMiddleware.validateTaskQuery,
  taskController.getTasks
);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   get:
 *     summary: Get task by ID
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
 *         description: Task retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/TaskResult'
 *       400:
 *         description: Invalid task ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Task not found
 */
router.get('/:taskId',
  rateLimiterMiddleware.generalLimiter(),
  AuthMiddleware.verifyToken,
  ValidationMiddleware.validateTaskId,
  taskController.getTask
);

/**
 * @swagger
 * /api/tasks/{taskId}/progress:
 *   put:
 *     summary: Update task progress
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               progress:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Task progress percentage
 *               status:
 *                 type: string
 *                 enum: [pending, assigned, in_progress, completed, failed, cancelled]
 *                 description: Task status
 *               result:
 *                 type: object
 *                 description: Task result (required if status is completed)
 *               error:
 *                 type: string
 *                 description: Error message (required if status is failed)
 *     responses:
 *       200:
 *         description: Task progress updated successfully
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
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     progress:
 *                       type: integer
 *                     result:
 *                       type: object
 *                     error:
 *                       type: string
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Task not found
 */
router.put('/:taskId/progress',
  rateLimiterMiddleware.generalLimiter(),
  AuthMiddleware.verifyToken,
  ValidationMiddleware.sanitizeInput,
  ValidationMiddleware.validateTaskProgressUpdate,
  taskController.updateTaskProgress
);

/**
 * @swagger
 * /api/tasks/{taskId}/cancel:
 *   post:
 *     summary: Cancel a task
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
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     cancelledAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Cannot cancel completed or failed task
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Task not found
 */
router.post('/:taskId/cancel',
  rateLimiterMiddleware.generalLimiter(),
  AuthMiddleware.verifyToken,
  ValidationMiddleware.validateTaskId,
  taskController.cancelTask
);

/**
 * @swagger
 * /api/tasks/{taskId}/retry:
 *   post:
 *     summary: Retry a failed task
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
 *         description: Task retried successfully
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
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     retriedAt:
 *                       type: string
 *                       format: date-time
 *                     retryCount:
 *                       type: integer
 *       400:
 *         description: Only failed tasks can be retried
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Task not found
 */
router.post('/:taskId/retry',
  rateLimiterMiddleware.generalLimiter(),
  AuthMiddleware.verifyToken,
  ValidationMiddleware.validateTaskId,
  taskController.retryTask
);

/**
 * @swagger
 * /api/tasks/stats:
 *   get:
 *     summary: Get task statistics
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
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
 *                     total:
 *                       type: integer
 *                       description: Total number of tasks
 *                     byStatus:
 *                       type: object
 *                       description: Task count by status
 *                     byType:
 *                       type: object
 *                       description: Task count by type
 *                     byPriority:
 *                       type: object
 *                       description: Task count by priority
 *                     byFramework:
 *                       type: object
 *                       description: Task count by framework
 *                     averageCompletionTime:
 *                       type: number
 *                       description: Average completion time in milliseconds
 *                     successRate:
 *                       type: number
 *                       description: Success rate percentage
 *       401:
 *         description: Unauthorized
 */
router.get('/stats',
  rateLimiterMiddleware.metricsLimiter(),
  AuthMiddleware.verifyToken,
  taskController.getTaskStats
);

// Error handling middleware for task routes
router.use((error, req, res, next) => {
  logger.error('Task route error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error in task service'
  });
});

module.exports = router;