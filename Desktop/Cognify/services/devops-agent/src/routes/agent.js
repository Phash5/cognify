/**
 * DevOps AI Agent Routes
 * Handles DevOps operations including deployment, infrastructure, monitoring, and configuration
 */

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const { DevOpsService } = require('../services/devopsService');
const { CacheService } = require('../services/cacheService');
const logger = require('../utils/logger');
const { TelemetryService } = require('../utils/telemetry');
const {
  authenticate,
  aiRateLimit,
  devopsRateLimit,
  validateContentType,
  handleValidationErrors,
} = require('../middleware');
const {
  validators,
  validateSchema,
} = require('../utils/validation');

const router = express.Router();

// Initialize services
const devopsService = new DevOpsService();
const cacheService = new CacheService();
const telemetry = new TelemetryService();

/**
 * @swagger
 * /api/agent/capabilities:
 *   get:
 *     summary: Get DevOps AI Agent capabilities
 *     description: Returns information about supported DevOps operations and platforms
 *     tags: [DevOps Agent]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Agent capabilities retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 capabilities:
 *                   type: object
 *                   properties:
 *                     deployment:
 *                       type: object
 *                       properties:
 *                         supportedPlatforms:
 *                           type: array
 *                           items:
 *                             type: string
 *                         features:
 *                           type: array
 *                           items:
 *                             type: string
 *                     infrastructure:
 *                       type: object
 *                       properties:
 *                         supportedProviders:
 *                           type: array
 *                           items:
 *                             type: string
 *                         supportedTools:
 *                           type: array
 *                           items:
 *                             type: string
 *                     monitoring:
 *                       type: object
 *                       properties:
 *                         supportedPlatforms:
 *                           type: array
 *                           items:
 *                             type: string
 *                         supportedAlerting:
 *                           type: array
 *                           items:
 *                             type: string
 *                     configuration:
 *                       type: object
 *                       properties:
 *                         supportedTools:
 *                           type: array
 *                           items:
 *                             type: string
 *                 version:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/capabilities', authenticate, async (req, res, next) => {
  const span = telemetry.startSpan('get_agent_capabilities');
  
  try {
    logger.logRequest('Getting agent capabilities', {
      requestId: req.requestId,
      userId: req.auth?.user?.sub,
    });
    
    const capabilities = {
      deployment: {
        supportedPlatforms: config.devops.deployment.supportedPlatforms,
        features: [
          'Kubernetes manifests generation',
          'Docker Compose files',
          'Helm charts creation',
          'Rolling deployment strategies',
          'Blue-green deployments',
          'Canary deployments',
          'Rollback procedures',
          'Health checks configuration',
          'Resource management',
          'Environment-specific configs',
        ],
      },
      infrastructure: {
        supportedProviders: config.devops.infrastructure.supportedProviders,
        supportedTools: config.devops.infrastructure.supportedTools,
        features: [
          'Infrastructure as Code generation',
          'Terraform modules',
          'CloudFormation templates',
          'Ansible playbooks',
          'Resource provisioning',
          'Network configuration',
          'Security groups setup',
          'Load balancer configuration',
          'Auto-scaling setup',
          'Backup strategies',
        ],
      },
      monitoring: {
        supportedPlatforms: config.devops.monitoring.supportedPlatforms,
        supportedAlerting: config.devops.monitoring.supportedAlerting,
        features: [
          'Monitoring stack setup',
          'Prometheus configuration',
          'Grafana dashboards',
          'Alert rules creation',
          'Log aggregation setup',
          'Metrics collection',
          'Performance monitoring',
          'Health checks',
          'SLA monitoring',
          'Incident response automation',
        ],
      },
      configuration: {
        supportedTools: config.devops.configuration.supportedTools,
        features: [
          'Configuration management',
          'Ansible playbooks',
          'Puppet manifests',
          'Chef cookbooks',
          'Environment configuration',
          'Secret management',
          'Configuration validation',
          'Version control integration',
          'Rollback procedures',
          'Compliance checking',
        ],
      },
    };
    
    telemetry.incrementCounter('agent_capabilities_requests_total');
    
    res.json({
      capabilities,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
    
    logger.logRequest('Agent capabilities retrieved successfully', {
      requestId: req.requestId,
    });
    
  } catch (error) {
    span.recordException(error);
    next(error);
  } finally {
    span.end();
  }
});

/**
 * @swagger
 * /api/agent/deployment/generate:
 *   post:
 *     summary: Generate deployment configuration
 *     description: Generate deployment manifests and configurations based on requirements
 *     tags: [DevOps Agent]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requirements
 *             properties:
 *               requirements:
 *                 type: string
 *                 description: Deployment requirements description
 *                 minLength: 10
 *                 maxLength: 10000
 *               options:
 *                 type: object
 *                 properties:
 *                   platform:
 *                     type: string
 *                     enum: [kubernetes, docker, docker-compose, helm]
 *                     default: kubernetes
 *                   environment:
 *                     type: string
 *                     enum: [development, staging, production]
 *                     default: production
 *                   enableRollback:
 *                     type: boolean
 *                     default: true
 *                   replicas:
 *                     type: integer
 *                     minimum: 1
 *                     maximum: 100
 *                     default: 3
 *                   resources:
 *                     type: object
 *                     properties:
 *                       cpu:
 *                         type: string
 *                         pattern: '^\\d+m?$'
 *                         default: '500m'
 *                       memory:
 *                         type: string
 *                         pattern: '^\\d+(Mi|Gi)$'
 *                         default: '512Mi'
 *     responses:
 *       200:
 *         description: Deployment configuration generated successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.post('/deployment/generate',
  authenticate,
  devopsRateLimit.deployment,
  validateContentType(),
  validators.deploymentGeneration,
  handleValidationErrors,
  async (req, res, next) => {
    const span = telemetry.startSpan('generate_deployment_config');
    const taskId = uuidv4();
    
    try {
      // Validate request data
      const validatedData = validateSchema(req.body, 'deploymentGeneration');
      
      logger.logDeployment('Deployment generation requested', {
        requestId: req.requestId,
        taskId,
        userId: req.auth?.user?.sub,
        platform: validatedData.options.platform,
        environment: validatedData.options.environment,
      });
      
      // Generate deployment configuration
      const result = await devopsService.generateDeploymentConfig(
        validatedData.requirements,
        validatedData.options,
        {
          taskId,
          userId: req.auth?.user?.sub,
          requestId: req.requestId,
        }
      );
      
      telemetry.incrementCounter('deployment_generation_requests_total', {
        platform: validatedData.options.platform,
        environment: validatedData.options.environment,
      });
      
      res.json({
        taskId,
        result,
        timestamp: new Date().toISOString(),
      });
      
      logger.logDeployment('Deployment configuration generated successfully', {
        requestId: req.requestId,
        taskId,
        platform: validatedData.options.platform,
      });
      
    } catch (error) {
      span.recordException(error);
      telemetry.incrementCounter('deployment_generation_errors_total', {
        error_type: error.name || 'UnknownError',
      });
      next(error);
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/agent/infrastructure/generate:
 *   post:
 *     summary: Generate infrastructure as code
 *     description: Generate infrastructure configurations using Terraform, CloudFormation, or other IaC tools
 *     tags: [DevOps Agent]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requirements
 *             properties:
 *               requirements:
 *                 type: string
 *                 description: Infrastructure requirements description
 *                 minLength: 10
 *                 maxLength: 10000
 *               options:
 *                 type: object
 *                 properties:
 *                   provider:
 *                     type: string
 *                     enum: [aws, azure, gcp, digitalocean]
 *                     default: aws
 *                   tool:
 *                     type: string
 *                     enum: [terraform, cloudformation, pulumi, ansible]
 *                     default: terraform
 *                   region:
 *                     type: string
 *                     minLength: 2
 *                     maxLength: 50
 *                     default: 'us-east-1'
 *                   enableValidation:
 *                     type: boolean
 *                     default: true
 *                   enableMonitoring:
 *                     type: boolean
 *                     default: true
 *     responses:
 *       200:
 *         description: Infrastructure configuration generated successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.post('/infrastructure/generate',
  authenticate,
  devopsRateLimit.infrastructure,
  validateContentType(),
  validators.infrastructureGeneration,
  handleValidationErrors,
  async (req, res, next) => {
    const span = telemetry.startSpan('generate_infrastructure_config');
    const taskId = uuidv4();
    
    try {
      // Validate request data
      const validatedData = validateSchema(req.body, 'infrastructureGeneration');
      
      logger.logInfrastructure('Infrastructure generation requested', {
        requestId: req.requestId,
        taskId,
        userId: req.auth?.user?.sub,
        provider: validatedData.options.provider,
        tool: validatedData.options.tool,
      });
      
      // Generate infrastructure configuration
      const result = await devopsService.generateInfrastructureConfig(
        validatedData.requirements,
        validatedData.options,
        {
          taskId,
          userId: req.auth?.user?.sub,
          requestId: req.requestId,
        }
      );
      
      telemetry.incrementCounter('infrastructure_generation_requests_total', {
        provider: validatedData.options.provider,
        tool: validatedData.options.tool,
      });
      
      res.json({
        taskId,
        result,
        timestamp: new Date().toISOString(),
      });
      
      logger.logInfrastructure('Infrastructure configuration generated successfully', {
        requestId: req.requestId,
        taskId,
        provider: validatedData.options.provider,
        tool: validatedData.options.tool,
      });
      
    } catch (error) {
      span.recordException(error);
      telemetry.incrementCounter('infrastructure_generation_errors_total', {
        error_type: error.name || 'UnknownError',
      });
      next(error);
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/agent/monitoring/setup:
 *   post:
 *     summary: Generate monitoring configuration
 *     description: Generate monitoring stack configurations including Prometheus, Grafana, and alerting
 *     tags: [DevOps Agent]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requirements
 *             properties:
 *               requirements:
 *                 type: string
 *                 description: Monitoring requirements description
 *                 minLength: 10
 *                 maxLength: 10000
 *               options:
 *                 type: object
 *                 properties:
 *                   platform:
 *                     type: string
 *                     enum: [prometheus, datadog, newrelic, elk]
 *                     default: prometheus
 *                   alerting:
 *                     type: string
 *                     enum: [alertmanager, pagerduty, slack, email]
 *                     default: alertmanager
 *                   enableAlerts:
 *                     type: boolean
 *                     default: true
 *                   enableDashboards:
 *                     type: boolean
 *                     default: true
 *     responses:
 *       200:
 *         description: Monitoring configuration generated successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.post('/monitoring/setup',
  authenticate,
  devopsRateLimit.monitoring,
  validateContentType(),
  validators.monitoringSetup,
  handleValidationErrors,
  async (req, res, next) => {
    const span = telemetry.startSpan('generate_monitoring_config');
    const taskId = uuidv4();
    
    try {
      // Validate request data
      const validatedData = validateSchema(req.body, 'monitoringSetup');
      
      logger.logMonitoring('Monitoring setup requested', {
        requestId: req.requestId,
        taskId,
        userId: req.auth?.user?.sub,
        platform: validatedData.options.platform,
        alerting: validatedData.options.alerting,
      });
      
      // Generate monitoring configuration
      const result = await devopsService.generateMonitoringSetup(
        validatedData.requirements,
        validatedData.options,
        {
          taskId,
          userId: req.auth?.user?.sub,
          requestId: req.requestId,
        }
      );
      
      telemetry.incrementCounter('monitoring_setup_requests_total', {
        platform: validatedData.options.platform,
        alerting: validatedData.options.alerting,
      });
      
      res.json({
        taskId,
        result,
        timestamp: new Date().toISOString(),
      });
      
      logger.logMonitoring('Monitoring configuration generated successfully', {
        requestId: req.requestId,
        taskId,
        platform: validatedData.options.platform,
      });
      
    } catch (error) {
      span.recordException(error);
      telemetry.incrementCounter('monitoring_setup_errors_total', {
        error_type: error.name || 'UnknownError',
      });
      next(error);
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/agent/configuration/generate:
 *   post:
 *     summary: Generate configuration management scripts
 *     description: Generate configuration management scripts using Ansible, Puppet, or Chef
 *     tags: [DevOps Agent]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requirements
 *             properties:
 *               requirements:
 *                 type: string
 *                 description: Configuration requirements description
 *                 minLength: 10
 *                 maxLength: 10000
 *               options:
 *                 type: object
 *                 properties:
 *                   tool:
 *                     type: string
 *                     enum: [ansible, puppet, chef, saltstack]
 *                     default: ansible
 *                   environment:
 *                     type: string
 *                     enum: [development, staging, production]
 *                     default: production
 *                   enableVersioning:
 *                     type: boolean
 *                     default: true
 *                   enableValidation:
 *                     type: boolean
 *                     default: true
 *     responses:
 *       200:
 *         description: Configuration scripts generated successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Authentication required
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.post('/configuration/generate',
  authenticate,
  devopsRateLimit.configuration,
  validateContentType(),
  validators.configurationGeneration,
  handleValidationErrors,
  async (req, res, next) => {
    const span = telemetry.startSpan('generate_configuration_scripts');
    const taskId = uuidv4();
    
    try {
      // Validate request data
      const validatedData = validateSchema(req.body, 'configurationGeneration');
      
      logger.logConfiguration('Configuration generation requested', {
        requestId: req.requestId,
        taskId,
        userId: req.auth?.user?.sub,
        tool: validatedData.options.tool,
        environment: validatedData.options.environment,
      });
      
      // Generate configuration scripts
      const result = await devopsService.generateConfigurationManagement(
        validatedData.requirements,
        validatedData.options,
        {
          taskId,
          userId: req.auth?.user?.sub,
          requestId: req.requestId,
        }
      );
      
      telemetry.incrementCounter('configuration_generation_requests_total', {
        tool: validatedData.options.tool,
        environment: validatedData.options.environment,
      });
      
      res.json({
        taskId,
        result,
        timestamp: new Date().toISOString(),
      });
      
      logger.logConfiguration('Configuration scripts generated successfully', {
        requestId: req.requestId,
        taskId,
        tool: validatedData.options.tool,
      });
      
    } catch (error) {
      span.recordException(error);
      telemetry.incrementCounter('configuration_generation_errors_total', {
        error_type: error.name || 'UnknownError',
      });
      next(error);
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/agent/status:
 *   get:
 *     summary: Get DevOps AI Agent status
 *     description: Returns the current status and health of the DevOps AI Agent
 *     tags: [DevOps Agent]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Agent status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, degraded, unhealthy]
 *                 uptime:
 *                   type: number
 *                 version:
 *                   type: string
 *                 activeTasks:
 *                   type: number
 *                 queuedTasks:
 *                   type: number
 *                 metrics:
 *                   type: object
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/status', authenticate, async (req, res, next) => {
  const span = telemetry.startSpan('get_agent_status');
  
  try {
    logger.logRequest('Getting agent status', {
      requestId: req.requestId,
      userId: req.auth?.user?.sub,
    });
    
    const status = await devopsService.getStatus();
    const metrics = await devopsService.getMetrics();
    
    telemetry.incrementCounter('agent_status_requests_total');
    
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      version: '1.0.0',
      activeTasks: status.activeTasks,
      queuedTasks: status.queuedTasks,
      metrics,
      timestamp: new Date().toISOString(),
    });
    
    logger.logRequest('Agent status retrieved successfully', {
      requestId: req.requestId,
    });
    
  } catch (error) {
    span.recordException(error);
    next(error);
  } finally {
    span.end();
  }
});

module.exports = router;