/**
 * Load balancer for distributing requests across service instances
 */
class LoadBalancer {
  constructor(options = {}) {
    this.options = {
      strategy: 'round_robin',
      healthCheckEnabled: true,
      ...options
    };

    this.logger = options.logger;
    
    // Strategy-specific state
    this.roundRobinIndex = new Map();
    this.weightedState = new Map();
    this.leastConnectionsState = new Map();
    
    // Statistics
    this.stats = {
      totalSelections: 0,
      selectionsByStrategy: {},
      instanceSelections: new Map()
    };
  }

  /**
   * Select an instance from the available instances
   * @param {Array} instances - Available service instances
   * @param {Object} options - Selection options
   * @returns {Object} Selected instance
   */
  select(instances, options = {}) {
    if (!instances || instances.length === 0) {
      throw new Error('No instances available for load balancing');
    }

    if (instances.length === 1) {
      this._recordSelection(instances[0], 'single');
      return instances[0];
    }

    const strategy = options.strategy || this.options.strategy;
    let selectedInstance;

    switch (strategy) {
      case 'round_robin':
        selectedInstance = this._roundRobinSelect(instances, options);
        break;
      case 'weighted_round_robin':
        selectedInstance = this._weightedRoundRobinSelect(instances, options);
        break;
      case 'least_connections':
        selectedInstance = this._leastConnectionsSelect(instances, options);
        break;
      case 'random':
        selectedInstance = this._randomSelect(instances, options);
        break;
      case 'weighted_random':
        selectedInstance = this._weightedRandomSelect(instances, options);
        break;
      case 'ip_hash':
        selectedInstance = this._ipHashSelect(instances, options);
        break;
      case 'least_response_time':
        selectedInstance = this._leastResponseTimeSelect(instances, options);
        break;
      case 'health_aware':
        selectedInstance = this._healthAwareSelect(instances, options);
        break;
      default:
        selectedInstance = this._roundRobinSelect(instances, options);
    }

    this._recordSelection(selectedInstance, strategy);
    return selectedInstance;
  }

  /**
   * Round robin selection
   * @param {Array} instances - Available instances
   * @param {Object} options - Selection options
   * @returns {Object} Selected instance
   */
  _roundRobinSelect(instances, options = {}) {
    const serviceKey = options.serviceKey || 'default';
    
    if (!this.roundRobinIndex.has(serviceKey)) {
      this.roundRobinIndex.set(serviceKey, 0);
    }

    const currentIndex = this.roundRobinIndex.get(serviceKey);
    const selectedInstance = instances[currentIndex % instances.length];
    
    this.roundRobinIndex.set(serviceKey, currentIndex + 1);
    
    return selectedInstance;
  }

  /**
   * Weighted round robin selection
   * @param {Array} instances - Available instances
   * @param {Object} options - Selection options
   * @returns {Object} Selected instance
   */
  _weightedRoundRobinSelect(instances, options = {}) {
    const serviceKey = options.serviceKey || 'default';
    
    if (!this.weightedState.has(serviceKey)) {
      this.weightedState.set(serviceKey, {
        currentWeights: instances.map(instance => instance.weight || 1),
        totalWeight: instances.reduce((sum, instance) => sum + (instance.weight || 1), 0)
      });
    }

    const state = this.weightedState.get(serviceKey);
    
    // Find instance with highest current weight
    let maxWeight = -1;
    let selectedIndex = 0;
    
    for (let i = 0; i < instances.length; i++) {
      if (state.currentWeights[i] > maxWeight) {
        maxWeight = state.currentWeights[i];
        selectedIndex = i;
      }
    }

    // Decrease selected instance's current weight by total weight
    state.currentWeights[selectedIndex] -= state.totalWeight;
    
    // Increase all instances' current weights by their original weights
    for (let i = 0; i < instances.length; i++) {
      state.currentWeights[i] += instances[i].weight || 1;
    }

    return instances[selectedIndex];
  }

