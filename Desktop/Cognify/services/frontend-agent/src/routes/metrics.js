const express = require('express');
const { frontendService } = require('../services/frontendService');
const { logger } = require('../config/logger');
const { meter, tracer } = require('../config/telemetry');
const { AuthMiddleware } = require('../middleware/auth');
const { rateLimiterMiddleware } = require('../middleware/rateLimiter');
const promClient = require('prom-client');
const os = require('os');
const process = require('process');

const router = express.Router();

// Create Prometheus registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics for Frontend AI Agent
const taskCounter = new promClient.Counter({
  name: 'frontend_tasks_total',
  help: 'Total number of frontend tasks processed',
  labelNames: ['type', 'status', 'framework', 'language'],
  registers: [register]
});

const taskDuration = new promClient.Histogram({
  name: 'frontend_task_duration_seconds',
  help: 'Duration of frontend task processing in seconds',
  labelNames: ['type', 'framework', 'language'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [register]
});

const aiModelCalls = new promClient.Counter({
  name: 'frontend_ai_model_calls_total',
  help: 'Total number of AI model API calls',
  labelNames: ['model', 'operation', 'status'],
  registers: [register]
});

const aiModelLatency = new promClient.Histogram({
  name: 'frontend_ai_model_latency_seconds',
  help: 'Latency of AI model API calls in seconds',
  labelNames: ['model', 'operation'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 20, 30],
  registers: [register]
});

const aiTokenUsage = new promClient.Counter({
  name: 'frontend_ai_tokens_total',
  help: 'Total number of AI tokens used',
  labelNames: ['model', 'type'], // type: prompt, completion
  registers: [register]
});

const activeConnections = new promClient.Gauge({
  name: 'frontend_active_connections',
  help: 'Number of active connections to the frontend agent',
  registers: [register]
});

const codeGenerationMetrics = new promClient.Counter({
  name: 'frontend_code_generation_total',
  help: 'Total number of code generation requests',
  labelNames: ['type', 'framework', 'success'],
  registers: [register]
});

const componentGenerationMetrics = new promClient.Counter({
  name: 'frontend_component_generation_total',
  help: 'Total number of component generation requests',
  labelNames: ['framework', 'type', 'success'],
  registers: [register]
});

const optimizationMetrics = new promClient.Counter({
  name: 'frontend_optimization_total',
  help: 'Total number of code optimization requests',
  labelNames: ['type', 'success'],
  registers: [register]
});

const testGenerationMetrics = new promClient.Counter({
  name: 'frontend_test_generation_total',
  help: 'Total number of test generation requests',
  labelNames: ['framework', 'type', 'success'],
  registers: [register]
});

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Prometheus metrics endpoint
 *     tags: [Metrics]
 *     responses:
 *       200:
 *         description: Prometheus metrics in text format
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
router.get('/',
  rateLimiterMiddleware.metricsLimiter(),
  async (req, res) => {
    const span = tracer.startSpan('metrics.prometheus');
    
    try {
      // Update current metrics before serving
      updateCurrentMetrics();
      
      res.set('Content-Type', register.contentType);
      const metrics = await register.metrics();
      res.send(metrics);
      
      logger.debug('Prometheus metrics served');
    } catch (error) {
      logger.error('Failed to serve Prometheus metrics', { error: error.message });
      res.status(500).send('Error generating metrics');
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /metrics/frontend:
 *   get:
 *     summary: Frontend-specific metrics
 *     tags: [Metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Frontend agent metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     version:
 *                       type: string
 *                     uptime:
 *                       type: number
 *                     status:
 *                       type: string
 *                 tasks:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     completed:
 *                       type: number
 *                     failed:
 *                       type: number
 *                     active:
 *                       type: number
 *                     byType:
 *                       type: object
 *                     byFramework:
 *                       type: object
 *                 performance:
 *                   type: object
 *                   properties:
 *                     averageTaskDuration:
 *                       type: number
 *                     successRate:
 *                       type: number
 *                     throughput:
 *                       type: number
 *                 ai:
 *                   type: object
 *                   properties:
 *                     totalCalls:
 *                       type: number
 *                     averageLatency:
 *                       type: number
 *                     tokensUsed:
 *                       type: number
 *                     costEstimate:
 *                       type: number
 *                 system:
 *                   type: object
 *                   properties:
 *                     memory:
 *                       type: object
 *                     cpu:
 *                       type: object
 *                     connections:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/frontend',
  rateLimiterMiddleware.metricsLimiter(),
  AuthMiddleware.verifyToken,
  async (req, res) => {
    const span = tracer.startSpan('metrics.frontend');
    
    try {
      const serviceMetrics = frontendService.getMetrics();
      const systemMetrics = getSystemMetrics();
      
      const metrics = {
        service: {
          name: 'frontend-agent',
          version: process.env.npm_package_version || '1.0.0',
          uptime: process.uptime(),
          status: frontendService.getStatus(),
          environment: process.env.NODE_ENV || 'development'
        },
        tasks: {
          total: serviceMetrics.tasksProcessed || 0,
          completed: serviceMetrics.tasksCompleted || 0,
          failed: serviceMetrics.tasksFailed || 0,
          active: serviceMetrics.activeTasks || 0,
          byType: serviceMetrics.tasksByType || {},
          byFramework: serviceMetrics.tasksByFramework || {},
          byLanguage: serviceMetrics.tasksByLanguage || {}
        },
        performance: {
          averageTaskDuration: serviceMetrics.averageTaskDuration || 0,
          successRate: calculateSuccessRate(serviceMetrics),
          throughput: calculateThroughput(serviceMetrics),
          queueLength: serviceMetrics.queueLength || 0
        },
        ai: {
          totalCalls: serviceMetrics.aiCalls || 0,
          averageLatency: serviceMetrics.averageAiLatency || 0,
          tokensUsed: serviceMetrics.tokensUsed || 0,
          costEstimate: calculateCostEstimate(serviceMetrics.tokensUsed || 0),
          modelUsage: serviceMetrics.modelUsage || {}
        },
        codeGeneration: {
          components: serviceMetrics.componentsGenerated || 0,
          optimizations: serviceMetrics.optimizationsPerformed || 0,
          testsGenerated: serviceMetrics.testsGenerated || 0,
          reviewsCompleted: serviceMetrics.reviewsCompleted || 0
        },
        system: systemMetrics,
        timestamp: new Date().toISOString()
      };
      
      res.json(metrics);
      
      logger.info('Frontend metrics served', {
        tasksTotal: metrics.tasks.total,
        successRate: metrics.performance.successRate,
        userId: req.user?.id
      });
    } catch (error) {
      logger.error('Failed to serve frontend metrics', {
        error: error.message,
        userId: req.user?.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve metrics'
      });
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /metrics/performance:
 *   get:
 *     summary: Performance metrics and analytics
 *     tags: [Metrics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [1h, 6h, 24h, 7d, 30d]
 *           default: 24h
 *         description: Time range for metrics
 *       - in: query
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [minute, hour, day]
 *           default: hour
 *         description: Data granularity
 *     responses:
 *       200:
 *         description: Performance metrics and trends
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timeRange:
 *                   type: string
 *                 granularity:
 *                   type: string
 *                 performance:
 *                   type: object
 *                   properties:
 *                     throughput:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           timestamp:
 *                             type: string
 *                           value:
 *                             type: number
 *                     latency:
 *                       type: array
 *                       items:
 *                         type: object
 *                     errorRate:
 *                       type: array
 *                       items:
 *                         type: object
 *                 trends:
 *                   type: object
 *                   properties:
 *                     throughputTrend:
 *                       type: string
 *                       enum: [increasing, decreasing, stable]
 *                     latencyTrend:
 *                       type: string
 *                     errorTrend:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/performance',
  rateLimiterMiddleware.metricsLimiter(),
  AuthMiddleware.verifyToken,
  async (req, res) => {
    const span = tracer.startSpan('metrics.performance');
    
    try {
      const { timeRange = '24h', granularity = 'hour' } = req.query;
      
      // Get performance data from service
      const performanceData = await frontendService.getPerformanceMetrics(timeRange, granularity);
      
      const metrics = {
        timeRange,
        granularity,
        performance: {
          throughput: performanceData.throughput || [],
          latency: performanceData.latency || [],
          errorRate: performanceData.errorRate || [],
          successRate: performanceData.successRate || []
        },
        trends: {
          throughputTrend: calculateTrend(performanceData.throughput || []),
          latencyTrend: calculateTrend(performanceData.latency || []),
          errorTrend: calculateTrend(performanceData.errorRate || [])
        },
        summary: {
          avgThroughput: calculateAverage(performanceData.throughput || []),
          avgLatency: calculateAverage(performanceData.latency || []),
          avgErrorRate: calculateAverage(performanceData.errorRate || []),
          totalRequests: performanceData.totalRequests || 0
        },
        timestamp: new Date().toISOString()
      };
      
      res.json(metrics);
      
      logger.info('Performance metrics served', {
        timeRange,
        granularity,
        dataPoints: performanceData.throughput?.length || 0,
        userId: req.user?.id
      });
    } catch (error) {
      logger.error('Failed to serve performance metrics', {
        error: error.message,
        userId: req.user?.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve performance metrics'
      });
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /metrics/ai:
 *   get:
 *     summary: AI model usage and cost metrics
 *     tags: [Metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI usage metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 usage:
 *                   type: object
 *                   properties:
 *                     totalCalls:
 *                       type: number
 *                     totalTokens:
 *                       type: number
 *                     averageLatency:
 *                       type: number
 *                     successRate:
 *                       type: number
 *                 models:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       calls:
 *                         type: number
 *                       tokens:
 *                         type: number
 *                       cost:
 *                         type: number
 *                 operations:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                 costs:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     byModel:
 *                       type: object
 *                     byOperation:
 *                       type: object
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.get('/ai',
  rateLimiterMiddleware.metricsLimiter(),
  AuthMiddleware.verifyToken,
  async (req, res) => {
    const span = tracer.startSpan('metrics.ai');
    
    try {
      const aiMetrics = frontendService.getAIMetrics();
      
      const metrics = {
        usage: {
          totalCalls: aiMetrics.totalCalls || 0,
          totalTokens: aiMetrics.totalTokens || 0,
          averageLatency: aiMetrics.averageLatency || 0,
          successRate: aiMetrics.successRate || 0
        },
        models: aiMetrics.modelUsage || {},
        operations: aiMetrics.operationUsage || {},
        costs: {
          total: calculateTotalCost(aiMetrics),
          byModel: calculateCostByModel(aiMetrics.modelUsage || {}),
          byOperation: calculateCostByOperation(aiMetrics.operationUsage || {})
        },
        trends: {
          dailyUsage: aiMetrics.dailyUsage || [],
          hourlyUsage: aiMetrics.hourlyUsage || []
        },
        timestamp: new Date().toISOString()
      };
      
      res.json(metrics);
      
      logger.info('AI metrics served', {
        totalCalls: metrics.usage.totalCalls,
        totalCost: metrics.costs.total,
        userId: req.user?.id
      });
    } catch (error) {
      logger.error('Failed to serve AI metrics', {
        error: error.message,
        userId: req.user?.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve AI metrics'
      });
    } finally {
      span.end();
    }
  }
);

// Helper functions
function updateCurrentMetrics() {
  try {
    const serviceMetrics = frontendService.getMetrics();
    const memUsage = process.memoryUsage();
    
    // Update active connections
    activeConnections.set(serviceMetrics.activeConnections || 0);
    
    // Update task metrics
    if (serviceMetrics.recentTasks) {
      serviceMetrics.recentTasks.forEach(task => {
        taskCounter.inc({
          type: task.type,
          status: task.status,
          framework: task.framework || 'unknown',
          language: task.language || 'unknown'
        });
        
        if (task.duration) {
          taskDuration.observe({
            type: task.type,
            framework: task.framework || 'unknown',
            language: task.language || 'unknown'
          }, task.duration / 1000);
        }
      });
    }
    
    // Update AI metrics
    if (serviceMetrics.recentAICalls) {
      serviceMetrics.recentAICalls.forEach(call => {
        aiModelCalls.inc({
          model: call.model,
          operation: call.operation,
          status: call.status
        });
        
        if (call.latency) {
          aiModelLatency.observe({
            model: call.model,
            operation: call.operation
          }, call.latency / 1000);
        }
        
        if (call.tokens) {
          aiTokenUsage.inc({
            model: call.model,
            type: 'prompt'
          }, call.tokens.prompt || 0);
          
          aiTokenUsage.inc({
            model: call.model,
            type: 'completion'
          }, call.tokens.completion || 0);
        }
      });
    }
  } catch (error) {
    logger.error('Failed to update current metrics', { error: error.message });
  }
}

function getSystemMetrics() {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  return {
    memory: {
      used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024) // MB
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system
    },
    uptime: process.uptime(),
    loadAverage: os.loadavg(),
    platform: os.platform(),
    arch: os.arch()
  };
}

function calculateSuccessRate(metrics) {
  const total = (metrics.tasksCompleted || 0) + (metrics.tasksFailed || 0);
  return total > 0 ? Math.round(((metrics.tasksCompleted || 0) / total) * 100) : 0;
}

function calculateThroughput(metrics) {
  const uptime = process.uptime();
  return uptime > 0 ? Math.round((metrics.tasksProcessed || 0) / uptime * 3600) : 0; // tasks per hour
}

function calculateCostEstimate(tokens) {
  // Rough estimate based on OpenAI pricing (as of 2024)
  const costPerToken = 0.00002; // $0.02 per 1K tokens for GPT-4
  return Math.round(tokens * costPerToken * 100) / 100; // Round to 2 decimal places
}

function calculateTrend(dataPoints) {
  if (dataPoints.length < 2) return 'stable';
  
  const recent = dataPoints.slice(-5); // Last 5 data points
  const first = recent[0]?.value || 0;
  const last = recent[recent.length - 1]?.value || 0;
  
  const change = ((last - first) / first) * 100;
  
  if (change > 10) return 'increasing';
  if (change < -10) return 'decreasing';
  return 'stable';
}

function calculateAverage(dataPoints) {
  if (dataPoints.length === 0) return 0;
  const sum = dataPoints.reduce((acc, point) => acc + (point.value || 0), 0);
  return Math.round((sum / dataPoints.length) * 100) / 100;
}

function calculateTotalCost(aiMetrics) {
  // Calculate total cost based on token usage and model pricing
  let totalCost = 0;
  
  if (aiMetrics.modelUsage) {
    Object.entries(aiMetrics.modelUsage).forEach(([model, usage]) => {
      const tokens = usage.tokens || 0;
      const costPerToken = getModelCostPerToken(model);
      totalCost += tokens * costPerToken;
    });
  }
  
  return Math.round(totalCost * 100) / 100;
}

function calculateCostByModel(modelUsage) {
  const costs = {};
  
  Object.entries(modelUsage).forEach(([model, usage]) => {
    const tokens = usage.tokens || 0;
    const costPerToken = getModelCostPerToken(model);
    costs[model] = Math.round(tokens * costPerToken * 100) / 100;
  });
  
  return costs;
}

function calculateCostByOperation(operationUsage) {
  const costs = {};
  
  Object.entries(operationUsage).forEach(([operation, usage]) => {
    const tokens = usage.tokens || 0;
    const costPerToken = 0.00002; // Average cost
    costs[operation] = Math.round(tokens * costPerToken * 100) / 100;
  });
  
  return costs;
}

function getModelCostPerToken(model) {
  // OpenAI pricing as of 2024 (approximate)
  const pricing = {
    'gpt-4': 0.00003,
    'gpt-4-turbo': 0.00001,
    'gpt-3.5-turbo': 0.000002,
    'text-davinci-003': 0.00002
  };
  
  return pricing[model] || 0.00002; // Default cost
}

// Error handling middleware for metrics routes
router.use((error, req, res, next) => {
  logger.error('Metrics route error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error in metrics service'
  });
});

// Export metrics for use in other modules
module.exports = {
  router,
  taskCounter,
  taskDuration,
  aiModelCalls,
  aiModelLatency,
  aiTokenUsage,
  activeConnections,
  codeGenerationMetrics,
  componentGenerationMetrics,
  optimizationMetrics,
  testGenerationMetrics
};