const express = require('express');
const { AgentController } = require('../controllers/agentController');
const { AuthMiddleware } = require('../middleware/auth');
const { ValidationMiddleware } = require('../middleware/validation');
const { rateLimiterMiddleware } = require('../middleware/rateLimiter');
const { logger } = require('../config/logger');

const router = express.Router();
const agentController = new AgentController();

// Initialize agent controller
agentController.initialize().catch(error => {
  logger.error('Failed to initialize agent controller', { error: error.message });
});

/**
 * @swagger
 * /api/agent/status:
 *   get:
 *     summary: Get agent status
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agent status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/AgentStatus'
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Agent not initialized
 */
router.get('/status',
  rateLimiterMiddleware.generalLimiter(),
  AuthMiddleware.optionalAuth,
  agentController.getStatus
);

/**
 * @swagger
 * /api/agent/capabilities:
 *   put:
 *     summary: Update agent capabilities
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               capabilities:
 *                 type: object
 *                 properties:
 *                   frameworks:
 *                     type: array
 *                     items:
 *                       type: string
 *                       enum: [react, vue, angular, svelte, vanilla]
 *                   languages:
 *                     type: array
 *                     items:
 *                       type: string
 *                       enum: [javascript, typescript, jsx, tsx]
 *                   styling:
 *                     type: array
 *                     items:
 *                       type: string
 *                   tools:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       200:
 *         description: Capabilities updated successfully
 *       400:
 *         description: Invalid capabilities format
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Agent not initialized
 */
router.put('/capabilities',
  rateLimiterMiddleware.generalLimiter(),
  AuthMiddleware.verifyApiKey,
  ValidationMiddleware.sanitizeInput,
  ValidationMiddleware.validateCapabilitiesUpdate,
  agentController.updateCapabilities
);

/**
 * @swagger
 * /api/agent/metrics:
 *   get:
 *     summary: Get agent metrics
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agent metrics retrieved successfully
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
 *                     tasksCompleted:
 *                       type: integer
 *                     tasksFailed:
 *                       type: integer
 *                     averageResponseTime:
 *                       type: number
 *                     uptime:
 *                       type: number
 *                     memoryUsage:
 *                       type: object
 *                     cpuUsage:
 *                       type: object
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Agent not initialized
 */
router.get('/metrics',
  rateLimiterMiddleware.metricsLimiter(),
  AuthMiddleware.optionalAuth,
  agentController.getMetrics
);

/**
 * @swagger
 * /api/agent/heartbeat:
 *   post:
 *     summary: Send heartbeat to agent
 *     tags: [Agent]
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Heartbeat received successfully
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
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     status:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Agent not initialized
 */
router.post('/heartbeat',
  rateLimiterMiddleware.healthCheckLimiter(),
  AuthMiddleware.verifyApiKey,
  agentController.heartbeat
);

/**
 * @swagger
 * /api/agent/maintenance:
 *   post:
 *     summary: Set agent maintenance mode
 *     tags: [Agent]
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 description: Enable or disable maintenance mode
 *     responses:
 *       200:
 *         description: Maintenance mode updated successfully
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
 *                     maintenanceMode:
 *                       type: boolean
 *                     status:
 *                       type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Agent not initialized
 */
router.post('/maintenance',
  rateLimiterMiddleware.generalLimiter(),
  AuthMiddleware.verifyApiKey,
  ValidationMiddleware.sanitizeInput,
  ValidationMiddleware.validateMaintenanceMode,
  agentController.setMaintenanceMode
);

/**
 * @swagger
 * /api/agent/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Agent]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthCheck'
 *       503:
 *         description: Service is unhealthy
 */
router.get('/health',
  rateLimiterMiddleware.healthCheckLimiter(),
  agentController.healthCheck
);

// Error handling middleware for agent routes
router.use((error, req, res, next) => {
  logger.error('Agent route error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error in agent service'
  });
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down agent controller gracefully');
  await agentController.shutdown();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down agent controller gracefully');
  await agentController.shutdown();
});

module.exports = router;