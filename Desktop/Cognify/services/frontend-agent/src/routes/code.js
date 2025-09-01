const express = require('express');
const { frontendService } = require('../services/frontendService');
const { AuthMiddleware } = require('../middleware/auth');
const { ValidationMiddleware } = require('../middleware/validation');
const { rateLimiterMiddleware } = require('../middleware/rateLimiter');
const { logger } = require('../config/logger');
const { tracer } = require('../config/telemetry');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

/**
 * @swagger
 * /api/code/generate/component:
 *   post:
 *     summary: Generate a React/Vue/Angular component
 *     tags: [Code Generation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ComponentRequest'
 *     responses:
 *       200:
 *         description: Component generated successfully
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
 *                     code:
 *                       type: string
 *                       description: Generated component code
 *                     tests:
 *                       type: string
 *                       description: Generated test code
 *                     documentation:
 *                       type: string
 *                       description: Component documentation
 *                     dependencies:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Required dependencies
 *                     framework:
 *                       type: string
 *                     language:
 *                       type: string
 *                     styling:
 *                       type: string
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/generate/component',
  rateLimiterMiddleware.aiProcessingLimiter(),
  AuthMiddleware.verifyToken,
  ValidationMiddleware.sanitizeInput,
  ValidationMiddleware.validateComponentGeneration,
  async (req, res) => {
    const span = tracer.startSpan('code.generateComponent');
    
    try {
      const {
        componentName,
        componentType,
        framework = 'react',
        language = 'typescript',
        styling = 'css',
        props = [],
        features = [],
        description
      } = req.body;

      logger.info('Component generation requested', {
        componentName,
        framework,
        language,
        userId: req.user?.id
      });

      // Create a task for component generation
      const taskId = uuidv4();
      const task = {
        id: taskId,
        type: 'component_generation',
        description: description || `Generate ${componentName} component`,
        framework,
        language,
        styling,
        requirements: [
          `Component name: ${componentName}`,
          `Component type: ${componentType}`,
          `Props: ${JSON.stringify(props)}`,
          `Features: ${features.join(', ')}`
        ],
        context: {
          componentName,
          componentType,
          props,
          features
        },
        priority: 'medium'
      };

      // Process the component generation
      const result = await frontendService.processComponentGeneration(task);

      res.json({
        success: true,
        data: {
          taskId,
          code: result.code,
          tests: result.tests,
          documentation: result.documentation,
          dependencies: result.dependencies,
          framework,
          language,
          styling,
          generatedAt: new Date().toISOString()
        }
      });

      logger.info('Component generated successfully', {
        taskId,
        componentName,
        framework,
        userId: req.user?.id
      });
    } catch (error) {
      logger.error('Component generation failed', {
        error: error.message,
        userId: req.user?.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Component generation failed',
        details: error.message
      });
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/code/optimize:
 *   post:
 *     summary: Optimize existing code
 *     tags: [Code Optimization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OptimizationRequest'
 *     responses:
 *       200:
 *         description: Code optimized successfully
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
 *                     optimizedCode:
 *                       type: string
 *                       description: Optimized code
 *                     improvements:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: List of improvements made
 *                     metrics:
 *                       type: object
 *                       description: Performance metrics
 *                     suggestions:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Additional optimization suggestions
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/optimize',
  rateLimiterMiddleware.aiProcessingLimiter(),
  AuthMiddleware.verifyToken,
  ValidationMiddleware.sanitizeInput,
  ValidationMiddleware.validateCodeOptimization,
  async (req, res) => {
    const span = tracer.startSpan('code.optimize');
    
    try {
      const {
        code,
        optimizationType,
        framework = 'react',
        language = 'typescript',
        targetMetrics = {},
        preserveFormatting = true
      } = req.body;

      logger.info('Code optimization requested', {
        optimizationType,
        framework,
        language,
        codeLength: code.length,
        userId: req.user?.id
      });

      // Create a task for code optimization
      const taskId = uuidv4();
      const task = {
        id: taskId,
        type: 'optimization',
        description: `Optimize code for ${optimizationType}`,
        framework,
        language,
        requirements: [
          `Optimization type: ${optimizationType}`,
          `Target metrics: ${JSON.stringify(targetMetrics)}`,
          `Preserve formatting: ${preserveFormatting}`
        ],
        context: {
          code,
          optimizationType,
          targetMetrics,
          preserveFormatting
        },
        priority: 'medium'
      };

      // Process the code optimization
      const result = await frontendService.processOptimization(task);

      res.json({
        success: true,
        data: {
          taskId,
          optimizedCode: result.optimizedCode,
          improvements: result.improvements,
          metrics: result.metrics,
          suggestions: result.suggestions,
          optimizationType,
          framework,
          language,
          optimizedAt: new Date().toISOString()
        }
      });

      logger.info('Code optimization completed', {
        taskId,
        optimizationType,
        improvementsCount: result.improvements?.length || 0,
        userId: req.user?.id
      });
    } catch (error) {
      logger.error('Code optimization failed', {
        error: error.message,
        userId: req.user?.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Code optimization failed',
        details: error.message
      });
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/code/review:
 *   post:
 *     summary: Review code for best practices and issues
 *     tags: [Code Review]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 description: Code to review
 *               framework:
 *                 type: string
 *                 enum: [react, vue, angular, svelte, vanilla]
 *               language:
 *                 type: string
 *                 enum: [javascript, typescript, jsx, tsx]
 *               reviewType:
 *                 type: string
 *                 enum: [security, performance, best_practices, accessibility, all]
 *               strictness:
 *                 type: string
 *                 enum: [low, medium, high]
 *                 default: medium
 *     responses:
 *       200:
 *         description: Code review completed successfully
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
 *                     issues:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                           severity:
 *                             type: string
 *                           message:
 *                             type: string
 *                           line:
 *                             type: integer
 *                           suggestion:
 *                             type: string
 *                     score:
 *                       type: number
 *                       description: Overall code quality score (0-100)
 *                     suggestions:
 *                       type: array
 *                       items:
 *                         type: string
 *                     summary:
 *                       type: string
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/review',
  rateLimiterMiddleware.aiProcessingLimiter(),
  AuthMiddleware.verifyToken,
  ValidationMiddleware.sanitizeInput,
  async (req, res) => {
    const span = tracer.startSpan('code.review');
    
    try {
      const {
        code,
        framework = 'react',
        language = 'typescript',
        reviewType = 'all',
        strictness = 'medium'
      } = req.body;

      if (!code || typeof code !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Code is required and must be a string'
        });
      }

      logger.info('Code review requested', {
        reviewType,
        framework,
        language,
        strictness,
        codeLength: code.length,
        userId: req.user?.id
      });

      // Create a task for code review
      const taskId = uuidv4();
      const task = {
        id: taskId,
        type: 'code_review',
        description: `Review code for ${reviewType}`,
        framework,
        language,
        requirements: [
          `Review type: ${reviewType}`,
          `Strictness: ${strictness}`
        ],
        context: {
          code,
          reviewType,
          strictness
        },
        priority: 'medium'
      };

      // Process the code review
      const result = await frontendService.processCodeReview(task);

      res.json({
        success: true,
        data: {
          taskId,
          issues: result.issues,
          score: result.score,
          suggestions: result.suggestions,
          summary: result.summary,
          reviewType,
          framework,
          language,
          reviewedAt: new Date().toISOString()
        }
      });

      logger.info('Code review completed', {
        taskId,
        reviewType,
        score: result.score,
        issuesCount: result.issues?.length || 0,
        userId: req.user?.id
      });
    } catch (error) {
      logger.error('Code review failed', {
        error: error.message,
        userId: req.user?.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Code review failed',
        details: error.message
      });
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/code/generate/tests:
 *   post:
 *     summary: Generate tests for existing code
 *     tags: [Code Generation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 description: Code to generate tests for
 *               framework:
 *                 type: string
 *                 enum: [react, vue, angular, svelte, vanilla]
 *               language:
 *                 type: string
 *                 enum: [javascript, typescript, jsx, tsx]
 *               testFramework:
 *                 type: string
 *                 enum: [jest, vitest, cypress, playwright]
 *                 default: jest
 *               testType:
 *                 type: string
 *                 enum: [unit, integration, e2e, all]
 *                 default: unit
 *               coverage:
 *                 type: string
 *                 enum: [basic, comprehensive, full]
 *                 default: comprehensive
 *     responses:
 *       200:
 *         description: Tests generated successfully
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
 *                     tests:
 *                       type: string
 *                       description: Generated test code
 *                     testFiles:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           filename:
 *                             type: string
 *                           content:
 *                             type: string
 *                     dependencies:
 *                       type: array
 *                       items:
 *                         type: string
 *                     coverage:
 *                       type: object
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/generate/tests',
  rateLimiterMiddleware.aiProcessingLimiter(),
  AuthMiddleware.verifyToken,
  ValidationMiddleware.sanitizeInput,
  async (req, res) => {
    const span = tracer.startSpan('code.generateTests');
    
    try {
      const {
        code,
        framework = 'react',
        language = 'typescript',
        testFramework = 'jest',
        testType = 'unit',
        coverage = 'comprehensive'
      } = req.body;

      if (!code || typeof code !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Code is required and must be a string'
        });
      }

      logger.info('Test generation requested', {
        framework,
        language,
        testFramework,
        testType,
        coverage,
        codeLength: code.length,
        userId: req.user?.id
      });

      // Create a task for test generation
      const taskId = uuidv4();
      const task = {
        id: taskId,
        type: 'testing',
        description: `Generate ${testType} tests using ${testFramework}`,
        framework,
        language,
        requirements: [
          `Test framework: ${testFramework}`,
          `Test type: ${testType}`,
          `Coverage: ${coverage}`
        ],
        context: {
          code,
          testFramework,
          testType,
          coverage
        },
        priority: 'medium'
      };

      // Process the test generation
      const result = await frontendService.processTestGeneration(task);

      res.json({
        success: true,
        data: {
          taskId,
          tests: result.tests,
          testFiles: result.testFiles,
          dependencies: result.dependencies,
          coverage: result.coverage,
          framework,
          language,
          testFramework,
          generatedAt: new Date().toISOString()
        }
      });

      logger.info('Tests generated successfully', {
        taskId,
        testFramework,
        testType,
        testFilesCount: result.testFiles?.length || 0,
        userId: req.user?.id
      });
    } catch (error) {
      logger.error('Test generation failed', {
        error: error.message,
        userId: req.user?.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Test generation failed',
        details: error.message
      });
    } finally {
      span.end();
    }
  }
);

// Error handling middleware for code routes
router.use((error, req, res, next) => {
  logger.error('Code route error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error in code service'
  });
});

module.exports = router;