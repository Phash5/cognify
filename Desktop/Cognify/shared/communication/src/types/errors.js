/**
 * Custom error types for inter-service communication
 */

/**
 * Base class for all communication errors
 */
class CommunicationError extends Error {
  constructor(message, code = 'COMMUNICATION_ERROR', statusCode = 500, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging/serialization
   * @returns {Object} JSON representation of the error
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }

  /**
   * Create error response object for HTTP responses
   * @returns {Object} Error response object
   */
  toResponse() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp
      }
    };
  }
}

/**
 * Service not found error
 */
class ServiceNotFoundError extends CommunicationError {
  constructor(message, details = {}) {
    super(message, 'SERVICE_NOT_FOUND', 404, details);
  }
}

/**
 * Service unavailable error
 */
class ServiceUnavailableError extends CommunicationError {
  constructor(message, details = {}) {
    super(message, 'SERVICE_UNAVAILABLE', 503, details);
  }
}

/**
 * Service timeout error
 */
class ServiceTimeoutError extends CommunicationError {
  constructor(message, timeout, details = {}) {
    super(message, 'SERVICE_TIMEOUT', 408, { timeout, ...details });
    this.timeout = timeout;
  }
}

/**
 * Circuit breaker open error
 */
class CircuitBreakerOpenError extends CommunicationError {
  constructor(message, details = {}) {
    super(message, 'CIRCUIT_BREAKER_OPEN', 503, details);
  }
}

/**
 * Rate limit exceeded error
 */
class RateLimitExceededError extends CommunicationError {
  constructor(message, limit, windowMs, details = {}) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, { limit, windowMs, ...details });
    this.limit = limit;
    this.windowMs = windowMs;
  }
}

/**
 * Authentication error
 */
class AuthenticationError extends CommunicationError {
  constructor(message, details = {}) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
  }
}

/**
 * Authorization error
 */
class AuthorizationError extends CommunicationError {
  constructor(message, details = {}) {
    super(message, 'AUTHORIZATION_ERROR', 403, details);
  }
}

/**
 * Validation error
 */
class ValidationError extends CommunicationError {
  constructor(message, validationErrors = [], details = {}) {
    super(message, 'VALIDATION_ERROR', 400, { validationErrors, ...details });
    this.validationErrors = validationErrors;
  }
}

/**
 * Network error
 */
class NetworkError extends CommunicationError {
  constructor(message, originalError, details = {}) {
    super(message, 'NETWORK_ERROR', 0, details);
    this.originalError = originalError;
  }
}

/**
 * Service discovery error
 */
class ServiceDiscoveryError extends CommunicationError {
  constructor(message, details = {}) {
    super(message, 'SERVICE_DISCOVERY_ERROR', 500, details);
  }
}

/**
 * Load balancer error
 */
class LoadBalancerError extends CommunicationError {
  constructor(message, details = {}) {
    super(message, 'LOAD_BALANCER_ERROR', 500, details);
  }
}

/**
 * Retry exhausted error
 */
class RetryExhaustedError extends CommunicationError {
  constructor(message, attempts, lastError, details = {}) {
    super(message, 'RETRY_EXHAUSTED', 500, { attempts, lastError: lastError?.message, ...details });
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * Configuration error
 */
class ConfigurationError extends CommunicationError {
  constructor(message, details = {}) {
    super(message, 'CONFIGURATION_ERROR', 500, details);
  }
}

/**
 * Serialization error
 */
class SerializationError extends CommunicationError {
  constructor(message, data, details = {}) {
    super(message, 'SERIALIZATION_ERROR', 500, { dataType: typeof data, ...details });
    this.data = data;
  }
}

/**
 * Deserialization error
 */
class DeserializationError extends CommunicationError {
  constructor(message, rawData, details = {}) {
    super(message, 'DESERIALIZATION_ERROR', 500, details);
    this.rawData = rawData;
  }
}

/**
 * Health check error
 */
class HealthCheckError extends CommunicationError {
  constructor(message, serviceName, details = {}) {
    super(message, 'HEALTH_CHECK_ERROR', 503, { serviceName, ...details });
    this.serviceName = serviceName;
  }
}

/**
 * Metrics error
 */
class MetricsError extends CommunicationError {
  constructor(message, metricName, details = {}) {
    super(message, 'METRICS_ERROR', 500, { metricName, ...details });
    this.metricName = metricName;
  }
}

/**
 * Tracing error
 */
class TracingError extends CommunicationError {
  constructor(message, spanName, details = {}) {
    super(message, 'TRACING_ERROR', 500, { spanName, ...details });
    this.spanName = spanName;
  }
}

/**
 * Error factory for creating errors from HTTP responses
 */
class ErrorFactory {
  /**
   * Create error from HTTP response
   * @param {Object} response - HTTP response object
   * @param {string} serviceName - Name of the service that returned the error
   * @returns {CommunicationError} Appropriate error instance
   */
  static fromHttpResponse(response, serviceName = 'unknown') {
    const { status, statusText, data } = response;
    const message = data?.error?.message || data?.message || statusText || 'Unknown error';
    const details = {
      serviceName,
      status,
      statusText,
      responseData: data
    };

    switch (status) {
      case 400:
        return new ValidationError(message, data?.error?.validationErrors, details);
      case 401:
        return new AuthenticationError(message, details);
      case 403:
        return new AuthorizationError(message, details);
      case 404:
        return new ServiceNotFoundError(message, details);
      case 408:
        return new ServiceTimeoutError(message, data?.timeout, details);
      case 429:
        return new RateLimitExceededError(message, data?.limit, data?.windowMs, details);
      case 503:
        return new ServiceUnavailableError(message, details);
      default:
        return new CommunicationError(message, 'HTTP_ERROR', status, details);
    }
  }

  /**
   * Create error from network/request error
   * @param {Error} error - Original error
   * @param {string} serviceName - Name of the service
   * @returns {CommunicationError} Appropriate error instance
   */
  static fromNetworkError(error, serviceName = 'unknown') {
    const details = { serviceName, originalError: error.message };

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new ServiceUnavailableError(
        `Service '${serviceName}' is not reachable: ${error.message}`,
        details
      );
    }

    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      return new ServiceTimeoutError(
        `Request to service '${serviceName}' timed out: ${error.message}`,
        error.timeout,
        details
      );
    }

    return new NetworkError(
      `Network error when communicating with service '${serviceName}': ${error.message}`,
      error,
      details
    );
  }

