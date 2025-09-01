/**
 * AI Service for Frontend AI Agent
 * Handles OpenAI API interactions and code generation
 */

'use strict';

const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const telemetryService = require('./telemetryService');

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.models = {
      code: process.env.OPENAI_CODE_MODEL || 'gpt-4',
      chat: process.env.OPENAI_CHAT_MODEL || 'gpt-3.5-turbo',
      embedding: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002',
    };
    
    this.pricing = {
      'gpt-4': { input: 0.03, output: 0.06 }, // per 1K tokens
      'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
      'text-embedding-ada-002': { input: 0.0001, output: 0 },
    };
    
    this.rateLimits = {
      requestsPerMinute: parseInt(process.env.OPENAI_RPM_LIMIT) || 60,
      tokensPerMinute: parseInt(process.env.OPENAI_TPM_LIMIT) || 90000,
    };
    
    this.requestQueue = [];
    this.isProcessingQueue = false;
  }

  /**
   * Generate code using OpenAI
   */
  async generateCode(options) {
    const requestId = uuidv4();
    const requestLogger = logger.addRequestId(requestId);

    return telemetryService.withSpan('ai.generate_code', async (span) => {
      try {
        const {
          prompt,
          language = 'javascript',
          framework = 'react',
          maxTokens = 2000,
          temperature = 0.1,
          model = this.models.code,
        } = options;

        span.setAttributes({
          'ai.model': model,
          'ai.language': language,
          'ai.framework': framework,
          'ai.max_tokens': maxTokens,
          'ai.temperature': temperature,
        });

        requestLogger.info('Starting code generation', {
          model,
          language,
          framework,
          maxTokens,
        });

        const systemPrompt = this.buildSystemPrompt(language, framework);
        const userPrompt = this.buildCodePrompt(prompt, language, framework);

        const startTime = Date.now();
        const response = await this.makeRequest({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature,
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.1,
        });
        const duration = Date.now() - startTime;

        const result = this.parseCodeResponse(response, language);
        const cost = this.calculateCost(model, response.usage);

        requestLogger.ai('generate_code', model, response.usage.total_tokens, cost, {
          language,
          framework,
          duration,
        });

        telemetryService.recordAiOperation(
          'generate_code',
          model,
          response.usage.total_tokens,
          cost,
          true,
          { language, framework }
        );

        return {
          code: result.code,
          explanation: result.explanation,
          suggestions: result.suggestions,
          model,
          tokensUsed: response.usage.total_tokens,
          cost,
          duration,
        };
      } catch (error) {
        requestLogger.logError(error, { operation: 'generate_code' });
        telemetryService.recordError('ai_generation_error', error.code || 'unknown');
        throw error;
      }
    });
  }

  /**
   * Optimize existing code
   */
  async optimizeCode(options) {
    const requestId = uuidv4();
    const requestLogger = logger.addRequestId(requestId);

    return telemetryService.withSpan('ai.optimize_code', async (span) => {
      try {
        const {
          prompt,
          code,
          language = 'javascript',
          framework = 'react',
          maxTokens = 3000,
          temperature = 0.1,
          model = this.models.code,
        } = options;

        span.setAttributes({
          'ai.model': model,
          'ai.language': language,
          'ai.framework': framework,
          'ai.operation': 'optimize',
        });

        requestLogger.info('Starting code optimization', {
          model,
          language,
          framework,
          codeLength: code.length,
        });

        const systemPrompt = this.buildOptimizationSystemPrompt(language, framework);
        const userPrompt = this.buildOptimizationPrompt(prompt, code, language);

        const startTime = Date.now();
        const response = await this.makeRequest({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature,
        });
        const duration = Date.now() - startTime;

        const result = this.parseOptimizationResponse(response);
        const cost = this.calculateCost(model, response.usage);

        requestLogger.ai('optimize_code', model, response.usage.total_tokens, cost, {
          language,
          framework,
          duration,
          improvementsCount: result.improvements.length,
        });

        telemetryService.recordAiOperation(
          'optimize_code',
          model,
          response.usage.total_tokens,
          cost,
          true,
          { language, framework }
        );

        return {
          code: result.code,
          improvements: result.improvements,
          explanation: result.explanation,
          suggestions: result.suggestions,
          model,
          tokensUsed: response.usage.total_tokens,
          cost,
          duration,
        };
      } catch (error) {
        requestLogger.logError(error, { operation: 'optimize_code' });
        telemetryService.recordError('ai_optimization_error', error.code || 'unknown');
        throw error;
      }
    });
  }

  /**
   * Review code for issues and improvements
   */
  async reviewCode(options) {
    const requestId = uuidv4();
    const requestLogger = logger.addRequestId(requestId);

    return telemetryService.withSpan('ai.review_code', async (span) => {
      try {
        const {
          code,
          language = 'javascript',
          framework = 'react',
          focusAreas = ['performance', 'security', 'maintainability'],
          maxTokens = 2000,
          model = this.models.code,
        } = options;

        span.setAttributes({
          'ai.model': model,
          'ai.language': language,
          'ai.framework': framework,
          'ai.operation': 'review',
        });

        requestLogger.info('Starting code review', {
          model,
          language,
          framework,
          focusAreas,
          codeLength: code.length,
        });

        const systemPrompt = this.buildReviewSystemPrompt(language, framework);
        const userPrompt = this.buildReviewPrompt(code, language, focusAreas);

        const startTime = Date.now();
        const response = await this.makeRequest({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.1,
        });
        const duration = Date.now() - startTime;

        const result = this.parseReviewResponse(response);
        const cost = this.calculateCost(model, response.usage);

        requestLogger.ai('review_code', model, response.usage.total_tokens, cost, {
          language,
          framework,
          duration,
          issuesFound: result.issues.length,
        });

        telemetryService.recordAiOperation(
          'review_code',
          model,
          response.usage.total_tokens,
          cost,
          true,
          { language, framework }
        );

        return {
          issues: result.issues,
          suggestions: result.suggestions,
          score: result.score,
          summary: result.summary,
          model,
          tokensUsed: response.usage.total_tokens,
          cost,
          duration,
        };
      } catch (error) {
        requestLogger.logError(error, { operation: 'review_code' });
        telemetryService.recordError('ai_review_error', error.code || 'unknown');
        throw error;
      }
    });
  }

  /**
   * Generate embeddings for code
   */
  async generateEmbedding(text) {
    const requestId = uuidv4();
    const requestLogger = logger.addRequestId(requestId);

    return telemetryService.withSpan('ai.generate_embedding', async (span) => {
      try {
        const model = this.models.embedding;
        
        span.setAttributes({
          'ai.model': model,
          'ai.operation': 'embedding',
          'ai.text_length': text.length,
        });

        requestLogger.info('Generating embedding', {
          model,
          textLength: text.length,
        });

        const startTime = Date.now();
        const response = await this.openai.embeddings.create({
          model,
          input: text,
        });
        const duration = Date.now() - startTime;

        const cost = this.calculateCost(model, response.usage);

        requestLogger.ai('generate_embedding', model, response.usage.total_tokens, cost, {
          duration,
          embeddingDimensions: response.data[0].embedding.length,
        });

        telemetryService.recordAiOperation(
          'generate_embedding',
          model,
          response.usage.total_tokens,
          cost
        );

        return {
          embedding: response.data[0].embedding,
          model,
          tokensUsed: response.usage.total_tokens,
          cost,
          duration,
        };
      } catch (error) {
        requestLogger.logError(error, { operation: 'generate_embedding' });
        telemetryService.recordError('ai_embedding_error', error.code || 'unknown');
        throw error;
      }
    });
  }

  /**
   * Make request to OpenAI with rate limiting
   */
  async makeRequest(params) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ params, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process request queue with rate limiting
   */
  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.requestQueue.length > 0) {
        const { params, resolve, reject } = this.requestQueue.shift();

        try {
          const response = await this.openai.chat.completions.create(params);
          resolve(response);
        } catch (error) {
          if (error.status === 429) {
            // Rate limit hit, wait and retry
            logger.warn('Rate limit hit, waiting before retry', {
              error: error.message,
              retryAfter: error.headers?.['retry-after'] || 60,
            });
            
            const waitTime = (error.headers?.['retry-after'] || 60) * 1000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            // Put request back at front of queue
            this.requestQueue.unshift({ params, resolve, reject });
            continue;
          }
          reject(error);
        }

        // Add delay between requests to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Build system prompt for code generation
   */
  buildSystemPrompt(language, framework) {
    return `You are an expert ${language} developer specializing in ${framework}. 
You write clean, efficient, and well-documented code following best practices. 
Always include proper error handling, type safety, and accessibility considerations. 
Provide code that is production-ready and follows modern conventions.`;
  }

  /**
   * Build user prompt for code generation
   */
  buildCodePrompt(prompt, language, framework) {
    return `Generate ${language} code using ${framework} for the following requirement:

${prompt}

Please provide:
1. Clean, well-structured code
2. Proper comments and documentation
3. Error handling where appropriate
4. Type definitions if applicable
5. Brief explanation of the implementation

Format your response as JSON with the following structure:
{
  "code": "// Your code here",
  "explanation": "Brief explanation of the implementation",
  "suggestions": ["Additional suggestions or improvements"]
}`;
  }

  /**
   * Build system prompt for optimization
   */
  buildOptimizationSystemPrompt(language, framework) {
    return `You are an expert ${language} developer specializing in ${framework} optimization. 
You identify performance bottlenecks, security issues, and maintainability problems. 
You provide optimized code with clear explanations of improvements made.`;
  }

  /**
   * Build prompt for code optimization
   */
  buildOptimizationPrompt(prompt, code, language) {
    return `Optimize the following ${language} code:

\`\`\`${language}
${code}
\`\`\`

${prompt ? `Focus on: ${prompt}` : 'Focus on performance, security, and maintainability.'}

Please provide:
1. Optimized code
2. List of improvements made
3. Explanation of changes
4. Additional suggestions

Format your response as JSON with the following structure:
{
  "code": "// Optimized code here",
  "improvements": ["List of specific improvements made"],
  "explanation": "Detailed explanation of changes",
  "suggestions": ["Additional suggestions"]
}`;
  }

  /**
   * Build system prompt for code review
   */
  buildReviewSystemPrompt(language, framework) {
    return `You are an expert ${language} code reviewer specializing in ${framework}. 
You identify bugs, security vulnerabilities, performance issues, and maintainability problems. 
You provide constructive feedback with specific suggestions for improvement.`;
  }

  /**
   * Build prompt for code review
   */
  buildReviewPrompt(code, language, focusAreas) {
    return `Review the following ${language} code:

\`\`\`${language}
${code}
\`\`\`

Focus areas: ${focusAreas.join(', ')}

Please provide:
1. List of issues found (with severity levels)
2. Specific suggestions for improvement
3. Overall code quality score (1-10)
4. Summary of findings

Format your response as JSON with the following structure:
{
  "issues": [
    {
      "type": "issue type",
      "severity": "low|medium|high|critical",
      "description": "Description of the issue",
      "line": "line number if applicable",
      "suggestion": "How to fix it"
    }
  ],
  "suggestions": ["General improvement suggestions"],
  "score": 8,
  "summary": "Overall assessment of code quality"
}`;
  }

  /**
   * Parse code generation response
   */
  parseCodeResponse(response, language) {
    try {
      const content = response.choices[0].message.content;
      
      // Try to parse as JSON first
      try {
        return JSON.parse(content);
      } catch {
        // Fallback: extract code blocks
        const codeMatch = content.match(new RegExp(`\`\`\`${language}?\n([\s\S]*?)\`\`\``, 'i'));
        const code = codeMatch ? codeMatch[1].trim() : content;
        
        return {
          code,
          explanation: 'Generated code',
          suggestions: [],
        };
      }
    } catch (error) {
      logger.logError(error, { operation: 'parse_code_response' });
      throw new Error('Failed to parse AI response');
    }
  }

  /**
   * Parse optimization response
   */
  parseOptimizationResponse(response) {
    try {
      const content = response.choices[0].message.content;
      return JSON.parse(content);
    } catch (error) {
      logger.logError(error, { operation: 'parse_optimization_response' });
      throw new Error('Failed to parse optimization response');
    }
  }

  /**
   * Parse review response
   */
  parseReviewResponse(response) {
    try {
      const content = response.choices[0].message.content;
      return JSON.parse(content);
    } catch (error) {
      logger.logError(error, { operation: 'parse_review_response' });
      throw new Error('Failed to parse review response');
    }
  }

  /**
   * Calculate cost based on token usage
   */
  calculateCost(model, usage) {
    const pricing = this.pricing[model];
    if (!pricing) return 0;

    const inputCost = (usage.prompt_tokens / 1000) * pricing.input;
    const outputCost = (usage.completion_tokens / 1000) * pricing.output;
    
    return inputCost + outputCost;
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      models: this.models,
      queueLength: this.requestQueue.length,
      isProcessingQueue: this.isProcessingQueue,
      rateLimits: this.rateLimits,
      uptime: process.uptime(),
    };
  }

  /**
   * Get usage statistics
   */
  getUsageStats() {
    // This would typically come from a database or metrics store
    return {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      averageResponseTime: 0,
      errorRate: 0,
    };
  }
}

module.exports = new AIService();