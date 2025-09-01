const { v4: uuidv4 } = require('uuid');

class Task {
  constructor({
    id = uuidv4(),
    type,
    description,
    framework = 'react',
    language = 'typescript',
    styling = 'tailwind',
    requirements = {},
    constraints = {},
    context = {},
    priority = 'medium',
    status = 'pending',
    agentId = null,
    requestData = {},
    result = null,
    error = null,
    metrics = {},
    createdAt = new Date(),
    updatedAt = new Date(),
    startedAt = null,
    completedAt = null,
    estimatedDuration = null,
    actualDuration = null
  } = {}) {
    this.id = id;
    this.type = type;
    this.description = description;
    this.framework = framework;
    this.language = language;
    this.styling = styling;
    this.requirements = {
      responsive: true,
      accessibility: 'wcag-aa',
      testing: true,
      storybook: false,
      documentation: true,
      ...requirements
    };
    this.constraints = {
      maxFileSize: '50KB',
      browserSupport: ['Chrome >= 90', 'Firefox >= 88', 'Safari >= 14'],
      performance: {},
      ...constraints
    };
    this.context = context;
    this.priority = priority;
    this.status = status;
    this.agentId = agentId;
    this.requestData = requestData;
    this.result = result;
    this.error = error;
    this.metrics = {
      executionTime: null,
      linesOfCode: null,
      filesGenerated: null,
      complexity: null,
      tokensUsed: null,
      ...metrics
    };
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.startedAt = startedAt;
    this.completedAt = completedAt;
    this.estimatedDuration = estimatedDuration;
    this.actualDuration = actualDuration;
  }

  // Static factory methods for different task types
  static createComponentGeneration({
    name,
    description,
    props = [],
    state = [],
    events = [],
    styling = {},
    framework = 'react',
    language = 'typescript',
    requirements = {},
    constraints = {},
    context = {}
  }) {
    return new Task({
      type: 'component_generation',
      description: `Generate ${name} component: ${description}`,
      framework,
      language,
      styling: styling.approach || 'tailwind',
      requirements,
      constraints,
      context,
      requestData: {
        componentName: name,
        props,
        state,
        events,
        styling
      },
      estimatedDuration: this.estimateComponentDuration(props, state, events)
    });
  }

  static createCodeReview({
    code,
    filePath,
    reviewType = 'comprehensive',
    focusAreas = [],
    framework = 'react',
    language = 'typescript',
    context = {}
  }) {
    return new Task({
      type: 'code_review',
      description: `Code review for ${filePath || 'provided code'}`,
      framework,
      language,
      requestData: {
        code,
        filePath,
        reviewType,
        focusAreas
      },
      context,
      estimatedDuration: this.estimateReviewDuration(code)
    });
  }

  static createOptimization({
    code,
    filePath,
    optimizationType,
    targetMetrics = {},
    currentMetrics = {},
    framework = 'react',
    language = 'typescript',
    constraints = {},
    context = {}
  }) {
    return new Task({
      type: 'optimization',
      description: `${optimizationType} optimization for ${filePath || 'provided code'}`,
      framework,
      language,
      constraints,
      context,
      requestData: {
        code,
        filePath,
        optimizationType,
        targetMetrics,
        currentMetrics
      },
      estimatedDuration: this.estimateOptimizationDuration(optimizationType, code)
    });
  }

  static createStyling({
    component,
    stylingApproach,
    designSystem = {},
    responsive = true,
    accessibility = 'wcag-aa',
    framework = 'react',
    language = 'typescript',
    context = {}
  }) {
    return new Task({
      type: 'styling',
      description: `Apply ${stylingApproach} styling to component`,
      framework,
      language,
      styling: stylingApproach,
      requirements: {
        responsive,
        accessibility,
        testing: true,
        documentation: true
      },
      context,
      requestData: {
        component,
        stylingApproach,
        designSystem
      },
      estimatedDuration: this.estimateStylingDuration(component, stylingApproach)
    });
  }

