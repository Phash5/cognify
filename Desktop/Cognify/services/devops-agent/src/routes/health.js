/**
 * Health Check Routes for DevOps AI Agent
 * Provides comprehensive health monitoring and status endpoints
 */

'use strict';

const express = require('express');
const os = require('os');
const config = require('../config/config');
const { DevOpsService } = require('../services/devopsService');
const { CacheService } = require('../services/cacheService');
const logger = require('../utils/logger');
const { TelemetryService } = require('../utils/telemetry');

const router = express.Router();

// Initialize services
const devopsService = new DevOpsService();
const cacheService = new CacheService();
const telemetry = new TelemetryService();

// Store startup time
const startupTime = new Date();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Basic health check
 *     description: Returns basic health status of the DevOps AI Agent
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 version:
 *                   type: string
 *       503:
 *         description: Service is unhealthy
 */
router.get('/', async (req, res) => {
  try {
    const uptime = process.uptime();
    
    // Record health check metric
    telemetry.incrementCounter('health_checks_total', {
      endpoint: 'basic',
      status: 'success',
    });
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime,
      version: '1.0.0',
    });
    
  } catch (error) {
    logger.logError('Basic health check failed', error);
    
    telemetry.incrementCounter('health_checks_total', {
      endpoint: 'basic',
      status: 'error',
    });
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /health/detailed:
 *   get:
 *     summary: Detailed health check
 *     description: Returns comprehensive health information including dependencies
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Detailed health information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, degraded, unhealthy]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 version:
 *                   type: string
 *                 system:
 *                   type: object
 *                   properties:
 *                     platform:
 *                       type: string
 *                     arch:
 *                       type: string
 *                     nodeVersion:
 *                       type: string
 *                     memory:
 *                       type: object
 *                     cpu:
 *                       type: object
 *                 dependencies:
 *                   type: object
 *                   properties:
 *                     cache:
 *                       type: object
 *                     aiService:
 *                       type: object
 *                     rateLimiter:
 *                       type: object
 *                 metrics:
 *                   type: object
 *       200:
 *         description: Service is healthy or degraded
 *       503:
 *         description: Service is unhealthy
 */
router.get('/detailed', async (req, res) => {
  const checks = [];
  let overallStatus = 'healthy';
  
  try {
    // System information
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const loadAvg = os.loadavg();
    
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
        free: Math.round(os.freemem() / 1024 / 1024),
        totalSystem: Math.round(os.totalmem() / 1024 / 1024),
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        loadAverage: loadAvg,
        cores: os.cpus().length,
      },
    };
    
    // Check cache service
    let cacheStatus = 'healthy';
    let cacheError = null;
    try {
      const cacheHealth = await cacheService.healthCheck();
      if (!cacheHealth.healthy) {
        cacheStatus = 'unhealthy';
        cacheError = cacheHealth.error;
        overallStatus = 'degraded';
      }
    } catch (error) {
      cacheStatus = 'unhealthy';
      cacheError = error.message;
      overallStatus = 'degraded';
    }
    
    // Check AI service
    let aiServiceStatus = 'healthy';
    let aiServiceError = null;
    try {
      const aiHealth = await devopsService.healthCheck();
      if (!aiHealth.healthy) {
        aiServiceStatus = 'unhealthy';
        aiServiceError = aiHealth.error;
        overallStatus = 'unhealthy';
      }
    } catch (error) {
      aiServiceStatus = 'unhealthy';
      aiServiceError = error.message;
      overallStatus = 'unhealthy';
    }
    
    // Check rate limiter (basic check)
    let rateLimiterStatus = 'healthy';
    let rateLimiterError = null;
    try {
      // Simple check - if we can access config, rate limiter should work
      if (!config.rateLimit.maxRequests) {
        throw new Error('Rate limit configuration missing');
      }
    } catch (error) {
      rateLimiterStatus = 'degraded';
      rateLimiterError = error.message;
      if (overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    }
    
    // Get service metrics
    const metrics = await devopsService.getMetrics();
    
    const dependencies = {
      cache: {
        status: cacheStatus,
        error: cacheError,
        responseTime: null, // Could add timing if needed
      },
      aiService: {
        status: aiServiceStatus,
        error: aiServiceError,
        responseTime: null,
      },
      rateLimiter: {
        status: rateLimiterStatus,
        error: rateLimiterError,
        responseTime: null,
      },
    };
    
    telemetry.incrementCounter('health_checks_total', {
      endpoint: 'detailed',
      status: overallStatus,
    });
    
    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
    
    res.status(statusCode).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      system: systemInfo,
      dependencies,
      metrics,
    });
    
  } catch (error) {
    logger.logError('Detailed health check failed', error);
    
    telemetry.incrementCounter('health_checks_total', {
      endpoint: 'detailed',
      status: 'error',
    });
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness check
 *     description: Returns whether the service is ready to accept requests
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ready]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 checks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       status:
 *                         type: string
 *                       message:
 *                         type: string
 *       503:
 *         description: Service is not ready
 */
