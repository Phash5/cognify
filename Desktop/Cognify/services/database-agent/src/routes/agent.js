/**
 * Database AI Agent Routes
 * API endpoints for database development tasks
 */

'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const config = require('../config/config');
const { DatabaseService } = require('../services/databaseService');
const { authenticate, requireRoles } = require('../middleware/auth');
const {
  aiLimiter,
  schemaGenerationLimiter,
  queryOptimizationLimiter,
  migrationLimiter,
  performanceAnalysisLimiter,
} = require('../middleware/rateLimiter');
const { validateRequest } = require('../utils/validation');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');

const router = express.Router();
const databaseService = new DatabaseService();

/**
 * @swagger
 * /api/agent/capabilities:
 *   get:
 *     summary: Get Database AI Agent capabilities
 *     description: Returns the capabilities and supported features of the Database AI Agent
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Agent capabilities retrieved successfully
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
 *                     version:
 *                       type: string
 *                     capabilities:
 *                       type: array
 *                       items:
 *                         type: string
 *                     supportedDatabases:
 *                       type: array
 *                       items:
 *                         type: string
 *                     supportedORMs:
 *                       type: array
 *                       items:
 *                         type: string
 */
router.get('/capabilities', authenticate, (req, res) => {
  const span = telemetryService.startSpan('agent.get_capabilities');
  
  try {
    span.setAttributes({
      'agent.type': 'database',
      'request.user_id': req.user?.id,
    });
    
    const capabilities = {
      version: '1.0.0',
      agent: 'Database AI Agent',
      capabilities: [
        'schema_generation',
        'query_optimization',
        'migration_generation',
        'performance_analysis',
        'database_design',
        'index_recommendations',
        'data_modeling',
        'relationship_mapping',
      ],
      supportedDatabases: config.database.supportedTypes,
      supportedORMs: [
        'mongoose',
        'sequelize',
        'typeorm',
        'prisma',
        'knex',
      ],
      features: {
        schemaGeneration: {
          description: 'Generate database schemas from requirements',
          inputFormats: ['text', 'json'],
          outputFormats: ['mongoose', 'sequelize', 'sql', 'prisma'],
        },
        queryOptimization: {
          description: 'Optimize database queries for better performance',
          supportedQueries: ['mongodb', 'sql'],
          optimizations: ['indexing', 'aggregation', 'joins', 'caching'],
        },
        migrationGeneration: {
          description: 'Generate database migration scripts',
          supportedFormats: ['mongoose', 'sequelize', 'knex', 'raw-sql'],
        },
        performanceAnalysis: {
          description: 'Analyze database performance and provide recommendations',
          metrics: ['query_time', 'index_usage', 'memory_usage', 'throughput'],
        },
      },
      limits: {
        maxSchemaComplexity: 50,
        maxQueryLength: 10000,
        maxMigrationSteps: 20,
        maxAnalysisDepth: 100,
      },
    };
    
    logger.api('Agent capabilities requested', {
      userId: req.user?.id,
      requestId: req.id,
    });
    
    telemetryService.incrementCounter('agent_capabilities_requests_total', {
      user_role: req.user?.role || 'anonymous',
    });
    
    span.setAttributes({ 'response.success': true });
    span.end();
    
    res.json({
      success: true,
      data: capabilities,
    });
    
  } catch (error) {
    span.recordException(error);
    span.end();
    
    logger.error('Error getting agent capabilities', {
      error: error.message,
      userId: req.user?.id,
      requestId: req.id,
    });
    
    res.status(500).json({
      success: false,
      error: {
        type: 'InternalServerError',
        message: 'Failed to get agent capabilities',
      },
    });
  }
});