  static createTesting({
    component,
    testType = 'unit',
    coverage = 80,
    framework = 'react',
    language = 'typescript',
    testingLibrary = 'jest',
    context = {}
  }) {
    return new Task({
      type: 'testing',
      description: `Generate ${testType} tests for component`,
      framework,
      language,
      requirements: {
        testing: true,
        coverage,
        documentation: true
      },
      context,
      requestData: {
        component,
        testType,
        coverage,
        testingLibrary
      },
      estimatedDuration: this.estimateTestingDuration(component, testType)
    });
  }

  static createRefactoring({
    code,
    filePath,
    refactoringType,
    targetPattern,
    preserveAPI = true,
    framework = 'react',
    language = 'typescript',
    constraints = {},
    context = {}
  }) {
    return new Task({
      type: 'refactoring',
      description: `Refactor code using ${refactoringType} pattern`,
      framework,
      language,
      constraints: {
        maintainFunctionality: true,
        preserveAPI,
        ...constraints
      },
      context,
      requestData: {
        code,
        filePath,
        refactoringType,
        targetPattern
      },
      estimatedDuration: this.estimateRefactoringDuration(code, refactoringType)
    });
  }

  // Duration estimation methods
  static estimateComponentDuration(props, state, events) {
    const baseTime = 300000; // 5 minutes
    const propTime = props.length * 30000; // 30 seconds per prop
    const stateTime = state.length * 60000; // 1 minute per state
    const eventTime = events.length * 45000; // 45 seconds per event
    return baseTime + propTime + stateTime + eventTime;
  }

  static estimateReviewDuration(code) {
    const lines = code.split('\n').length;
    return Math.max(120000, lines * 2000); // 2 seconds per line, minimum 2 minutes
  }

  static estimateOptimizationDuration(type, code) {
    const lines = code.split('\n').length;
    const multiplier = {
      'performance': 3000,
      'bundle-size': 2000,
      'accessibility': 2500,
      'seo': 1500,
      'security': 3500
    }[type] || 2000;
    return Math.max(180000, lines * multiplier); // Minimum 3 minutes
  }

  static estimateStylingDuration(component, approach) {
    const baseTime = {
      'css': 240000,
      'scss': 300000,
      'tailwind': 180000,
      'styled-components': 360000,
      'emotion': 360000
    }[approach] || 240000;
    
    const complexity = component.length / 1000; // Rough complexity based on component size
    return baseTime + (complexity * 60000);
  }

  static estimateTestingDuration(component, testType) {
    const baseTime = {
      'unit': 300000,
      'integration': 600000,
      'e2e': 900000
    }[testType] || 300000;
    
    const complexity = component.length / 1000;
    return baseTime + (complexity * 120000);
  }

  static estimateRefactoringDuration(code, type) {
    const lines = code.split('\n').length;
    const multiplier = {
      'extract-component': 2500,
      'hooks-conversion': 3000,
      'typescript-migration': 4000,
      'performance-optimization': 3500,
      'pattern-implementation': 3000
    }[type] || 2500;
    return Math.max(300000, lines * multiplier); // Minimum 5 minutes
  }

  // Instance methods
  assign(agentId) {
    this.agentId = agentId;
    this.status = 'assigned';
    this.updatedAt = new Date();
    return this;
  }

  start() {
    this.status = 'in_progress';
    this.startedAt = new Date();
    this.updatedAt = new Date();
    return this;
  }

  updateProgress(progress, message) {
    this.status = 'in_progress';
    this.metrics.progress = progress;
    this.metrics.progressMessage = message;
    this.updatedAt = new Date();
    return this;
  }

  complete(result, metrics = {}) {
    this.status = 'completed';
    this.result = result;
    this.completedAt = new Date();
    this.updatedAt = new Date();
    
    // Calculate actual duration
    if (this.startedAt) {
      this.actualDuration = this.completedAt.getTime() - this.startedAt.getTime();
    }
    
    // Update metrics
    this.metrics = {
      ...this.metrics,
      ...metrics,
      executionTime: this.actualDuration
    };
    
    return this;
  }

  fail(error, context = {}) {
    this.status = 'failed';
    this.error = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      context
    };
    this.completedAt = new Date();
    this.updatedAt = new Date();
    
