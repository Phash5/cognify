/**
 * Metrics Routes for DevOps AI Agent
 * Provides comprehensive metrics and monitoring endpoints
 */

'use strict';

const express = require('express');
const promClient = require('prom-client');
const os = require('os');
const config = require('../config/config');
const { DevOpsService } = require('../services/devopsService');
const { CacheService } = require('../services/cacheService');
const logger = require('../utils/logger');
const { TelemetryService } = require('../utils/telemetry');
const { authenticateApiKey } = require('../middleware');

const router = express.Router();

// Initialize services
const devopsService = new DevOpsService();
const cacheService = new CacheService();
const telemetry = new TelemetryService();

// Create a registry for custom metrics
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({
  register,
  prefix: 'devops_agent_',
});

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'devops_agent_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

const httpRequestsTotal = new promClient.Counter({
  name: 'devops_agent_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const activeConnections = new promClient.Gauge({
  name: 'devops_agent_active_connections',
  help: 'Number of active connections',
  registers: [register],
});

const taskProcessingDuration = new promClient.Histogram({
  name: 'devops_agent_task_processing_duration_seconds',
  help: 'Duration of task processing in seconds',
  labelNames: ['task_type', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

const tasksTotal = new promClient.Counter({
  name: 'devops_agent_tasks_total',
  help: 'Total number of tasks processed',
  labelNames: ['task_type', 'status'],
  registers: [register],
});

const activeTasks = new promClient.Gauge({
  name: 'devops_agent_active_tasks',
  help: 'Number of currently active tasks',
  labelNames: ['task_type'],
  registers: [register],
});

const aiRequestDuration = new promClient.Histogram({
  name: 'devops_agent_ai_request_duration_seconds',
  help: 'Duration of AI requests in seconds',
  labelNames: ['operation_type', 'status'],
  buckets: [1, 5, 10, 30, 60],
  registers: [register],
});

const aiRequestsTotal = new promClient.Counter({
  name: 'devops_agent_ai_requests_total',
  help: 'Total number of AI requests',
  labelNames: ['operation_type', 'status'],
  registers: [register],
});

const cacheHitsTotal = new promClient.Counter({
  name: 'devops_agent_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['operation'],
  registers: [register],
});

const cacheMissesTotal = new promClient.Counter({
  name: 'devops_agent_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['operation'],
  registers: [register],
});

const rateLimitHitsTotal = new promClient.Counter({
  name: 'devops_agent_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['limiter_type', 'endpoint'],
  registers: [register],
});

const errorTotal = new promClient.Counter({
  name: 'devops_agent_errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type', 'endpoint'],
  registers: [register],
});

// DevOps-specific metrics
const deploymentOperations = new promClient.Counter({
  name: 'devops_agent_deployment_operations_total',
  help: 'Total number of deployment operations',
  labelNames: ['platform', 'status'],
  registers: [register],
});

const infrastructureOperations = new promClient.Counter({
  name: 'devops_agent_infrastructure_operations_total',
  help: 'Total number of infrastructure operations',
  labelNames: ['provider', 'resource_type', 'status'],
  registers: [register],
});

const monitoringSetups = new promClient.Counter({
  name: 'devops_agent_monitoring_setups_total',
  help: 'Total number of monitoring setups',
  labelNames: ['monitoring_type', 'status'],
  registers: [register],
});

const configurationChanges = new promClient.Counter({
  name: 'devops_agent_configuration_changes_total',
  help: 'Total number of configuration changes',
  labelNames: ['config_type', 'status'],
  registers: [register],
});

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Prometheus metrics
 *     description: Returns metrics in Prometheus format
 *     tags: [Metrics]
 *     responses:
 *       200:
 *         description: Metrics in Prometheus format
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       500:
 *         description: Failed to retrieve metrics
 */
router.get('/', async (req, res) => {
  try {
    // Update custom metrics before returning
    await updateCustomMetrics();
    
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
    
  } catch (error) {
    logger.logError('Failed to retrieve Prometheus metrics', error);
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error.message,
    });
  }
});