router.get('/ready', async (req, res) => {
  const checks = [];
  let isReady = true;
  
  try {
    // Check if cache is available
    try {
      const cacheHealth = await cacheService.healthCheck();
      checks.push({
        name: 'cache',
        status: cacheHealth.healthy ? 'pass' : 'fail',
        message: cacheHealth.healthy ? 'Cache is accessible' : cacheHealth.error,
      });
      if (!cacheHealth.healthy) {
        isReady = false;
      }
    } catch (error) {
      checks.push({
        name: 'cache',
        status: 'fail',
        message: error.message,
      });
      isReady = false;
    }
    
    // Check if AI service is available
    try {
      const aiHealth = await devopsService.healthCheck();
      checks.push({
        name: 'aiService',
        status: aiHealth.healthy ? 'pass' : 'fail',
        message: aiHealth.healthy ? 'AI service is accessible' : aiHealth.error,
      });
      if (!aiHealth.healthy) {
        isReady = false;
      }
    } catch (error) {
      checks.push({
        name: 'aiService',
        status: 'fail',
        message: error.message,
      });
      isReady = false;
    }
    
    // Check configuration
    try {
      if (!config.openai.apiKey) {
        throw new Error('OpenAI API key not configured');
      }
      checks.push({
        name: 'configuration',
        status: 'pass',
        message: 'Configuration is valid',
      });
    } catch (error) {
      checks.push({
        name: 'configuration',
        status: 'fail',
        message: error.message,
      });
      isReady = false;
    }
    
    telemetry.incrementCounter('health_checks_total', {
      endpoint: 'ready',
      status: isReady ? 'ready' : 'not_ready',
    });
    
    const statusCode = isReady ? 200 : 503;
    
    res.status(statusCode).json({
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks,
    });
    
  } catch (error) {
    logger.logError('Readiness check failed', error);
    
    telemetry.incrementCounter('health_checks_total', {
      endpoint: 'ready',
      status: 'error',
    });
    
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error.message,
      checks,
    });
  }
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness check
 *     description: Returns whether the service is alive (for Kubernetes liveness probe)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [alive]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *       503:
 *         description: Service is not alive
 */
router.get('/live', async (req, res) => {
  try {
    // Basic liveness check - if we can respond, we're alive
    const uptime = process.uptime();
    
    // Check if process has been running for a reasonable time
    // and memory usage is not excessive
    const memUsage = process.memoryUsage();
    const memUsageMB = memUsage.heapUsed / 1024 / 1024;
    
    // If memory usage is over 1GB, consider it unhealthy
    if (memUsageMB > 1024) {
      throw new Error(`High memory usage: ${Math.round(memUsageMB)}MB`);
    }
    
    telemetry.incrementCounter('health_checks_total', {
      endpoint: 'live',
      status: 'alive',
    });
    
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime,
    });
    
  } catch (error) {
    logger.logError('Liveness check failed', error);
    
    telemetry.incrementCounter('health_checks_total', {
      endpoint: 'live',
      status: 'not_alive',
    });
    
    res.status(503).json({
      status: 'not_alive',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /health/metrics:
 *   get:
 *     summary: Health metrics
 *     description: Returns health-related metrics for monitoring
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Health metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 system:
 *                   type: object
 *                 service:
 *                   type: object
 *                 dependencies:
 *                   type: object
 *       500:
 *         description: Failed to retrieve metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    // System metrics
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const loadAvg = os.loadavg();
    
    const systemMetrics = {
      memory: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        freeSystem: os.freemem(),
        totalSystem: os.totalmem(),
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        loadAverage: loadAvg,
      },
      uptime: {
        process: process.uptime(),
        system: os.uptime(),
      },
    };
    
    // Service metrics
    const serviceMetrics = await devopsService.getMetrics();
    
    // Cache metrics
    let cacheMetrics = {};
    try {
      cacheMetrics = await cacheService.getStats();
    } catch (error) {
      logger.logError('Failed to get cache metrics', error);
      cacheMetrics = { error: error.message };
    }
    
    telemetry.incrementCounter('health_checks_total', {
      endpoint: 'metrics',
      status: 'success',
    });
    
    res.json({
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      system: systemMetrics,
      service: serviceMetrics,
      dependencies: {
        cache: cacheMetrics,
      },
    });
    
  } catch (error) {
    logger.logError('Health metrics check failed', error);
    
    telemetry.incrementCounter('health_checks_total', {
      endpoint: 'metrics',
      status: 'error',
    });
    
    res.status(500).json({
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /health/startup:
 *   get:
 *     summary: Startup information
 *     description: Returns information about service startup
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Startup information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 startupTime:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 environment:
 *                   type: string
 *                 version:
 *                   type: string
 *                 nodeVersion:
 *                   type: string
 *                 platform:
 *                   type: string
 *                 arch:
 *                   type: string
 */
router.get('/startup', async (req, res) => {
  try {
    telemetry.incrementCounter('health_checks_total', {
      endpoint: 'startup',
      status: 'success',
    });
    
    res.json({
      startupTime: startupTime.toISOString(),
      uptime: process.uptime(),
      environment: config.server.env,
      version: '1.0.0',
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      pid: process.pid,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    logger.logError('Startup info check failed', error);
    
    telemetry.incrementCounter('health_checks_total', {
      endpoint: 'startup',
      status: 'error',
    });
    
    res.status(500).json({
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

module.exports = router;