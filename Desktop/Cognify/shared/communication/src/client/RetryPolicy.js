import pRetry from 'p-retry';
import pTimeout from 'p-timeout';

/**
 * Retry policy implementation with exponential backoff and jitter
 */
class RetryPolicy {
  constructor(options = {}) {
    this.options = {
      retries: 3,
      retryDelay: 1000,
      maxRetryDelay: 30000,
      factor: 2,
      randomize: true,
      timeout: 30000,
      retryCondition: this._defaultRetryCondition,
      onRetry: null,
      ...options
    };

    this.logger = options.logger;
    this.metrics = options.metrics;

    // Statistics
    this.stats = {
      totalAttempts: 0,
      totalRetries: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      totalTimeouts: 0,
      averageAttempts: 0,
      lastReset: Date.now()
    };
  }

  /**
   * Execute function with retry policy
   * @param {Function} fn - Function to execute
   * @param {Object} options - Override options for this execution
   * @returns {Promise} Result of function execution
   */
  async execute(fn, options = {}) {
    const config = { ...this.options, ...options };
    const startTime = Date.now();
    let attemptCount = 0;

    this.stats.totalAttempts++;

    try {
      const result = await pRetry(async (attempt) => {
        attemptCount = attempt;
        
        if (this.logger && attempt > 1) {
          this.logger.debug('Retrying function execution', {
            attempt,
            maxRetries: config.retries,
            delay: this._calculateDelay(attempt - 1, config)
          });
        }

        // Execute with timeout if specified
        if (config.timeout) {
          return pTimeout(fn(), config.timeout, `Operation timed out after ${config.timeout}ms`);
        }

        return fn();
      }, {
        retries: config.retries,
        factor: config.factor,
        minTimeout: config.retryDelay,
        maxTimeout: config.maxRetryDelay,
        randomize: config.randomize,
        onFailedAttempt: (error) => {
          this.stats.totalRetries++;
          
          // Check if we should retry this error
          if (!config.retryCondition(error)) {
            throw new pRetry.AbortError(error);
          }

          const duration = Date.now() - startTime;
          
          if (this.logger) {
            this.logger.warn('Function execution failed, retrying', {
              attempt: error.attemptNumber,
              retriesLeft: error.retriesLeft,
              error: error.message,
              duration
            });
          }

          // Record metrics
          if (this.metrics) {
            this.metrics.recordRetryAttempt({
              attempt: error.attemptNumber,
              retriesLeft: error.retriesLeft,
              error: error.message,
              duration
            });
          }

          // Call custom onRetry callback
          if (config.onRetry) {
            config.onRetry(error, error.attemptNumber);
          }
        }
      });

      // Record success
      this.stats.totalSuccesses++;
      this._updateAverageAttempts(attemptCount);
      
      const duration = Date.now() - startTime;
      
      if (this.logger && attemptCount > 1) {
        this.logger.info('Function execution succeeded after retries', {
          attempts: attemptCount,
          duration
        });
      }

      // Record metrics
      if (this.metrics) {
        this.metrics.recordRetrySuccess({
          attempts: attemptCount,
          duration
        });
      }

      return result;
    } catch (error) {
      this.stats.totalFailures++;
      this._updateAverageAttempts(attemptCount);
      
      const duration = Date.now() - startTime;
      
      // Check if it was a timeout
      if (error.name === 'TimeoutError') {
        this.stats.totalTimeouts++;
      }
      
      if (this.logger) {
        this.logger.error('Function execution failed after all retries', {
          attempts: attemptCount,
          maxRetries: config.retries,
          error: error.message,
          duration
        });
      }

      // Record metrics
      if (this.metrics) {
        this.metrics.recordRetryFailure({
          attempts: attemptCount,
          error: error.message,
          duration,
          timeout: error.name === 'TimeoutError'
        });
      }

      throw error;
    }
  }

  /**
   * Execute function with custom retry configuration
   * @param {Function} fn - Function to execute
   * @param {number} retries - Number of retries
   * @param {number} delay - Initial delay between retries
   * @param {Object} options - Additional options
   * @returns {Promise} Result of function execution
   */
  async executeWithConfig(fn, retries, delay, options = {}) {
    return this.execute(fn, {
      retries,
      retryDelay: delay,
      ...options
    });
  }

  /**
   * Execute function with exponential backoff
   * @param {Function} fn - Function to execute
   * @param {Object} options - Override options
   * @returns {Promise} Result of function execution
   */
  async executeWithExponentialBackoff(fn, options = {}) {
    return this.execute(fn, {
      factor: 2,
      randomize: true,
      ...options
    });
  }

  /**
   * Execute function with linear backoff
   * @param {Function} fn - Function to execute
   * @param {Object} options - Override options
   * @returns {Promise} Result of function execution
   */
  async executeWithLinearBackoff(fn, options = {}) {
    return this.execute(fn, {
      factor: 1,
      randomize: false,
      ...options
    });
  }

