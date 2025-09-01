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
 * /api/ui/style/generate:
 *   post:
 *     summary: Generate CSS/SCSS styles for components
 *     tags: [UI Styling]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               component:
 *                 type: string
 *                 description: Component code or description
 *               styleType:
 *                 type: string
 *                 enum: [css, scss, sass, less, tailwind, styled-components, emotion]
 *                 default: css
 *               theme:
 *                 type: object
 *                 properties:
 *                   colors:
 *                     type: object
 *                   typography:
 *                     type: object
 *                   spacing:
 *                     type: object
 *                   breakpoints:
 *                     type: object
 *               requirements:
 *                 type: array
 *                 items:
 *                   type: string
 *               responsive:
 *                 type: boolean
 *                 default: true
 *               accessibility:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Styles generated successfully
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
 *                     styles:
 *                       type: string
 *                       description: Generated CSS/SCSS code
 *                     variables:
 *                       type: string
 *                       description: CSS variables or SCSS variables
 *                     mediaQueries:
 *                       type: array
 *                       items:
 *                         type: string
 *                     accessibility:
 *                       type: array
 *                       items:
 *                         type: string
 *                     documentation:
 *                       type: string
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/style/generate',
  rateLimiterMiddleware.aiProcessingLimiter(),
  AuthMiddleware.verifyToken,
  ValidationMiddleware.sanitizeInput,
  async (req, res) => {
    const span = tracer.startSpan('ui.generateStyles');
    
    try {
      const {
        component,
        styleType = 'css',
        theme = {},
        requirements = [],
        responsive = true,
        accessibility = true
      } = req.body;

      if (!component || typeof component !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Component is required and must be a string'
        });
      }

      logger.info('Style generation requested', {
        styleType,
        responsive,
        accessibility,
        requirementsCount: requirements.length,
        userId: req.user?.id
      });

      // Create a task for style generation
      const taskId = uuidv4();
      const task = {
        id: taskId,
        type: 'styling',
        description: `Generate ${styleType} styles for component`,
        styling: styleType,
        requirements: [
          `Style type: ${styleType}`,
          `Responsive: ${responsive}`,
          `Accessibility: ${accessibility}`,
          ...requirements
        ],
        context: {
          component,
          theme,
          responsive,
          accessibility
        },
        priority: 'medium'
      };

      // Process the style generation
      const result = await frontendService.processStyling(task);

      res.json({
        success: true,
        data: {
          taskId,
          styles: result.styles,
          variables: result.variables,
          mediaQueries: result.mediaQueries,
          accessibility: result.accessibility,
          documentation: result.documentation,
          styleType,
          generatedAt: new Date().toISOString()
        }
      });

      logger.info('Styles generated successfully', {
        taskId,
        styleType,
        userId: req.user?.id
      });
    } catch (error) {
      logger.error('Style generation failed', {
        error: error.message,
        userId: req.user?.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Style generation failed',
        details: error.message
      });
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/ui/theme/generate:
 *   post:
 *     summary: Generate a design system theme
 *     tags: [UI Theming]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               brandColors:
 *                 type: object
 *                 properties:
 *                   primary:
 *                     type: string
 *                   secondary:
 *                     type: string
 *                   accent:
 *                     type: string
 *               style:
 *                 type: string
 *                 enum: [modern, classic, minimal, bold, playful]
 *                 default: modern
 *               framework:
 *                 type: string
 *                 enum: [css, tailwind, material-ui, chakra-ui, ant-design]
 *                 default: css
 *               components:
 *                 type: array
 *                 items:
 *                   type: string
 *               darkMode:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Theme generated successfully
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
 *                     theme:
 *                       type: object
 *                       description: Complete theme configuration
 *                     cssVariables:
 *                       type: string
 *                       description: CSS custom properties
 *                     tokens:
 *                       type: object
 *                       description: Design tokens
 *                     components:
 *                       type: object
 *                       description: Component-specific styles
 *                     documentation:
 *                       type: string
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/theme/generate',
  rateLimiterMiddleware.aiProcessingLimiter(),
  AuthMiddleware.verifyToken,
  ValidationMiddleware.sanitizeInput,
  async (req, res) => {
    const span = tracer.startSpan('ui.generateTheme');
    
    try {
      const {
        brandColors = {},
        style = 'modern',
        framework = 'css',
        components = [],
        darkMode = true
      } = req.body;

      logger.info('Theme generation requested', {
        style,
        framework,
        darkMode,
        componentsCount: components.length,
        userId: req.user?.id
      });

      // Create a task for theme generation
      const taskId = uuidv4();
      const task = {
        id: taskId,
        type: 'styling',
        description: `Generate ${style} theme for ${framework}`,
        styling: framework,
        requirements: [
          `Style: ${style}`,
          `Framework: ${framework}`,
          `Dark mode: ${darkMode}`,
          `Components: ${components.join(', ')}`
        ],
        context: {
          brandColors,
          style,
          framework,
          components,
          darkMode
        },
        priority: 'medium'
      };

      // Process the theme generation
      const result = await frontendService.processThemeGeneration(task);

      res.json({
        success: true,
        data: {
          taskId,
          theme: result.theme,
          cssVariables: result.cssVariables,
          tokens: result.tokens,
          components: result.components,
          documentation: result.documentation,
          style,
          framework,
          generatedAt: new Date().toISOString()
        }
      });

      logger.info('Theme generated successfully', {
        taskId,
        style,
        framework,
        userId: req.user?.id
      });
    } catch (error) {
      logger.error('Theme generation failed', {
        error: error.message,
        userId: req.user?.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Theme generation failed',
        details: error.message
      });
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/ui/layout/generate:
 *   post:
 *     summary: Generate responsive layout code
 *     tags: [UI Layout]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               layoutType:
 *                 type: string
 *                 enum: [grid, flexbox, css-grid, masonry, sidebar, dashboard]
 *               sections:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     content:
 *                       type: string
 *                     width:
 *                       type: string
 *                     height:
 *                       type: string
 *               breakpoints:
 *                 type: object
 *                 properties:
 *                   mobile:
 *                     type: string
 *                   tablet:
 *                     type: string
 *                   desktop:
 *                     type: string
 *               framework:
 *                 type: string
 *                 enum: [css, tailwind, bootstrap, bulma]
 *                 default: css
 *     responses:
 *       200:
 *         description: Layout generated successfully
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
 *                     html:
 *                       type: string
 *                       description: Generated HTML structure
 *                     css:
 *                       type: string
 *                       description: Generated CSS styles
 *                     responsive:
 *                       type: object
 *                       description: Responsive breakpoint styles
 *                     accessibility:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/layout/generate',
  rateLimiterMiddleware.aiProcessingLimiter(),
  AuthMiddleware.verifyToken,
  ValidationMiddleware.sanitizeInput,
  async (req, res) => {
    const span = tracer.startSpan('ui.generateLayout');
    
    try {
      const {
        layoutType,
        sections = [],
        breakpoints = {},
        framework = 'css'
      } = req.body;

      if (!layoutType) {
        return res.status(400).json({
          success: false,
          error: 'Layout type is required'
        });
      }

      logger.info('Layout generation requested', {
        layoutType,
        framework,
        sectionsCount: sections.length,
        userId: req.user?.id
      });

      // Create a task for layout generation
      const taskId = uuidv4();
      const task = {
        id: taskId,
        type: 'styling',
        description: `Generate ${layoutType} layout using ${framework}`,
        styling: framework,
        requirements: [
          `Layout type: ${layoutType}`,
          `Framework: ${framework}`,
          `Sections: ${sections.length}`,
          `Breakpoints: ${Object.keys(breakpoints).join(', ')}`
        ],
        context: {
          layoutType,
          sections,
          breakpoints,
          framework
        },
        priority: 'medium'
      };

      // Process the layout generation
      const result = await frontendService.processLayoutGeneration(task);

      res.json({
        success: true,
        data: {
          taskId,
          html: result.html,
          css: result.css,
          responsive: result.responsive,
          accessibility: result.accessibility,
          layoutType,
          framework,
          generatedAt: new Date().toISOString()
        }
      });

      logger.info('Layout generated successfully', {
        taskId,
        layoutType,
        framework,
        userId: req.user?.id
      });
    } catch (error) {
      logger.error('Layout generation failed', {
        error: error.message,
        userId: req.user?.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Layout generation failed',
        details: error.message
      });
    } finally {
      span.end();
    }
  }
);

/**
 * @swagger
 * /api/ui/accessibility/audit:
 *   post:
 *     summary: Audit UI components for accessibility issues
 *     tags: [UI Accessibility]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               html:
 *                 type: string
 *                 description: HTML code to audit
 *               css:
 *                 type: string
 *                 description: CSS code to audit
 *               wcagLevel:
 *                 type: string
 *                 enum: [A, AA, AAA]
 *                 default: AA
 *               includeRecommendations:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Accessibility audit completed successfully
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
 *                           element:
 *                             type: string
 *                           fix:
 *                             type: string
 *                     score:
 *                       type: number
 *                       description: Accessibility score (0-100)
 *                     recommendations:
 *                       type: array
 *                       items:
 *                         type: string
 *                     wcagCompliance:
 *                       type: object
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/accessibility/audit',
  rateLimiterMiddleware.aiProcessingLimiter(),
  AuthMiddleware.verifyToken,
  ValidationMiddleware.sanitizeInput,
  async (req, res) => {
    const span = tracer.startSpan('ui.accessibilityAudit');
    
    try {
      const {
        html,
        css = '',
        wcagLevel = 'AA',
        includeRecommendations = true
      } = req.body;

      if (!html || typeof html !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'HTML is required and must be a string'
        });
      }

      logger.info('Accessibility audit requested', {
        wcagLevel,
        includeRecommendations,
        htmlLength: html.length,
        cssLength: css.length,
        userId: req.user?.id
      });

      // Create a task for accessibility audit
      const taskId = uuidv4();
      const task = {
        id: taskId,
        type: 'code_review',
        description: `Accessibility audit for WCAG ${wcagLevel} compliance`,
        requirements: [
          `WCAG level: ${wcagLevel}`,
          `Include recommendations: ${includeRecommendations}`
        ],
        context: {
          html,
          css,
          wcagLevel,
          includeRecommendations,
          auditType: 'accessibility'
        },
        priority: 'medium'
      };

      // Process the accessibility audit
      const result = await frontendService.processAccessibilityAudit(task);

      res.json({
        success: true,
        data: {
          taskId,
          issues: result.issues,
          score: result.score,
          recommendations: result.recommendations,
          wcagCompliance: result.wcagCompliance,
          wcagLevel,
          auditedAt: new Date().toISOString()
        }
      });

      logger.info('Accessibility audit completed', {
        taskId,
        wcagLevel,
        score: result.score,
        issuesCount: result.issues?.length || 0,
        userId: req.user?.id
      });
    } catch (error) {
      logger.error('Accessibility audit failed', {
        error: error.message,
        userId: req.user?.id
      });
      
      res.status(500).json({
        success: false,
        error: 'Accessibility audit failed',
        details: error.message
      });
    } finally {
      span.end();
    }
  }
);

// Error handling middleware for UI routes
router.use((error, req, res, next) => {
  logger.error('UI route error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error in UI service'
  });
});

module.exports = router;