  /**
   * Least connections selection
   * @param {Array} instances - Available instances
   * @param {Object} options - Selection options
   * @returns {Object} Selected instance
   */
  _leastConnectionsSelect(instances, options = {}) {
    let minConnections = Infinity;
    let selectedInstance = instances[0];

    for (const instance of instances) {
      const instanceKey = this._getInstanceKey(instance);
      const connections = this.leastConnectionsState.get(instanceKey) || 0;
      
      if (connections < minConnections) {
        minConnections = connections;
        selectedInstance = instance;
      }
    }

    return selectedInstance;
  }

  /**
   * Random selection
   * @param {Array} instances - Available instances
   * @returns {Object} Selected instance
   */
  _randomSelect(instances) {
    const randomIndex = Math.floor(Math.random() * instances.length);
    return instances[randomIndex];
  }

  /**
   * Weighted random selection
   * @param {Array} instances - Available instances
   * @returns {Object} Selected instance
   */
  _weightedRandomSelect(instances) {
    const totalWeight = instances.reduce((sum, instance) => sum + (instance.weight || 1), 0);
    let randomWeight = Math.random() * totalWeight;
    
    for (const instance of instances) {
      randomWeight -= instance.weight || 1;
      if (randomWeight <= 0) {
        return instance;
      }
    }
    
    // Fallback to last instance
    return instances[instances.length - 1];
  }

  /**
   * IP hash selection (consistent hashing)
   * @param {Array} instances - Available instances
   * @param {Object} options - Selection options
   * @returns {Object} Selected instance
   */
  _ipHashSelect(instances, options = {}) {
    const clientIp = options.clientIp || options.sourceIp || 'unknown';
    const hash = this._simpleHash(clientIp);
    const index = hash % instances.length;
    
    return instances[index];
  }

  /**
   * Least response time selection
   * @param {Array} instances - Available instances
   * @returns {Object} Selected instance
   */
  _leastResponseTimeSelect(instances) {
    let minResponseTime = Infinity;
    let selectedInstance = instances[0];

    for (const instance of instances) {
      const responseTime = instance.averageResponseTime || instance.responseTime || 0;
      
      if (responseTime < minResponseTime) {
        minResponseTime = responseTime;
        selectedInstance = instance;
      }
    }

    return selectedInstance;
  }

  /**
   * Health-aware selection (combines health score with load balancing)
   * @param {Array} instances - Available instances
   * @param {Object} options - Selection options
   * @returns {Object} Selected instance
   */
  _healthAwareSelect(instances, options = {}) {
    // Filter out unhealthy instances
    const healthyInstances = instances.filter(instance => {
      const healthScore = instance.healthScore || 1.0;
      const isHealthy = instance.healthy !== false;
      return isHealthy && healthScore > 0.5;
    });

    if (healthyInstances.length === 0) {
      // If no healthy instances, fall back to all instances
      return this._roundRobinSelect(instances, options);
    }

    // Weight instances by health score
    const weightedInstances = healthyInstances.map(instance => ({
      ...instance,
      weight: (instance.weight || 1) * (instance.healthScore || 1.0)
    }));

    return this._weightedRandomSelect(weightedInstances);
  }

  /**
   * Record connection start for least connections strategy
   * @param {Object} instance - Service instance
   */
  recordConnectionStart(instance) {
    const instanceKey = this._getInstanceKey(instance);
    const currentConnections = this.leastConnectionsState.get(instanceKey) || 0;
    this.leastConnectionsState.set(instanceKey, currentConnections + 1);
  }

  /**
   * Record connection end for least connections strategy
   * @param {Object} instance - Service instance
   */
  recordConnectionEnd(instance) {
    const instanceKey = this._getInstanceKey(instance);
    const currentConnections = this.leastConnectionsState.get(instanceKey) || 0;
    this.leastConnectionsState.set(instanceKey, Math.max(0, currentConnections - 1));
  }

