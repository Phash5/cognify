/**
 * Telemetry Service for DevOps AI Agent
 * Provides OpenTelemetry tracing and metrics collection
 */

'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { trace, metrics } = require('@opentelemetry/api');
const config = require('../config/config');
const logger = require('./logger');

class TelemetryService {
  constructor() {
    this.sdk = null;
    this.tracer = null;
    this.meter = null;
    this.isInitialized = false;
    
    // Metrics instruments
    this.counters = new Map();
    this.histograms = new Map();
    this.upDownCounters = new Map();
    this.gauges = new Map();
    
    this.initialize();
  }

  /**
   * Initialize OpenTelemetry SDK
   */
  initialize() {
    try {
      if (!config.telemetry.enabled) {
        logger.info('Telemetry is disabled');
        return;
      }
      
      // Create resource
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.telemetry.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: config.telemetry.serviceVersion,
        [SemanticResourceAttributes.SERVICE_NAMESPACE]: config.telemetry.serviceNamespace,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.env,
      });
      
      // Configure metric readers
      const metricReaders = [];
      
      // Prometheus exporter
      if (config.telemetry.prometheus.enabled) {
        const prometheusExporter = new PrometheusExporter({
          port: config.telemetry.prometheus.port,
          endpoint: config.telemetry.prometheus.endpoint,
        });
        metricReaders.push(prometheusExporter);
      }
      
      // Configure span processors
      const spanProcessors = [];
      
      // Jaeger exporter
      if (config.telemetry.jaeger.enabled) {
        const jaegerExporter = new JaegerExporter({
          endpoint: config.telemetry.jaeger.endpoint,
        });
        spanProcessors.push(new BatchSpanProcessor(jaegerExporter));
      }
      