    // Calculate actual duration even for failed tasks
    if (this.startedAt) {
      this.actualDuration = this.completedAt.getTime() - this.startedAt.getTime();
      this.metrics.executionTime = this.actualDuration;
    }
    
    return this;
  }

  cancel(reason = 'Cancelled by user') {
    this.status = 'cancelled';
    this.error = { message: reason };
    this.completedAt = new Date();
    this.updatedAt = new Date();
    return this;
  }

  retry() {
    this.status = 'pending';
    this.agentId = null;
    this.result = null;
    this.error = null;
    this.startedAt = null;
    this.completedAt = null;
    this.actualDuration = null;
    this.updatedAt = new Date();
    
    // Reset progress metrics
    if (this.metrics.progress) {
      delete this.metrics.progress;
      delete this.metrics.progressMessage;
    }
    
    return this;
  }

  // Utility methods
  getDuration() {
    if (this.actualDuration) {
      return this.actualDuration;
    }
    
    if (this.startedAt) {
      return new Date().getTime() - this.startedAt.getTime();
    }
    
    return null;
  }

  getFormattedDuration() {
    const duration = this.getDuration();
    if (!duration) return null;
    
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  isCompleted() {
    return ['completed', 'failed', 'cancelled'].includes(this.status);
  }

  isActive() {
    return ['assigned', 'in_progress'].includes(this.status);
  }

  isPending() {
    return this.status === 'pending';
  }

  getComplexityScore() {
    let score = 1;
    
    // Framework complexity
    const frameworkScores = {
      'vanilla': 1.2,
      'react': 1.0,
      'vue': 1.1,
      'angular': 1.3
    };
    score *= frameworkScores[this.framework] || 1.0;
    
    // Language complexity
    if (this.language === 'typescript') {
      score *= 1.1;
    }
    
    // Styling complexity
    const stylingScores = {
      'css': 1.0,
      'scss': 1.1,
      'tailwind': 0.9,
      'styled-components': 1.2,
      'emotion': 1.2
    };
    score *= stylingScores[this.styling] || 1.0;
    
    // Requirements complexity
    if (this.requirements.accessibility === 'wcag-aaa') {
      score *= 1.3;
    } else if (this.requirements.accessibility === 'wcag-aa') {
      score *= 1.1;
    }
    
    if (this.requirements.testing) {
      score *= 1.1;
    }
    
    if (this.requirements.storybook) {
      score *= 1.2;
    }
    
    return Math.round(score * 10) / 10;
  }

  validate() {
    const errors = [];
    
    if (!this.type) {
      errors.push('Task type is required');
    }
    
    if (!this.description) {
      errors.push('Task description is required');
    }
    
    const validTypes = ['component_generation', 'code_review', 'optimization', 'styling', 'testing', 'refactoring'];
    if (this.type && !validTypes.includes(this.type)) {
      errors.push(`Invalid task type: ${this.type}`);
    }
    
    const validFrameworks = ['react', 'vue', 'angular', 'vanilla'];
    if (this.framework && !validFrameworks.includes(this.framework)) {
      errors.push(`Invalid framework: ${this.framework}`);
    }
    
    const validLanguages = ['javascript', 'typescript'];
    if (this.language && !validLanguages.includes(this.language)) {
      errors.push(`Invalid language: ${this.language}`);
    }
    
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (this.priority && !validPriorities.includes(this.priority)) {
      errors.push(`Invalid priority: ${this.priority}`);
    }
    
    return errors;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      description: this.description,
      framework: this.framework,
      language: this.language,
      styling: this.styling,
      requirements: this.requirements,
      constraints: this.constraints,
      context: this.context,
      priority: this.priority,
      status: this.status,
      agentId: this.agentId,
      requestData: this.requestData,
      result: this.result,
      error: this.error,
      metrics: this.metrics,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      estimatedDuration: this.estimatedDuration,
      actualDuration: this.actualDuration,
      formattedDuration: this.getFormattedDuration(),
      complexityScore: this.getComplexityScore()
    };
  }
}

module.exports = Task;