import EventEmitter from 'eventemitter3';

/**
 * Metrics collector for microservices
 */
class MetricsCollector extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      serviceName: process.env.SERVICE_NAME || 'unknown-service',
      enablePrometheus: process.env.METRICS_PROMETHEUS !== 'false',
      enableCustom: true,
      flushInterval: parseInt(process.env.METRICS_FLUSH_INTERVAL) || 60000,
      maxMetrics: parseInt(process.env.METRICS_MAX_COUNT) || 10000,
      enableHistograms: true,
      enableCounters: true,
      enableGauges: true,
      enableSummaries: true,
      ...options
    };

    this.logger = options.logger;
    
    // Metrics storage
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.summaries = new Map();
    this.timers = new Map();
    
    // Metric metadata
    this.metadata = new Map();
    
    // Statistics
    this.stats = {
      metricsCollected: 0,
      metricsExported: 0,
      errors: 0,
      lastFlush: null
    };

    // Flush timer
    this.flushTimer = null;
    
    // Start periodic flush if enabled
    if (this.options.flushInterval > 0) {
      this._startPeriodicFlush();
    }

    // Initialize Prometheus if enabled
    if (this.options.enablePrometheus) {
      this._initializePrometheus();
    }
  }

  /**
   * Initialize Prometheus metrics
   */
  _initializePrometheus() {
    try {
      // Note: In a real implementation, you would import and configure prometheus client
      // const prometheus = require('prom-client');
      // this.prometheusRegistry = new prometheus.Registry();
      
      if (this.logger) {
        this.logger.debug('Prometheus metrics initialized', {
          serviceName: this.options.serviceName
        });
      }
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Failed to initialize Prometheus metrics', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
    }
  }

  /**
   * Start periodic metrics flush
   */
  _startPeriodicFlush() {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        this.stats.errors++;
        
        if (this.logger) {
          this.logger.error('Periodic metrics flush failed', {
            error: error.message,
            serviceName: this.options.serviceName
          });
        }
      });
    }, this.options.flushInterval);
  }

  /**
   * Increment a counter metric
   * @param {string} name - Metric name
   * @param {number} value - Increment value (default: 1)
   * @param {Object} labels - Metric labels
   * @param {Object} metadata - Metric metadata
   */
  incrementCounter(name, value = 1, labels = {}, metadata = {}) {
    if (!this.options.enableCounters) return;

    const key = this._getMetricKey(name, labels);
    const current = this.counters.get(key) || 0;
    
    this.counters.set(key, current + value);
    this._setMetadata(name, { type: 'counter', labels, ...metadata });
    
    this.stats.metricsCollected++;
    this.emit('counterIncremented', { name, value, labels, total: current + value });

    if (this.logger) {
      this.logger.debug('Counter incremented', {
        metric: name,
        value,
        labels,
        total: current + value,
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Set a gauge metric
   * @param {string} name - Metric name
   * @param {number} value - Gauge value
   * @param {Object} labels - Metric labels
   * @param {Object} metadata - Metric metadata
   */
  setGauge(name, value, labels = {}, metadata = {}) {
    if (!this.options.enableGauges) return;

    const key = this._getMetricKey(name, labels);
    
    this.gauges.set(key, {
      value,
      timestamp: Date.now()
    });
    
    this._setMetadata(name, { type: 'gauge', labels, ...metadata });
    
    this.stats.metricsCollected++;
    this.emit('gaugeSet', { name, value, labels });

    if (this.logger) {
      this.logger.debug('Gauge set', {
        metric: name,
        value,
        labels,
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Increment a gauge metric
   * @param {string} name - Metric name
   * @param {number} value - Increment value
   * @param {Object} labels - Metric labels
   * @param {Object} metadata - Metric metadata
   */
  incrementGauge(name, value = 1, labels = {}, metadata = {}) {
    const key = this._getMetricKey(name, labels);
    const current = this.gauges.get(key)?.value || 0;
    
    this.setGauge(name, current + value, labels, metadata);
  }

  /**
   * Decrement a gauge metric
   * @param {string} name - Metric name
   * @param {number} value - Decrement value
   * @param {Object} labels - Metric labels
   * @param {Object} metadata - Metric metadata
   */
  decrementGauge(name, value = 1, labels = {}, metadata = {}) {
    this.incrementGauge(name, -value, labels, metadata);
  }

  /**
   * Record a histogram observation
   * @param {string} name - Metric name
   * @param {number} value - Observed value
   * @param {Object} labels - Metric labels
   * @param {Object} metadata - Metric metadata
   */
  recordHistogram(name, value, labels = {}, metadata = {}) {
    if (!this.options.enableHistograms) return;

    const key = this._getMetricKey(name, labels);
    
    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        observations: [],
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity
      });
    }
    
    const histogram = this.histograms.get(key);
    histogram.observations.push({ value, timestamp: Date.now() });
    histogram.count++;
    histogram.sum += value;
    histogram.min = Math.min(histogram.min, value);
    histogram.max = Math.max(histogram.max, value);
    
    // Keep only recent observations to prevent memory issues
    if (histogram.observations.length > 1000) {
      histogram.observations = histogram.observations.slice(-500);
    }
    
    this._setMetadata(name, { type: 'histogram', labels, ...metadata });
    
    this.stats.metricsCollected++;
    this.emit('histogramRecorded', { name, value, labels });

    if (this.logger) {
      this.logger.debug('Histogram recorded', {
        metric: name,
        value,
        labels,
        count: histogram.count,
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Record a summary observation
   * @param {string} name - Metric name
   * @param {number} value - Observed value
   * @param {Object} labels - Metric labels
   * @param {Object} metadata - Metric metadata
   */
  recordSummary(name, value, labels = {}, metadata = {}) {
    if (!this.options.enableSummaries) return;

    const key = this._getMetricKey(name, labels);
    
    if (!this.summaries.has(key)) {
      this.summaries.set(key, {
        observations: [],
        count: 0,
        sum: 0
      });
    }
    
    const summary = this.summaries.get(key);
    summary.observations.push({ value, timestamp: Date.now() });
    summary.count++;
    summary.sum += value;
    
    // Keep only recent observations
    if (summary.observations.length > 1000) {
      summary.observations = summary.observations.slice(-500);
    }
    
    this._setMetadata(name, { type: 'summary', labels, ...metadata });
    
    this.stats.metricsCollected++;
    this.emit('summaryRecorded', { name, value, labels });

    if (this.logger) {
      this.logger.debug('Summary recorded', {
        metric: name,
        value,
        labels,
        count: summary.count,
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Start a timer for measuring duration
   * @param {string} name - Metric name
   * @param {Object} labels - Metric labels
   * @returns {Function} End timer function
   */
  startTimer(name, labels = {}) {
    const startTime = Date.now();
    const timerId = `${name}_${Date.now()}_${Math.random()}`;
    
    this.timers.set(timerId, {
      name,
      labels,
      startTime
    });

    return () => {
      const timer = this.timers.get(timerId);
      if (timer) {
        const duration = Date.now() - timer.startTime;
        this.recordHistogram(name, duration, labels, { unit: 'milliseconds' });
        this.timers.delete(timerId);
        return duration;
      }
      return 0;
    };
  }

  /**
   * Measure function execution time
   * @param {string} name - Metric name
   * @param {Function} fn - Function to measure
   * @param {Object} labels - Metric labels
   * @returns {Promise} Function result
   */
  async measureTime(name, fn, labels = {}) {
    const endTimer = this.startTimer(name, labels);
    
    try {
      const result = await fn();
      const duration = endTimer();
      
      this.emit('timeMeasured', { name, duration, labels, success: true });
      return result;
    } catch (error) {
      const duration = endTimer();
      
      this.emit('timeMeasured', { name, duration, labels, success: false, error });
      throw error;
    }
  }

  /**
   * Record HTTP request metrics
   * @param {Object} request - Request information
   */
  recordHttpRequest(request) {
    const {
      method,
      path,
      statusCode,
      duration,
      contentLength = 0,
      userAgent = 'unknown'
    } = request;

    const labels = {
      method: method.toUpperCase(),
      path,
      status_code: statusCode.toString(),
      status_class: `${Math.floor(statusCode / 100)}xx`
    };

    // Request count
    this.incrementCounter('http_requests_total', 1, labels);
    
    // Request duration
    this.recordHistogram('http_request_duration_ms', duration, labels);
    
    // Response size
    if (contentLength > 0) {
      this.recordHistogram('http_response_size_bytes', contentLength, labels);
    }

    // Error rate
    if (statusCode >= 400) {
      this.incrementCounter('http_requests_errors_total', 1, {
        method: method.toUpperCase(),
        path,
        status_code: statusCode.toString()
      });
    }
  }

  /**
   * Record service discovery metrics
   * @param {Object} discovery - Discovery information
   */
  recordServiceDiscovery(discovery) {
    const {
      operation, // 'register', 'deregister', 'discover', 'heartbeat'
      serviceName,
      success,
      duration,
      instanceCount = 0
    } = discovery;

    const labels = {
      operation,
      service: serviceName,
      success: success.toString()
    };

    // Discovery operations
    this.incrementCounter('service_discovery_operations_total', 1, labels);
    
    // Discovery duration
    this.recordHistogram('service_discovery_duration_ms', duration, labels);
    
    // Service instances
    if (operation === 'discover' && success) {
      this.setGauge('service_instances_discovered', instanceCount, { service: serviceName });
    }
  }

  /**
   * Record event emission metrics
   * @param {Object} event - Event information
   */
  recordEventEmission(event) {
    const {
      eventName,
      serviceName,
      local = false,
      distributed = false,
      success,
      error = null,
      listenerCount = 0
    } = event;

    const labels = {
      event: eventName,
      service: serviceName,
      type: local && distributed ? 'both' : local ? 'local' : 'distributed',
      success: success.toString()
    };

    // Event emissions
    this.incrementCounter('events_emitted_total', 1, labels);
    
    // Listener count
    if (listenerCount > 0) {
      this.setGauge('event_listeners_count', listenerCount, { event: eventName });
    }

    // Errors
    if (!success && error) {
      this.incrementCounter('events_errors_total', 1, {
        event: eventName,
        service: serviceName,
        error_type: error
      });
    }
  }

  /**
   * Record event reception metrics
   * @param {Object} event - Event information
   */
  recordEventReception(event) {
    const {
      eventName,
      serviceName,
      fromService = 'unknown',
      distributed = false,
      success,
      error = null
    } = event;

    const labels = {
      event: eventName,
      service: serviceName,
      from_service: fromService,
      type: distributed ? 'distributed' : 'local',
      success: success.toString()
    };

    // Event receptions
    this.incrementCounter('events_received_total', 1, labels);

    // Errors
    if (!success && error) {
      this.incrementCounter('events_reception_errors_total', 1, {
        event: eventName,
        service: serviceName,
        from_service: fromService,
        error_type: error
      });
    }
  }

  /**
   * Record message processing metrics
   * @param {Object} message - Message information
   */
  recordMessageProcessed(message) {
    const {
      queueName,
      messageType = 'default',
      processingTime = 0,
      success,
      error = null,
      attempts = 1
    } = message;

    const labels = {
      queue: queueName,
      type: messageType,
      success: success.toString()
    };

    // Message processing
    this.incrementCounter('messages_processed_total', 1, labels);
    
    // Processing time
    if (processingTime > 0) {
      this.recordHistogram('message_processing_duration_ms', processingTime, labels);
    }

    // Retry attempts
    if (attempts > 1) {
      this.recordHistogram('message_retry_attempts', attempts, labels);
    }

    // Errors
    if (!success && error) {
      this.incrementCounter('message_processing_errors_total', 1, {
        queue: queueName,
        type: messageType,
        error_type: error
      });
    }
  }

  /**
   * Record message enqueued metrics
   * @param {Object} message - Message information
   */
  recordMessageEnqueued(message) {
    const {
      queueName,
      priority = 0,
      delay = 0
    } = message;

    const labels = {
      queue: queueName,
      priority: priority.toString(),
      delayed: (delay > 0).toString()
    };

    // Message enqueued
    this.incrementCounter('messages_enqueued_total', 1, labels);
    
    // Queue size (approximate)
    this.incrementGauge('queue_size_approximate', 1, { queue: queueName });
  }

  /**
   * Get metric key for storage
   * @param {string} name - Metric name
   * @param {Object} labels - Metric labels
   * @returns {string} Metric key
   */
  _getMetricKey(name, labels = {}) {
    const labelStr = Object.keys(labels)
      .sort()
      .map(key => `${key}="${labels[key]}"`)
      .join(',');
    
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  /**
   * Set metric metadata
   * @param {string} name - Metric name
   * @param {Object} metadata - Metadata
   */
  _setMetadata(name, metadata) {
    this.metadata.set(name, {
      ...this.metadata.get(name),
      ...metadata,
      lastUpdated: Date.now()
    });
  }

  /**
   * Get all metrics in Prometheus format
   * @returns {string} Prometheus metrics
   */
  getPrometheusMetrics() {
    const lines = [];
    const timestamp = Date.now();

    // Add service info
    lines.push(`# HELP service_info Service information`);
    lines.push(`# TYPE service_info gauge`);
    lines.push(`service_info{service="${this.options.serviceName}",version="1.0.0"} 1 ${timestamp}`);
    lines.push('');

    // Counters
    for (const [key, value] of this.counters) {
      const metricName = key.split('{')[0];
      const metadata = this.metadata.get(metricName);
      
      if (metadata && !lines.some(line => line.includes(`# HELP ${metricName}`))) {
        lines.push(`# HELP ${metricName} ${metadata.description || 'Counter metric'}`);
        lines.push(`# TYPE ${metricName} counter`);
      }
      
      lines.push(`${key} ${value} ${timestamp}`);
    }

    // Gauges
    for (const [key, data] of this.gauges) {
      const metricName = key.split('{')[0];
      const metadata = this.metadata.get(metricName);
      
      if (metadata && !lines.some(line => line.includes(`# HELP ${metricName}`))) {
        lines.push(`# HELP ${metricName} ${metadata.description || 'Gauge metric'}`);
        lines.push(`# TYPE ${metricName} gauge`);
      }
      
      lines.push(`${key} ${data.value} ${data.timestamp}`);
    }

    // Histograms
    for (const [key, histogram] of this.histograms) {
      const metricName = key.split('{')[0];
      const metadata = this.metadata.get(metricName);
      
      if (metadata && !lines.some(line => line.includes(`# HELP ${metricName}`))) {
        lines.push(`# HELP ${metricName} ${metadata.description || 'Histogram metric'}`);
        lines.push(`# TYPE ${metricName} histogram`);
      }
      
      // Calculate percentiles
      const sortedValues = histogram.observations
        .map(obs => obs.value)
        .sort((a, b) => a - b);
      
      const percentiles = [0.5, 0.9, 0.95, 0.99];
      for (const p of percentiles) {
        const index = Math.floor(sortedValues.length * p);
        const value = sortedValues[index] || 0;
        const bucketKey = key.replace('}', `,le="${p}"}}`);
        lines.push(`${bucketKey} ${value} ${timestamp}`);
      }
      
      lines.push(`${key.replace('}', '_count}')} ${histogram.count} ${timestamp}`);
      lines.push(`${key.replace('}', '_sum}')} ${histogram.sum} ${timestamp}`);
    }

    return lines.join('\n');
  }

  /**
   * Get all metrics as JSON
   * @returns {Object} Metrics data
   */
  getMetrics() {
    return {
      timestamp: Date.now(),
      service: this.options.serviceName,
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(
        Array.from(this.gauges.entries()).map(([key, data]) => [key, data.value])
      ),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([key, histogram]) => {
          const sortedValues = histogram.observations
            .map(obs => obs.value)
            .sort((a, b) => a - b);
          
          return [key, {
            count: histogram.count,
            sum: histogram.sum,
            min: histogram.min === Infinity ? 0 : histogram.min,
            max: histogram.max === -Infinity ? 0 : histogram.max,
            avg: histogram.count > 0 ? histogram.sum / histogram.count : 0,
            p50: sortedValues[Math.floor(sortedValues.length * 0.5)] || 0,
            p90: sortedValues[Math.floor(sortedValues.length * 0.9)] || 0,
            p95: sortedValues[Math.floor(sortedValues.length * 0.95)] || 0,
            p99: sortedValues[Math.floor(sortedValues.length * 0.99)] || 0
          }];
        })
      ),
      summaries: Object.fromEntries(
        Array.from(this.summaries.entries()).map(([key, summary]) => [
          key,
          {
            count: summary.count,
            sum: summary.sum,
            avg: summary.count > 0 ? summary.sum / summary.count : 0
          }
        ])
      ),
      stats: this.stats
    };
  }

  /**
   * Flush metrics (export to external systems)
   * @returns {Promise<void>}
   */
  async flush() {
    try {
      const metrics = this.getMetrics();
      
      this.emit('metricsFlush', metrics);
      
      this.stats.metricsExported += Object.keys(metrics.counters).length +
                                   Object.keys(metrics.gauges).length +
                                   Object.keys(metrics.histograms).length +
                                   Object.keys(metrics.summaries).length;
      
      this.stats.lastFlush = Date.now();

      if (this.logger) {
        this.logger.debug('Metrics flushed', {
          counters: Object.keys(metrics.counters).length,
          gauges: Object.keys(metrics.gauges).length,
          histograms: Object.keys(metrics.histograms).length,
          summaries: Object.keys(metrics.summaries).length,
          serviceName: this.options.serviceName
        });
      }
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Metrics flush failed', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.summaries.clear();
    this.timers.clear();
    this.metadata.clear();
    
    this.stats = {
      metricsCollected: 0,
      metricsExported: 0,
      errors: 0,
      lastFlush: null
    };

    this.emit('metricsReset');

    if (this.logger) {
      this.logger.info('Metrics reset', {
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Close metrics collector
   */
  close() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    this.removeAllListeners();

    if (this.logger) {
      this.logger.info('Metrics collector closed', {
        serviceName: this.options.serviceName
      });
    }
  }
}

/**
 * Create a metrics collector instance
 * @param {Object} options - Configuration options
 * @returns {MetricsCollector} Metrics collector instance
 */
export function createMetrics(options = {}) {
  return new MetricsCollector(options);
}

/**
 * Default metrics instance
 */
export const defaultMetrics = createMetrics();

export default {
  MetricsCollector,
  createMetrics,
  defaultMetrics
};