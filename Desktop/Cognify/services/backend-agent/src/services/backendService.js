/**
 * Backend AI Agent Service
 * Handles AI-powered backend development tasks including API generation,
 * database schema design, authentication, testing, and optimization
 */

'use strict';

const OpenAI = require('openai');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const sanitizeHtml = require('sanitize-html');
const xss = require('xss');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');
const { tracer, meter } = require('../utils/telemetry');
const CacheService = require('./cacheService');

class BackendService extends EventEmitter {
  constructor() {
    super();
    
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
      organization: config.openai.organization,
      timeout: config.openai.timeout,
      maxRetries: config.openai.maxRetries,
    });
    
    this.cache = new CacheService();
    this.activeTasks = new Map();
    this.taskQueue = [];
    this.isProcessing = false;
    
    // Metrics
    this.metrics = {
      tasksProcessed: meter.createCounter({
        name: 'backend_tasks_processed_total',
        description: 'Total number of backend tasks processed',
      }),
      taskDuration: meter.createHistogram({
        name: 'backend_task_duration_seconds',
        description: 'Duration of backend task processing',
        boundaries: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      }),
      activeConnections: meter.createUpDownCounter({
        name: 'backend_active_connections',
        description: 'Number of active backend connections',
      }),
      cacheHits: meter.createCounter({
        name: 'backend_cache_hits_total',
        description: 'Total number of cache hits',
      }),
      cacheMisses: meter.createCounter({
        name: 'backend_cache_misses_total',
        description: 'Total number of cache misses',
      }),
      errors: meter.createCounter({
        name: 'backend_errors_total',
        description: 'Total number of backend errors',
      }),
    };
    
    // Supported frameworks and their configurations
    this.frameworks = {
      express: {
        name: 'Express.js',
        dependencies: ['express', 'cors', 'helmet', 'morgan', 'compression'],
        devDependencies: ['nodemon', 'jest', 'supertest'],
        templates: {
          basic: 'express-basic-api',
          auth: 'express-auth-api',
          crud: 'express-crud-api',
          microservice: 'express-microservice',
        },
      },
      fastify: {
        name: 'Fastify',
        dependencies: ['fastify', '@fastify/cors', '@fastify/helmet', '@fastify/compress'],
        devDependencies: ['nodemon', 'jest', 'tap'],
        templates: {
          basic: 'fastify-basic-api',
          auth: 'fastify-auth-api',
          crud: 'fastify-crud-api',
          microservice: 'fastify-microservice',
        },
      },
      koa: {
        name: 'Koa.js',
        dependencies: ['koa', '@koa/cors', 'koa-helmet', 'koa-compress', 'koa-router'],
        devDependencies: ['nodemon', 'jest', 'supertest'],
        templates: {
          basic: 'koa-basic-api',
          auth: 'koa-auth-api',
          crud: 'koa-crud-api',
          microservice: 'koa-microservice',
        },
      },
      nestjs: {
        name: 'NestJS',
        dependencies: ['@nestjs/core', '@nestjs/common', '@nestjs/platform-express'],
        devDependencies: ['@nestjs/cli', '@nestjs/testing', 'jest'],
        templates: {
          basic: 'nestjs-basic-api',
          auth: 'nestjs-auth-api',
          crud: 'nestjs-crud-api',
          microservice: 'nestjs-microservice',
        },
      },
    };
    
    // Database configurations
    this.databases = {
      mongodb: {
        name: 'MongoDB',
        dependencies: ['mongoose'],
        connectionString: 'mongodb://localhost:27017/',
      },
      postgresql: {
        name: 'PostgreSQL',
        dependencies: ['pg', 'sequelize'],
        connectionString: 'postgresql://localhost:5432/',
      },
      mysql: {
        name: 'MySQL',
        dependencies: ['mysql2', 'sequelize'],
        connectionString: 'mysql://localhost:3306/',
      },
      redis: {
        name: 'Redis',
        dependencies: ['redis', 'ioredis'],
        connectionString: 'redis://localhost:6379',
      },
    };
    
    this.setupEventHandlers();
    this.startTaskProcessor();
    
    logger.info('Backend AI Agent Service initialized', {
      supportedFrameworks: Object.keys(this.frameworks),
      supportedDatabases: Object.keys(this.databases),
    });
  }
  
  setupEventHandlers() {
    this.on('task:created', (task) => {
      logger.info('Backend task created', { taskId: task.id, type: task.type });
      this.metrics.tasksProcessed.add(1, { type: task.type, status: 'created' });
    });
    
    this.on('task:completed', (task) => {
      logger.info('Backend task completed', { taskId: task.id, type: task.type });
      this.metrics.tasksProcessed.add(1, { type: task.type, status: 'completed' });
    });
    
    this.on('task:failed', (task, error) => {
      logger.error('Backend task failed', { taskId: task.id, type: task.type, error: error.message });
      this.metrics.tasksProcessed.add(1, { type: task.type, status: 'failed' });
      this.metrics.errors.add(1, { type: task.type, error: error.name });
    });
  }
  
  async startTaskProcessor() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    while (this.isProcessing) {
      if (this.taskQueue.length > 0 && this.activeTasks.size < config.tasks.maxConcurrent) {
        const task = this.taskQueue.shift();
        this.processTask(task).catch(error => {
          logger.error('Task processing error', { taskId: task.id, error: error.message });
          this.emit('task:failed', task, error);
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  async processTask(task) {
    const span = tracer.startSpan(`backend.process_task.${task.type}`);
    const startTime = Date.now();
    
    try {
      this.activeTasks.set(task.id, task);
      
      span.setAttributes({
        'task.id': task.id,
        'task.type': task.type,
        'task.framework': task.framework || 'unknown',
        'task.language': task.language || 'unknown',
      });
      
      let result;
      
      switch (task.type) {
        case 'api_generation':
          result = await this.generateAPI(task.data);
          break;
        case 'database_schema':
          result = await this.generateDatabaseSchema(task.data);
          break;
        case 'authentication':
          result = await this.generateAuthentication(task.data);
          break;
        case 'middleware':
          result = await this.generateMiddleware(task.data);
          break;
        case 'testing':
          result = await this.generateTests(task.data);
          break;
        case 'optimization':
          result = await this.optimizeCode(task.data);
          break;
        case 'documentation':
          result = await this.generateDocumentation(task.data);
          break;
        case 'deployment':
          result = await this.generateDeploymentConfig(task.data);
          break;
        default:
          throw new Error(`Unsupported task type: ${task.type}`);
      }
      
      task.result = result;
      task.status = 'completed';
      task.completedAt = new Date();
      
      this.emit('task:completed', task);
      
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.taskDuration.record(duration, {
        type: task.type,
        framework: task.framework || 'unknown',
        status: 'success',
      });
      
      span.setStatus({ code: 1 }); // OK
      
      return result;
      
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.failedAt = new Date();
      
      this.emit('task:failed', task, error);
      
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.taskDuration.record(duration, {
        type: task.type,
        framework: task.framework || 'unknown',
        status: 'error',
      });
      
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message }); // ERROR
      
      throw error;
      
    } finally {
      this.activeTasks.delete(task.id);
      span.end();
    }
  }
  
  async generateAPI(data) {
    const span = tracer.startSpan('backend.generate_api');
    
    try {
      const {
        framework = 'express',
        language = 'javascript',
        apiType = 'rest',
        endpoints = [],
        authentication = false,
        database = null,
        middleware = [],
        documentation = true,
      } = data;
      
      // Validate framework
      if (!this.frameworks[framework]) {
        throw new Error(`Unsupported framework: ${framework}`);
      }
      
      // Check cache
      const cacheKey = `api:${framework}:${language}:${JSON.stringify(endpoints)}`;
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.metrics.cacheHits.add(1, { type: 'api_generation' });
        return cached;
      }
      
      this.metrics.cacheMisses.add(1, { type: 'api_generation' });
      
      const prompt = this.buildAPIPrompt({
        framework,
        language,
        apiType,
        endpoints,
        authentication,
        database,
        middleware,
        documentation,
      });
      
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert backend developer specializing in API development. Generate clean, production-ready code with proper error handling, validation, and security practices.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
        top_p: config.openai.topP,
        frequency_penalty: config.openai.frequencyPenalty,
        presence_penalty: config.openai.presencePenalty,
      });
      
      const generatedCode = response.choices[0].message.content;
      
      const result = {
        code: generatedCode,
        framework,
        language,
        apiType,
        endpoints,
        dependencies: this.frameworks[framework].dependencies,
        devDependencies: this.frameworks[framework].devDependencies,
        files: this.parseGeneratedFiles(generatedCode),
        documentation: documentation ? this.extractDocumentation(generatedCode) : null,
        timestamp: new Date(),
      };
      
      // Cache result
      await this.cache.set(cacheKey, result, config.cache.ttl);
      
      span.setAttributes({
        'api.framework': framework,
        'api.language': language,
        'api.endpoints_count': endpoints.length,
        'api.has_auth': authentication,
        'api.has_database': !!database,
      });
      
      return result;
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }
  
  async generateDatabaseSchema(data) {
    const span = tracer.startSpan('backend.generate_database_schema');
    
    try {
      const {
        database = 'mongodb',
        entities = [],
        relationships = [],
        indexes = [],
        constraints = [],
        migrations = true,
      } = data;
      
      // Validate database
      if (!this.databases[database]) {
        throw new Error(`Unsupported database: ${database}`);
      }
      
      const cacheKey = `schema:${database}:${JSON.stringify(entities)}`;
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.metrics.cacheHits.add(1, { type: 'database_schema' });
        return cached;
      }
      
      this.metrics.cacheMisses.add(1, { type: 'database_schema' });
      
      const prompt = this.buildSchemaPrompt({
        database,
        entities,
        relationships,
        indexes,
        constraints,
        migrations,
      });
      
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert database architect. Generate optimized database schemas with proper indexing, relationships, and data integrity constraints.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      });
      
      const generatedSchema = response.choices[0].message.content;
      
      const result = {
        schema: generatedSchema,
        database,
        entities,
        relationships,
        indexes,
        constraints,
        dependencies: this.databases[database].dependencies,
        migrations: migrations ? this.extractMigrations(generatedSchema) : null,
        models: this.extractModels(generatedSchema),
        timestamp: new Date(),
      };
      
      await this.cache.set(cacheKey, result, config.cache.ttl);
      
      span.setAttributes({
        'schema.database': database,
        'schema.entities_count': entities.length,
        'schema.relationships_count': relationships.length,
        'schema.has_migrations': migrations,
      });
      
      return result;
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }
  
  async generateAuthentication(data) {
    const span = tracer.startSpan('backend.generate_authentication');
    
    try {
      const {
        framework = 'express',
        authType = 'jwt',
        providers = ['local'],
        features = ['login', 'register', 'logout'],
        security = ['bcrypt', 'helmet', 'rateLimit'],
      } = data;
      
      const cacheKey = `auth:${framework}:${authType}:${providers.join(',')}`;
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.metrics.cacheHits.add(1, { type: 'authentication' });
        return cached;
      }
      
      this.metrics.cacheMisses.add(1, { type: 'authentication' });
      
      const prompt = this.buildAuthPrompt({
        framework,
        authType,
        providers,
        features,
        security,
      });
      
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are a security expert specializing in authentication systems. Generate secure, production-ready authentication code with proper password hashing, token management, and security best practices.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      });
      
      const generatedAuth = response.choices[0].message.content;
      
      const result = {
        code: generatedAuth,
        framework,
        authType,
        providers,
        features,
        security,
        middleware: this.extractMiddleware(generatedAuth),
        routes: this.extractRoutes(generatedAuth),
        models: this.extractModels(generatedAuth),
        dependencies: this.extractDependencies(generatedAuth),
        timestamp: new Date(),
      };
      
      await this.cache.set(cacheKey, result, config.cache.ttl);
      
      span.setAttributes({
        'auth.framework': framework,
        'auth.type': authType,
        'auth.providers_count': providers.length,
        'auth.features_count': features.length,
      });
      
      return result;
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }
  
  async generateMiddleware(data) {
    const span = tracer.startSpan('backend.generate_middleware');
    
    try {
      const {
        framework = 'express',
        type = 'custom',
        purpose = '',
        features = [],
      } = data;
      
      const cacheKey = `middleware:${framework}:${type}:${purpose}`;
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.metrics.cacheHits.add(1, { type: 'middleware' });
        return cached;
      }
      
      this.metrics.cacheMisses.add(1, { type: 'middleware' });
      
      const prompt = this.buildMiddlewarePrompt({
        framework,
        type,
        purpose,
        features,
      });
      
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert in middleware development. Generate efficient, reusable middleware with proper error handling and performance considerations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      });
      
      const generatedMiddleware = response.choices[0].message.content;
      
      const result = {
        code: generatedMiddleware,
        framework,
        type,
        purpose,
        features,
        usage: this.extractUsageExamples(generatedMiddleware),
        dependencies: this.extractDependencies(generatedMiddleware),
        timestamp: new Date(),
      };
      
      await this.cache.set(cacheKey, result, config.cache.ttl);
      
      return result;
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }
  
  async generateTests(data) {
    const span = tracer.startSpan('backend.generate_tests');
    
    try {
      const {
        framework = 'express',
        testFramework = 'jest',
        testType = 'unit',
        coverage = 80,
        codeToTest = '',
      } = data;
      
      const cacheKey = `tests:${framework}:${testFramework}:${testType}:${codeToTest.slice(0, 100)}`;
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.metrics.cacheHits.add(1, { type: 'testing' });
        return cached;
      }
      
      this.metrics.cacheMisses.add(1, { type: 'testing' });
      
      const prompt = this.buildTestPrompt({
        framework,
        testFramework,
        testType,
        coverage,
        codeToTest,
      });
      
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are a testing expert. Generate comprehensive test suites with good coverage, edge cases, and clear assertions.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      });
      
      const generatedTests = response.choices[0].message.content;
      
      const result = {
        tests: generatedTests,
        framework,
        testFramework,
        testType,
        coverage,
        testFiles: this.extractTestFiles(generatedTests),
        dependencies: this.extractTestDependencies(testFramework),
        scripts: this.generateTestScripts(testFramework),
        timestamp: new Date(),
      };
      
      await this.cache.set(cacheKey, result, config.cache.ttl);
      
      return result;
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }
  
  async optimizeCode(data) {
    const span = tracer.startSpan('backend.optimize_code');
    
    try {
      const {
        code = '',
        framework = 'express',
        optimizationType = 'performance',
        metrics = [],
      } = data;
      
      const cacheKey = `optimize:${optimizationType}:${code.slice(0, 100)}`;
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.metrics.cacheHits.add(1, { type: 'optimization' });
        return cached;
      }
      
      this.metrics.cacheMisses.add(1, { type: 'optimization' });
      
      const prompt = this.buildOptimizationPrompt({
        code,
        framework,
        optimizationType,
        metrics,
      });
      
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are a performance optimization expert. Analyze code and provide specific, actionable optimizations with explanations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      });
      
      const optimization = response.choices[0].message.content;
      
      const result = {
        originalCode: code,
        optimizedCode: this.extractOptimizedCode(optimization),
        suggestions: this.extractSuggestions(optimization),
        metrics: this.extractMetrics(optimization),
        framework,
        optimizationType,
        timestamp: new Date(),
      };
      
      await this.cache.set(cacheKey, result, config.cache.ttl);
      
      return result;
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }
  
  async generateDocumentation(data) {
    const span = tracer.startSpan('backend.generate_documentation');
    
    try {
      const {
        code = '',
        framework = 'express',
        docType = 'api',
        format = 'markdown',
      } = data;
      
      const cacheKey = `docs:${docType}:${format}:${code.slice(0, 100)}`;
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.metrics.cacheHits.add(1, { type: 'documentation' });
        return cached;
      }
      
      this.metrics.cacheMisses.add(1, { type: 'documentation' });
      
      const prompt = this.buildDocumentationPrompt({
        code,
        framework,
        docType,
        format,
      });
      
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are a technical documentation expert. Generate clear, comprehensive documentation with examples and best practices.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      });
      
      const documentation = response.choices[0].message.content;
      
      const result = {
        documentation,
        framework,
        docType,
        format,
        sections: this.extractDocumentationSections(documentation),
        timestamp: new Date(),
      };
      
      await this.cache.set(cacheKey, result, config.cache.ttl);
      
      return result;
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }
  
  async generateDeploymentConfig(data) {
    const span = tracer.startSpan('backend.generate_deployment');
    
    try {
      const {
        platform = 'docker',
        framework = 'express',
        environment = 'production',
        features = [],
      } = data;
      
      const cacheKey = `deploy:${platform}:${framework}:${environment}`;
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        this.metrics.cacheHits.add(1, { type: 'deployment' });
        return cached;
      }
      
      this.metrics.cacheMisses.add(1, { type: 'deployment' });
      
      const prompt = this.buildDeploymentPrompt({
        platform,
        framework,
        environment,
        features,
      });
      
      const response = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are a DevOps expert. Generate production-ready deployment configurations with security, scalability, and monitoring considerations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      });
      
      const deploymentConfig = response.choices[0].message.content;
      
      const result = {
        config: deploymentConfig,
        platform,
        framework,
        environment,
        features,
        files: this.extractDeploymentFiles(deploymentConfig),
        scripts: this.extractDeploymentScripts(deploymentConfig),
        timestamp: new Date(),
      };
      
      await this.cache.set(cacheKey, result, config.cache.ttl);
      
      return result;
      
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }
  
  // Helper methods for building prompts
  buildAPIPrompt(data) {
    const { framework, language, apiType, endpoints, authentication, database, middleware, documentation } = data;
    
    return `Generate a ${framework} ${apiType.toUpperCase()} API in ${language} with the following requirements:

Endpoints:
${endpoints.map(ep => `- ${ep.method} ${ep.path}: ${ep.description}`).join('\n')}

${authentication ? 'Include authentication middleware and protected routes.' : ''}
${database ? `Use ${database} for data persistence.` : ''}
${middleware.length > 0 ? `Include middleware: ${middleware.join(', ')}` : ''}
${documentation ? 'Include Swagger/OpenAPI documentation.' : ''}

Generate clean, production-ready code with proper error handling, validation, and security practices.`;
  }
  
  buildSchemaPrompt(data) {
    const { database, entities, relationships, indexes, constraints, migrations } = data;
    
    return `Generate a ${database} database schema with the following requirements:

Entities:
${entities.map(entity => `- ${entity.name}: ${entity.fields.map(f => `${f.name} (${f.type})`).join(', ')}`).join('\n')}

Relationships:
${relationships.map(rel => `- ${rel.from} ${rel.type} ${rel.to}`).join('\n')}

${indexes.length > 0 ? `Indexes: ${indexes.join(', ')}` : ''}
${constraints.length > 0 ? `Constraints: ${constraints.join(', ')}` : ''}
${migrations ? 'Include migration scripts.' : ''}

Generate optimized schema with proper indexing and data integrity.`;
  }
  
  buildAuthPrompt(data) {
    const { framework, authType, providers, features, security } = data;
    
    return `Generate ${authType} authentication system for ${framework} with:

Providers: ${providers.join(', ')}
Features: ${features.join(', ')}
Security: ${security.join(', ')}

Include middleware, routes, models, and security best practices.`;
  }
  
  buildMiddlewarePrompt(data) {
    const { framework, type, purpose, features } = data;
    
    return `Generate ${type} middleware for ${framework} that ${purpose}.

Features: ${features.join(', ')}

Include proper error handling and performance considerations.`;
  }
  
  buildTestPrompt(data) {
    const { framework, testFramework, testType, coverage, codeToTest } = data;
    
    return `Generate ${testType} tests using ${testFramework} for this ${framework} code:

\`\`\`javascript
${codeToTest}
\`\`\`

Target coverage: ${coverage}%
Include edge cases and proper assertions.`;
  }
  
  buildOptimizationPrompt(data) {
    const { code, framework, optimizationType, metrics } = data;
    
    return `Optimize this ${framework} code for ${optimizationType}:

\`\`\`javascript
${code}
\`\`\`

${metrics.length > 0 ? `Focus on: ${metrics.join(', ')}` : ''}

Provide optimized code with explanations.`;
  }
  
  buildDocumentationPrompt(data) {
    const { code, framework, docType, format } = data;
    
    return `Generate ${docType} documentation in ${format} format for this ${framework} code:

\`\`\`javascript
${code}
\`\`\`

Include examples and best practices.`;
  }
  
  buildDeploymentPrompt(data) {
    const { platform, framework, environment, features } = data;
    
    return `Generate ${platform} deployment configuration for ${framework} application in ${environment} environment.

Features: ${features.join(', ')}

Include security, scalability, and monitoring configurations.`;
  }
  
  // Helper methods for parsing generated content
  parseGeneratedFiles(content) {
    // Extract file blocks from generated content
    const fileRegex = /```(?:javascript|typescript|json)\s*\/\/ (.*?)\n([\s\S]*?)```/g;
    const files = [];
    let match;
    
    while ((match = fileRegex.exec(content)) !== null) {
      files.push({
        path: match[1],
        content: match[2].trim(),
      });
    }
    
    return files;
  }
  
  extractDocumentation(content) {
    // Extract documentation sections
    const docRegex = /## Documentation\s*([\s\S]*?)(?=##|$)/;
    const match = content.match(docRegex);
    return match ? match[1].trim() : null;
  }
  
  extractMigrations(content) {
    // Extract migration scripts
    const migrationRegex = /```sql\s*-- Migration: (.*?)\n([\s\S]*?)```/g;
    const migrations = [];
    let match;
    
    while ((match = migrationRegex.exec(content)) !== null) {
      migrations.push({
        name: match[1],
        sql: match[2].trim(),
      });
    }
    
    return migrations;
  }
  
  extractModels(content) {
    // Extract model definitions
    const modelRegex = /class (\w+)\s*{[\s\S]*?}/g;
    const models = [];
    let match;
    
    while ((match = modelRegex.exec(content)) !== null) {
      models.push({
        name: match[1],
        definition: match[0],
      });
    }
    
    return models;
  }
  
  extractMiddleware(content) {
    // Extract middleware functions
    const middlewareRegex = /(?:const|function)\s+(\w+)\s*=?\s*\([^)]*\)\s*=>?\s*{[\s\S]*?}/g;
    const middleware = [];
    let match;
    
    while ((match = middlewareRegex.exec(content)) !== null) {
      middleware.push({
        name: match[1],
        code: match[0],
      });
    }
    
    return middleware;
  }
  
  extractRoutes(content) {
    // Extract route definitions
    const routeRegex = /(?:app|router)\.(get|post|put|delete|patch)\s*\(['"`]([^'"`)]+)['"`]/g;
    const routes = [];
    let match;
    
    while ((match = routeRegex.exec(content)) !== null) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
      });
    }
    
    return routes;
  }
  
  extractDependencies(content) {
    // Extract require/import statements
    const depRegex = /(?:require|import)\s*\(['"`]([^'"`)]+)['"`]\)|from\s+['"`]([^'"`)]+)['"`]/g;
    const dependencies = new Set();
    let match;
    
    while ((match = depRegex.exec(content)) !== null) {
      const dep = match[1] || match[2];
      if (dep && !dep.startsWith('.') && !dep.startsWith('/')) {
        dependencies.add(dep);
      }
    }
    
    return Array.from(dependencies);
  }
  
  extractUsageExamples(content) {
    // Extract usage examples from comments
    const exampleRegex = /\/\*\*[\s\S]*?@example[\s\S]*?\*\//g;
    const examples = [];
    let match;
    
    while ((match = exampleRegex.exec(content)) !== null) {
      examples.push(match[0]);
    }
    
    return examples;
  }
  
  extractTestFiles(content) {
    // Extract test file blocks
    return this.parseGeneratedFiles(content).filter(file => 
      file.path.includes('.test.') || file.path.includes('.spec.')
    );
  }
  
  extractTestDependencies(testFramework) {
    const testDeps = {
      jest: ['jest', '@types/jest'],
      mocha: ['mocha', 'chai', 'sinon'],
      tap: ['tap'],
      ava: ['ava'],
    };
    
    return testDeps[testFramework] || ['jest'];
  }
  
  generateTestScripts(testFramework) {
    const scripts = {
      jest: {
        test: 'jest',
        'test:watch': 'jest --watch',
        'test:coverage': 'jest --coverage',
      },
      mocha: {
        test: 'mocha',
        'test:watch': 'mocha --watch',
        'test:coverage': 'nyc mocha',
      },
    };
    
    return scripts[testFramework] || scripts.jest;
  }
  
  extractOptimizedCode(content) {
    // Extract optimized code blocks
    const codeRegex = /```(?:javascript|typescript)\s*\/\/ Optimized[\s\S]*?([\s\S]*?)```/;
    const match = content.match(codeRegex);
    return match ? match[1].trim() : content;
  }
  
  extractSuggestions(content) {
    // Extract optimization suggestions
    const suggestionRegex = /(?:Suggestion|Optimization):\s*([^\n]+)/g;
    const suggestions = [];
    let match;
    
    while ((match = suggestionRegex.exec(content)) !== null) {
      suggestions.push(match[1].trim());
    }
    
    return suggestions;
  }
  
  extractMetrics(content) {
    // Extract performance metrics
    const metricRegex = /(\w+):\s*([\d.]+)\s*(ms|%|MB|KB)/g;
    const metrics = {};
    let match;
    
    while ((match = metricRegex.exec(content)) !== null) {
      metrics[match[1]] = {
        value: parseFloat(match[2]),
        unit: match[3],
      };
    }
    
    return metrics;
  }
  
  extractDocumentationSections(content) {
    // Extract documentation sections
    const sectionRegex = /##\s+([^\n]+)\n([\s\S]*?)(?=##|$)/g;
    const sections = [];
    let match;
    
    while ((match = sectionRegex.exec(content)) !== null) {
      sections.push({
        title: match[1].trim(),
        content: match[2].trim(),
      });
    }
    
    return sections;
  }
  
  extractDeploymentFiles(content) {
    // Extract deployment configuration files
    return this.parseGeneratedFiles(content).filter(file => 
      file.path.includes('Dockerfile') || 
      file.path.includes('docker-compose') ||
      file.path.includes('.yml') ||
      file.path.includes('.yaml')
    );
  }
  
  extractDeploymentScripts(content) {
    // Extract deployment scripts
    const scriptRegex = /```(?:bash|sh)\s*# (.*?)\n([\s\S]*?)```/g;
    const scripts = [];
    let match;
    
    while ((match = scriptRegex.exec(content)) !== null) {
      scripts.push({
        name: match[1],
        content: match[2].trim(),
      });
    }
    
    return scripts;
  }
  
  // Public API methods
  async createTask(type, data, options = {}) {
    const task = {
      id: uuidv4(),
      type,
      data: this.sanitizeInput(data),
      status: 'pending',
      priority: options.priority || 'medium',
      createdAt: new Date(),
      framework: data.framework,
      language: data.language,
    };
    
    this.emit('task:created', task);
    
    // Add to queue based on priority
    const priorityValue = config.tasks.priority[task.priority] || 5;
    const insertIndex = this.taskQueue.findIndex(t => 
      (config.tasks.priority[t.priority] || 5) > priorityValue
    );
    
    if (insertIndex === -1) {
      this.taskQueue.push(task);
    } else {
      this.taskQueue.splice(insertIndex, 0, task);
    }
    
    return task;
  }
  
  async getTask(taskId) {
    return this.activeTasks.get(taskId) || 
           this.taskQueue.find(task => task.id === taskId);
  }
  
  async getActiveTasks() {
    return Array.from(this.activeTasks.values());
  }
  
  async getQueuedTasks() {
    return [...this.taskQueue];
  }
  
  async cancelTask(taskId) {
    const taskIndex = this.taskQueue.findIndex(task => task.id === taskId);
    if (taskIndex !== -1) {
      const task = this.taskQueue.splice(taskIndex, 1)[0];
      task.status = 'cancelled';
      task.cancelledAt = new Date();
      return task;
    }
    
    const activeTask = this.activeTasks.get(taskId);
    if (activeTask) {
      activeTask.status = 'cancelled';
      activeTask.cancelledAt = new Date();
      this.activeTasks.delete(taskId);
      return activeTask;
    }
    
    throw new Error(`Task ${taskId} not found`);
  }
  
  sanitizeInput(data) {
    if (typeof data === 'string') {
      return xss(sanitizeHtml(data));
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeInput(item));
    }
    
    if (typeof data === 'object' && data !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = this.sanitizeInput(value);
      }
      return sanitized;
    }
    
    return data;
  }
  
  async getMetrics() {
    return {
      activeTasks: this.activeTasks.size,
      queuedTasks: this.taskQueue.length,
      supportedFrameworks: Object.keys(this.frameworks),
      supportedDatabases: Object.keys(this.databases),
      cacheStats: await this.cache.getStats(),
    };
  }
  
  async cleanup() {
    this.isProcessing = false;
    await this.cache.cleanup();
    this.activeTasks.clear();
    this.taskQueue.length = 0;
    this.removeAllListeners();
    
    logger.info('Backend AI Agent Service cleaned up');
  }
}

module.exports = BackendService;