/**
 * @swagger
 * /metrics/json:
 *   get:
 *     summary: JSON metrics
 *     description: Returns comprehensive metrics in JSON format
 *     tags: [Metrics]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Metrics in JSON format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 system:
 *                   type: object
 *                 service:
 *                   type: object
 *                 devops:
 *                   type: object
 *                 performance:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to retrieve metrics
 */
router.get('/json', authenticateApiKey, async (req, res) => {
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
        usagePercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        loadAverage: loadAvg,
        cores: os.cpus().length,
      },
      uptime: {
        process: process.uptime(),
        system: os.uptime(),
      },
      platform: {
        type: os.platform(),
        arch: os.arch(),
        release: os.release(),
        hostname: os.hostname(),
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
    
    // DevOps-specific metrics
    const devopsMetrics = {
      deployments: {
        total: serviceMetrics.deploymentOperations || 0,
        successful: serviceMetrics.successfulDeployments || 0,
        failed: serviceMetrics.failedDeployments || 0,
        platforms: serviceMetrics.deploymentPlatforms || {},
      },
      infrastructure: {
        total: serviceMetrics.infrastructureOperations || 0,
        successful: serviceMetrics.successfulInfrastructure || 0,
        failed: serviceMetrics.failedInfrastructure || 0,
        providers: serviceMetrics.infrastructureProviders || {},
      },
      monitoring: {
        total: serviceMetrics.monitoringSetups || 0,
        successful: serviceMetrics.successfulMonitoring || 0,
        failed: serviceMetrics.failedMonitoring || 0,
        types: serviceMetrics.monitoringTypes || {},
      },
      configuration: {
        total: serviceMetrics.configurationChanges || 0,
        successful: serviceMetrics.successfulConfiguration || 0,
        failed: serviceMetrics.failedConfiguration || 0,
        types: serviceMetrics.configurationTypes || {},
      },
    };
    
    // Performance metrics
    const performanceMetrics = {
      requests: {
        total: serviceMetrics.requestsProcessed || 0,
        successful: serviceMetrics.successfulRequests || 0,
        failed: serviceMetrics.failedRequests || 0,
        averageResponseTime: serviceMetrics.averageResponseTime || 0,
      },
      tasks: {
        total: serviceMetrics.tasksProcessed || 0,
        active: serviceMetrics.activeTasks || 0,
        queued: serviceMetrics.queuedTasks || 0,
        averageProcessingTime: serviceMetrics.averageTaskDuration || 0,
      },
      ai: {
        requests: serviceMetrics.aiRequests || 0,
        successful: serviceMetrics.successfulAiRequests || 0,
        failed: serviceMetrics.failedAiRequests || 0,
        averageResponseTime: serviceMetrics.averageAiResponseTime || 0,
      },
      cache: {
        hits: cacheMetrics.hits || 0,
        misses: cacheMetrics.misses || 0,
        hitRate: cacheMetrics.hitRate || 0,
        size: cacheMetrics.size || 0,
      },
    };
    
    telemetry.incrementCounter('metrics_requests_total', {
      format: 'json',
      status: 'success',
    });
    
    res.json({
      timestamp: new Date().toISOString(),
      system: systemMetrics,
      service: serviceMetrics,
      devops: devopsMetrics,
      performance: performanceMetrics,
      cache: cacheMetrics,
    });
    
  } catch (error) {
    logger.logError('Failed to retrieve JSON metrics', error);
    
    telemetry.incrementCounter('metrics_requests_total', {
      format: 'json',
      status: 'error',
    });
    
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /metrics/performance:
 *   get:
 *     summary: Performance metrics
 *     description: Returns performance-specific metrics
 *     tags: [Metrics]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Performance metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 response_times:
 *                   type: object
 *                 throughput:
 *                   type: object
 *                 resource_usage:
 *                   type: object
 *                 error_rates:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to retrieve performance metrics
 */
router.get('/performance', authenticateApiKey, async (req, res) => {
  try {
    const serviceMetrics = await devopsService.getMetrics();
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const performanceMetrics = {
      response_times: {
        average: serviceMetrics.averageResponseTime || 0,
        p50: serviceMetrics.p50ResponseTime || 0,
        p95: serviceMetrics.p95ResponseTime || 0,
        p99: serviceMetrics.p99ResponseTime || 0,
        ai_average: serviceMetrics.averageAiResponseTime || 0,
        task_average: serviceMetrics.averageTaskDuration || 0,
      },
      throughput: {
        requests_per_second: serviceMetrics.requestsPerSecond || 0,
        tasks_per_minute: serviceMetrics.tasksPerMinute || 0,
        ai_requests_per_minute: serviceMetrics.aiRequestsPerMinute || 0,
      },
      resource_usage: {
        memory: {
          heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
          heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
          usage_percent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
        },
        cpu: {
          user_time: cpuUsage.user,
          system_time: cpuUsage.system,
          load_average: os.loadavg(),
        },
      },
      error_rates: {
        overall_error_rate: serviceMetrics.errorRate || 0,
        ai_error_rate: serviceMetrics.aiErrorRate || 0,
        task_failure_rate: serviceMetrics.taskFailureRate || 0,
        cache_miss_rate: serviceMetrics.cacheMissRate || 0,
      },
      concurrency: {
        active_tasks: serviceMetrics.activeTasks || 0,
        queued_tasks: serviceMetrics.queuedTasks || 0,
        active_connections: serviceMetrics.activeConnections || 0,
      },
    };
    
    telemetry.incrementCounter('metrics_requests_total', {
      format: 'performance',
      status: 'success',
    });
    
    res.json({
      timestamp: new Date().toISOString(),
      ...performanceMetrics,
    });
    
  } catch (error) {
    logger.logError('Failed to retrieve performance metrics', error);
    
    telemetry.incrementCounter('metrics_requests_total', {
      format: 'performance',
      status: 'error',
    });
    
    res.status(500).json({
      error: 'Failed to retrieve performance metrics',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /metrics/devops:
 *   get:
 *     summary: DevOps-specific metrics
 *     description: Returns metrics specific to DevOps operations
 *     tags: [Metrics]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: DevOps metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 deployments:
 *                   type: object
 *                 infrastructure:
 *                   type: object
 *                 monitoring:
 *                   type: object
 *                 configuration:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to retrieve DevOps metrics
 */
router.get('/devops', authenticateApiKey, async (req, res) => {
  try {
    const serviceMetrics = await devopsService.getMetrics();
    
    const devopsMetrics = {
      deployments: {
        total: serviceMetrics.deploymentOperations || 0,
        successful: serviceMetrics.successfulDeployments || 0,
        failed: serviceMetrics.failedDeployments || 0,
        success_rate: serviceMetrics.deploymentSuccessRate || 0,
        average_duration: serviceMetrics.averageDeploymentDuration || 0,
        platforms: serviceMetrics.deploymentPlatforms || {},
        recent_deployments: serviceMetrics.recentDeployments || [],
      },
      infrastructure: {
        total: serviceMetrics.infrastructureOperations || 0,
        successful: serviceMetrics.successfulInfrastructure || 0,
        failed: serviceMetrics.failedInfrastructure || 0,
        success_rate: serviceMetrics.infrastructureSuccessRate || 0,
        average_duration: serviceMetrics.averageInfrastructureDuration || 0,
        providers: serviceMetrics.infrastructureProviders || {},
        resource_types: serviceMetrics.infrastructureResourceTypes || {},
      },
      monitoring: {
        total: serviceMetrics.monitoringSetups || 0,
        successful: serviceMetrics.successfulMonitoring || 0,
        failed: serviceMetrics.failedMonitoring || 0,
        success_rate: serviceMetrics.monitoringSuccessRate || 0,
        average_duration: serviceMetrics.averageMonitoringDuration || 0,
        types: serviceMetrics.monitoringTypes || {},
        tools: serviceMetrics.monitoringTools || {},
      },
      configuration: {
        total: serviceMetrics.configurationChanges || 0,
        successful: serviceMetrics.successfulConfiguration || 0,
        failed: serviceMetrics.failedConfiguration || 0,
        success_rate: serviceMetrics.configurationSuccessRate || 0,
        average_duration: serviceMetrics.averageConfigurationDuration || 0,
        types: serviceMetrics.configurationTypes || {},
        tools: serviceMetrics.configurationTools || {},
      },
    };
    
    telemetry.incrementCounter('metrics_requests_total', {
      format: 'devops',
      status: 'success',
    });
    
    res.json({
      timestamp: new Date().toISOString(),
      ...devopsMetrics,
    });
    
  } catch (error) {
    logger.logError('Failed to retrieve DevOps metrics', error);
    
    telemetry.incrementCounter('metrics_requests_total', {
      format: 'devops',
      status: 'error',
    });
    
    res.status(500).json({
      error: 'Failed to retrieve DevOps metrics',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @swagger
 * /metrics/reset:
 *   post:
 *     summary: Reset metrics
 *     description: Reset all metrics counters (development only)
 *     tags: [Metrics]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Metrics reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not allowed in production
 *       500:
 *         description: Failed to reset metrics
 */
router.post('/reset', authenticateApiKey, async (req, res) => {
  try {
    // Only allow in development environment
    if (config.server.env === 'production') {
      return res.status(403).json({
        error: 'Metrics reset not allowed in production',
        timestamp: new Date().toISOString(),
      });
    }
    
    // Clear the registry and re-add default metrics
    register.clear();
    promClient.collectDefaultMetrics({
      register,
      prefix: 'devops_agent_',
    });
    
    // Reset service metrics
    await devopsService.resetMetrics();
    
    logger.logInfo('Metrics reset successfully');
    
    telemetry.incrementCounter('metrics_requests_total', {
      format: 'reset',
      status: 'success',
    });
    
    res.json({
      message: 'Metrics reset successfully',
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    logger.logError('Failed to reset metrics', error);
    
    telemetry.incrementCounter('metrics_requests_total', {
      format: 'reset',
      status: 'error',
    });
    
    res.status(500).json({
      error: 'Failed to reset metrics',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Helper function to update custom metrics
async function updateCustomMetrics() {
  try {
    const serviceMetrics = await devopsService.getMetrics();
    const memUsage = process.memoryUsage();
    
    // Update active tasks gauge
    activeTasks.set({ task_type: 'deployment' }, serviceMetrics.activeDeploymentTasks || 0);
    activeTasks.set({ task_type: 'infrastructure' }, serviceMetrics.activeInfrastructureTasks || 0);
    activeTasks.set({ task_type: 'monitoring' }, serviceMetrics.activeMonitoringTasks || 0);
    activeTasks.set({ task_type: 'configuration' }, serviceMetrics.activeConfigurationTasks || 0);
    
    // Update memory usage gauge
    const memoryGauge = new promClient.Gauge({
      name: 'devops_agent_memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'],
      registers: [register],
    });
    
    memoryGauge.set({ type: 'heap_used' }, memUsage.heapUsed);
    memoryGauge.set({ type: 'heap_total' }, memUsage.heapTotal);
    memoryGauge.set({ type: 'external' }, memUsage.external);
    memoryGauge.set({ type: 'rss' }, memUsage.rss);
    
  } catch (error) {
    logger.logError('Failed to update custom metrics', error);
  }
}

// Export metrics objects for use in other modules
module.exports = {
  router,
  metrics: {
    httpRequestDuration,
    httpRequestsTotal,
    activeConnections,
    taskProcessingDuration,
    tasksTotal,
    activeTasks,
    aiRequestDuration,
    aiRequestsTotal,
    cacheHitsTotal,
    cacheMissesTotal,
    rateLimitHitsTotal,
    errorTotal,
    deploymentOperations,
    infrastructureOperations,
    monitoringSetups,
    configurationChanges,
  },
  register,
};