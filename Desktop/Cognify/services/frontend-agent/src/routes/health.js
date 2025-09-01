const express = require('express');
const { frontendService } = require('../services/frontendService');
const { eventEmitter } = require('../services/eventEmitter');
const { logger } = require('../config/logger');
const { tracer, meter } = require('../config/telemetry');
const redis = require('redis');
const axios = require('axios');
const os = require('os');
const process = require('process');

const router = express.Router();

// Health check metrics
const healthCheckCounter = meter.createCounter('health_checks_total', {
  description: 'Total number of health checks performed'
});

const healthCheckDuration = meter.createHistogram('health_check_duration_seconds', {
  description: 'Duration of health checks in seconds'
});

const serviceHealthGauge = meter.createUpDownCounter('service_health_status', {
  description: 'Current health status of the service (1 = healthy, 0 = unhealthy)'
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Basic health check
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
 *                   example: frontend-agent
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *       503:
 *         description: Service is unhealthy
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const span = tracer.startSpan('health.basic');
  
  try {
    healthCheckCounter.add(1, { type: 'basic' });
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'frontend-agent',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };

    serviceHealthGauge.add(1, { service: 'frontend-agent', type: 'basic' });
    
    res.json(health);
    
    logger.debug('Basic health check completed', { status: 'healthy' });
  } catch (error) {
    serviceHealthGauge.add(0, { service: 'frontend-agent', type: 'basic' });
    
    logger.error('Basic health check failed', { error: error.message });
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'frontend-agent',
      error: error.message
    });
  } finally {
    const duration = (Date.now() - startTime) / 1000;
    healthCheckDuration.record(duration, { type: 'basic' });
    span.end();
  }
});

/**
 * @swagger
 * /health/detailed:
 *   get:
 *     summary: Detailed health check with dependencies
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Detailed health status
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
 *                 service:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     version:
 *                       type: string
 *                     uptime:
 *                       type: number
 *                     environment:
 *                       type: string
 *                 dependencies:
 *                   type: object
 *                   properties:
 *                     redis:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         latency:
 *                           type: number
 *                     orchestrator:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         latency:
 *                           type: number
 *                     openai:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         latency:
 *                           type: number
 *                 system:
 *                   type: object
 *                   properties:
 *                     memory:
 *                       type: object
 *                     cpu:
 *                       type: object
 *                     disk:
 *                       type: object
 *       503:
 *         description: Service is unhealthy
 */
router.get('/detailed', async (req, res) => {
  const startTime = Date.now();
  const span = tracer.startSpan('health.detailed');
  
  try {
    healthCheckCounter.add(1, { type: 'detailed' });
    
    const checks = await Promise.allSettled([
      checkRedis(),
      checkOrchestrator(),
      checkOpenAI(),
      checkSystemResources()
    ]);

    const [redisCheck, orchestratorCheck, openaiCheck, systemCheck] = checks;
    
    const dependencies = {
      redis: redisCheck.status === 'fulfilled' ? redisCheck.value : { status: 'unhealthy', error: redisCheck.reason?.message },
      orchestrator: orchestratorCheck.status === 'fulfilled' ? orchestratorCheck.value : { status: 'unhealthy', error: orchestratorCheck.reason?.message },
      openai: openaiCheck.status === 'fulfilled' ? openaiCheck.value : { status: 'unhealthy', error: openaiCheck.reason?.message }
    };

    const system = systemCheck.status === 'fulfilled' ? systemCheck.value : { error: systemCheck.reason?.message };

    // Determine overall health status
    const healthyDeps = Object.values(dependencies).filter(dep => dep.status === 'healthy').length;
    const totalDeps = Object.keys(dependencies).length;
    
    let overallStatus = 'healthy';
    if (healthyDeps === 0) {
      overallStatus = 'unhealthy';
    } else if (healthyDeps < totalDeps) {
      overallStatus = 'degraded';
    }

    const health = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: {
        name: 'frontend-agent',
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        pid: process.pid
      },
      dependencies,
      system,
      agent: {
        status: frontendService.getStatus(),
        tasksProcessed: frontendService.getMetrics().tasksProcessed || 0,
        activeConnections: frontendService.getMetrics().activeConnections || 0
      }
    };

    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
    serviceHealthGauge.add(statusCode === 200 ? 1 : 0, { service: 'frontend-agent', type: 'detailed' });
    
    res.status(statusCode).json(health);
    
    logger.info('Detailed health check completed', {
      status: overallStatus,
      healthyDependencies: healthyDeps,
      totalDependencies: totalDeps
    });
  } catch (error) {
    serviceHealthGauge.add(0, { service: 'frontend-agent', type: 'detailed' });
    
    logger.error('Detailed health check failed', { error: error.message });
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'frontend-agent',
      error: error.message
    });
  } finally {
    const duration = (Date.now() - startTime) / 1000;
    healthCheckDuration.record(duration, { type: 'detailed' });
    span.end();
  }
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness probe for Kubernetes
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready to accept traffic
 *       503:
 *         description: Service is not ready
 */
