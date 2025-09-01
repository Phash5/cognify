const { v4: uuidv4 } = require('uuid');

class Agent {
  constructor({
    id = uuidv4(),
    type = 'frontend',
    status = 'offline',
    endpoint = null,
    capabilities = [],
    supportedTaskTypes = [],
    supportedFrameworks = [],
    supportedLanguages = [],
    supportedStyling = [],
    maxConcurrentTasks = 5,
    currentTasks = 0,
    loadFactor = 0,
    version = '1.0.0',
    metadata = {},
    performance = {},
    createdAt = new Date(),
    updatedAt = new Date(),
    lastHeartbeat = null,
    lastTaskAt = null
  } = {}) {
    this.id = id;
    this.type = type;
    this.status = status;
    this.endpoint = endpoint;
    this.capabilities = capabilities.length > 0 ? capabilities : this.getDefaultCapabilities();
    this.supportedTaskTypes = supportedTaskTypes.length > 0 ? supportedTaskTypes : this.getDefaultTaskTypes();
    this.supportedFrameworks = supportedFrameworks.length > 0 ? supportedFrameworks : this.getDefaultFrameworks();
    this.supportedLanguages = supportedLanguages.length > 0 ? supportedLanguages : this.getDefaultLanguages();
    this.supportedStyling = supportedStyling.length > 0 ? supportedStyling : this.getDefaultStyling();
    this.maxConcurrentTasks = maxConcurrentTasks;
    this.currentTasks = currentTasks;
    this.loadFactor = loadFactor;
    this.version = version;
    this.metadata = {
      hostname: process.env.HOSTNAME || 'localhost',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      ...metadata
    };
    this.performance = {
      totalTasksCompleted: 0,
      totalTasksFailed: 0,
      averageResponseTime: 0,
      averageTaskDuration: 0,
      successRate: 100,
      uptime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      ...performance
    };
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.lastHeartbeat = lastHeartbeat;
    this.lastTaskAt = lastTaskAt;
  }

  // Default configurations
  getDefaultCapabilities() {
    return [
      'component_generation',
      'code_review',
      'code_optimization',
      'styling',
      'responsive_design',
      'accessibility_compliance',
      'test_generation',
      'refactoring',
      'performance_optimization',
      'bundle_optimization',
      'seo_optimization',
      'ui_ux_implementation',
      'state_management',
      'api_integration',
      'form_handling',
      'routing',
      'animation',
      'progressive_web_app',
      'cross_browser_compatibility',
      'documentation_generation'
    ];
  }

  getDefaultTaskTypes() {
    return [
      'component_generation',
      'code_review',
      'optimization',
      'styling',
      'testing',
      'refactoring'
    ];
  }

  getDefaultFrameworks() {
    return ['react', 'vue', 'angular', 'vanilla'];
  }

  getDefaultLanguages() {
    return ['javascript', 'typescript'];
  }

  getDefaultStyling() {
    return ['css', 'scss', 'tailwind', 'styled-components', 'emotion'];
  }

  // Static factory method
  static createFrontendAgent({
    endpoint,
    specializations = [],
    maxConcurrentTasks = 5,
    metadata = {}
  } = {}) {
    const agent = new Agent({
      type: 'frontend',
      endpoint,
      maxConcurrentTasks,
      metadata: {
        specializations,
        ...metadata
      }
    });

    // Adjust capabilities based on specializations
    if (specializations.length > 0) {
      agent.adjustCapabilitiesForSpecializations(specializations);
    }

    return agent;
  }

  // Capability management
  adjustCapabilitiesForSpecializations(specializations) {
    const specializationCapabilities = {
      'react': ['hooks', 'context', 'redux', 'next.js', 'gatsby'],
      'vue': ['vuex', 'nuxt.js', 'composition_api'],
      'angular': ['rxjs', 'ngrx', 'angular_material'],
      'performance': ['lazy_loading', 'code_splitting', 'bundle_optimization', 'caching'],
      'accessibility': ['screen_reader', 'keyboard_navigation', 'aria_labels', 'color_contrast'],
      'testing': ['unit_testing', 'integration_testing', 'e2e_testing', 'visual_testing'],
      'mobile': ['responsive_design', 'touch_gestures', 'mobile_optimization'],
      'pwa': ['service_workers', 'offline_support', 'push_notifications', 'app_manifest']
    };

    specializations.forEach(spec => {
      if (specializationCapabilities[spec]) {
        this.capabilities = [...new Set([...this.capabilities, ...specializationCapabilities[spec]])];
      }
    });
  }

