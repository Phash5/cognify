/**
 * Database AI Agent Health Routes
 * Health check endpoints for monitoring and diagnostics
 */

'use strict';

const express = require('express');
const os = require('os');
const process = require('process');
const { DatabaseService } = require('../services/databaseService');
const { CacheService } = require('../services/cacheService');
const config = require('../config/config');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');
const { healthCheck: rateLimiterHealthCheck } = require('../middleware/rateLimiter');

const router = express.Router();
const databaseService = new DatabaseService();
const cacheService = new CacheService();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Basic health check
 *     description: Returns basic health status of the Database AI Agent
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
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 service:
 *                   type: string
 *                   example: database-agent
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *       503:
 *         description: Service is unhealthy
 */
router.get('/', (req, res) => {
  const span = telemetryService.startSpan('health.basic_check');
  
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'database-agent',
      version: '1.0.0',
      uptime: process.uptime(),
    };
    
    span.setAttributes({
      'health.status': 'healthy',
      'health.uptime': process.uptime(),
    });
    
    telemetryService.incrementCounter('health_check_requests_total', {
      type: 'basic',
      status: 'healthy',
    });
    
    span.end();
    
    res.json(health);
    
  } catch (error) {
    span.recordException(error);
    span.setAttributes({ 'health.status': 'unhealthy' });
    span.end();
    
    logger.error('Basic health check failed', {
      error: error.message,
      requestId: req.id,
    });
    
    telemetryService.incrementCounter('health_check_requests_total', {
      type: 'basic',
      status: 'unhealthy',
    });
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'database-agent',
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/health/detailed:
 *   get:
 *     summary: Detailed health check
 *     description: Returns comprehensive health status including dependencies
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
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 service:
 *                   type: string
 *                 version:
 *                   type: string
 *                 uptime:
 *                   type: number
 *                 system:
 *                   type: object
 *                 dependencies:
 *                   type: object
 *                 metrics:
 *                   type: object
 *       503:
 *         description: Service or dependencies are unhealthy
 */
router.get('/detailed', async (req, res) => {
  const span = telemetryService.startSpan('health.detailed_check');
  
  try {
    const startTime = Date.now();
    
    // System information
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: process.memoryUsage(),
      },
      cpu: {
        count: os.cpus().length,
        loadAverage: os.loadavg(),
      },
      uptime: {
        system: os.uptime(),
        process: process.uptime(),
      },
    };
    
    // Check dependencies
    const dependencies = {
      cache: { status: 'unknown', responseTime: null, error: null },
      aiService: { status: 'unknown', responseTime: null, error: null },
      rateLimiter: { status: 'unknown', responseTime: null, error: null },
    };
    
    // Check cache service
    try {
      const cacheStart = Date.now();
      const cacheHealth = await cacheService.healthCheck();
      dependencies.cache = {
        status: cacheHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
        responseTime: Date.now() - cacheStart,
        details: cacheHealth,
      };
    } catch (error) {
      dependencies.cache = {
        status: 'unhealthy',
        responseTime: null,
        error: error.message,
      };
    }
    
    // Check AI service
    try {
      const aiStart = Date.now();
      const aiHealth = await databaseService.healthCheck();
      dependencies.aiService = {
        status: aiHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
        responseTime: Date.now() - aiStart,
        details: aiHealth,
      };
    } catch (error) {
      dependencies.aiService = {
        status: 'unhealthy',
        responseTime: null,
        error: error.message,
      };
    }
    
    // Check rate limiter
    try {
      const rateLimiterStart = Date.now();
      const rateLimiterHealth = await rateLimiterHealthCheck();
      dependencies.rateLimiter = {
        status: rateLimiterHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
        responseTime: Date.now() - rateLimiterStart,
        details: rateLimiterHealth,
      };
    } catch (error) {
      dependencies.rateLimiter = {
        status: 'unhealthy',
        responseTime: null,
        error: error.message,
      };
    }
    
    // Get service metrics
    const serviceMetrics = await databaseService.getMetrics();
    
    // Determine overall status
    const allDependenciesHealthy = Object.values(dependencies)
      .every(dep => dep.status === 'healthy');
    
    const overallStatus = allDependenciesHealthy ? 'healthy' : 'degraded';
    
    const health = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: 'database-agent',
      version: '1.0.0',
      uptime: process.uptime(),
      responseTime: Date.now() - startTime,
      system: systemInfo,
      dependencies,
      metrics: {
        service: serviceMetrics,
        requests: {
          total: telemetryService.getMetric('requests_total') || 0,
          errors: telemetryService.getMetric('errors_total') || 0,
        },
      },
    };
    
    span.setAttributes({
      'health.status': overallStatus,
      'health.response_time': Date.now() - startTime,
      'health.dependencies_healthy': allDependenciesHealthy,
      'health.cache_status': dependencies.cache.status,
      'health.ai_service_status': dependencies.aiService.status,
      'health.rate_limiter_status': dependencies.rateLimiter.status,
    });
    
    telemetryService.incrementCounter('health_check_requests_total', {
      type: 'detailed',
      status: overallStatus,
    });
    
    span.end();
    
    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
    
  } catch (error) {
    span.recordException(error);
    span.setAttributes({ 'health.status': 'unhealthy' });
    span.end();
    
    logger.error('Detailed health check failed', {
      error: error.message,
      stack: error.stack,
      requestId: req.id,
    });
    
    telemetryService.incrementCounter('health_check_requests_total', {
      type: 'detailed',
      status: 'unhealthy',
    });
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'database-agent',
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/health/ready:
 *   get:
 *     summary: Readiness check
 *     description: Kubernetes readiness probe endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready to accept traffic
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ready
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: Service is not ready
 */
router.get('/ready', async (req, res) => {
  const span = telemetryService.startSpan('health.readiness_check');
  
  try {
    // Check critical dependencies for readiness
    const checks = [];
    
    // Check if AI service is available
    if (config.openai.enabled) {
      checks.push(
        databaseService.healthCheck()
          .then(() => ({ name: 'ai_service', status: 'ready' }))
          .catch(error => ({ name: 'ai_service', status: 'not_ready', error: error.message }))
      );
    }
    
    // Check if cache is available (if enabled)
    if (config.cache.enabled) {
      checks.push(
        cacheService.healthCheck()
          .then(() => ({ name: 'cache', status: 'ready' }))
          .catch(error => ({ name: 'cache', status: 'not_ready', error: error.message }))
      );
    }
    
    const results = await Promise.all(checks);
    const allReady = results.every(result => result.status === 'ready');
    
    const readiness = {
      status: allReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      service: 'database-agent',
      checks: results,
    };
    
    span.setAttributes({
      'health.readiness': allReady ? 'ready' : 'not_ready',
      'health.checks_count': results.length,
      'health.checks_passed': results.filter(r => r.status === 'ready').length,
    });
    
    telemetryService.incrementCounter('readiness_check_requests_total', {
      status: allReady ? 'ready' : 'not_ready',
    });
    
    span.end();
    
    const statusCode = allReady ? 200 : 503;
    res.status(statusCode).json(readiness);
    
  } catch (error) {
    span.recordException(error);
    span.setAttributes({ 'health.readiness': 'error' });
    span.end();
    
    logger.error('Readiness check failed', {
      error: error.message,
      requestId: req.id,
    });
    
    telemetryService.incrementCounter('readiness_check_requests_total', {
      status: 'error',
    });
    
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      service: 'database-agent',
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/health/live:
 *   get:
 *     summary: Liveness check
 *     description: Kubernetes liveness probe endpoint
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
 *                   example: alive
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *       503:
 *         description: Service is not responding
 */
router.get('/live', (req, res) => {
  const span = telemetryService.startSpan('health.liveness_check');
  
  try {
    // Simple liveness check - if we can respond, we're alive
    const liveness = {
      status: 'alive',
      timestamp: new Date().toISOString(),
      service: 'database-agent',
      uptime: process.uptime(),
      pid: process.pid,
    };
    
    span.setAttributes({
      'health.liveness': 'alive',
      'health.uptime': process.uptime(),
      'health.pid': process.pid,
    });
    
    telemetryService.incrementCounter('liveness_check_requests_total', {
      status: 'alive',
    });
    
    span.end();
    
    res.json(liveness);
    
  } catch (error) {
    span.recordException(error);
    span.setAttributes({ 'health.liveness': 'error' });
    span.end();
    
    logger.error('Liveness check failed', {
      error: error.message,
      requestId: req.id,
    });
    
    telemetryService.incrementCounter('liveness_check_requests_total', {
      status: 'error',
    });
    
    res.status(503).json({
      status: 'not_alive',
      timestamp: new Date().toISOString(),
      service: 'database-agent',
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/health/metrics:
 *   get:
 *     summary: Service metrics
 *     description: Returns service metrics for monitoring
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 service:
 *                   type: string
 *                 metrics:
 *                   type: object
 */
router.get('/metrics', async (req, res) => {
  const span = telemetryService.startSpan('health.get_metrics');
  
  try {
    // Get service metrics
    const serviceMetrics = await databaseService.getMetrics();
    const cacheMetrics = await cacheService.getStats();
    
    // Get system metrics
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const metrics = {
      timestamp: new Date().toISOString(),
      service: 'database-agent',
      version: '1.0.0',
      uptime: process.uptime(),
      system: {
        memory: {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
          arrayBuffers: memoryUsage.arrayBuffers,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
      },
      service: serviceMetrics,
      cache: cacheMetrics,
      telemetry: {
        requests_total: telemetryService.getMetric('requests_total') || 0,
        errors_total: telemetryService.getMetric('errors_total') || 0,
        response_time_avg: telemetryService.getMetric('response_time_avg') || 0,
      },
    };
    
    span.setAttributes({
      'metrics.uptime': process.uptime(),
      'metrics.memory_used': memoryUsage.heapUsed,
      'metrics.active_tasks': serviceMetrics.activeTasks || 0,
    });
    
    telemetryService.incrementCounter('metrics_requests_total');
    
    span.end();
    
    res.json(metrics);
    
  } catch (error) {
    span.recordException(error);
    span.end();
    
    logger.error('Metrics retrieval failed', {
      error: error.message,
      requestId: req.id,
    });
    
    res.status(500).json({
      timestamp: new Date().toISOString(),
      service: 'database-agent',
      error: error.message,
    });
  }
});

module.exports = router;