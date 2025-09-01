/**
 * Agent Routes for Backend AI Agent
 * Handles backend development tasks and AI-powered code generation
 */

'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const createError = require('http-errors');
const config = require('../config/config');
const { BackendService } = require('../services/backendService');
const { authenticateToken, requireRoles, optionalAuth } = require('../middleware/auth');
const { aiLimiter, codeGenerationLimiter, dynamicRateLimiter } = require('../middleware/rateLimiter');
const { handleValidationErrors, validateSchema, schemas } = require('../utils/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');

const router = express.Router();
const backendService = new BackendService();

/**
 * @swagger
 * components:
 *   schemas:
 *     BackendTask:
 *       type: object
 *       required:
 *         - type
 *         - description
 *         - requirements
 *       properties:
 *         type:
 *           type: string
 *           enum: [api_generation, database_schema, authentication, middleware, testing, optimization, documentation, deployment]
 *         description:
 *           type: string
 *           minLength: 10
 *           maxLength: 2000
 *         requirements:
 *           type: object
 *           properties:
 *             framework:
 *               type: string
 *               enum: [express, fastify, koa, nestjs, hapi, restify]
 *             database:
 *               type: string
 *               enum: [mongodb, postgresql, mysql, redis, sqlite, dynamodb]
 *             authType:
 *               type: string
 *               enum: [jwt, oauth2, basic, apikey, session, passport]
 *         priority:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *           default: medium
 *     
 *     TaskResponse:
 *       type: object
 *       properties:
 *         taskId:
 *           type: string
 *           format: uuid
 *         status:
 *           type: string
 *           enum: [pending, processing, completed, failed]
 *         result:
 *           type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/agent/capabilities:
 *   get:
 *     summary: Get agent capabilities
 *     description: Returns the capabilities and supported features of the backend agent
 *     tags: [Agent]
 *     responses:
 *       200:
 *         description: Agent capabilities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 frameworks:
 *                   type: array
 *                   items:
 *                     type: string
 *                 databases:
 *                   type: array
 *                   items:
 *                     type: string
 *                 features:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.get('/capabilities', asyncHandler(async (req, res) => {
  const span = telemetryService.startSpan('agent.get_capabilities');
  
  try {
    const capabilities = {
      service: 'Backend AI Agent',
      version: '1.0.0',
      frameworks: ['express', 'fastify', 'koa', 'nestjs', 'hapi', 'restify'],
      databases: ['mongodb', 'postgresql', 'mysql', 'redis', 'sqlite', 'dynamodb'],
      authTypes: ['jwt', 'oauth2', 'basic', 'apikey', 'session', 'passport'],
      testFrameworks: ['jest', 'mocha', 'vitest', 'ava', 'tap'],
      deploymentTargets: ['docker', 'kubernetes', 'aws', 'gcp', 'azure', 'heroku'],
      features: [
        'API Generation',
        'Database Schema Design',
        'Authentication Implementation',
        'Middleware Development',
        'Test Generation',
        'Code Optimization',
        'Documentation Generation',
        'Deployment Configuration'
      ],
      limits: {
        maxCodeLength: 100000,
        maxEndpoints: 50,
        maxModels: 20,
        maxFileSize: 10485760, // 10MB
      },
      status: 'operational',
      uptime: process.uptime(),
    };
    
    span.setAttributes({
      'agent.frameworks_count': capabilities.frameworks.length,
      'agent.databases_count': capabilities.databases.length,
      'agent.features_count': capabilities.features.length,
    });
    
    logger.info('Agent capabilities requested', {
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });
    
    res.json({
      success: true,
      data: capabilities,
    });
    
  } catch (error) {
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}));

/**
 * @swagger
 * /api/agent/generate/api:
 *   post:
 *     summary: Generate API endpoints
 *     description: Generate REST API endpoints with Express.js or other frameworks
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BackendTask'
 *     responses:
 *       200:
 *         description: API generation task created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TaskResponse'
 */