      // Initialize SDK
      this.sdk = new NodeSDK({
        resource,
        instrumentations: [getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': {
            enabled: false, // Disable file system instrumentation for performance
          },
        })],
        metricReader: metricReaders.length > 0 ? metricReaders[0] : undefined,
        spanProcessors,
      });
      
      // Start SDK
      this.sdk.start();
      
      // Get tracer and meter
      this.tracer = trace.getTracer(config.telemetry.serviceName, config.telemetry.serviceVersion);
      this.meter = metrics.getMeter(config.telemetry.serviceName, config.telemetry.serviceVersion);
      
      // Initialize metrics instruments
      this.initializeMetrics();
      
      this.isInitialized = true;
      
      logger.info('Telemetry initialized successfully', {
        serviceName: config.telemetry.serviceName,
        serviceVersion: config.telemetry.serviceVersion,
        prometheusEnabled: config.telemetry.prometheus.enabled,
        jaegerEnabled: config.telemetry.jaeger.enabled,
      });
      
    } catch (error) {
      logger.error('Failed to initialize telemetry', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Initialize metrics instruments
   */
  initializeMetrics() {
    if (!this.meter) return;
    
    try {
      // Counters
      this.counters.set('requests_total', this.meter.createCounter('devops_requests_total', {
        description: 'Total number of requests processed',
      }));
      
      this.counters.set('tasks_total', this.meter.createCounter('devops_tasks_total', {
        description: 'Total number of tasks processed',
      }));
      
      this.counters.set('ai_requests_total', this.meter.createCounter('devops_ai_requests_total', {
        description: 'Total number of AI requests made',
      }));
      
      this.counters.set('cache_operations_total', this.meter.createCounter('devops_cache_operations_total', {
        description: 'Total number of cache operations',
      }));
      
      this.counters.set('deployments_total', this.meter.createCounter('devops_deployments_total', {
        description: 'Total number of deployments generated',
      }));
      
      this.counters.set('infrastructure_operations_total', this.meter.createCounter('devops_infrastructure_operations_total', {
        description: 'Total number of infrastructure operations',
      }));
      
      this.counters.set('monitoring_setups_total', this.meter.createCounter('devops_monitoring_setups_total', {
        description: 'Total number of monitoring setups',
      }));
      
      this.counters.set('configuration_changes_total', this.meter.createCounter('devops_configuration_changes_total', {
        description: 'Total number of configuration changes',
      }));
      
      // Histograms
      this.histograms.set('request_duration', this.meter.createHistogram('devops_request_duration_seconds', {
        description: 'Request duration in seconds',
        boundaries: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
      }));
      
      this.histograms.set('task_duration', this.meter.createHistogram('devops_task_duration_seconds', {
        description: 'Task processing duration in seconds',
        boundaries: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
      }));
      
      this.histograms.set('ai_request_duration', this.meter.createHistogram('devops_ai_request_duration_seconds', {
        description: 'AI request duration in seconds',
        boundaries: [0.1, 0.5, 1, 2, 5, 10, 20, 30, 60],
      }));
      
      this.histograms.set('cache_operation_duration', this.meter.createHistogram('devops_cache_operation_duration_seconds', {
        description: 'Cache operation duration in seconds',
        boundaries: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      }));
      
      // Up-down counters
      this.upDownCounters.set('active_tasks', this.meter.createUpDownCounter('devops_active_tasks', {
        description: 'Number of currently active tasks',
      }));
      
      this.upDownCounters.set('active_connections', this.meter.createUpDownCounter('devops_active_connections', {
        description: 'Number of active connections',
      }));
      
      // Gauges (using observable gauges)
      this.meter.createObservableGauge('devops_memory_usage_bytes', {
        description: 'Memory usage in bytes',
      }).addCallback((result) => {
        const memUsage = process.memoryUsage();
        result.observe(memUsage.heapUsed, { type: 'heap_used' });
        result.observe(memUsage.heapTotal, { type: 'heap_total' });
        result.observe(memUsage.rss, { type: 'rss' });
        result.observe(memUsage.external, { type: 'external' });
      });
      
      this.meter.createObservableGauge('devops_cpu_usage_percent', {
        description: 'CPU usage percentage',
      }).addCallback((result) => {
        const cpuUsage = process.cpuUsage();
        result.observe(cpuUsage.user / 1000000, { type: 'user' });
        result.observe(cpuUsage.system / 1000000, { type: 'system' });
      });
      
      logger.debug('Metrics instruments initialized');
      
    } catch (error) {
      logger.error('Failed to initialize metrics instruments', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Start a new span
   */
  startSpan(name, options = {}) {
    if (!this.isInitialized || !this.tracer) {
      return {
        setAttributes: () => {},
        setStatus: () => {},
        recordException: () => {},
        end: () => {},
      };
    }
    
    return this.tracer.startSpan(name, options);
  }

  /**
   * Start an active span
   */
  startActiveSpan(name, options = {}, fn) {
    if (!this.isInitialized || !this.tracer) {
      return fn({
        setAttributes: () => {},
        setStatus: () => {},
        recordException: () => {},
        end: () => {},
      });
    }
    
    return this.tracer.startActiveSpan(name, options, fn);
  }

  /**
   * Record an exception in the current span
   */
  recordException(exception, span = null) {
    if (!this.isInitialized) return;
    
    try {
      if (span) {
        span.recordException(exception);
      } else {
        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
          activeSpan.recordException(exception);
        }
      }
    } catch (error) {
      logger.warn('Failed to record exception in span', {
        error: error.message,
      });
    }
  }

  /**
   * Increment a counter
   */
  incrementCounter(name, value = 1, attributes = {}) {
    if (!this.isInitialized) return;
    
    try {
      const counter = this.counters.get(name);
      if (counter) {
        counter.add(value, attributes);
      } else {
        logger.warn('Counter not found', { name });
      }
    } catch (error) {
      logger.warn('Failed to increment counter', {
        name,
        error: error.message,
      });
    }
  }

  /**
   * Record a histogram value
   */
  recordHistogram(name, value, attributes = {}) {
    if (!this.isInitialized) return;
    
    try {
      const histogram = this.histograms.get(name);
      if (histogram) {
        histogram.record(value, attributes);
      } else {
        logger.warn('Histogram not found', { name });
      }
    } catch (error) {
      logger.warn('Failed to record histogram', {
        name,
        error: error.message,
      });
    }
  }

  /**
   * Update an up-down counter
   */
  updateUpDownCounter(name, value, attributes = {}) {
    if (!this.isInitialized) return;
    
    try {
      const counter = this.upDownCounters.get(name);
      if (counter) {
        counter.add(value, attributes);
      } else {
        logger.warn('Up-down counter not found', { name });
      }
    } catch (error) {
      logger.warn('Failed to update up-down counter', {
        name,
        error: error.message,
      });
    }
  }

  /**
   * Create a timer for measuring duration
   */
  createTimer(histogramName, attributes = {}) {
    const start = Date.now();
    
    return {
      end: () => {
        const duration = (Date.now() - start) / 1000;
        this.recordHistogram(histogramName, duration, attributes);
        return duration;
      },
    };
  }

  /**
   * Middleware for Express request tracing
   */
  requestMiddleware() {
    return (req, res, next) => {
      if (!this.isInitialized) {
        return next();
      }
      
      const span = this.startSpan(`${req.method} ${req.route?.path || req.path}`, {
        kind: 1, // SERVER
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
          'http.route': req.route?.path || req.path,
          'http.user_agent': req.get('User-Agent'),
          'http.remote_addr': req.ip,
        },
      });
      
      const timer = this.createTimer('request_duration', {
        method: req.method,
        route: req.route?.path || req.path,
      });
      
      // Increment request counter
      this.incrementCounter('requests_total', 1, {
        method: req.method,
        route: req.route?.path || req.path,
      });
      
      // Override res.end to capture response data
      const originalEnd = res.end;
      res.end = function(...args) {
        span.setAttributes({
          'http.status_code': res.statusCode,
          'http.response_size': res.get('Content-Length') || 0,
        });
        
        // Set span status based on response code
        if (res.statusCode >= 400) {
          span.setStatus({
            code: 2, // ERROR
            message: `HTTP ${res.statusCode}`,
          });
        }
        
        timer.end();
        span.end();
        
        originalEnd.apply(this, args);
      };
      
      next();
    };
  }

  /**
   * Trace a function execution
   */
  traceFunction(name, fn, attributes = {}) {
    if (!this.isInitialized) {
      return fn();
    }
    
    return this.startActiveSpan(name, { attributes }, async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: 1 }); // OK
        return result;
      } catch (error) {
        span.recordException(error);
        span.setStatus({
          code: 2, // ERROR
          message: error.message,
        });
        throw error;
      }
    });
  }

  /**
   * Get telemetry status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      enabled: config.telemetry.enabled,
      serviceName: config.telemetry.serviceName,
      serviceVersion: config.telemetry.serviceVersion,
      prometheus: {
        enabled: config.telemetry.prometheus.enabled,
        port: config.telemetry.prometheus.port,
      },
      jaeger: {
        enabled: config.telemetry.jaeger.enabled,
        endpoint: config.telemetry.jaeger.endpoint,
      },
    };
  }

  /**
   * Shutdown telemetry
   */
  async shutdown() {
    if (this.sdk) {
      try {
        await this.sdk.shutdown();
        logger.info('Telemetry shutdown completed');
      } catch (error) {
        logger.error('Error during telemetry shutdown', {
          error: error.message,
        });
      }
    }
  }
}

// Create singleton instance
const telemetryService = new TelemetryService();

// Export both the service and individual functions for convenience
module.exports = {
  telemetryService,
  startSpan: (name, options) => telemetryService.startSpan(name, options),
  startActiveSpan: (name, options, fn) => telemetryService.startActiveSpan(name, options, fn),
  recordException: (exception, span) => telemetryService.recordException(exception, span),
  incrementCounter: (name, value, attributes) => telemetryService.incrementCounter(name, value, attributes),
  recordHistogram: (name, value, attributes) => telemetryService.recordHistogram(name, value, attributes),
  updateUpDownCounter: (name, value, attributes) => telemetryService.updateUpDownCounter(name, value, attributes),
  createTimer: (histogramName, attributes) => telemetryService.createTimer(histogramName, attributes),
  traceFunction: (name, fn, attributes) => telemetryService.traceFunction(name, fn, attributes),
};