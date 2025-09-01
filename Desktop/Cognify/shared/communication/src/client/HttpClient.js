import axios from 'axios';
import axiosRetry from 'axios-retry';
import { v4 as uuidv4 } from 'uuid';
import CircuitBreaker from './CircuitBreaker.js';
import RetryPolicy from './RetryPolicy.js';
import { HttpError, TimeoutError, CircuitBreakerError } from '../types/errors.js';
import { HTTP_METHODS, HTTP_STATUS_CODES } from '../constants/http.js';

/**
 * Enhanced HTTP client with retry, circuit breaker, and observability features
 */
class HttpClient {
  constructor(options = {}) {
    this.options = {
      timeout: 30000,
      retries: 3,
      retryDelay: 1000,
      circuitBreaker: {
        enabled: true,
        threshold: 5,
        timeout: 60000,
        resetTimeout: 30000
      },
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Cognify-HttpClient/1.0.0'
      },
      ...options
    };

    this.logger = options.logger;
    this.metrics = options.metrics;
    this.tracer = options.tracer;

    // Initialize axios instance
    this.client = axios.create({
      timeout: this.options.timeout,
      headers: this.options.headers
    });

    // Setup retry policy
    this.retryPolicy = new RetryPolicy({
      retries: this.options.retries,
      retryDelay: this.options.retryDelay,
      logger: this.logger
    });

    // Setup circuit breaker if enabled
    if (this.options.circuitBreaker.enabled) {
      this.circuitBreaker = new CircuitBreaker({
        ...this.options.circuitBreaker,
        logger: this.logger,
        metrics: this.metrics
      });
    }