router.post('/generate/api',
  authenticateToken,
  codeGenerationLimiter,
  validateSchema(schemas.apiGeneration),
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('agent.generate_api');
    
    try {
      const { endpoints, framework, database, includeValidation, includeErrorHandling, includeLogging, includeTests, includeDocumentation } = req.body;
      
      span.setAttributes({
        'task.type': 'api_generation',
        'task.framework': framework,
        'task.database': database || 'none',
        'task.endpoints_count': endpoints.length,
        'task.include_validation': includeValidation,
        'task.include_tests': includeTests,
        'user.id': req.user.id,
      });
      
      logger.info('API generation requested', {
        userId: req.user.id,
        framework,
        database,
        endpointsCount: endpoints.length,
        features: {
          validation: includeValidation,
          errorHandling: includeErrorHandling,
          logging: includeLogging,
          tests: includeTests,
          documentation: includeDocumentation,
        },
      });
      
      const task = await backendService.generateAPI({
        endpoints,
        framework,
        database,
        includeValidation,
        includeErrorHandling,
        includeLogging,
        includeTests,
        includeDocumentation,
        userId: req.user.id,
        sessionId: req.user.sessionId,
      });
      
      res.status(201).json({
        success: true,
        data: {
          taskId: task.id,
          status: task.status,
          type: 'api_generation',
          estimatedDuration: task.estimatedDuration,
          createdAt: task.createdAt,
        },
        message: 'API generation task created successfully',
      });
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  })
);

/**
 * @swagger
 * /api/agent/generate/database:
 *   post:
 *     summary: Generate database schema
 *     description: Generate database models and schemas for various databases
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BackendTask'
 *     responses:
 *       200:
 *         description: Database schema generation task created
 */
router.post('/generate/database',
  authenticateToken,
  codeGenerationLimiter,
  validateSchema(schemas.databaseSchema),
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('agent.generate_database');
    
    try {
      const { database, models, includeSeeds, includeMigrations, includeValidation } = req.body;
      
      span.setAttributes({
        'task.type': 'database_schema',
        'task.database': database,
        'task.models_count': models.length,
        'task.include_seeds': includeSeeds,
        'task.include_migrations': includeMigrations,
        'user.id': req.user.id,
      });
      
      logger.info('Database schema generation requested', {
        userId: req.user.id,
        database,
        modelsCount: models.length,
        features: {
          seeds: includeSeeds,
          migrations: includeMigrations,
          validation: includeValidation,
        },
      });
      
      const task = await backendService.generateDatabaseSchema({
        database,
        models,
        includeSeeds,
        includeMigrations,
        includeValidation,
        userId: req.user.id,
        sessionId: req.user.sessionId,
      });
      
      res.status(201).json({
        success: true,
        data: {
          taskId: task.id,
          status: task.status,
          type: 'database_schema',
          estimatedDuration: task.estimatedDuration,
          createdAt: task.createdAt,
        },
        message: 'Database schema generation task created successfully',
      });
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  })
);

/**
 * @swagger
 * /api/agent/generate/auth:
 *   post:
 *     summary: Generate authentication system
 *     description: Generate authentication and authorization code
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BackendTask'
 *     responses:
 *       200:
 *         description: Authentication generation task created
 */
router.post('/generate/auth',
  authenticateToken,
  codeGenerationLimiter,
  validateSchema(schemas.authentication),
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('agent.generate_auth');
    
    try {
      const { type, config: authConfig, features, userModel } = req.body;
      
      span.setAttributes({
        'task.type': 'authentication',
        'task.auth_type': type,
        'task.features': Object.keys(features).filter(key => features[key]).join(','),
        'user.id': req.user.id,
      });
      
      logger.info('Authentication generation requested', {
        userId: req.user.id,
        authType: type,
        features,
        userModel,
      });
      
      const task = await backendService.generateAuthentication({
        type,
        config: authConfig,
        features,
        userModel,
        userId: req.user.id,
        sessionId: req.user.sessionId,
      });
      
      res.status(201).json({
        success: true,
        data: {
          taskId: task.id,
          status: task.status,
          type: 'authentication',
          estimatedDuration: task.estimatedDuration,
          createdAt: task.createdAt,
        },
        message: 'Authentication generation task created successfully',
      });
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  })
);

/**
 * @swagger
 * /api/agent/optimize:
 *   post:
 *     summary: Optimize backend code
 *     description: Analyze and optimize backend code for performance, security, and maintainability
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BackendTask'
 *     responses:
 *       200:
 *         description: Code optimization task created
 */