  // Status management
  register() {
    this.status = 'online';
    this.updatedAt = new Date();
    this.lastHeartbeat = new Date();
    return this;
  }

  unregister() {
    this.status = 'offline';
    this.updatedAt = new Date();
    return this;
  }

  updateHeartbeat() {
    this.lastHeartbeat = new Date();
    this.updatedAt = new Date();
    
    // Update uptime
    if (this.createdAt) {
      this.performance.uptime = Date.now() - this.createdAt.getTime();
    }
    
    return this;
  }

  setMaintenance(reason = 'Scheduled maintenance') {
    this.status = 'maintenance';
    this.metadata.maintenanceReason = reason;
    this.updatedAt = new Date();
    return this;
  }

  exitMaintenance() {
    this.status = 'online';
    delete this.metadata.maintenanceReason;
    this.updatedAt = new Date();
    return this;
  }

  // Task management
  assignTask(taskId, taskType) {
    if (this.currentTasks >= this.maxConcurrentTasks) {
      throw new Error('Agent at maximum capacity');
    }

    if (!this.supportedTaskTypes.includes(taskType)) {
      throw new Error(`Agent does not support task type: ${taskType}`);
    }

    this.currentTasks++;
    this.loadFactor = this.currentTasks / this.maxConcurrentTasks;
    this.status = this.currentTasks > 0 ? 'busy' : 'online';
    this.lastTaskAt = new Date();
    this.updatedAt = new Date();
    
    return this;
  }

  completeTask(taskId, duration, success = true) {
    if (this.currentTasks > 0) {
      this.currentTasks--;
    }
    
    this.loadFactor = this.currentTasks / this.maxConcurrentTasks;
    this.status = this.currentTasks > 0 ? 'busy' : 'online';
    this.updatedAt = new Date();
    
    // Update performance metrics
    if (success) {
      this.performance.totalTasksCompleted++;
    } else {
      this.performance.totalTasksFailed++;
    }
    
    // Update success rate
    const totalTasks = this.performance.totalTasksCompleted + this.performance.totalTasksFailed;
    this.performance.successRate = totalTasks > 0 
      ? (this.performance.totalTasksCompleted / totalTasks) * 100 
      : 100;
    
    // Update average task duration
    if (duration && success) {
      const currentAvg = this.performance.averageTaskDuration || 0;
      const completedTasks = this.performance.totalTasksCompleted;
      this.performance.averageTaskDuration = completedTasks > 1 
        ? ((currentAvg * (completedTasks - 1)) + duration) / completedTasks
        : duration;
    }
    
    return this;
  }

  failTask(taskId, error, duration = null) {
    return this.completeTask(taskId, duration, false);
  }

  // Health and performance
  updateSystemMetrics(memoryUsage, cpuUsage) {
    this.performance.memoryUsage = memoryUsage;
    this.performance.cpuUsage = cpuUsage;
    this.updatedAt = new Date();
    return this;
  }

  updateResponseTime(responseTime) {
    const currentAvg = this.performance.averageResponseTime || 0;
    const totalRequests = this.performance.totalTasksCompleted + this.performance.totalTasksFailed;
    
    this.performance.averageResponseTime = totalRequests > 1
      ? ((currentAvg * (totalRequests - 1)) + responseTime) / totalRequests
      : responseTime;
    
    this.updatedAt = new Date();
    return this;
  }

  // Capability checks
  canHandleTask(taskType, framework, language, styling) {
    const checks = [
      !taskType || this.supportedTaskTypes.includes(taskType),
      !framework || this.supportedFrameworks.includes(framework),
      !language || this.supportedLanguages.includes(language),
      !styling || this.supportedStyling.includes(styling)
    ];
    
    return checks.every(check => check);
  }

  hasCapability(capability) {
    return this.capabilities.includes(capability);
  }

