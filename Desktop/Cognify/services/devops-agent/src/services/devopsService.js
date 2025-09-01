/**
 * DevOps AI Service
 * Core service for AI-powered DevOps operations including deployment,
 * infrastructure management, monitoring, and configuration
 */

'use strict';

const { OpenAI } = require('openai');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const config = require('../config/config');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');
const { CacheService } = require('./cacheService');

class DevOpsService extends EventEmitter {
  constructor() {
    super();
    
    // Initialize OpenAI client
    if (config.openai.enabled && config.openai.apiKey) {
      this.openai = new OpenAI({
        apiKey: config.openai.apiKey,
        timeout: config.openai.timeout,
        maxRetries: config.openai.maxRetries,
      });
    }
    
    // Initialize cache service
    this.cache = new CacheService();
    
    // Task management
    this.activeTasks = new Map();
    this.taskQueue = [];
    this.isProcessingQueue = false;
    
    // Metrics
    this.metrics = {
      tasksProcessed: 0,
      tasksSucceeded: 0,
      tasksFailed: 0,
      totalProcessingTime: 0,
      activeTasks: 0,
      cacheHits: 0,
      cacheMisses: 0,
      aiRequests: 0,
      aiErrors: 0,
      deployments: 0,
      infrastructureOperations: 0,
      monitoringSetups: 0,
      configurationChanges: 0,
    };
    
    // Start queue processing
    this.startQueueProcessing();
    
    logger.info('DevOps AI Service initialized', {
      openaiEnabled: !!this.openai,
      cacheEnabled: config.cache.enabled,
      supportedPlatforms: config.devops.supportedPlatforms,
    });
  }

