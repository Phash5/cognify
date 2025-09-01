import EventEmitter from 'events';
import { CircuitBreakerError } from '../types/errors.js';

/**
 * Circuit breaker states
 */
const STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

/**
 * Circuit Breaker implementation for fault tolerance
 * 
 * Prevents cascading failures by monitoring request failures
 * and temporarily blocking requests when failure threshold is exceeded.
 */
class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      threshold: 5,           // Number of failures before opening
      timeout: 60000,         // Time to wait before attempting reset (ms)
      resetTimeout: 30000,    // Time to wait in half-open state (ms)
      monitoringPeriod: 10000, // Period to monitor for failures (ms)
      volumeThreshold: 10,    // Minimum number of requests before considering failure rate
      errorThresholdPercentage: 50, // Percentage of errors to trigger opening
      ...options
    };

    this.logger = options.logger;
    this.metrics = options.metrics;

    // Circuit breaker state
    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    
    // Statistics tracking
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      totalTimeouts: 0,
      totalRejections: 0,
      stateChanges: 0,
      lastStateChange: null,
      uptime: Date.now()
    };

    // Sliding window for monitoring
    this.requestWindow = [];
    
    // Cleanup interval
    this.cleanupInterval = setInterval(() => {
      this._cleanupWindow();
    }, this.options.monitoringPeriod);

    // Bind methods
    this.execute = this.execute.bind(this);
    this.call = this.call.bind(this);
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Function to execute
   * @param {...any} args - Arguments to pass to function
   * @returns {Promise} Result of function execution
   */
  async execute(fn, ...args) {
    return this.call(fn, ...args);
  }

  /**
   * Call a function with circuit breaker protection
   * @param {Function} fn - Function to call
   * @param {...any} args - Arguments to pass to function
   * @returns {Promise} Result of function call
   */
  async call(fn, ...args) {
    this.stats.totalRequests++;
    this.requestCount++;

    // Check if circuit breaker should reject the request
    if (this._shouldReject()) {
      this.stats.totalRejections++;
      const error = new CircuitBreakerError(
        `Circuit breaker is ${this.state}. Request rejected.`,
        this.state
      );
      
      if (this.logger) {
        this.logger.warn('Circuit breaker rejected request', {
          state: this.state,
          failureCount: this.failureCount,
          requestCount: this.requestCount
        });
      }

      this.emit('reject', error, this.stats);
      throw error;
    }

    const startTime = Date.now();
    
    try {
      // Execute the function
      const result = await fn(...args);
      
      // Record success
      this._onSuccess(Date.now() - startTime);
      
      return result;
    } catch (error) {
      // Record failure
      this._onFailure(error, Date.now() - startTime);
      
      throw error;
    }
  }

  /**
   * Handle successful execution
   * @param {number} duration - Execution duration in ms
   */
  _onSuccess(duration) {
    this.stats.totalSuccesses++;
    this.successCount++;
    
    // Add to request window
    this.requestWindow.push({
      timestamp: Date.now(),
      success: true,
      duration
    });

    // Reset failure count on success
    if (this.state === STATES.HALF_OPEN) {
      this._transitionTo(STATES.CLOSED);
    } else if (this.state === STATES.CLOSED) {
      this.failureCount = 0;
    }

    // Record metrics
    if (this.metrics) {
      this.metrics.recordCircuitBreakerSuccess({
        state: this.state,
        duration,
        successCount: this.successCount,
        failureCount: this.failureCount
      });
    }

    this.emit('success', {
      duration,
      state: this.state,
      stats: this.stats
    });
  }

  /**
   * Handle failed execution
   * @param {Error} error - The error that occurred
   * @param {number} duration - Execution duration in ms
   */
  _onFailure(error, duration) {
    this.stats.totalFailures++;
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    // Add to request window
    this.requestWindow.push({
      timestamp: Date.now(),
      success: false,
      error: error.message,
      duration
    });

    // Check if we should open the circuit
    if (this._shouldOpen()) {
      this._transitionTo(STATES.OPEN);
    }

    // Record metrics
    if (this.metrics) {
      this.metrics.recordCircuitBreakerFailure({
        state: this.state,
        error: error.message,
        duration,
        successCount: this.successCount,
        failureCount: this.failureCount
      });
    }

    this.emit('failure', {
      error,
      duration,
      state: this.state,
      failureCount: this.failureCount,
      stats: this.stats
    });
  }

  /**
   * Check if the request should be rejected
   * @returns {boolean} True if request should be rejected
   */
  _shouldReject() {
    if (this.state === STATES.CLOSED) {
      return false;
    }

    if (this.state === STATES.OPEN) {
      // Check if enough time has passed to attempt reset
      if (Date.now() - this.lastFailureTime >= this.options.timeout) {
        this._transitionTo(STATES.HALF_OPEN);
        return false;
      }
      return true;
    }

    if (this.state === STATES.HALF_OPEN) {
      // Allow limited requests in half-open state
      return false;
    }

    return false;
  }

  /**
   * Check if circuit should be opened
   * @returns {boolean} True if circuit should be opened
   */
  _shouldOpen() {
    // Simple threshold-based opening
    if (this.failureCount >= this.options.threshold) {
      return true;
    }

    // Percentage-based opening with volume threshold
    if (this.requestCount >= this.options.volumeThreshold) {
      const failureRate = (this.failureCount / this.requestCount) * 100;
      return failureRate >= this.options.errorThresholdPercentage;
    }

    return false;
  }

  /**
   * Transition to a new state
   * @param {string} newState - The new state to transition to
   */
  _transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.stats.stateChanges++;
    this.stats.lastStateChange = Date.now();

    // Reset counters on state change
    if (newState === STATES.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
      this.requestCount = 0;
    } else if (newState === STATES.HALF_OPEN) {
      this.successCount = 0;
      this.requestCount = 0;
    } else if (newState === STATES.OPEN) {
      this.nextAttempt = Date.now() + this.options.timeout;
    }

    if (this.logger) {
      this.logger.info('Circuit breaker state changed', {
        from: oldState,
        to: newState,
        failureCount: this.failureCount,
        requestCount: this.requestCount,
        stats: this.stats
      });
    }

    // Record metrics
    if (this.metrics) {
      this.metrics.recordCircuitBreakerStateChange({
        from: oldState,
        to: newState,
        failureCount: this.failureCount,
        requestCount: this.requestCount
      });
    }

    this.emit('stateChange', {
      from: oldState,
      to: newState,
      stats: this.stats
    });
  }

  /**
   * Clean up old entries from the request window
   */
  _cleanupWindow() {
    const cutoff = Date.now() - this.options.monitoringPeriod;
    this.requestWindow = this.requestWindow.filter(req => req.timestamp > cutoff);
  }

  /**
   * Get current circuit breaker status
   * @returns {Object} Current status information
   */
  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt,
      stats: { ...this.stats },
      options: { ...this.options },
      windowSize: this.requestWindow.length
    };
  }

  /**
   * Get failure rate from the current window
   * @returns {number} Failure rate as percentage
   */
  getFailureRate() {
    if (this.requestWindow.length === 0) {
      return 0;
    }

    const failures = this.requestWindow.filter(req => !req.success).length;
    return (failures / this.requestWindow.length) * 100;
  }

  /**
   * Get average response time from the current window
   * @returns {number} Average response time in ms
   */
  getAverageResponseTime() {
    if (this.requestWindow.length === 0) {
      return 0;
    }

    const totalDuration = this.requestWindow.reduce((sum, req) => sum + req.duration, 0);
    return totalDuration / this.requestWindow.length;
  }

  /**
   * Force circuit breaker to open
   */
  forceOpen() {
    this._transitionTo(STATES.OPEN);
  }

  /**
   * Force circuit breaker to close
   */
  forceClose() {
    this._transitionTo(STATES.CLOSED);
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset() {
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.requestWindow = [];
    
    this._transitionTo(STATES.CLOSED);
    
    if (this.logger) {
      this.logger.info('Circuit breaker reset');
    }

    this.emit('reset', { stats: this.stats });
  }

  /**
   * Check if circuit breaker is open
   * @returns {boolean} True if circuit is open
   */
  isOpen() {
    return this.state === STATES.OPEN;
  }

  /**
   * Check if circuit breaker is closed
   * @returns {boolean} True if circuit is closed
   */
  isClosed() {
    return this.state === STATES.CLOSED;
  }

  /**
   * Check if circuit breaker is half-open
   * @returns {boolean} True if circuit is half-open
   */
  isHalfOpen() {
    return this.state === STATES.HALF_OPEN;
  }

  /**
   * Destroy circuit breaker and cleanup resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.removeAllListeners();
    this.requestWindow = [];
    
    if (this.logger) {
      this.logger.info('Circuit breaker destroyed');
    }
  }
}

// Export states for external use
CircuitBreaker.STATES = STATES;

export default CircuitBreaker;