    // Setup axios retry
    axiosRetry(this.client, {
      retries: this.options.retries,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
               error.response?.status >= 500;
      }
    });

    // Setup interceptors
    this._setupRequestInterceptors();
    this._setupResponseInterceptors();
  }

  /**
   * Setup request interceptors
   */
  _setupRequestInterceptors() {
    this.client.interceptors.request.use(
      (config) => {
        // Add request ID
        config.headers['X-Request-ID'] = uuidv4();
        
        // Add timestamp
        config.metadata = {
          startTime: Date.now(),
          requestId: config.headers['X-Request-ID']
        };

        // Add tracing headers if tracer is available
        if (this.tracer) {
          const span = this.tracer.startSpan(`HTTP ${config.method?.toUpperCase()} ${config.url}`);
          config.metadata.span = span;
          
          // Inject trace context into headers
          this.tracer.inject(span, config.headers);
        }

        // Log request
        if (this.logger) {
          this.logger.info('HTTP request started', {
            method: config.method,
            url: config.url,
            requestId: config.metadata.requestId,
            headers: this._sanitizeHeaders(config.headers)
          });
        }

        return config;
      },
      (error) => {
        if (this.logger) {
          this.logger.error('HTTP request setup failed', { error: error.message });
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Setup response interceptors
   */
  _setupResponseInterceptors() {
    this.client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata.startTime;
        const requestId = response.config.metadata.requestId;

        // Record metrics
        if (this.metrics) {
          this.metrics.recordHttpRequest({
            method: response.config.method,
            status: response.status,
            duration,
            url: response.config.url
          });
        }

        // Finish tracing span
        if (response.config.metadata.span) {
          response.config.metadata.span.setStatus({ code: 1 }); // OK
          response.config.metadata.span.end();
        }

        // Log successful response
        if (this.logger) {
          this.logger.info('HTTP request completed', {
            method: response.config.method,
            url: response.config.url,
            status: response.status,
            duration,
            requestId
          });
        }

        return response;
      },
      (error) => {
        const config = error.config || {};
        const duration = config.metadata ? Date.now() - config.metadata.startTime : 0;
        const requestId = config.metadata?.requestId;
        const status = error.response?.status || 0;

        // Record metrics
        if (this.metrics) {
          this.metrics.recordHttpRequest({
            method: config.method,
            status,
            duration,
            url: config.url,
            error: true
          });
        }

        // Finish tracing span with error
        if (config.metadata?.span) {
          config.metadata.span.setStatus({ 
            code: 2, // ERROR
            message: error.message 
          });
          config.metadata.span.end();
        }

        // Log error
        if (this.logger) {
          this.logger.error('HTTP request failed', {
            method: config.method,
            url: config.url,
            status,
            duration,
            requestId,
            error: error.message
          });
        }

        // Transform error
        const transformedError = this._transformError(error);
        return Promise.reject(transformedError);
      }
    );
  }

  /**
   * Make HTTP request with circuit breaker and retry logic
   */
  async request(config) {
    const requestConfig = {
      ...config,
      headers: {
        ...this.options.headers,
        ...config.headers
      }
    };

    // Execute with circuit breaker if enabled
    if (this.circuitBreaker) {
      return this.circuitBreaker.execute(() => this.client.request(requestConfig));
    }

    return this.client.request(requestConfig);
  }

  /**
   * GET request
   */
  async get(url, config = {}) {
    return this.request({
      method: HTTP_METHODS.GET,
      url,
      ...config
    });
  }

  /**
   * POST request
   */
  async post(url, data, config = {}) {
    return this.request({
      method: HTTP_METHODS.POST,
      url,
      data,
      ...config
    });
  }

  /**
   * PUT request
   */
  async put(url, data, config = {}) {
    return this.request({
      method: HTTP_METHODS.PUT,
      url,
      data,
      ...config
    });
  }

  /**
   * PATCH request
   */
  async patch(url, data, config = {}) {
    return this.request({
      method: HTTP_METHODS.PATCH,
      url,
      data,
      ...config
    });
  }

  /**
   * DELETE request
   */
  async delete(url, config = {}) {
    return this.request({
      method: HTTP_METHODS.DELETE,
      url,
      ...config
    });
  }

  /**
   * HEAD request
   */
  async head(url, config = {}) {
    return this.request({
      method: HTTP_METHODS.HEAD,
      url,
      ...config
    });
  }

  /**
   * OPTIONS request
   */
  async options(url, config = {}) {
    return this.request({
      method: HTTP_METHODS.OPTIONS,
      url,
      ...config
    });
  }

  /**
   * Stream request for large responses
   */
  async stream(url, config = {}) {
    return this.request({
      ...config,
      url,
      responseType: 'stream'
    });
  }

  /**
   * Upload file with progress tracking
   */
  async upload(url, formData, config = {}) {
    return this.request({
      method: HTTP_METHODS.POST,
      url,
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      ...config
    });
  }

  /**
   * Download file
   */
  async download(url, config = {}) {
    return this.request({
      method: HTTP_METHODS.GET,
      url,
      responseType: 'arraybuffer',
      ...config
    });
  }

  /**
   * Health check request
   */
  async healthCheck(url, timeout = 5000) {
    try {
      const response = await this.get(`${url}/health`, {
        timeout,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      return {
        healthy: response.status === HTTP_STATUS_CODES.OK,
        status: response.status,
        data: response.data,
        responseTime: response.config.metadata ? 
          Date.now() - response.config.metadata.startTime : 0
      };
    } catch (error) {
      return {
        healthy: false,
        status: error.response?.status || 0,
        error: error.message,
        responseTime: error.config?.metadata ? 
          Date.now() - error.config.metadata.startTime : 0
      };
    }
  }

  /**
   * Transform axios error to custom error types
   */
  _transformError(error) {
    if (error.code === 'ECONNABORTED') {
      return new TimeoutError('Request timeout', error);
    }

    if (error.response) {
      return new HttpError(
        error.message,
        error.response.status,
        error.response.data,
        error
      );
    }

    return error;
  }

  /**
   * Sanitize headers for logging (remove sensitive data)
   */
  _sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker ? this.circuitBreaker.getStatus() : null;
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    if (this.circuitBreaker) {
      this.circuitBreaker.reset();
    }
  }

  /**
   * Get client statistics
   */
  getStats() {
    return {
      circuitBreaker: this.getCircuitBreakerStatus(),
      retryPolicy: this.retryPolicy.getStats(),
      options: this.options
    };
  }

  /**
   * Close client and cleanup resources
   */
  close() {
    if (this.circuitBreaker) {
      this.circuitBreaker.destroy();
    }
    
    // Clear interceptors
    this.client.interceptors.request.clear();
    this.client.interceptors.response.clear();
  }
}

export default HttpClient;