router.get('/ready', async (req, res) => {
  const startTime = Date.now();
  const span = tracer.startSpan('health.readiness');
  
  try {
    healthCheckCounter.add(1, { type: 'readiness' });
    
    // Check if service is initialized and ready
    const isReady = frontendService.isReady() && eventEmitter.isConnected();
    
    if (isReady) {
      serviceHealthGauge.add(1, { service: 'frontend-agent', type: 'readiness' });
      
      res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        service: 'frontend-agent'
      });
      
      logger.debug('Readiness check passed');
    } else {
      serviceHealthGauge.add(0, { service: 'frontend-agent', type: 'readiness' });
      
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        service: 'frontend-agent',
        reason: 'Service not fully initialized'
      });
      
      logger.warn('Readiness check failed', { reason: 'Service not fully initialized' });
    }
  } catch (error) {
    serviceHealthGauge.add(0, { service: 'frontend-agent', type: 'readiness' });
    
    logger.error('Readiness check failed', { error: error.message });
    
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      service: 'frontend-agent',
      error: error.message
    });
  } finally {
    const duration = (Date.now() - startTime) / 1000;
    healthCheckDuration.record(duration, { type: 'readiness' });
    span.end();
  }
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness probe for Kubernetes
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is alive
 *       503:
 *         description: Service should be restarted
 */
router.get('/live', async (req, res) => {
  const startTime = Date.now();
  const span = tracer.startSpan('health.liveness');
  
  try {
    healthCheckCounter.add(1, { type: 'liveness' });
    
    // Basic liveness check - service is running
    const memUsage = process.memoryUsage();
    const isAlive = memUsage.heapUsed < (1024 * 1024 * 1024); // Less than 1GB heap usage
    
    if (isAlive) {
      serviceHealthGauge.add(1, { service: 'frontend-agent', type: 'liveness' });
      
      res.json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        service: 'frontend-agent',
        uptime: process.uptime(),
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
        }
      });
      
      logger.debug('Liveness check passed');
    } else {
      serviceHealthGauge.add(0, { service: 'frontend-agent', type: 'liveness' });
      
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'frontend-agent',
        reason: 'High memory usage detected'
      });
      
      logger.error('Liveness check failed', { reason: 'High memory usage', heapUsed: memUsage.heapUsed });
    }
  } catch (error) {
    serviceHealthGauge.add(0, { service: 'frontend-agent', type: 'liveness' });
    
    logger.error('Liveness check failed', { error: error.message });
    
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'frontend-agent',
      error: error.message
    });
  } finally {
    const duration = (Date.now() - startTime) / 1000;
    healthCheckDuration.record(duration, { type: 'liveness' });
    span.end();
  }
});

// Helper functions for dependency checks
async function checkRedis() {
  const startTime = Date.now();
  
  try {
    // Check if Redis is accessible through event emitter
    const isConnected = eventEmitter.isConnected();
    
    if (!isConnected) {
      throw new Error('Redis connection not established');
    }
    
    const latency = Date.now() - startTime;
    
    return {
      status: 'healthy',
      latency,
      connection: 'established'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      latency: Date.now() - startTime
    };
  }
}

async function checkOrchestrator() {
  const startTime = Date.now();
  
  try {
    const orchestratorUrl = process.env.ORCHESTRATOR_URL || 'http://localhost:3000';
    
    const response = await axios.get(`${orchestratorUrl}/health`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'frontend-agent-health-check'
      }
    });
    
    const latency = Date.now() - startTime;
    
    return {
      status: response.status === 200 ? 'healthy' : 'unhealthy',
      latency,
      url: orchestratorUrl,
      responseStatus: response.status
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      latency: Date.now() - startTime
    };
  }
}

async function checkOpenAI() {
  const startTime = Date.now();
  
  try {
    // Simple check to see if OpenAI API key is configured
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    // We don't make an actual API call to avoid costs
    // Just check if the key format looks valid
    const isValidFormat = apiKey.startsWith('sk-') && apiKey.length > 20;
    
    if (!isValidFormat) {
      throw new Error('Invalid OpenAI API key format');
    }
    
    const latency = Date.now() - startTime;
    
    return {
      status: 'healthy',
      latency,
      configured: true,
      keyFormat: 'valid'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      latency: Date.now() - startTime,
      configured: false
    };
  }
}

async function checkSystemResources() {
  try {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const loadAvg = os.loadavg();
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    
    return {
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024), // MB
        systemFree: Math.round(freeMem / 1024 / 1024), // MB
        systemTotal: Math.round(totalMem / 1024 / 1024), // MB
        usage: Math.round(((totalMem - freeMem) / totalMem) * 100) // %
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        loadAverage: loadAvg
      },
      uptime: {
        process: Math.round(process.uptime()),
        system: Math.round(os.uptime())
      },
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version
    };
  } catch (error) {
    throw new Error(`System resource check failed: ${error.message}`);
  }
}

// Error handling middleware for health routes
router.use((error, req, res, next) => {
  logger.error('Health route error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    status: 'error',
    timestamp: new Date().toISOString(),
    service: 'frontend-agent',
    error: 'Health check failed'
  });
});

module.exports = router;