  /**
   * Generate deployment configuration
   */
  async generateDeployment(requirements, options = {}) {
    const taskId = uuidv4();
    const span = telemetryService.startSpan('devops.generate_deployment');
    
    try {
      span.setAttributes({
        'task.id': taskId,
        'deployment.platform': options.platform || 'kubernetes',
        'deployment.environment': options.environment || 'production',
      });
      
      logger.logTask('Starting deployment generation', {
        taskId,
        requirements: requirements.substring(0, 200),
        options,
      });
      
      // Check cache first
      const cacheKey = this.generateCacheKey('deployment', requirements, options);
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.metrics.cacheHits++;
        span.setAttributes({ 'cache.hit': true });
        
        logger.logTask('Deployment generation cache hit', { taskId, cacheKey });
        
        span.end();
        return {
          taskId,
          status: 'completed',
          result: cached,
          cached: true,
        };
      }
      
      this.metrics.cacheMisses++;
      span.setAttributes({ 'cache.hit': false });
      
      // Create task
      const task = {
        id: taskId,
        type: 'deployment',
        status: 'processing',
        requirements,
        options,
        startTime: Date.now(),
        progress: 0,
      };
      
      this.activeTasks.set(taskId, task);
      this.metrics.activeTasks++;
      
      // Generate deployment configuration
      const result = await this.processDeploymentGeneration(requirements, options, taskId);
      
      // Cache the result
      await this.cache.set(cacheKey, result, config.cache.deploymentTtl);
      
      // Update task
      task.status = 'completed';
      task.result = result;
      task.endTime = Date.now();
      task.processingTime = task.endTime - task.startTime;
      
      // Update metrics
      this.metrics.tasksProcessed++;
      this.metrics.tasksSucceeded++;
      this.metrics.deployments++;
      this.metrics.totalProcessingTime += task.processingTime;
      this.metrics.activeTasks--;
      
      span.setAttributes({
        'task.status': 'completed',
        'task.processing_time': task.processingTime,
      });
      
      logger.logTask('Deployment generation completed', {
        taskId,
        processingTime: task.processingTime,
        resultSize: JSON.stringify(result).length,
      });
      
      span.end();
      
      return {
        taskId,
        status: 'completed',
        result,
        processingTime: task.processingTime,
      };
      
    } catch (error) {
      span.recordException(error);
      span.setAttributes({ 'task.status': 'failed' });
      span.end();
      
      this.metrics.tasksFailed++;
      this.metrics.activeTasks--;
      
      logger.error('Deployment generation failed', {
        taskId,
        error: error.message,
        stack: error.stack,
      });
      
      throw error;
    }
  }

  /**
   * Generate infrastructure as code
   */
  async generateInfrastructure(requirements, options = {}) {
    const taskId = uuidv4();
    const span = telemetryService.startSpan('devops.generate_infrastructure');
    
    try {
      span.setAttributes({
        'task.id': taskId,
        'infrastructure.provider': options.provider || 'aws',
        'infrastructure.tool': options.tool || 'terraform',
      });
      
      logger.logTask('Starting infrastructure generation', {
        taskId,
        requirements: requirements.substring(0, 200),
        options,
      });
      
      // Check cache first
      const cacheKey = this.generateCacheKey('infrastructure', requirements, options);
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.metrics.cacheHits++;
        span.setAttributes({ 'cache.hit': true });
        
        logger.logTask('Infrastructure generation cache hit', { taskId, cacheKey });
        
        span.end();
        return {
          taskId,
          status: 'completed',
          result: cached,
          cached: true,
        };
      }
      
      this.metrics.cacheMisses++;
      span.setAttributes({ 'cache.hit': false });
      
      // Create task
      const task = {
        id: taskId,
        type: 'infrastructure',
        status: 'processing',
        requirements,
        options,
        startTime: Date.now(),
        progress: 0,
      };
      
      this.activeTasks.set(taskId, task);
      this.metrics.activeTasks++;
      
      // Generate infrastructure code
      const result = await this.processInfrastructureGeneration(requirements, options, taskId);
      
      // Cache the result
      await this.cache.set(cacheKey, result, config.cache.infrastructureTtl);
      
      // Update task
      task.status = 'completed';
      task.result = result;
      task.endTime = Date.now();
      task.processingTime = task.endTime - task.startTime;
      
      // Update metrics
      this.metrics.tasksProcessed++;
      this.metrics.tasksSucceeded++;
      this.metrics.infrastructureOperations++;
      this.metrics.totalProcessingTime += task.processingTime;
      this.metrics.activeTasks--;
      
      span.setAttributes({
        'task.status': 'completed',
        'task.processing_time': task.processingTime,
      });
      
      logger.logTask('Infrastructure generation completed', {
        taskId,
        processingTime: task.processingTime,
        resultSize: JSON.stringify(result).length,
      });
      
      span.end();
      
      return {
        taskId,
        status: 'completed',
        result,
        processingTime: task.processingTime,
      };
      
    } catch (error) {
      span.recordException(error);
      span.setAttributes({ 'task.status': 'failed' });
      span.end();
      
      this.metrics.tasksFailed++;
      this.metrics.activeTasks--;
      
      logger.error('Infrastructure generation failed', {
        taskId,
        error: error.message,
        stack: error.stack,
      });
      
      throw error;
    }
  }

  /**
   * Setup monitoring and alerting
   */
  async setupMonitoring(requirements, options = {}) {
    const taskId = uuidv4();
    const span = telemetryService.startSpan('devops.setup_monitoring');
    
    try {
      span.setAttributes({
        'task.id': taskId,
        'monitoring.platform': options.platform || 'prometheus',
        'monitoring.alerting': options.alerting || 'alertmanager',
      });
      
      logger.logTask('Starting monitoring setup', {
        taskId,
        requirements: requirements.substring(0, 200),
        options,
      });
      
      // Check cache first
      const cacheKey = this.generateCacheKey('monitoring', requirements, options);
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.metrics.cacheHits++;
        span.setAttributes({ 'cache.hit': true });
        
        logger.logTask('Monitoring setup cache hit', { taskId, cacheKey });
        
        span.end();
        return {
          taskId,
          status: 'completed',
          result: cached,
          cached: true,
        };
      }
      
      this.metrics.cacheMisses++;
      span.setAttributes({ 'cache.hit': false });
      
      // Create task
      const task = {
        id: taskId,
        type: 'monitoring',
        status: 'processing',
        requirements,
        options,
        startTime: Date.now(),
        progress: 0,
      };
      
      this.activeTasks.set(taskId, task);
      this.metrics.activeTasks++;
      
      // Setup monitoring
      const result = await this.processMonitoringSetup(requirements, options, taskId);
      
      // Cache the result
      await this.cache.set(cacheKey, result, config.cache.monitoringTtl);
      
      // Update task
      task.status = 'completed';
      task.result = result;
      task.endTime = Date.now();
      task.processingTime = task.endTime - task.startTime;
      
      // Update metrics
      this.metrics.tasksProcessed++;
      this.metrics.tasksSucceeded++;
      this.metrics.monitoringSetups++;
      this.metrics.totalProcessingTime += task.processingTime;
      this.metrics.activeTasks--;
      
      span.setAttributes({
        'task.status': 'completed',
        'task.processing_time': task.processingTime,
      });
      
      logger.logTask('Monitoring setup completed', {
        taskId,
        processingTime: task.processingTime,
        resultSize: JSON.stringify(result).length,
      });
      
      span.end();
      
      return {
        taskId,
        status: 'completed',
        result,
        processingTime: task.processingTime,
      };
      
    } catch (error) {
      span.recordException(error);
      span.setAttributes({ 'task.status': 'failed' });
      span.end();
      
      this.metrics.tasksFailed++;
      this.metrics.activeTasks--;
      
      logger.error('Monitoring setup failed', {
        taskId,
        error: error.message,
        stack: error.stack,
      });
      
      throw error;
    }
  }

  /**
   * Generate configuration management
   */
  async generateConfiguration(requirements, options = {}) {
    const taskId = uuidv4();
    const span = telemetryService.startSpan('devops.generate_configuration');
    
    try {
      span.setAttributes({
        'task.id': taskId,
        'configuration.tool': options.tool || 'ansible',
        'configuration.environment': options.environment || 'production',
      });
      
      logger.logTask('Starting configuration generation', {
        taskId,
        requirements: requirements.substring(0, 200),
        options,
      });
      
      // Check cache first
      const cacheKey = this.generateCacheKey('configuration', requirements, options);
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.metrics.cacheHits++;
        span.setAttributes({ 'cache.hit': true });
        
        logger.logTask('Configuration generation cache hit', { taskId, cacheKey });
        
        span.end();
        return {
          taskId,
          status: 'completed',
          result: cached,
          cached: true,
        };
      }
      
      this.metrics.cacheMisses++;
      span.setAttributes({ 'cache.hit': false });
      
      // Create task
      const task = {
        id: taskId,
        type: 'configuration',
        status: 'processing',
        requirements,
        options,
        startTime: Date.now(),
        progress: 0,
      };
      
      this.activeTasks.set(taskId, task);
      this.metrics.activeTasks++;
      
      // Generate configuration
      const result = await this.processConfigurationGeneration(requirements, options, taskId);
      
      // Cache the result
      await this.cache.set(cacheKey, result, config.cache.configurationTtl);
      
      // Update task
      task.status = 'completed';
      task.result = result;
      task.endTime = Date.now();
      task.processingTime = task.endTime - task.startTime;
      
      // Update metrics
      this.metrics.tasksProcessed++;
      this.metrics.tasksSucceeded++;
      this.metrics.configurationChanges++;
      this.metrics.totalProcessingTime += task.processingTime;
      this.metrics.activeTasks--;
      
      span.setAttributes({
        'task.status': 'completed',
        'task.processing_time': task.processingTime,
      });
      
      logger.logTask('Configuration generation completed', {
        taskId,
        processingTime: task.processingTime,
        resultSize: JSON.stringify(result).length,
      });
      
      span.end();
      
      return {
        taskId,
        status: 'completed',
        result,
        processingTime: task.processingTime,
      };
      
    } catch (error) {
      span.recordException(error);
      span.setAttributes({ 'task.status': 'failed' });
      span.end();
      
      this.metrics.tasksFailed++;
      this.metrics.activeTasks--;
      
      logger.error('Configuration generation failed', {
        taskId,
        error: error.message,
        stack: error.stack,
      });
      
      throw error;
    }
  }

  /**
   * Process deployment generation with AI
   */
  async processDeploymentGeneration(requirements, options, taskId) {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }
    
    const prompt = this.buildDeploymentPrompt(requirements, options);
    
    try {
      this.metrics.aiRequests++;
      
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert DevOps engineer specializing in deployment automation and containerization.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      });
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from OpenAI');
      }
      
      return this.extractDeploymentContent(content, options);
      
    } catch (error) {
      this.metrics.aiErrors++;
      logger.logAiOperation('Deployment generation AI request failed', {
        taskId,
        error: error.message,
        model: config.openai.model,
      });
      throw error;
    }
  }

  /**
   * Process infrastructure generation with AI
   */
  async processInfrastructureGeneration(requirements, options, taskId) {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }
    
    const prompt = this.buildInfrastructurePrompt(requirements, options);
    
    try {
      this.metrics.aiRequests++;
      
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert cloud infrastructure engineer specializing in Infrastructure as Code (IaC).',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      });
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from OpenAI');
      }
      
      return this.extractInfrastructureContent(content, options);
      
    } catch (error) {
      this.metrics.aiErrors++;
      logger.logAiOperation('Infrastructure generation AI request failed', {
        taskId,
        error: error.message,
        model: config.openai.model,
      });
      throw error;
    }
  }

  /**
   * Process monitoring setup with AI
   */
  async processMonitoringSetup(requirements, options, taskId) {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }
    
    const prompt = this.buildMonitoringPrompt(requirements, options);
    
    try {
      this.metrics.aiRequests++;
      
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert in monitoring, observability, and alerting systems.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      });
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from OpenAI');
      }
      
      return this.extractMonitoringContent(content, options);
      
    } catch (error) {
      this.metrics.aiErrors++;
      logger.logAiOperation('Monitoring setup AI request failed', {
        taskId,
        error: error.message,
        model: config.openai.model,
      });
      throw error;
    }
  }

  /**
   * Process configuration generation with AI
   */
  async processConfigurationGeneration(requirements, options, taskId) {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }
    
    const prompt = this.buildConfigurationPrompt(requirements, options);
    
    try {
      this.metrics.aiRequests++;
      
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert in configuration management and automation tools.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      });
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from OpenAI');
      }
      
      return this.extractConfigurationContent(content, options);
      
    } catch (error) {
      this.metrics.aiErrors++;
      logger.logAiOperation('Configuration generation AI request failed', {
        taskId,
        error: error.message,
        model: config.openai.model,
      });
      throw error;
    }
  }

  /**
   * Build deployment prompt
   */
  buildDeploymentPrompt(requirements, options) {
    const platform = options.platform || 'kubernetes';
    const environment = options.environment || 'production';
    const enableRollback = options.enableRollback !== false;
    
    return `Generate a comprehensive deployment configuration for the following requirements:

${requirements}

Platform: ${platform}
Environment: ${environment}
Enable Rollback: ${enableRollback}

Please provide:
1. Deployment manifests/configuration files
2. Service definitions
3. Ingress/routing configuration
4. Environment variables and secrets
5. Health checks and readiness probes
6. Resource limits and requests
7. Scaling configuration
8. Rollback strategy (if enabled)
9. Best practices and security considerations
10. Deployment commands and procedures

Format the response as structured YAML/JSON with clear sections and comments.`;
  }

  /**
   * Build infrastructure prompt
   */
  buildInfrastructurePrompt(requirements, options) {
    const provider = options.provider || 'aws';
    const tool = options.tool || 'terraform';
    const enableValidation = options.enableValidation !== false;
    
    return `Generate Infrastructure as Code for the following requirements:

${requirements}

Cloud Provider: ${provider}
IaC Tool: ${tool}
Enable Validation: ${enableValidation}

Please provide:
1. Main infrastructure configuration
2. Variable definitions
3. Output definitions
4. Provider configuration
5. Resource dependencies
6. Security groups/firewall rules
7. Networking configuration
8. Storage configuration
9. Monitoring and logging setup
10. Cost optimization recommendations
11. Security best practices
12. Validation rules (if enabled)

Format the response with proper ${tool} syntax and include comments explaining each section.`;
  }

  /**
   * Build monitoring prompt
   */
  buildMonitoringPrompt(requirements, options) {
    const platform = options.platform || 'prometheus';
    const alerting = options.alerting || 'alertmanager';
    const enableAlerts = options.enableAlerts !== false;
    
    return `Setup comprehensive monitoring and observability for the following requirements:

${requirements}

Monitoring Platform: ${platform}
Alerting System: ${alerting}
Enable Alerts: ${enableAlerts}

Please provide:
1. Monitoring configuration
2. Metrics collection setup
3. Dashboard definitions
4. Alert rules and thresholds
5. Notification channels
6. Log aggregation configuration
7. Distributed tracing setup
8. SLA/SLO definitions
9. Runbook procedures
10. Performance baselines
11. Capacity planning metrics
12. Security monitoring

Format the response with proper configuration syntax and include explanations for each component.`;
  }

  /**
   * Build configuration prompt
   */
  buildConfigurationPrompt(requirements, options) {
    const tool = options.tool || 'ansible';
    const environment = options.environment || 'production';
    const enableVersioning = options.enableVersioning !== false;
    
    return `Generate configuration management automation for the following requirements:

${requirements}

Configuration Tool: ${tool}
Environment: ${environment}
Enable Versioning: ${enableVersioning}

Please provide:
1. Configuration playbooks/recipes
2. Variable definitions
3. Template files
4. Inventory configuration
5. Role definitions
6. Handler configurations
7. Validation tasks
8. Rollback procedures
9. Environment-specific configurations
10. Security hardening
11. Compliance checks
12. Version control strategy (if enabled)

Format the response with proper ${tool} syntax and include best practices for maintainability.`;
  }

  /**
   * Extract deployment content from AI response
   */
  extractDeploymentContent(content, options) {
    // Extract structured content from AI response
    const sections = this.parseAIResponse(content);
    
    return {
      type: 'deployment',
      platform: options.platform || 'kubernetes',
      environment: options.environment || 'production',
      manifests: sections.manifests || [],
      services: sections.services || [],
      ingress: sections.ingress || {},
      secrets: sections.secrets || {},
      healthChecks: sections.healthChecks || {},
      resources: sections.resources || {},
      scaling: sections.scaling || {},
      rollback: sections.rollback || {},
      procedures: sections.procedures || [],
      bestPractices: sections.bestPractices || [],
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract infrastructure content from AI response
   */
  extractInfrastructureContent(content, options) {
    const sections = this.parseAIResponse(content);
    
    return {
      type: 'infrastructure',
      provider: options.provider || 'aws',
      tool: options.tool || 'terraform',
      main: sections.main || '',
      variables: sections.variables || {},
      outputs: sections.outputs || {},
      providers: sections.providers || {},
      resources: sections.resources || [],
      networking: sections.networking || {},
      security: sections.security || {},
      storage: sections.storage || {},
      monitoring: sections.monitoring || {},
      validation: sections.validation || {},
      costOptimization: sections.costOptimization || [],
      bestPractices: sections.bestPractices || [],
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract monitoring content from AI response
   */
  extractMonitoringContent(content, options) {
    const sections = this.parseAIResponse(content);
    
    return {
      type: 'monitoring',
      platform: options.platform || 'prometheus',
      alerting: options.alerting || 'alertmanager',
      configuration: sections.configuration || {},
      metrics: sections.metrics || [],
      dashboards: sections.dashboards || [],
      alerts: sections.alerts || [],
      notifications: sections.notifications || {},
      logging: sections.logging || {},
      tracing: sections.tracing || {},
      sla: sections.sla || {},
      runbooks: sections.runbooks || [],
      baselines: sections.baselines || {},
      capacity: sections.capacity || {},
      security: sections.security || {},
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract configuration content from AI response
   */
  extractConfigurationContent(content, options) {
    const sections = this.parseAIResponse(content);
    
    return {
      type: 'configuration',
      tool: options.tool || 'ansible',
      environment: options.environment || 'production',
      playbooks: sections.playbooks || [],
      variables: sections.variables || {},
      templates: sections.templates || [],
      inventory: sections.inventory || {},
      roles: sections.roles || [],
      handlers: sections.handlers || [],
      validation: sections.validation || [],
      rollback: sections.rollback || {},
      environments: sections.environments || {},
      security: sections.security || {},
      compliance: sections.compliance || [],
      versioning: sections.versioning || {},
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Parse AI response into structured sections
   */
  parseAIResponse(content) {
    // Simple parsing logic - in production, this would be more sophisticated
    const sections = {};
    
    // Extract code blocks
    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
    sections.codeBlocks = codeBlocks.map(block => 
      block.replace(/```\w*\n?/, '').replace(/```$/, '')
    );
    
    // Extract YAML/JSON content
    const yamlMatch = content.match(/```ya?ml([\s\S]*?)```/gi);
    if (yamlMatch) {
      sections.yaml = yamlMatch.map(match => 
        match.replace(/```ya?ml\n?/i, '').replace(/```$/, '')
      );
    }
    
    const jsonMatch = content.match(/```json([\s\S]*?)```/gi);
    if (jsonMatch) {
      sections.json = jsonMatch.map(match => 
        match.replace(/```json\n?/i, '').replace(/```$/, '')
      );
    }
    
    // Extract sections by headers
    const headerRegex = /#{1,6}\s*(.+)/g;
    let match;
    const headers = [];
    
    while ((match = headerRegex.exec(content)) !== null) {
      headers.push({
        title: match[1].trim(),
        index: match.index,
      });
    }
    
    // Extract content between headers
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const nextHeader = headers[i + 1];
      const sectionContent = content.substring(
        header.index,
        nextHeader ? nextHeader.index : content.length
      );
      
      const key = header.title.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 20);
      
      sections[key] = sectionContent.trim();
    }
    
    return sections;
  }

  /**
   * Generate cache key
   */
  generateCacheKey(type, requirements, options) {
    const hash = require('crypto')
      .createHash('md5')
      .update(JSON.stringify({ type, requirements, options }))
      .digest('hex');
    
    return `${type}:${hash}`;
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId) {
    return this.activeTasks.get(taskId) || null;
  }

  /**
   * Cancel task
   */
  cancelTask(taskId) {
    const task = this.activeTasks.get(taskId);
    if (task && task.status === 'processing') {
      task.status = 'cancelled';
      task.endTime = Date.now();
      this.metrics.activeTasks--;
      return true;
    }
    return false;
  }

  /**
   * Get service metrics
   */
  async getMetrics() {
    const cacheStats = await this.cache.getStats();
    
    return {
      ...this.metrics,
      averageProcessingTime: this.metrics.tasksProcessed > 0 
        ? this.metrics.totalProcessingTime / this.metrics.tasksProcessed 
        : 0,
      successRate: this.metrics.tasksProcessed > 0 
        ? this.metrics.tasksSucceeded / this.metrics.tasksProcessed 
        : 0,
      cacheHitRate: (this.metrics.cacheHits + this.metrics.cacheMisses) > 0 
        ? this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) 
        : 0,
      cache: cacheStats,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const checks = {
        service: 'healthy',
        cache: 'unknown',
        ai: 'unknown',
      };
      
      // Check cache
      if (config.cache.enabled) {
        try {
          await this.cache.healthCheck();
          checks.cache = 'healthy';
        } catch (error) {
          checks.cache = 'unhealthy';
        }
      } else {
        checks.cache = 'disabled';
      }
      
      // Check AI service
      if (this.openai) {
        checks.ai = 'healthy';
      } else {
        checks.ai = 'disabled';
      }
      
      const allHealthy = Object.values(checks).every(status => 
        status === 'healthy' || status === 'disabled'
      );
      
      return {
        status: allHealthy ? 'healthy' : 'degraded',
        checks,
        metrics: await this.getMetrics(),
        timestamp: new Date().toISOString(),
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Start queue processing
   */
  startQueueProcessing() {
    if (this.isProcessingQueue) return;
    
    this.isProcessingQueue = true;
    
    const processQueue = async () => {
      while (this.taskQueue.length > 0 && this.activeTasks.size < config.tasks.maxConcurrent) {
        const task = this.taskQueue.shift();
        try {
          await this.processQueuedTask(task);
        } catch (error) {
          logger.error('Queue task processing failed', {
            taskId: task.id,
            error: error.message,
          });
        }
      }
      
      setTimeout(processQueue, 1000);
    };
    
    processQueue();
  }

  /**
   * Process queued task
   */
  async processQueuedTask(task) {
    // Implementation would depend on task type
    logger.info('Processing queued task', { taskId: task.id, type: task.type });
  }
}

module.exports = { DevOpsService };