/**
 * @swagger
 * /api/agent/schema/generate:
 *   post:
 *     summary: Generate database schema
 *     description: Generate database schema from requirements using AI
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requirements
 *               - databaseType
 *               - outputFormat
 *             properties:
 *               requirements:
 *                 type: string
 *                 description: Natural language description of schema requirements
 *               databaseType:
 *                 type: string
 *                 enum: [mongodb, postgresql, mysql, sqlite]
 *               outputFormat:
 *                 type: string
 *                 enum: [mongoose, sequelize, sql, prisma, typeorm]
 *               options:
 *                 type: object
 *                 properties:
 *                   includeIndexes:
 *                     type: boolean
 *                   includeValidation:
 *                     type: boolean
 *                   includeRelationships:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Schema generated successfully
 *       400:
 *         description: Invalid request parameters
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/schema/generate',
  authenticate,
  schemaGenerationLimiter,
  [
    body('requirements')
      .isString()
      .isLength({ min: 10, max: 5000 })
      .withMessage('Requirements must be between 10 and 5000 characters'),
    body('databaseType')
      .isIn(config.database.supportedTypes)
      .withMessage('Invalid database type'),
    body('outputFormat')
      .isIn(['mongoose', 'sequelize', 'sql', 'prisma', 'typeorm'])
      .withMessage('Invalid output format'),
    body('options.includeIndexes')
      .optional()
      .isBoolean()
      .withMessage('includeIndexes must be boolean'),
    body('options.includeValidation')
      .optional()
      .isBoolean()
      .withMessage('includeValidation must be boolean'),
    body('options.includeRelationships')
      .optional()
      .isBoolean()
      .withMessage('includeRelationships must be boolean'),
  ],
  validateRequest,
  async (req, res, next) => {
    const span = telemetryService.startSpan('agent.generate_schema');
    
    try {
      const { requirements, databaseType, outputFormat, options = {} } = req.body;
      
      span.setAttributes({
        'agent.operation': 'schema_generation',
        'request.database_type': databaseType,
        'request.output_format': outputFormat,
        'request.user_id': req.user?.id,
        'request.requirements_length': requirements.length,
      });
      
      logger.api('Schema generation requested', {
        userId: req.user?.id,
        databaseType,
        outputFormat,
        requirementsLength: requirements.length,
        requestId: req.id,
      });
      
      const result = await databaseService.generateSchema({
        requirements,
        databaseType,
        outputFormat,
        options,
        userId: req.user?.id,
        requestId: req.id,
      });
      
      span.setAttributes({
        'response.success': true,
        'response.task_id': result.taskId,
      });
      
      telemetryService.incrementCounter('schema_generation_requests_total', {
        database_type: databaseType,
        output_format: outputFormat,
        user_role: req.user?.role || 'anonymous',
      });
      
      span.end();
      
      res.json({
        success: true,
        data: result,
      });
      
    } catch (error) {
      span.recordException(error);
      span.end();
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/agent/query/optimize:
 *   post:
 *     summary: Optimize database query
 *     description: Analyze and optimize database queries for better performance
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *               - databaseType
 *             properties:
 *               query:
 *                 type: string
 *                 description: The database query to optimize
 *               databaseType:
 *                 type: string
 *                 enum: [mongodb, postgresql, mysql, sqlite]
 *               schema:
 *                 type: object
 *                 description: Database schema context
 *               options:
 *                 type: object
 *                 properties:
 *                   includeExplanation:
 *                     type: boolean
 *                   includeIndexSuggestions:
 *                     type: boolean
 *                   performanceTarget:
 *                     type: string
 *                     enum: [speed, memory, balanced]
 *     responses:
 *       200:
 *         description: Query optimized successfully
 *       400:
 *         description: Invalid request parameters
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/query/optimize',
  authenticate,
  queryOptimizationLimiter,
  [
    body('query')
      .isString()
      .isLength({ min: 5, max: 10000 })
      .withMessage('Query must be between 5 and 10000 characters'),
    body('databaseType')
      .isIn(config.database.supportedTypes)
      .withMessage('Invalid database type'),
    body('schema')
      .optional()
      .isObject()
      .withMessage('Schema must be an object'),
    body('options.includeExplanation')
      .optional()
      .isBoolean()
      .withMessage('includeExplanation must be boolean'),
    body('options.includeIndexSuggestions')
      .optional()
      .isBoolean()
      .withMessage('includeIndexSuggestions must be boolean'),
    body('options.performanceTarget')
      .optional()
      .isIn(['speed', 'memory', 'balanced'])
      .withMessage('Invalid performance target'),
  ],
  validateRequest,
  async (req, res, next) => {
    const span = telemetryService.startSpan('agent.optimize_query');
    
    try {
      const { query, databaseType, schema, options = {} } = req.body;
      
      span.setAttributes({
        'agent.operation': 'query_optimization',
        'request.database_type': databaseType,
        'request.user_id': req.user?.id,
        'request.query_length': query.length,
        'request.has_schema': !!schema,
      });
      
      logger.api('Query optimization requested', {
        userId: req.user?.id,
        databaseType,
        queryLength: query.length,
        hasSchema: !!schema,
        requestId: req.id,
      });
      
      const result = await databaseService.optimizeQuery({
        query,
        databaseType,
        schema,
        options,
        userId: req.user?.id,
        requestId: req.id,
      });
      
      span.setAttributes({
        'response.success': true,
        'response.task_id': result.taskId,
      });
      
      telemetryService.incrementCounter('query_optimization_requests_total', {
        database_type: databaseType,
        performance_target: options.performanceTarget || 'balanced',
        user_role: req.user?.role || 'anonymous',
      });
      
      span.end();
      
      res.json({
        success: true,
        data: result,
      });
      
    } catch (error) {
      span.recordException(error);
      span.end();
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/agent/migration/generate:
 *   post:
 *     summary: Generate database migration
 *     description: Generate database migration scripts from schema changes
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - changes
 *               - databaseType
 *               - migrationFormat
 *             properties:
 *               changes:
 *                 type: string
 *                 description: Description of schema changes needed
 *               databaseType:
 *                 type: string
 *                 enum: [mongodb, postgresql, mysql, sqlite]
 *               migrationFormat:
 *                 type: string
 *                 enum: [mongoose, sequelize, knex, raw-sql]
 *               currentSchema:
 *                 type: object
 *                 description: Current database schema
 *               targetSchema:
 *                 type: object
 *                 description: Target database schema
 *               options:
 *                 type: object
 *                 properties:
 *                   includeRollback:
 *                     type: boolean
 *                   includeDataMigration:
 *                     type: boolean
 *                   safeMode:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Migration generated successfully
 *       400:
 *         description: Invalid request parameters
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/migration/generate',
  authenticate,
  migrationLimiter,
  [
    body('changes')
      .isString()
      .isLength({ min: 10, max: 5000 })
      .withMessage('Changes description must be between 10 and 5000 characters'),
    body('databaseType')
      .isIn(config.database.supportedTypes)
      .withMessage('Invalid database type'),
    body('migrationFormat')
      .isIn(['mongoose', 'sequelize', 'knex', 'raw-sql'])
      .withMessage('Invalid migration format'),
    body('currentSchema')
      .optional()
      .isObject()
      .withMessage('Current schema must be an object'),
    body('targetSchema')
      .optional()
      .isObject()
      .withMessage('Target schema must be an object'),
    body('options.includeRollback')
      .optional()
      .isBoolean()
      .withMessage('includeRollback must be boolean'),
    body('options.includeDataMigration')
      .optional()
      .isBoolean()
      .withMessage('includeDataMigration must be boolean'),
    body('options.safeMode')
      .optional()
      .isBoolean()
      .withMessage('safeMode must be boolean'),
  ],
  validateRequest,
  async (req, res, next) => {
    const span = telemetryService.startSpan('agent.generate_migration');
    
    try {
      const {
        changes,
        databaseType,
        migrationFormat,
        currentSchema,
        targetSchema,
        options = {},
      } = req.body;
      
      span.setAttributes({
        'agent.operation': 'migration_generation',
        'request.database_type': databaseType,
        'request.migration_format': migrationFormat,
        'request.user_id': req.user?.id,
        'request.changes_length': changes.length,
        'request.has_current_schema': !!currentSchema,
        'request.has_target_schema': !!targetSchema,
      });
      
      logger.api('Migration generation requested', {
        userId: req.user?.id,
        databaseType,
        migrationFormat,
        changesLength: changes.length,
        hasCurrentSchema: !!currentSchema,
        hasTargetSchema: !!targetSchema,
        requestId: req.id,
      });
      
      const result = await databaseService.generateMigration({
        changes,
        databaseType,
        migrationFormat,
        currentSchema,
        targetSchema,
        options,
        userId: req.user?.id,
        requestId: req.id,
      });
      
      span.setAttributes({
        'response.success': true,
        'response.task_id': result.taskId,
      });
      
      telemetryService.incrementCounter('migration_generation_requests_total', {
        database_type: databaseType,
        migration_format: migrationFormat,
        user_role: req.user?.role || 'anonymous',
      });
      
      span.end();
      
      res.json({
        success: true,
        data: result,
      });
      
    } catch (error) {
      span.recordException(error);
      span.end();
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/agent/performance/analyze:
 *   post:
 *     summary: Analyze database performance
 *     description: Analyze database performance and provide optimization recommendations
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - databaseType
 *             properties:
 *               databaseType:
 *                 type: string
 *                 enum: [mongodb, postgresql, mysql, sqlite]
 *               schema:
 *                 type: object
 *                 description: Database schema to analyze
 *               queries:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Common queries to analyze
 *               metrics:
 *                 type: object
 *                 description: Performance metrics data
 *               options:
 *                 type: object
 *                 properties:
 *                   analysisDepth:
 *                     type: string
 *                     enum: [basic, detailed, comprehensive]
 *                   includeRecommendations:
 *                     type: boolean
 *                   includeIndexSuggestions:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Performance analysis completed successfully
 *       400:
 *         description: Invalid request parameters
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/performance/analyze',
  authenticate,
  performanceAnalysisLimiter,
  [
    body('databaseType')
      .isIn(config.database.supportedTypes)
      .withMessage('Invalid database type'),
    body('schema')
      .optional()
      .isObject()
      .withMessage('Schema must be an object'),
    body('queries')
      .optional()
      .isArray()
      .withMessage('Queries must be an array'),
    body('queries.*')
      .optional()
      .isString()
      .withMessage('Each query must be a string'),
    body('metrics')
      .optional()
      .isObject()
      .withMessage('Metrics must be an object'),
    body('options.analysisDepth')
      .optional()
      .isIn(['basic', 'detailed', 'comprehensive'])
      .withMessage('Invalid analysis depth'),
    body('options.includeRecommendations')
      .optional()
      .isBoolean()
      .withMessage('includeRecommendations must be boolean'),
    body('options.includeIndexSuggestions')
      .optional()
      .isBoolean()
      .withMessage('includeIndexSuggestions must be boolean'),
  ],
  validateRequest,
  async (req, res, next) => {
    const span = telemetryService.startSpan('agent.analyze_performance');
    
    try {
      const {
        databaseType,
        schema,
        queries = [],
        metrics,
        options = {},
      } = req.body;
      
      span.setAttributes({
        'agent.operation': 'performance_analysis',
        'request.database_type': databaseType,
        'request.user_id': req.user?.id,
        'request.has_schema': !!schema,
        'request.queries_count': queries.length,
        'request.has_metrics': !!metrics,
        'request.analysis_depth': options.analysisDepth || 'basic',
      });
      
      logger.api('Performance analysis requested', {
        userId: req.user?.id,
        databaseType,
        hasSchema: !!schema,
        queriesCount: queries.length,
        hasMetrics: !!metrics,
        analysisDepth: options.analysisDepth || 'basic',
        requestId: req.id,
      });
      
      const result = await databaseService.analyzePerformance({
        databaseType,
        schema,
        queries,
        metrics,
        options,
        userId: req.user?.id,
        requestId: req.id,
      });
      
      span.setAttributes({
        'response.success': true,
        'response.task_id': result.taskId,
      });
      
      telemetryService.incrementCounter('performance_analysis_requests_total', {
        database_type: databaseType,
        analysis_depth: options.analysisDepth || 'basic',
        user_role: req.user?.role || 'anonymous',
      });
      
      span.end();
      
      res.json({
        success: true,
        data: result,
      });
      
    } catch (error) {
      span.recordException(error);
      span.end();
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/agent/status:
 *   get:
 *     summary: Get Database AI Agent status
 *     description: Returns the current status and health of the Database AI Agent
 *     tags: [Agent]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
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
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                     uptime:
 *                       type: number
 *                     activeTasks:
 *                       type: number
 *                     queueSize:
 *                       type: number
 *                     metrics:
 *                       type: object
 */
router.get('/status', authenticate, async (req, res, next) => {
  const span = telemetryService.startSpan('agent.get_status');
  
  try {
    span.setAttributes({
      'agent.type': 'database',
      'request.user_id': req.user?.id,
    });
    
    const status = await databaseService.getStatus();
    
    span.setAttributes({
      'response.success': true,
      'agent.active_tasks': status.activeTasks,
      'agent.queue_size': status.queueSize,
    });
    
    logger.api('Agent status requested', {
      userId: req.user?.id,
      status: status.status,
      activeTasks: status.activeTasks,
      requestId: req.id,
    });
    
    telemetryService.incrementCounter('agent_status_requests_total', {
      user_role: req.user?.role || 'anonymous',
    });
    
    span.end();
    
    res.json({
      success: true,
      data: status,
    });
    
  } catch (error) {
    span.recordException(error);
    span.end();
    next(error);
  }
});

module.exports = router;