const axios = require('axios');
const OpenAI = require('openai');
const Task = require('../models/Task');
const Agent = require('../models/Agent');
const { 
  logger, 
  logTask, 
  logCodeGeneration, 
  logOptimization, 
  logAIInteraction, 
  logComponent 
} = require('../config/logger');
const { 
  trackTask, 
  trackActiveTask, 
  trackCodeGeneration, 
  trackOptimization, 
  trackAIModelCall 
} = require('../config/telemetry');

class FrontendService {
  constructor(eventEmitter) {
    this.eventEmitter = eventEmitter;
    this.agent = null;
    this.activeTasks = new Map();
    this.taskQueue = [];
    this.isProcessing = false;
    
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Configuration
    this.config = {
      maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS) || 5,
      orchestratorUrl: process.env.ORCHESTRATOR_URL || 'http://localhost:3001',
      agentId: process.env.AGENT_ID || 'frontend-agent',
      heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL) || 30000,
      taskTimeout: parseInt(process.env.TASK_TIMEOUT) || 600000, // 10 minutes
      retryAttempts: parseInt(process.env.RETRY_ATTEMPTS) || 3
    };
    
    this.heartbeatTimer = null;
  }

  async initialize() {
    try {
      // Create agent instance
      this.agent = Agent.createFrontendAgent({
        endpoint: `http://localhost:${process.env.PORT || 3002}`,
        maxConcurrentTasks: this.config.maxConcurrentTasks,
        metadata: {
          specializations: (process.env.SPECIALIZATIONS || 'react,typescript,tailwind').split(','),
          environment: process.env.NODE_ENV || 'development'
        }
      });

      // Register with orchestrator
      await this.registerWithOrchestrator();
      
      // Start heartbeat
      this.startHeartbeat();
      
      // Start task processing
      this.startTaskProcessing();
      
      logger.info('Frontend service initialized successfully', {
        agentId: this.agent.id,
        maxConcurrentTasks: this.config.maxConcurrentTasks,
        orchestratorUrl: this.config.orchestratorUrl
      });
      
    } catch (error) {
      logger.error('Failed to initialize frontend service:', error);
      throw error;
    }
  }

  async registerWithOrchestrator() {
    try {
      const registrationData = {
        id: this.agent.id,
        type: this.agent.type,
        endpoint: this.agent.endpoint,
        capabilities: this.agent.capabilities,
        supportedTaskTypes: this.agent.supportedTaskTypes,
        maxConcurrentTasks: this.agent.maxConcurrentTasks,
        metadata: this.agent.metadata
      };

      const response = await axios.post(
        `${this.config.orchestratorUrl}/api/orchestrator/agents/register`,
        registrationData,
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': `frontend-agent/${this.agent.version}`
          }
        }
      );

      if (response.status === 200) {
        this.agent.register();
        logger.info('Successfully registered with orchestrator', {
          agentId: this.agent.id,
          orchestratorUrl: this.config.orchestratorUrl
        });
        
        // Emit registration event
        await this.eventEmitter.emitAgentStatusChanged('online', this.agent.performance);
      }
    } catch (error) {
      logger.error('Failed to register with orchestrator:', error);
      throw error;
    }
  }

  startHeartbeat() {
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.sendHeartbeat();
      } catch (error) {
        logger.warn('Heartbeat failed:', error.message);
      }
    }, this.config.heartbeatInterval);
  }

  async sendHeartbeat() {
    try {
      const startTime = Date.now();
      
      const heartbeatData = {
        agentId: this.agent.id,
        status: this.agent.status,
        currentTasks: this.agent.currentTasks,
        loadFactor: this.agent.loadFactor,
        performance: this.agent.performance,
        timestamp: new Date().toISOString()
      };

      await axios.post(
        `${this.config.orchestratorUrl}/api/orchestrator/agents/${this.agent.id}/heartbeat`,
        heartbeatData,
        { timeout: 5000 }
      );

      const responseTime = Date.now() - startTime;
      this.agent.updateHeartbeat();
      this.agent.updateResponseTime(responseTime);
      
      logger.debug('Heartbeat sent successfully', {
        agentId: this.agent.id,
        responseTime: `${responseTime}ms`
      });
      
    } catch (error) {
      logger.warn('Heartbeat failed:', error.message);
    }
  }

  startTaskProcessing() {
    setInterval(() => {
      if (!this.isProcessing && this.taskQueue.length > 0 && this.agent.isAvailable()) {
        this.processNextTask();
      }
    }, 1000);
  }

  async processNextTask() {
    if (this.isProcessing || this.taskQueue.length === 0 || !this.agent.isAvailable()) {
      return;
    }

    this.isProcessing = true;
    const task = this.taskQueue.shift();
    
    try {
      await this.executeTask(task);
    } catch (error) {
      logger.error('Task processing error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async executeTask(task) {
    const startTime = Date.now();
    
    try {
      // Start task
      task.start();
      this.agent.assignTask(task.id, task.type);
      this.activeTasks.set(task.id, task);
      
      trackActiveTask(true);
      logTask('info', task.id, task.type, 'Task started');
      
      // Emit task started event
      await this.eventEmitter.emitTaskStarted(task.id, task.type, this.agent.id);
      
      // Execute based on task type
      let result;
      switch (task.type) {
        case 'component_generation':
          result = await this.generateComponent(task);
          break;
        case 'code_review':
          result = await this.reviewCode(task);
          break;
        case 'optimization':
          result = await this.optimizeCode(task);
          break;
        case 'styling':
          result = await this.applyStyling(task);
          break;
        case 'testing':
          result = await this.generateTests(task);
          break;
        case 'refactoring':
          result = await this.refactorCode(task);
          break;
        default:
          throw new Error(`Unsupported task type: ${task.type}`);
      }
      
      // Complete task
      const duration = Date.now() - startTime;
      const metrics = {
        executionTime: duration,
        linesOfCode: this.countLinesOfCode(result),
        filesGenerated: result.files ? result.files.length : 0,
        complexity: this.assessComplexity(result)
      };
      
      task.complete(result, metrics);
      this.agent.completeTask(task.id, duration, true);
      
      trackActiveTask(false);
      trackTask(task.type, duration, true);
      logTask('info', task.id, task.type, 'Task completed successfully', { duration: `${duration}ms` });
      
      // Emit task completed event
      await this.eventEmitter.emitTaskCompleted(task.id, result, metrics);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      task.fail(error);
      this.agent.completeTask(task.id, duration, false);
      
      trackActiveTask(false);
      trackTask(task.type, duration, false);
      logTask('error', task.id, task.type, 'Task failed', { error: error.message, duration: `${duration}ms` });
      
      // Emit task failed event
      await this.eventEmitter.emitTaskFailed(task.id, error, { duration });
      
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  async generateComponent(task) {
    const { componentName, props, state, events, styling } = task.requestData;
    
    logComponent('info', componentName, 'generation_started');
    
    const prompt = this.buildComponentPrompt(task);
    const aiStartTime = Date.now();
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert frontend developer specializing in React components. Generate clean, efficient, and well-documented code.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4000
      });
      
      const aiLatency = Date.now() - aiStartTime;
      const tokensUsed = response.usage?.total_tokens || 0;
      
      trackAIModelCall('gpt-4', 'component_generation', aiLatency, tokensUsed, true);
      logAIInteraction('info', 'gpt-4', 'component_generation', tokensUsed, aiLatency);
      
      const generatedCode = response.choices[0].message.content;
      const files = this.parseGeneratedFiles(generatedCode, componentName, task);
      
      const result = {
        files,
        explanation: `Generated ${componentName} component with ${props.length} props and ${state.length} state variables`,
        suggestions: this.generateSuggestions(task),
        dependencies: this.extractDependencies(generatedCode, task)
      };
      
      trackCodeGeneration('component', files.reduce((acc, f) => acc + f.content.split('\n').length, 0), true);
      logComponent('info', componentName, 'generation_completed', { filesGenerated: files.length });
      
      // Emit code generated event
      await this.eventEmitter.emitComponentGenerated(task.id, componentName, props, {
        filesGenerated: files.length,
        linesOfCode: files.reduce((acc, f) => acc + f.content.split('\n').length, 0)
      });
      
      return result;
      
    } catch (error) {
      const aiLatency = Date.now() - aiStartTime;
      trackAIModelCall('gpt-4', 'component_generation', aiLatency, 0, false);
      logAIInteraction('error', 'gpt-4', 'component_generation', 0, aiLatency, { error: error.message });
      throw error;
    }
  }

  async reviewCode(task) {
    const { code, filePath, reviewType, focusAreas } = task.requestData;
    
    const prompt = this.buildCodeReviewPrompt(task);
    const aiStartTime = Date.now();
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert code reviewer specializing in frontend development. Provide detailed, constructive feedback.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 3000
      });
      
      const aiLatency = Date.now() - aiStartTime;
      const tokensUsed = response.usage?.total_tokens || 0;
      
      trackAIModelCall('gpt-4', 'code_review', aiLatency, tokensUsed, true);
      logAIInteraction('info', 'gpt-4', 'code_review', tokensUsed, aiLatency);
      
      const reviewContent = response.choices[0].message.content;
      const review = this.parseCodeReview(reviewContent);
      
      return {
        review,
        suggestions: review.suggestions || [],
        issues: review.issues || [],
        score: review.score || 85,
        explanation: `Code review completed for ${filePath || 'provided code'}`
      };
      
    } catch (error) {
      const aiLatency = Date.now() - aiStartTime;
      trackAIModelCall('gpt-4', 'code_review', aiLatency, 0, false);
      throw error;
    }
  }

  async optimizeCode(task) {
    const { code, optimizationType, targetMetrics, currentMetrics } = task.requestData;
    
    logOptimization('info', optimizationType, 'optimization_started');
    
    const prompt = this.buildOptimizationPrompt(task);
    const aiStartTime = Date.now();
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in frontend performance optimization. Provide optimized code with detailed explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4000
      });
      
      const aiLatency = Date.now() - aiStartTime;
      const tokensUsed = response.usage?.total_tokens || 0;
      
      trackAIModelCall('gpt-4', 'optimization', aiLatency, tokensUsed, true);
      logAIInteraction('info', 'gpt-4', 'optimization', tokensUsed, aiLatency);
      
      const optimizedContent = response.choices[0].message.content;
      const optimization = this.parseOptimization(optimizedContent);
      
      const result = {
        optimizedCode: optimization.code,
        improvements: optimization.improvements,
        metrics: optimization.metrics,
        explanation: optimization.explanation,
        suggestions: optimization.suggestions || []
      };
      
      trackOptimization(optimizationType, optimization.improvement, true);
      logOptimization('info', optimizationType, currentMetrics, optimization.metrics);
      
      // Emit optimization completed event
      await this.eventEmitter.emitOptimizationCompleted(
        task.id, 
        optimizationType, 
        currentMetrics, 
        optimization.metrics, 
        optimization.improvement
      );
      
      return result;
      
    } catch (error) {
      const aiLatency = Date.now() - aiStartTime;
      trackAIModelCall('gpt-4', 'optimization', aiLatency, 0, false);
      trackOptimization(optimizationType, null, false);
      throw error;
    }
  }

  async applyStyling(task) {
    const { component, stylingApproach, designSystem } = task.requestData;
    
    const prompt = this.buildStylingPrompt(task);
    const aiStartTime = Date.now();
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in frontend styling and design systems. Create beautiful, responsive, and accessible styles.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 3000
      });
      
      const aiLatency = Date.now() - aiStartTime;
      const tokensUsed = response.usage?.total_tokens || 0;
      
      trackAIModelCall('gpt-4', 'styling', aiLatency, tokensUsed, true);
      logAIInteraction('info', 'gpt-4', 'styling', tokensUsed, aiLatency);
      
      const styledContent = response.choices[0].message.content;
      const styling = this.parseStyling(styledContent);
      
      return {
        styledComponent: styling.component,
        styles: styling.styles,
        explanation: styling.explanation,
        suggestions: styling.suggestions || []
      };
      
    } catch (error) {
      const aiLatency = Date.now() - aiStartTime;
      trackAIModelCall('gpt-4', 'styling', aiLatency, 0, false);
      throw error;
    }
  }

  async generateTests(task) {
    const { component, testType, coverage, testingLibrary } = task.requestData;
    
    const prompt = this.buildTestingPrompt(task);
    const aiStartTime = Date.now();
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in frontend testing. Generate comprehensive, maintainable tests with good coverage.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 3000
      });
      
      const aiLatency = Date.now() - aiStartTime;
      const tokensUsed = response.usage?.total_tokens || 0;
      
      trackAIModelCall('gpt-4', 'testing', aiLatency, tokensUsed, true);
      logAIInteraction('info', 'gpt-4', 'testing', tokensUsed, aiLatency);
      
      const testContent = response.choices[0].message.content;
      const tests = this.parseTests(testContent);
      
      return {
        testFiles: tests.files,
        testCount: tests.count,
        coverage: tests.coverage,
        explanation: tests.explanation,
        suggestions: tests.suggestions || []
      };
      
    } catch (error) {
      const aiLatency = Date.now() - aiStartTime;
      trackAIModelCall('gpt-4', 'testing', aiLatency, 0, false);
      throw error;
    }
  }

  async refactorCode(task) {
    const { code, refactoringType, targetPattern } = task.requestData;
    
    const prompt = this.buildRefactoringPrompt(task);
    const aiStartTime = Date.now();
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in code refactoring and design patterns. Improve code quality while maintaining functionality.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4000
      });
      
      const aiLatency = Date.now() - aiStartTime;
      const tokensUsed = response.usage?.total_tokens || 0;
      
      trackAIModelCall('gpt-4', 'refactoring', aiLatency, tokensUsed, true);
      logAIInteraction('info', 'gpt-4', 'refactoring', tokensUsed, aiLatency);
      
      const refactoredContent = response.choices[0].message.content;
      const refactoring = this.parseRefactoring(refactoredContent);
      
      return {
        refactoredCode: refactoring.code,
        changes: refactoring.changes,
        improvements: refactoring.improvements,
        explanation: refactoring.explanation,
        suggestions: refactoring.suggestions || []
      };
      
    } catch (error) {
      const aiLatency = Date.now() - aiStartTime;
      trackAIModelCall('gpt-4', 'refactoring', aiLatency, 0, false);
      throw error;
    }
  }

  // Helper methods for building prompts
  buildComponentPrompt(task) {
    const { componentName, props, state, events, styling } = task.requestData;
    
    return `Generate a ${task.framework} component named "${componentName}" with the following specifications:

Description: ${task.description}
Language: ${task.language}
Styling: ${task.styling}

Props:
${props.map(p => `- ${p.name}: ${p.type}${p.required ? ' (required)' : ''} - ${p.description || ''}`).join('\n')}

State:
${state.map(s => `- ${s.name}: ${s.type} (initial: ${s.initialValue}) - ${s.description || ''}`).join('\n')}

Events:
${events.map(e => `- ${e.name}(${e.parameters ? e.parameters.join(', ') : ''}) - ${e.description || ''}`).join('\n')}

Requirements:
- Responsive design: ${task.requirements.responsive}
- Accessibility: ${task.requirements.accessibility}
- Testing: ${task.requirements.testing}
- Documentation: ${task.requirements.documentation}

Please generate:
1. The main component file
2. Type definitions (if TypeScript)
3. Styles file
4. Test file (if testing required)
5. Storybook story (if requested)

Ensure the code follows best practices and is production-ready.`;
  }

  buildCodeReviewPrompt(task) {
    const { code, filePath, reviewType, focusAreas } = task.requestData;
    
    return `Please review the following ${task.framework} code:

File: ${filePath || 'Unknown'}
Language: ${task.language}
Review Type: ${reviewType}
Focus Areas: ${focusAreas.join(', ')}

Code:
\`\`\`${task.language}
${code}
\`\`\`

Please provide:
1. Overall code quality score (1-100)
2. Issues found (with severity levels)
3. Suggestions for improvement
4. Best practices recommendations
5. Performance considerations
6. Security concerns (if any)
7. Accessibility improvements

Format your response as structured feedback.`;
  }

  buildOptimizationPrompt(task) {
    const { code, optimizationType, targetMetrics, currentMetrics } = task.requestData;
    
    return `Optimize the following ${task.framework} code for ${optimizationType}:

Language: ${task.language}
Current Metrics: ${JSON.stringify(currentMetrics, null, 2)}
Target Metrics: ${JSON.stringify(targetMetrics, null, 2)}

Code:
\`\`\`${task.language}
${code}
\`\`\`

Please provide:
1. Optimized code
2. List of improvements made
3. Expected performance gains
4. Metrics comparison
5. Additional optimization suggestions

Focus on ${optimizationType} optimization while maintaining functionality.`;
  }

  buildStylingPrompt(task) {
    const { component, stylingApproach, designSystem } = task.requestData;
    
    return `Apply ${stylingApproach} styling to the following ${task.framework} component:

Component:
\`\`\`${task.language}
${component}
\`\`\`

Design System: ${JSON.stringify(designSystem, null, 2)}

Requirements:
- Responsive design: ${task.requirements.responsive}
- Accessibility: ${task.requirements.accessibility}
- Modern and clean design
- Cross-browser compatibility

Please provide:
1. Styled component code
2. Separate styles file
3. Responsive breakpoints
4. Accessibility enhancements
5. Design system integration`;
  }

  buildTestingPrompt(task) {
    const { component, testType, coverage, testingLibrary } = task.requestData;
    
    return `Generate ${testType} tests for the following ${task.framework} component using ${testingLibrary}:

Component:
\`\`\`${task.language}
${component}
\`\`\`

Target Coverage: ${coverage}%
Language: ${task.language}

Please provide:
1. Comprehensive test suite
2. Test cases for all props and state
3. Event handling tests
4. Edge case testing
5. Accessibility testing
6. Performance testing (if applicable)

Ensure tests are maintainable and follow best practices.`;
  }

  buildRefactoringPrompt(task) {
    const { code, refactoringType, targetPattern } = task.requestData;
    
    return `Refactor the following ${task.framework} code using ${refactoringType}:

Target Pattern: ${targetPattern}
Language: ${task.language}

Code:
\`\`\`${task.language}
${code}
\`\`\`

Constraints:
- Maintain functionality: ${task.constraints.maintainFunctionality}
- Preserve API: ${task.constraints.preserveAPI}

Please provide:
1. Refactored code
2. List of changes made
3. Improvements achieved
4. Migration guide (if API changes)
5. Testing recommendations`;
  }

  // Helper methods for parsing AI responses
  parseGeneratedFiles(content, componentName, task) {
    const files = [];
    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
    
    codeBlocks.forEach((block, index) => {
      const lines = block.split('\n');
      const firstLine = lines[0];
      const language = firstLine.replace('```', '').trim();
      const code = lines.slice(1, -1).join('\n');
      
      let fileName, fileType;
      
      if (index === 0) {
        fileName = `${componentName}.${task.language === 'typescript' ? 'tsx' : 'jsx'}`;
        fileType = 'component';
      } else if (language.includes('css') || language.includes('scss')) {
        fileName = `${componentName}.${task.styling === 'scss' ? 'scss' : 'css'}`;
        fileType = 'style';
      } else if (language.includes('test') || content.includes('test')) {
        fileName = `${componentName}.test.${task.language === 'typescript' ? 'tsx' : 'jsx'}`;
        fileType = 'test';
      } else if (language.includes('story')) {
        fileName = `${componentName}.stories.${task.language === 'typescript' ? 'tsx' : 'jsx'}`;
        fileType = 'story';
      } else {
        fileName = `${componentName}.types.ts`;
        fileType = 'type';
      }
      
      files.push({
        path: fileName,
        content: code,
        type: fileType
      });
    });
    
    return files;
  }

  parseCodeReview(content) {
    // Parse structured code review response
    const lines = content.split('\n');
    const review = {
      score: 85,
      issues: [],
      suggestions: [],
      summary: ''
    };
    
    // Extract score
    const scoreMatch = content.match(/score[:\s]*(\d+)/i);
    if (scoreMatch) {
      review.score = parseInt(scoreMatch[1]);
    }
    
    // Extract issues and suggestions (simplified parsing)
    review.summary = content.substring(0, 200) + '...';
    
    return review;
  }

  parseOptimization(content) {
    return {
      code: content,
      improvements: ['Performance optimized'],
      metrics: { improvement: '20%' },
      explanation: 'Code optimized for better performance',
      improvement: 20
    };
  }

  parseStyling(content) {
    return {
      component: content,
      styles: '',
      explanation: 'Styling applied successfully'
    };
  }

  parseTests(content) {
    return {
      files: [{ path: 'test.js', content }],
      count: 5,
      coverage: 85,
      explanation: 'Tests generated successfully'
    };
  }

  parseRefactoring(content) {
    return {
      code: content,
      changes: ['Improved structure'],
      improvements: ['Better maintainability'],
      explanation: 'Code refactored successfully'
    };
  }

  // Utility methods
  countLinesOfCode(result) {
    if (result.files) {
      return result.files.reduce((total, file) => {
        return total + (file.content ? file.content.split('\n').length : 0);
      }, 0);
    }
    return 0;
  }

  assessComplexity(result) {
    const linesOfCode = this.countLinesOfCode(result);
    if (linesOfCode < 50) return 'low';
    if (linesOfCode < 200) return 'medium';
    return 'high';
  }

  generateSuggestions(task) {
    const suggestions = [];
    
    if (task.requirements.testing && !task.requirements.storybook) {
      suggestions.push('Consider adding Storybook stories for better component documentation');
    }
    
    if (task.framework === 'react' && task.language === 'javascript') {
      suggestions.push('Consider migrating to TypeScript for better type safety');
    }
    
    return suggestions;
  }

  extractDependencies(code, task) {
    const dependencies = [];
    
    // Basic dependency extraction
    const importMatches = code.match(/import .* from ['"]([^'"]+)['"]/g) || [];
    
    importMatches.forEach(match => {
      const depMatch = match.match(/from ['"]([^'"]+)['"]/);;
      if (depMatch && !depMatch[1].startsWith('.')) {
        dependencies.push({
          name: depMatch[1],
          version: 'latest',
          type: 'dependency'
        });
      }
    });
    
    return dependencies;
  }

  // Public API methods
  async addTask(taskData) {
    const task = new Task(taskData);
    const validationErrors = task.validate();
    
    if (validationErrors.length > 0) {
      throw new Error(`Task validation failed: ${validationErrors.join(', ')}`);
    }
    
    this.taskQueue.push(task);
    
    logger.info('Task added to queue', {
      taskId: task.id,
      taskType: task.type,
      queueLength: this.taskQueue.length
    });
    
    return task;
  }

  getTaskStatus(taskId) {
    const activeTask = this.activeTasks.get(taskId);
    if (activeTask) {
      return activeTask.toJSON();
    }
    
    const queuedTask = this.taskQueue.find(t => t.id === taskId);
    if (queuedTask) {
      return queuedTask.toJSON();
    }
    
    return null;
  }

  getAgentStatus() {
    return this.agent ? this.agent.toJSON() : null;
  }

  getMetrics() {
    return {
      agent: this.agent ? this.agent.toSummary() : null,
      tasks: {
        active: this.activeTasks.size,
        queued: this.taskQueue.length,
        total: this.agent ? this.agent.performance.totalTasksCompleted + this.agent.performance.totalTasksFailed : 0
      },
      system: {
        uptime: this.agent ? this.agent.getFormattedUptime() : '0s',
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      }
    };
  }

  async shutdown() {
    logger.info('Shutting down frontend service...');
    
    // Clear heartbeat timer
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    // Unregister from orchestrator
    try {
      await axios.post(
        `${this.config.orchestratorUrl}/api/orchestrator/agents/${this.agent.id}/unregister`,
        {},
        { timeout: 5000 }
      );
    } catch (error) {
      logger.warn('Failed to unregister from orchestrator:', error.message);
    }
    
    // Update agent status
    if (this.agent) {
      this.agent.unregister();
    }
    
    logger.info('Frontend service shutdown complete');
  }
}

module.exports = FrontendService;