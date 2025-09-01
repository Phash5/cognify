/**
 * Health Check Routes for Backend AI Agent
 * Provides comprehensive health monitoring endpoints
 */

'use strict';

const express = require('express');
const os = require('os');
const process = require('process');
const config = require('../config/config');
const { BackendService } = require('../services/backendService');
const { CacheService } = require('../services/cacheService');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');

const router = express.Router();
const backendService = new BackendService();
const cacheService = new CacheService();

// Health check start time
const startTime = Date.now();

/**
 * @swagger
 * components:
 *   schemas:
 *     HealthStatus:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [healthy, degraded, unhealthy]
 *         timestamp:
 *           type: string
 *           format: date-time
 *         uptime:
 *           type: number
 *           description: Service uptime in seconds
 *         version:
 *           type: string
 *         environment:
 *           type: string
 *         services:
 *           type: object
 *           properties:
 *             cache:
 *               $ref: '#/components/schemas/ServiceHealth'
 *             ai:
 *               $ref: '#/components/schemas/ServiceHealth'
 *             orchestrator:
 *               $ref: '#/components/schemas/ServiceHealth'
 *         system:
 *           type: object
 *           properties:
 *             memory:
 *               type: object
 *               properties:
 *                 used:
 *                   type: number
 *                 total:
 *                   type: number
 *                 percentage:
 *                   type: number
 *             cpu:
 *               type: object
 *               properties:
 *                 usage:
 *                   type: number
 *                 loadAverage:
 *                   type: array
 *                   items:
 *                     type: number
 *             disk:
 *               type: object
 *               properties:
 *                 free:
 *                   type: number
 *                 total:
 *                   type: number
 *                 percentage:
 *                   type: number
 *     
 *     ServiceHealth:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [healthy, degraded, unhealthy]
 *         responseTime:
 *           type: number
 *         lastCheck:
 *           type: string
 *           format: date-time
 *         error:
 *           type: string
 */

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Basic health check
 *     description: Returns basic service health status
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
 *                 uptime:
 *                   type: number
 *       503:
 *         description: Service is unhealthy
 */
router.get('/',
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('health.basic_check');
    
    try {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      const timestamp = new Date().toISOString();
      
      span.setAttributes({
        'health.uptime': uptime,
        'health.check_type': 'basic',
      });
      
      // Basic health indicators
      const memoryUsage = process.memoryUsage();
      const memoryPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      
      // Consider service unhealthy if memory usage is too high
      const isHealthy = memoryPercentage < 90;
      const status = isHealthy ? 'healthy' : 'unhealthy';
      
      span.setAttributes({
        'health.status': status,
        'health.memory_percentage': memoryPercentage,
      });
      
      const response = {
        status,
        timestamp,
        uptime,
        service: 'backend-ai-agent',
        version: process.env.npm_package_version || '1.0.0',
      };
      
      const statusCode = isHealthy ? 200 : 503;
      res.status(statusCode).json(response);
      
      logger.debug('Basic health check completed', {
        status,
        uptime,
        memoryPercentage: Math.round(memoryPercentage * 100) / 100,
      });
      
    } catch (error) {
      span.recordException(error);
      logger.error('Health check failed', { error: error.message });
      
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      });
    } finally {
      span.end();
    }
  })
);

/**
 * @swagger
 * /health/detailed:
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
 *               $ref: '#/components/schemas/HealthStatus'
 */
router.get('/detailed',
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('health.detailed_check');
    
    try {
      const startCheck = Date.now();
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      const timestamp = new Date().toISOString();
      
      span.setAttributes({
        'health.uptime': uptime,
        'health.check_type': 'detailed',
      });
      
      // System metrics
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const loadAverage = os.loadavg();
      
      const systemMetrics = {
        memory: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100 * 100) / 100,
          rss: memoryUsage.rss,
          external: memoryUsage.external,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
          loadAverage: loadAverage.map(load => Math.round(load * 100) / 100),
        },
        process: {
          pid: process.pid,
          uptime: Math.floor(process.uptime()),
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        os: {
          hostname: os.hostname(),
          type: os.type(),
          release: os.release(),
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          cpus: os.cpus().length,
        },
      };
      
      // Check external dependencies
      const serviceChecks = await Promise.allSettled([
        checkCacheHealth(),
        checkAIServiceHealth(),
        checkOrchestratorHealth(),
      ]);
      
      const [cacheHealth, aiHealth, orchestratorHealth] = serviceChecks.map(result => 
        result.status === 'fulfilled' ? result.value : { status: 'unhealthy', error: result.reason?.message }
      );
      
      const services = {
        cache: cacheHealth,
        ai: aiHealth,
        orchestrator: orchestratorHealth,
      };
      
      // Determine overall health status
      const serviceStatuses = Object.values(services).map(service => service.status);
      const hasUnhealthy = serviceStatuses.includes('unhealthy');
      const hasDegraded = serviceStatuses.includes('degraded');
      
      let overallStatus = 'healthy';
      if (hasUnhealthy) {
        overallStatus = 'unhealthy';
      } else if (hasDegraded || systemMetrics.memory.percentage > 80) {
        overallStatus = 'degraded';
      }
      
      const checkDuration = Date.now() - startCheck;
      
      span.setAttributes({
        'health.status': overallStatus,
        'health.check_duration': checkDuration,
        'health.memory_percentage': systemMetrics.memory.percentage,
        'health.cache_status': cacheHealth.status,
        'health.ai_status': aiHealth.status,
        'health.orchestrator_status': orchestratorHealth.status,
      });
      
      const response = {
        status: overallStatus,
        timestamp,
        uptime,
        checkDuration,
        service: 'backend-ai-agent',
        version: process.env.npm_package_version || '1.0.0',
        environment: config.server.env,
        services,
        system: systemMetrics,
        config: {
          port: config.server.port,
          logLevel: config.logging.level,
          cacheEnabled: config.cache.enabled,
          aiProvider: config.ai.provider,
          rateLimitEnabled: config.rateLimit.enabled,
        },
      };
      
      const statusCode = overallStatus === 'healthy' ? 200 : (overallStatus === 'degraded' ? 200 : 503);
      res.status(statusCode).json(response);
      
      logger.info('Detailed health check completed', {
        status: overallStatus,
        uptime,
        checkDuration,
        memoryPercentage: systemMetrics.memory.percentage,
        services: Object.fromEntries(
          Object.entries(services).map(([key, value]) => [key, value.status])
        ),
      });
      
    } catch (error) {
      span.recordException(error);
      logger.error('Detailed health check failed', { error: error.message, stack: error.stack });
      
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Detailed health check failed',
        message: error.message,
      });
    } finally {
      span.end();
    }
  })
);

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
 *       503:
 *         description: Service is not ready
 */