  /**
   * Update instance response time
   * @param {Object} instance - Service instance
   * @param {number} responseTime - Response time in milliseconds
   */
  updateResponseTime(instance, responseTime) {
    const instanceKey = this._getInstanceKey(instance);
    
    // Simple moving average (can be enhanced with more sophisticated algorithms)
    const currentAvg = instance.averageResponseTime || responseTime;
    const alpha = 0.1; // Smoothing factor
    instance.averageResponseTime = alpha * responseTime + (1 - alpha) * currentAvg;
  }

  /**
   * Update instance health score
   * @param {Object} instance - Service instance
   * @param {number} healthScore - Health score (0.0 to 1.0)
   */
  updateHealthScore(instance, healthScore) {
    instance.healthScore = Math.max(0, Math.min(1, healthScore));
  }

  /**
   * Get instance key for tracking
   * @param {Object} instance - Service instance
   * @returns {string} Instance key
   */
  _getInstanceKey(instance) {
    return `${instance.host || instance.address}:${instance.port}`;
  }

  /**
   * Simple hash function for IP hashing
   * @param {string} str - String to hash
   * @returns {number} Hash value
   */
  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Record selection statistics
   * @param {Object} instance - Selected instance
   * @param {string} strategy - Selection strategy used
   */
  _recordSelection(instance, strategy) {
    this.stats.totalSelections++;
    
    // Record by strategy
    if (!this.stats.selectionsByStrategy[strategy]) {
      this.stats.selectionsByStrategy[strategy] = 0;
    }
    this.stats.selectionsByStrategy[strategy]++;
    
    // Record by instance
    const instanceKey = this._getInstanceKey(instance);
    const currentCount = this.stats.instanceSelections.get(instanceKey) || 0;
    this.stats.instanceSelections.set(instanceKey, currentCount + 1);

    if (this.logger) {
      this.logger.debug('Load balancer selection', {
        strategy,
        instance: instanceKey,
        totalSelections: this.stats.totalSelections
      });
    }
  }

  /**
   * Get load balancer statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const instanceStats = {};
    for (const [instanceKey, count] of this.stats.instanceSelections) {
      instanceStats[instanceKey] = {
        selections: count,
        percentage: this.stats.totalSelections > 0 ? 
          (count / this.stats.totalSelections) * 100 : 0
      };
    }

    return {
      totalSelections: this.stats.totalSelections,
      selectionsByStrategy: this.stats.selectionsByStrategy,
      instanceSelections: instanceStats,
      activeConnections: Object.fromEntries(this.leastConnectionsState)
    };
  }

  /**
   * Reset load balancer state
   * @param {string} serviceKey - Optional service key to reset specific service
   */
  reset(serviceKey = null) {
    if (serviceKey) {
      this.roundRobinIndex.delete(serviceKey);
      this.weightedState.delete(serviceKey);
    } else {
      this.roundRobinIndex.clear();
      this.weightedState.clear();
      this.leastConnectionsState.clear();
      this.stats = {
        totalSelections: 0,
        selectionsByStrategy: {},
        instanceSelections: new Map()
      };
    }

    if (this.logger) {
      this.logger.info('Load balancer state reset', { serviceKey });
    }
  }

  /**
   * Get available load balancing strategies
   * @returns {Array} Array of strategy names
   */
  static getAvailableStrategies() {
    return [
      'round_robin',
      'weighted_round_robin',
      'least_connections',
      'random',
      'weighted_random',
      'ip_hash',
      'least_response_time',
      'health_aware'
    ];
  }

  /**
   * Validate load balancing strategy
   * @param {string} strategy - Strategy to validate
   * @returns {boolean} Whether strategy is valid
   */
  static isValidStrategy(strategy) {
    return LoadBalancer.getAvailableStrategies().includes(strategy);
  }
}

export default LoadBalancer;