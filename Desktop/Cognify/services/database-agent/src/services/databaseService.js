/**
 * Database AI Service
 * Core service for AI-powered database development tasks
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');
const config = require('../config/config');
const { CacheService } = require('./cacheService');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');

class DatabaseService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.ai.apiKey,
      timeout: config.ai.timeout,
      maxRetries: config.ai.maxRetries,
    });
    
    this.cacheService = new CacheService();
    this.activeTasks = new Map();
    this.taskQueue = [];
    this.isProcessing = false;
    
    // Metrics
    this.metrics = {
      tasksProcessed: 0,
      tasksSucceeded: 0,
      tasksFailed: 0,
      totalProcessingTime: 0,
      activeConnections: 0,
      cacheHits: 0,
      cacheMisses: 0,
      aiRequestsCount: 0,
      aiRequestsTime: 0,
      errorCount: 0,
    };
    
    // Start task processor
    this.startTaskProcessor();
    
    logger.info('DatabaseService initialized', {
      supportedDatabases: config.database.supportedTypes,
      defaultDatabase: config.database.defaultType,
      cacheEnabled: config.cache.enabled,
      queueConcurrency: config.tasks.queueConcurrency,
    });
  }

  /**
   * Get service capabilities
   */
  getCapabilities() {
    return {
      databases: config.database.supportedTypes,
      features: {
        schemaGeneration: true,
        queryOptimization: true,
        indexRecommendations: true,
        migrationScripts: true,
        seedDataGeneration: true,
        performanceAnalysis: true,
        relationshipMapping: true,
        validationRules: true,
        backupStrategies: true,
        securityAudit: true,
      },
      orms: ['mongoose', 'sequelize', 'typeorm', 'prisma', 'knex'],
      codeStyles: ['standard', 'airbnb', 'google'],
      languages: ['javascript', 'typescript', 'python', 'java', 'csharp'],
    };
  }

  /**
   * Generate database schema
   */
  async generateSchema(requirements, options = {}) {
    const span = telemetryService.startSpan('database.generate_schema');
    const taskId = uuidv4();
    
    try {
      span.setAttributes({
        'task.id': taskId,
        'task.type': 'schema_generation',
        'database.type': options.databaseType || config.database.defaultType,
        'database.orm': options.orm || config.database.defaultORM,
        'options.include_indexes': options.includeIndexes !== false,
        'options.include_validation': options.includeValidation !== false,
      });
      
      logger.info('Schema generation started', {
        taskId,
        databaseType: options.databaseType,
        orm: options.orm,
        requirements: typeof requirements === 'string' ? requirements.substring(0, 100) : 'object',
      });
      
      // Check cache first
      const cacheKey = this.generateCacheKey('schema', requirements, options);
      const cachedResult = await this.cacheService.get(cacheKey);
      
      if (cachedResult) {
        this.metrics.cacheHits++;
        span.setAttributes({ 'cache.hit': true });
        logger.debug('Schema generation cache hit', { taskId, cacheKey });
        return cachedResult;
      }
      
      this.metrics.cacheMisses++;
      span.setAttributes({ 'cache.hit': false });
      
      // Create task
      const task = {
        id: taskId,
        type: 'schema_generation',
        status: 'pending',
        requirements,
        options: {
          databaseType: options.databaseType || config.database.defaultType,
          orm: options.orm || config.database.defaultORM,
          includeIndexes: options.includeIndexes !== false,
          includeValidation: options.includeValidation !== false,
          includeRelationships: options.includeRelationships !== false,
          includeSeedData: options.includeSeedData === true,
          includeQueries: options.includeQueries !== false,
          includeMigrations: options.includeMigrations !== false,
          codeStyle: options.codeStyle || config.database.codeStyle,
          useTypeScript: options.useTypeScript === true,
          optimizeQueries: options.optimizeQueries !== false,
          ...options,
        },
        createdAt: new Date(),
        userId: options.userId,
        sessionId: options.sessionId,
      };
      
      // Add to active tasks
      this.activeTasks.set(taskId, task);
      
      // Process immediately or queue
      if (this.activeTasks.size <= config.tasks.queueConcurrency) {
        const result = await this.processSchemaGeneration(task);
        
        // Cache the result
        await this.cacheService.set(cacheKey, result, config.cache.ttl);
        
        return result;
      } else {
        // Add to queue
        this.taskQueue.push(task);
        return {
          taskId,
          status: 'queued',
          message: 'Task queued for processing',
          estimatedWaitTime: this.taskQueue.length * 30, // seconds
        };
      }
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errorCount++;
      logger.error('Schema generation failed', {
        taskId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Optimize database queries
   */
  async optimizeQueries(queries, options = {}) {
    const span = telemetryService.startSpan('database.optimize_queries');
    const taskId = uuidv4();
    
    try {
      span.setAttributes({
        'task.id': taskId,
        'task.type': 'query_optimization',
        'database.type': options.databaseType || config.database.defaultType,
        'queries.count': Array.isArray(queries) ? queries.length : 1,
      });
      
      logger.info('Query optimization started', {
        taskId,
        databaseType: options.databaseType,
        queryCount: Array.isArray(queries) ? queries.length : 1,
      });
      
      const cacheKey = this.generateCacheKey('optimize', queries, options);
      const cachedResult = await this.cacheService.get(cacheKey);
      
      if (cachedResult) {
        this.metrics.cacheHits++;
        return cachedResult;
      }
      
      this.metrics.cacheMisses++;
      
      const task = {
        id: taskId,
        type: 'query_optimization',
        status: 'pending',
        queries,
        options: {
          databaseType: options.databaseType || config.database.defaultType,
          includeIndexRecommendations: options.includeIndexRecommendations !== false,
          includePerformanceMetrics: options.includePerformanceMetrics !== false,
          includeExplanations: options.includeExplanations !== false,
          ...options,
        },
        createdAt: new Date(),
        userId: options.userId,
        sessionId: options.sessionId,
      };
      
      this.activeTasks.set(taskId, task);
      
      const result = await this.processQueryOptimization(task);
      await this.cacheService.set(cacheKey, result, config.cache.ttl);
      
      return result;
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errorCount++;
      logger.error('Query optimization failed', {
        taskId,
        error: error.message,
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Generate migration scripts
   */
  async generateMigrations(fromSchema, toSchema, options = {}) {
    const span = telemetryService.startSpan('database.generate_migrations');
    const taskId = uuidv4();
    
    try {
      span.setAttributes({
        'task.id': taskId,
        'task.type': 'migration_generation',
        'database.type': options.databaseType || config.database.defaultType,
      });
      
      logger.info('Migration generation started', {
        taskId,
        databaseType: options.databaseType,
      });
      
      const task = {
        id: taskId,
        type: 'migration_generation',
        status: 'pending',
        fromSchema,
        toSchema,
        options: {
          databaseType: options.databaseType || config.database.defaultType,
          includeDataMigration: options.includeDataMigration === true,
          includeRollback: options.includeRollback !== false,
          safeMode: options.safeMode !== false,
          ...options,
        },
        createdAt: new Date(),
        userId: options.userId,
        sessionId: options.sessionId,
      };
      
      this.activeTasks.set(taskId, task);
      
      const result = await this.processMigrationGeneration(task);
      
      return result;
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errorCount++;
      logger.error('Migration generation failed', {
        taskId,
        error: error.message,
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Analyze database performance
   */
  async analyzePerformance(schema, queries, options = {}) {
    const span = telemetryService.startSpan('database.analyze_performance');
    const taskId = uuidv4();
    
    try {
      span.setAttributes({
        'task.id': taskId,
        'task.type': 'performance_analysis',
        'database.type': options.databaseType || config.database.defaultType,
      });
      
      const task = {
        id: taskId,
        type: 'performance_analysis',
        status: 'pending',
        schema,
        queries,
        options: {
          databaseType: options.databaseType || config.database.defaultType,
          includeIndexAnalysis: options.includeIndexAnalysis !== false,
          includeQueryPlan: options.includeQueryPlan !== false,
          includeBottlenecks: options.includeBottlenecks !== false,
          includeRecommendations: options.includeRecommendations !== false,
          ...options,
        },
        createdAt: new Date(),
        userId: options.userId,
        sessionId: options.sessionId,
      };
      
      this.activeTasks.set(taskId, task);
      
      const result = await this.processPerformanceAnalysis(task);
      
      return result;
      
    } catch (error) {
      span.recordException(error);
      this.metrics.errorCount++;
      logger.error('Performance analysis failed', {
        taskId,
        error: error.message,
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Process schema generation task
   */
  async processSchemaGeneration(task) {
    const startTime = Date.now();
    
    try {
      task.status = 'processing';
      task.startedAt = new Date();
      
      const prompt = this.buildSchemaPrompt(task.requirements, task.options);
      
      const aiStartTime = Date.now();
      const completion = await this.openai.chat.completions.create({
        model: config.ai.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt('schema_generation', task.options),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.ai.maxTokens,
        temperature: config.ai.temperature,
      });
      
      const aiDuration = Date.now() - aiStartTime;
      this.metrics.aiRequestsCount++;
      this.metrics.aiRequestsTime += aiDuration;
      
      const result = this.extractSchemaContent(completion.choices[0].message.content, task.options);
      
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;
      task.duration = Date.now() - startTime;
      
      this.metrics.tasksProcessed++;
      this.metrics.tasksSucceeded++;
      this.metrics.totalProcessingTime += task.duration;
      
      logger.info('Schema generation completed', {
        taskId: task.id,
        duration: task.duration,
        aiDuration,
        databaseType: task.options.databaseType,
      });
      
      return result;
      
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.completedAt = new Date();
      task.duration = Date.now() - startTime;
      
      this.metrics.tasksProcessed++;
      this.metrics.tasksFailed++;
      
      throw error;
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  /**
   * Process query optimization task
   */
  async processQueryOptimization(task) {
    const startTime = Date.now();
    
    try {
      task.status = 'processing';
      task.startedAt = new Date();
      
      const prompt = this.buildOptimizationPrompt(task.queries, task.options);
      
      const completion = await this.openai.chat.completions.create({
        model: config.ai.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt('query_optimization', task.options),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.ai.maxTokens,
        temperature: config.ai.temperature,
      });
      
      const result = this.extractOptimizationContent(completion.choices[0].message.content, task.options);
      
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;
      task.duration = Date.now() - startTime;
      
      this.metrics.tasksProcessed++;
      this.metrics.tasksSucceeded++;
      
      return result;
      
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.completedAt = new Date();
      task.duration = Date.now() - startTime;
      
      this.metrics.tasksFailed++;
      
      throw error;
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  /**
   * Process migration generation task
   */
  async processMigrationGeneration(task) {
    const startTime = Date.now();
    
    try {
      task.status = 'processing';
      task.startedAt = new Date();
      
      const prompt = this.buildMigrationPrompt(task.fromSchema, task.toSchema, task.options);
      
      const completion = await this.openai.chat.completions.create({
        model: config.ai.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt('migration_generation', task.options),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.ai.maxTokens,
        temperature: config.ai.temperature,
      });
      
      const result = this.extractMigrationContent(completion.choices[0].message.content, task.options);
      
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;
      task.duration = Date.now() - startTime;
      
      this.metrics.tasksProcessed++;
      this.metrics.tasksSucceeded++;
      
      return result;
      
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.completedAt = new Date();
      task.duration = Date.now() - startTime;
      
      this.metrics.tasksFailed++;
      
      throw error;
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  /**
   * Process performance analysis task
   */
  async processPerformanceAnalysis(task) {
    const startTime = Date.now();
    
    try {
      task.status = 'processing';
      task.startedAt = new Date();
      
      const prompt = this.buildPerformancePrompt(task.schema, task.queries, task.options);
      
      const completion = await this.openai.chat.completions.create({
        model: config.ai.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt('performance_analysis', task.options),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.ai.maxTokens,
        temperature: config.ai.temperature,
      });
      
      const result = this.extractPerformanceContent(completion.choices[0].message.content, task.options);
      
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;
      task.duration = Date.now() - startTime;
      
      this.metrics.tasksProcessed++;
      this.metrics.tasksSucceeded++;
      
      return result;
      
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.completedAt = new Date();
      task.duration = Date.now() - startTime;
      
      this.metrics.tasksFailed++;
      
      throw error;
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  /**
   * Build schema generation prompt
   */
  buildSchemaPrompt(requirements, options) {
    const { databaseType, orm, includeIndexes, includeValidation, includeRelationships } = options;
    
    return `Generate a ${databaseType} database schema with the following requirements:

${typeof requirements === 'string' ? requirements : JSON.stringify(requirements, null, 2)}

Configuration:
- Database: ${databaseType}
- ORM: ${orm}
- Include Indexes: ${includeIndexes}
- Include Validation: ${includeValidation}
- Include Relationships: ${includeRelationships}
- Code Style: ${options.codeStyle}
- TypeScript: ${options.useTypeScript}

Please provide:
1. Complete schema definition
2. Model/Entity files
3. Index definitions (if requested)
4. Validation rules (if requested)
5. Relationship mappings (if requested)
6. Sample queries
7. Performance considerations
8. Best practices recommendations`;
  }

  /**
   * Build optimization prompt
   */
  buildOptimizationPrompt(queries, options) {
    const queryText = Array.isArray(queries) ? queries.join('\n\n') : queries;
    
    return `Optimize the following ${options.databaseType} queries:

${queryText}

Please provide:
1. Optimized query versions
2. Index recommendations
3. Performance analysis
4. Execution plan insights
5. Bottleneck identification
6. Best practices recommendations`;
  }

  /**
   * Build migration prompt
   */
  buildMigrationPrompt(fromSchema, toSchema, options) {
    return `Generate migration scripts to transform the database schema:

From Schema:
${typeof fromSchema === 'string' ? fromSchema : JSON.stringify(fromSchema, null, 2)}

To Schema:
${typeof toSchema === 'string' ? toSchema : JSON.stringify(toSchema, null, 2)}

Configuration:
- Database: ${options.databaseType}
- Include Data Migration: ${options.includeDataMigration}
- Include Rollback: ${options.includeRollback}
- Safe Mode: ${options.safeMode}

Please provide:
1. Forward migration scripts
2. Rollback scripts (if requested)
3. Data migration scripts (if requested)
4. Safety checks and validations
5. Execution order and dependencies
6. Risk assessment and recommendations`;
  }

  /**
   * Build performance analysis prompt
   */
  buildPerformancePrompt(schema, queries, options) {
    const schemaText = typeof schema === 'string' ? schema : JSON.stringify(schema, null, 2);
    const queryText = Array.isArray(queries) ? queries.join('\n\n') : queries;
    
    return `Analyze the performance of this ${options.databaseType} database:

Schema:
${schemaText}

Queries:
${queryText}

Please provide:
1. Performance bottleneck analysis
2. Index optimization recommendations
3. Query execution plan analysis
4. Schema design improvements
5. Caching strategies
6. Scaling recommendations
7. Monitoring suggestions`;
  }

  /**
   * Get system prompt for different task types
   */
  getSystemPrompt(taskType, options) {
    const basePrompt = `You are an expert database architect and performance optimization specialist. You have deep knowledge of ${options.databaseType} and modern database design patterns.`;
    
    const taskPrompts = {
      schema_generation: `${basePrompt} Generate production-ready database schemas with proper indexing, validation, and relationships. Focus on scalability, performance, and maintainability.`,
      query_optimization: `${basePrompt} Analyze and optimize database queries for maximum performance. Provide detailed explanations and actionable recommendations.`,
      migration_generation: `${basePrompt} Create safe and efficient database migration scripts. Prioritize data integrity and minimize downtime.`,
      performance_analysis: `${basePrompt} Conduct comprehensive performance analysis and provide actionable optimization strategies.`,
    };
    
    return taskPrompts[taskType] || basePrompt;
  }

  /**
   * Extract schema content from AI response
   */
  extractSchemaContent(content, options) {
    // This would contain logic to parse and structure the AI response
    // For now, returning a structured format
    return {
      schema: content,
      databaseType: options.databaseType,
      orm: options.orm,
      files: this.extractCodeBlocks(content),
      recommendations: this.extractRecommendations(content),
      metadata: {
        generatedAt: new Date(),
        options,
      },
    };
  }

  /**
   * Extract optimization content from AI response
   */
  extractOptimizationContent(content, options) {
    return {
      optimizedQueries: this.extractCodeBlocks(content),
      indexRecommendations: this.extractIndexes(content),
      performanceAnalysis: this.extractPerformanceMetrics(content),
      recommendations: this.extractRecommendations(content),
      metadata: {
        generatedAt: new Date(),
        options,
      },
    };
  }

  /**
   * Extract migration content from AI response
   */
  extractMigrationContent(content, options) {
    return {
      migrations: this.extractCodeBlocks(content),
      rollbacks: this.extractRollbacks(content),
      dataScripts: this.extractDataMigrations(content),
      safetyChecks: this.extractSafetyChecks(content),
      recommendations: this.extractRecommendations(content),
      metadata: {
        generatedAt: new Date(),
        options,
      },
    };
  }

  /**
   * Extract performance content from AI response
   */
  extractPerformanceContent(content, options) {
    return {
      analysis: content,
      bottlenecks: this.extractBottlenecks(content),
      indexRecommendations: this.extractIndexes(content),
      optimizations: this.extractOptimizations(content),
      recommendations: this.extractRecommendations(content),
      metadata: {
        generatedAt: new Date(),
        options,
      },
    };
  }

  /**
   * Helper methods for content extraction
   */
  extractCodeBlocks(content) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;
    
    while ((match = codeBlockRegex.exec(content)) !== null) {
      blocks.push({
        language: match[1] || 'text',
        code: match[2].trim(),
      });
    }
    
    return blocks;
  }

  extractRecommendations(content) {
    // Extract recommendation sections
    const recommendations = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.toLowerCase().includes('recommendation') || 
          line.toLowerCase().includes('best practice') ||
          line.toLowerCase().includes('suggestion')) {
        recommendations.push(line);
      }
    }
    
    return recommendations;
  }

  extractIndexes(content) {
    // Extract index recommendations
    const indexRegex = /CREATE INDEX|CREATE UNIQUE INDEX|db\.\w+\.createIndex/gi;
    const matches = content.match(indexRegex) || [];
    return matches;
  }

  extractPerformanceMetrics(content) {
    // Extract performance-related information
    const metrics = {};
    
    // This would contain more sophisticated parsing logic
    if (content.includes('execution time')) {
      metrics.executionTime = 'analyzed';
    }
    if (content.includes('memory usage')) {
      metrics.memoryUsage = 'analyzed';
    }
    
    return metrics;
  }

  extractBottlenecks(content) {
    const bottlenecks = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (line.toLowerCase().includes('bottleneck') ||
          line.toLowerCase().includes('slow') ||
          line.toLowerCase().includes('performance issue')) {
        bottlenecks.push(line.trim());
      }
    }
    
    return bottlenecks;
  }

  extractOptimizations(content) {
    const optimizations = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (line.toLowerCase().includes('optimize') ||
          line.toLowerCase().includes('improve') ||
          line.toLowerCase().includes('enhance')) {
        optimizations.push(line.trim());
      }
    }
    
    return optimizations;
  }

  extractRollbacks(content) {
    return this.extractCodeBlocks(content).filter(block => 
      block.code.toLowerCase().includes('rollback') ||
      block.code.toLowerCase().includes('down') ||
      block.code.toLowerCase().includes('revert')
    );
  }

  extractDataMigrations(content) {
    return this.extractCodeBlocks(content).filter(block => 
      block.code.toLowerCase().includes('data') ||
      block.code.toLowerCase().includes('insert') ||
      block.code.toLowerCase().includes('update')
    );
  }

  extractSafetyChecks(content) {
    const checks = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (line.toLowerCase().includes('check') ||
          line.toLowerCase().includes('validate') ||
          line.toLowerCase().includes('verify')) {
        checks.push(line.trim());
      }
    }
    
    return checks;
  }

  /**
   * Generate cache key
   */
  generateCacheKey(operation, data, options) {
    const hash = require('crypto')
      .createHash('md5')
      .update(JSON.stringify({ operation, data, options }))
      .digest('hex');
    return `${operation}:${hash}`;
  }

  /**
   * Start task processor
   */
  startTaskProcessor() {
    setInterval(() => {
      if (!this.isProcessing && this.taskQueue.length > 0) {
        this.processQueue();
      }
    }, 1000);
  }

  /**
   * Process task queue
   */
  async processQueue() {
    if (this.isProcessing || this.taskQueue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      while (this.taskQueue.length > 0 && this.activeTasks.size < config.tasks.queueConcurrency) {
        const task = this.taskQueue.shift();
        
        // Process task based on type
        switch (task.type) {
          case 'schema_generation':
            this.processSchemaGeneration(task).catch(error => {
              logger.error('Queued schema generation failed', {
                taskId: task.id,
                error: error.message,
              });
            });
            break;
          case 'query_optimization':
            this.processQueryOptimization(task).catch(error => {
              logger.error('Queued query optimization failed', {
                taskId: task.id,
                error: error.message,
              });
            });
            break;
          case 'migration_generation':
            this.processMigrationGeneration(task).catch(error => {
              logger.error('Queued migration generation failed', {
                taskId: task.id,
                error: error.message,
              });
            });
            break;
          case 'performance_analysis':
            this.processPerformanceAnalysis(task).catch(error => {
              logger.error('Queued performance analysis failed', {
                taskId: task.id,
                error: error.message,
              });
            });
            break;
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get service metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeTasks: this.activeTasks.size,
      queuedTasks: this.taskQueue.length,
      averageProcessingTime: this.metrics.tasksProcessed > 0 ? 
        this.metrics.totalProcessingTime / this.metrics.tasksProcessed : 0,
      successRate: this.metrics.tasksProcessed > 0 ? 
        (this.metrics.tasksSucceeded / this.metrics.tasksProcessed) * 100 : 0,
      averageAiRequestTime: this.metrics.aiRequestsCount > 0 ? 
        this.metrics.aiRequestsTime / this.metrics.aiRequestsCount : 0,
      cacheHitRate: (this.metrics.cacheHits + this.metrics.cacheMisses) > 0 ? 
        (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100 : 0,
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Check OpenAI connectivity
      await this.openai.models.list();
      
      // Check cache service
      await this.cacheService.healthCheck();
      
      return true;
    } catch (error) {
      logger.error('Database service health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Get task by ID
   */
  getTask(taskId) {
    return this.activeTasks.get(taskId) || null;
  }

  /**
   * Cancel task
   */
  cancelTask(taskId) {
    const task = this.activeTasks.get(taskId);
    if (task && ['pending', 'processing'].includes(task.status)) {
      task.status = 'cancelled';
      task.cancelledAt = new Date();
      this.activeTasks.delete(taskId);
      
      // Remove from queue if present
      const queueIndex = this.taskQueue.findIndex(t => t.id === taskId);
      if (queueIndex !== -1) {
        this.taskQueue.splice(queueIndex, 1);
      }
      
      return task;
    }
    return null;
  }
}

module.exports = { DatabaseService };