router.get('/ready',
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('health.readiness_check');
    
    try {
      const timestamp = new Date().toISOString();
      
      // Check if critical dependencies are available
      const criticalChecks = await Promise.allSettled([
        checkCacheHealth(),
        checkAIServiceHealth(),
      ]);
      
      const [cacheHealth, aiHealth] = criticalChecks.map(result => 
        result.status === 'fulfilled' ? result.value : { status: 'unhealthy' }
      );
      
      const isReady = cacheHealth.status !== 'unhealthy' && aiHealth.status !== 'unhealthy';
      
      span.setAttributes({
        'health.ready': isReady,
        'health.cache_status': cacheHealth.status,
        'health.ai_status': aiHealth.status,
      });
      
      const response = {
        ready: isReady,
        timestamp,
        service: 'backend-ai-agent',
        checks: {
          cache: cacheHealth.status,
          ai: aiHealth.status,
        },
      };
      
      const statusCode = isReady ? 200 : 503;
      res.status(statusCode).json(response);
      
      logger.debug('Readiness check completed', {
        ready: isReady,
        cacheStatus: cacheHealth.status,
        aiStatus: aiHealth.status,
      });
      
    } catch (error) {
      span.recordException(error);
      logger.error('Readiness check failed', { error: error.message });
      
      res.status(503).json({
        ready: false,
        timestamp: new Date().toISOString(),
        error: 'Readiness check failed',
      });
    } finally {
      span.end();
    }
  })
);

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
 */
router.get('/live',
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('health.liveness_check');
    
    try {
      const timestamp = new Date().toISOString();
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      
      span.setAttributes({
        'health.alive': true,
        'health.uptime': uptime,
      });
      
      res.json({
        alive: true,
        timestamp,
        uptime,
        service: 'backend-ai-agent',
      });
      
    } catch (error) {
      span.recordException(error);
      logger.error('Liveness check failed', { error: error.message });
      
      res.status(503).json({
        alive: false,
        timestamp: new Date().toISOString(),
        error: 'Liveness check failed',
      });
    } finally {
      span.end();
    }
  })
);

// Helper functions for dependency health checks

/**
 * Check cache service health
 */
async function checkCacheHealth() {
  const startTime = Date.now();
  
  try {
    const isHealthy = await cacheService.healthCheck();
    const responseTime = Date.now() - startTime;
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime,
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'unhealthy',
      responseTime,
      lastCheck: new Date().toISOString(),
      error: error.message,
    };
  }
}

/**
 * Check AI service health
 */
async function checkAIServiceHealth() {
  const startTime = Date.now();
  
  try {
    // Simple test to check if AI service is responsive
    const isHealthy = await backendService.healthCheck();
    const responseTime = Date.now() - startTime;
    
    return {
      status: isHealthy ? 'healthy' : 'degraded',
      responseTime,
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'unhealthy',
      responseTime,
      lastCheck: new Date().toISOString(),
      error: error.message,
    };
  }
}

/**
 * Check orchestrator service health
 */
async function checkOrchestratorHealth() {
  const startTime = Date.now();
  
  try {
    // In a real implementation, this would make an HTTP request to the orchestrator
    // For now, we'll simulate a check
    const orchestratorUrl = config.orchestrator?.url || process.env.ORCHESTRATOR_URL;
    
    if (!orchestratorUrl) {
      return {
        status: 'degraded',
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
        error: 'Orchestrator URL not configured',
      };
    }
    
    // Simulate orchestrator health check
    // In production, you would use axios or fetch to check the orchestrator health endpoint
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'healthy',
      responseTime,
      lastCheck: new Date().toISOString(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'unhealthy',
      responseTime,
      lastCheck: new Date().toISOString(),
      error: error.message,
    };
  }
}

module.exports = router;