  /**
   * Check if error is retryable
   * @param {Error} error - Error to check
   * @returns {boolean} Whether the error is retryable
   */
  static isRetryable(error) {
    if (error instanceof NetworkError) {
      return true;
    }

    if (error instanceof ServiceTimeoutError) {
      return true;
    }

    if (error instanceof ServiceUnavailableError) {
      return true;
    }

    if (error instanceof CommunicationError) {
      // Retry on 5xx errors (except 501 Not Implemented)
      return error.statusCode >= 500 && error.statusCode !== 501;
    }

    return false;
  }

  /**
   * Check if error should trigger circuit breaker
   * @param {Error} error - Error to check
   * @returns {boolean} Whether the error should trigger circuit breaker
   */
  static shouldTriggerCircuitBreaker(error) {
    if (error instanceof ServiceUnavailableError) {
      return true;
    }

    if (error instanceof ServiceTimeoutError) {
      return true;
    }

    if (error instanceof NetworkError) {
      return true;
    }

    if (error instanceof CommunicationError) {
      // Trigger on 5xx errors
      return error.statusCode >= 500;
    }

    return false;
  }
}

/**
 * Error handler utility
 */
class ErrorHandler {
  /**
   * Handle and transform errors for consistent error responses
   * @param {Error} error - Error to handle
   * @param {Object} context - Additional context
   * @returns {CommunicationError} Transformed error
   */
  static handle(error, context = {}) {
    if (error instanceof CommunicationError) {
      return error;
    }

    // Handle Axios errors
    if (error.response) {
      return ErrorFactory.fromHttpResponse(error.response, context.serviceName);
    }

    if (error.request) {
      return ErrorFactory.fromNetworkError(error, context.serviceName);
    }

    // Handle other errors
    return new CommunicationError(
      error.message || 'Unknown error occurred',
      'UNKNOWN_ERROR',
      500,
      { originalError: error.message, ...context }
    );
  }

  /**
   * Log error with appropriate level
   * @param {Error} error - Error to log
   * @param {Object} logger - Logger instance
   * @param {Object} context - Additional context
   */
  static log(error, logger, context = {}) {
    if (!logger) return;

    const logData = {
      error: error instanceof CommunicationError ? error.toJSON() : {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      ...context
    };

    if (error instanceof CommunicationError) {
      if (error.statusCode >= 500) {
        logger.error('Communication error', logData);
      } else if (error.statusCode >= 400) {
        logger.warn('Client error', logData);
      } else {
        logger.info('Communication info', logData);
      }
    } else {
      logger.error('Unexpected error', logData);
    }
  }
}

export {
  CommunicationError,
  ServiceNotFoundError,
  ServiceUnavailableError,
  ServiceTimeoutError,
  CircuitBreakerOpenError,
  RateLimitExceededError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NetworkError,
  ServiceDiscoveryError,
  LoadBalancerError,
  RetryExhaustedError,
  ConfigurationError,
  SerializationError,
  DeserializationError,
  HealthCheckError,
  MetricsError,
  TracingError,
  ErrorFactory,
  ErrorHandler
};

export default {
  CommunicationError,
  ServiceNotFoundError,
  ServiceUnavailableError,
  ServiceTimeoutError,
  CircuitBreakerOpenError,
  RateLimitExceededError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NetworkError,
  ServiceDiscoveryError,
  LoadBalancerError,
  RetryExhaustedError,
  ConfigurationError,
  SerializationError,
  DeserializationError,
  HealthCheckError,
  MetricsError,
  TracingError,
  ErrorFactory,
  ErrorHandler
};