  getCapabilityScore(taskType, framework, language, styling, requirements = {}) {
    let score = 100;
    
    // Base compatibility
    if (!this.canHandleTask(taskType, framework, language, styling)) {
      return 0;
    }
    
    // Load factor penalty
    score -= (this.loadFactor * 30);
    
    // Performance bonus
    if (this.performance.successRate > 95) {
      score += 10;
    } else if (this.performance.successRate < 80) {
      score -= 15;
    }
    
    // Response time factor
    if (this.performance.averageResponseTime < 1000) {
      score += 5;
    } else if (this.performance.averageResponseTime > 5000) {
      score -= 10;
    }
    
    // Framework specialization bonus
    const specializations = this.metadata.specializations || [];
    if (specializations.includes(framework)) {
      score += 15;
    }
    
    // Requirements matching
    if (requirements.accessibility && this.hasCapability('accessibility_compliance')) {
      score += 10;
    }
    
    if (requirements.testing && this.hasCapability('test_generation')) {
      score += 8;
    }
    
    if (requirements.responsive && this.hasCapability('responsive_design')) {
      score += 5;
    }
    
    // Recent activity bonus
    if (this.lastTaskAt && (Date.now() - this.lastTaskAt.getTime()) < 3600000) { // 1 hour
      score += 5;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  // Health check
  isHealthy() {
    const now = Date.now();
    const heartbeatThreshold = 300000; // 5 minutes
    
    if (!this.lastHeartbeat || (now - this.lastHeartbeat.getTime()) > heartbeatThreshold) {
      return false;
    }
    
    if (this.status === 'offline') {
      return false;
    }
    
    if (this.performance.successRate < 50) {
      return false;
    }
    
    return true;
  }

  getHealthStatus() {
    if (!this.isHealthy()) {
      return 'unhealthy';
    }
    
    if (this.loadFactor > 0.8 || this.performance.successRate < 80) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  // Utility methods
  isAvailable() {
    return this.status === 'online' && this.currentTasks < this.maxConcurrentTasks;
  }

  isBusy() {
    return this.status === 'busy' || this.currentTasks >= this.maxConcurrentTasks;
  }

  isOffline() {
    return this.status === 'offline';
  }

  inMaintenance() {
    return this.status === 'maintenance';
  }

  getFormattedUptime() {
    if (!this.performance.uptime) return '0s';
    
    const seconds = Math.floor(this.performance.uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  getLoadDescription() {
    if (this.loadFactor === 0) return 'idle';
    if (this.loadFactor < 0.3) return 'light';
    if (this.loadFactor < 0.7) return 'moderate';
    if (this.loadFactor < 0.9) return 'heavy';
    return 'at capacity';
  }

  // Validation
  validate() {
    const errors = [];
    
    if (!this.id) {
      errors.push('Agent ID is required');
    }
    
    if (!this.type) {
      errors.push('Agent type is required');
    }
    
    if (this.type !== 'frontend') {
      errors.push('Invalid agent type for frontend agent');
    }
    
    if (this.maxConcurrentTasks < 1) {
      errors.push('Max concurrent tasks must be at least 1');
    }
    
    if (this.currentTasks < 0) {
      errors.push('Current tasks cannot be negative');
    }
    
    if (this.currentTasks > this.maxConcurrentTasks) {
      errors.push('Current tasks cannot exceed max concurrent tasks');
    }
    
    return errors;
  }

  // Serialization
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      endpoint: this.endpoint,
      capabilities: this.capabilities,
      supportedTaskTypes: this.supportedTaskTypes,
      supportedFrameworks: this.supportedFrameworks,
      supportedLanguages: this.supportedLanguages,
      supportedStyling: this.supportedStyling,
      maxConcurrentTasks: this.maxConcurrentTasks,
      currentTasks: this.currentTasks,
      loadFactor: this.loadFactor,
      loadDescription: this.getLoadDescription(),
      version: this.version,
      metadata: this.metadata,
      performance: {
        ...this.performance,
        formattedUptime: this.getFormattedUptime(),
        successRateFormatted: `${this.performance.successRate.toFixed(1)}%`
      },
      healthStatus: this.getHealthStatus(),
      isHealthy: this.isHealthy(),
      isAvailable: this.isAvailable(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastHeartbeat: this.lastHeartbeat,
      lastTaskAt: this.lastTaskAt
    };
  }

  toSummary() {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      currentTasks: this.currentTasks,
      maxConcurrentTasks: this.maxConcurrentTasks,
      loadFactor: this.loadFactor,
      loadDescription: this.getLoadDescription(),
      healthStatus: this.getHealthStatus(),
      successRate: `${this.performance.successRate.toFixed(1)}%`,
      uptime: this.getFormattedUptime(),
      lastHeartbeat: this.lastHeartbeat
    };
  }
}

module.exports = Agent;