  /**
   * Execute function with fixed delay
   * @param {Function} fn - Function to execute
   * @param {number} delay - Fixed delay between retries
   * @param {Object} options - Override options
   * @returns {Promise} Result of function execution
   */
  async executeWithFixedDelay(fn, delay, options = {}) {
    return this.execute(fn, {
      retryDelay: delay,
      maxRetryDelay: delay,
      factor: 1,
      randomize: false,
      ...options
    });
  }

  /**
   * Execute function with immediate retry (no delay)
   * @param {Function} fn - Function to execute
   * @param {Object} options - Override options
   * @returns {Promise} Result of function execution
   */
  async executeWithImmediateRetry(fn, options = {}) {
    return this.execute(fn, {
      retryDelay: 0,
      maxRetryDelay: 0,
      factor: 1,
      randomize: false,
      ...options
    });
  }

  /**
   * Default retry condition - retries on network errors and 5xx status codes
   * @param {Error} error - The error to check
   * @returns {boolean} True if should retry
   */
  _defaultRetryCondition(error) {
    // Don't retry on client errors (4xx)
    if (error.response && error.response.status >= 400 && error.response.status < 500) {
      return false;
    }

    // Retry on network errors
    if (error.code === 'ECONNRESET' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT') {
      return true;
    }

    // Retry on server errors (5xx)
    if (error.response && error.response.status >= 500) {
      return true;
    }

    // Retry on timeout errors
    if (error.name === 'TimeoutError') {
      return true;
    }

    // Don't retry by default
    return false;
  }

  /**
   * Calculate delay for a given attempt
   * @param {number} attempt - Attempt number (0-based)
   * @param {Object} config - Configuration object
   * @returns {number} Delay in milliseconds
   */
  _calculateDelay(attempt, config) {
    let delay = config.retryDelay * Math.pow(config.factor, attempt);
    
    if (config.randomize) {
      delay = delay * (0.5 + Math.random() * 0.5); // Add jitter
    }
    
    return Math.min(delay, config.maxRetryDelay);
  }

  /**
   * Update average attempts statistic
   * @param {number} attempts - Number of attempts for this execution
   */
  _updateAverageAttempts(attempts) {
    const totalExecutions = this.stats.totalSuccesses + this.stats.totalFailures;
    if (totalExecutions > 0) {
      this.stats.averageAttempts = (
        (this.stats.averageAttempts * (totalExecutions - 1) + attempts) / totalExecutions
      );
    }
  }

  /**
   * Create a retry condition for specific HTTP status codes
   * @param {number[]} statusCodes - Array of status codes to retry on
   * @returns {Function} Retry condition function
   */
  static createStatusCodeRetryCondition(statusCodes) {
    return (error) => {
      if (error.response && statusCodes.includes(error.response.status)) {
        return true;
      }
      return RetryPolicy.prototype._defaultRetryCondition(error);
    };
  }

  /**
   * Create a retry condition for specific error codes
   * @param {string[]} errorCodes - Array of error codes to retry on
   * @returns {Function} Retry condition function
   */
  static createErrorCodeRetryCondition(errorCodes) {
    return (error) => {
      if (errorCodes.includes(error.code)) {
        return true;
      }
      return RetryPolicy.prototype._defaultRetryCondition(error);
    };
  }

  /**
   * Create a retry condition that combines multiple conditions with OR logic
   * @param {Function[]} conditions - Array of retry condition functions
   * @returns {Function} Combined retry condition function
   */
  static createOrRetryCondition(conditions) {
    return (error) => {
      return conditions.some(condition => condition(error));
    };
  }

  /**
   * Create a retry condition that combines multiple conditions with AND logic
   * @param {Function[]} conditions - Array of retry condition functions
   * @returns {Function} Combined retry condition function
   */
  static createAndRetryCondition(conditions) {
    return (error) => {
      return conditions.every(condition => condition(error));
    };
  }

  /**
   * Get retry policy statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalAttempts > 0 ? 
        (this.stats.totalSuccesses / this.stats.totalAttempts) * 100 : 0,
      retryRate: this.stats.totalAttempts > 0 ? 
        (this.stats.totalRetries / this.stats.totalAttempts) * 100 : 0,
      timeoutRate: this.stats.totalAttempts > 0 ? 
        (this.stats.totalTimeouts / this.stats.totalAttempts) * 100 : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalAttempts: 0,
      totalRetries: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      totalTimeouts: 0,
      averageAttempts: 0,
      lastReset: Date.now()
    };

    if (this.logger) {
      this.logger.info('Retry policy statistics reset');
    }
  }

  /**
   * Update retry policy options
   * @param {Object} newOptions - New options to merge
   */
  updateOptions(newOptions) {
    this.options = {
      ...this.options,
      ...newOptions
    };

    if (this.logger) {
      this.logger.info('Retry policy options updated', { options: this.options });
    }
  }

  /**
   * Get current retry policy configuration
   * @returns {Object} Current options
   */
  getOptions() {
    return { ...this.options };
  }
}

export default RetryPolicy;