router.post('/optimize',
  authenticateToken,
  aiLimiter,
  validateSchema(schemas.optimization),
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('agent.optimize_code');
    
    try {
      const { code, language, optimizationTypes, constraints, context } = req.body;
      
      span.setAttributes({
        'task.type': 'optimization',
        'task.language': language,
        'task.code_length': code.length,
        'task.optimization_types': optimizationTypes.join(','),
        'user.id': req.user.id,
      });
      
      logger.info('Code optimization requested', {
        userId: req.user.id,
        language,
        codeLength: code.length,
        optimizationTypes,
        constraints,
      });
      
      const task = await backendService.optimizeCode({
        code,
        language,
        optimizationTypes,
        constraints,
        context,
        userId: req.user.id,
        sessionId: req.user.sessionId,
      });
      
      res.status(201).json({
        success: true,
        data: {
          taskId: task.id,
          status: task.status,
          type: 'optimization',
          estimatedDuration: task.estimatedDuration,
          createdAt: task.createdAt,
        },
        message: 'Code optimization task created successfully',
      });
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  })
);

/**
 * @swagger
 * /api/agent/generate/tests:
 *   post:
 *     summary: Generate test cases
 *     description: Generate unit and integration tests for backend code
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Test generation task created
 */
router.post('/generate/tests',
  authenticateToken,
  aiLimiter,
  [
    body('code').isLength({ min: 10, max: 50000 }).withMessage('Code must be between 10 and 50,000 characters'),
    body('framework').isIn(['jest', 'mocha', 'vitest', 'ava', 'tap']).withMessage('Invalid test framework'),
    body('testTypes').isArray().withMessage('Test types must be an array'),
    body('testTypes.*').isIn(['unit', 'integration', 'e2e']).withMessage('Invalid test type'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('agent.generate_tests');
    
    try {
      const { code, framework, testTypes, coverage } = req.body;
      
      span.setAttributes({
        'task.type': 'testing',
        'task.framework': framework,
        'task.test_types': testTypes.join(','),
        'task.code_length': code.length,
        'user.id': req.user.id,
      });
      
      const task = await backendService.generateTests({
        code,
        framework,
        testTypes,
        coverage,
        userId: req.user.id,
        sessionId: req.user.sessionId,
      });
      
      res.status(201).json({
        success: true,
        data: {
          taskId: task.id,
          status: task.status,
          type: 'testing',
          estimatedDuration: task.estimatedDuration,
          createdAt: task.createdAt,
        },
        message: 'Test generation task created successfully',
      });
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  })
);

/**
 * @swagger
 * /api/agent/generate/docs:
 *   post:
 *     summary: Generate documentation
 *     description: Generate API documentation and code comments
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Documentation generation task created
 */
router.post('/generate/docs',
  authenticateToken,
  aiLimiter,
  [
    body('code').isLength({ min: 10, max: 100000 }).withMessage('Code must be between 10 and 100,000 characters'),
    body('format').isIn(['swagger', 'openapi', 'jsdoc', 'markdown']).withMessage('Invalid documentation format'),
    body('includeExamples').optional().isBoolean().withMessage('Include examples must be boolean'),
  ],
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const span = telemetryService.startSpan('agent.generate_docs');
    
    try {
      const { code, format, includeExamples, includeSchemas } = req.body;
      
      span.setAttributes({
        'task.type': 'documentation',
        'task.format': format,
        'task.code_length': code.length,
        'task.include_examples': includeExamples,
        'user.id': req.user.id,
      });
      
      const task = await backendService.generateDocumentation({
        code,
        format,
        includeExamples,
        includeSchemas,
        userId: req.user.id,
        sessionId: req.user.sessionId,
      });
      
      res.status(201).json({
        success: true,
        data: {
          taskId: task.id,
          status: task.status,
          type: 'documentation',
          estimatedDuration: task.estimatedDuration,
          createdAt: task.createdAt,
        },
        message: 'Documentation generation task created successfully',
      });
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  })
);

/**
 * @swagger
 * /api/agent/status:
 *   get:
 *     summary: Get agent status
 *     description: Get current status and metrics of the backend agent
 *     tags: [Agent]
 *     responses:
 *       200:
 *         description: Agent status information
 */
router.get('/status', asyncHandler(async (req, res) => {
  const span = telemetryService.startSpan('agent.get_status');
  
  try {
    const status = await backendService.getStatus();
    
    span.setAttributes({
      'agent.active_tasks': status.activeTasks,
      'agent.queue_size': status.queueSize,
      'agent.total_processed': status.totalProcessed,
    });
    
    res.json({
      success: true,
      data: status,
    });
    
  } catch (error) {
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}));

module.exports = router;