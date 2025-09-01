/**
 * Telemetry Utility
 * OpenTelemetry tracing and metrics for the Database AI Agent
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
      // Create resource
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'database-agent',
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
        [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'cognify',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.env,
      });

      // Configure exporters
      const exporters = [];
      
      // Jaeger exporter for traces
      if (config.telemetry.jaeger.enabled) {
        exporters.push(
          new BatchSpanProcessor(
            new JaegerExporter({
              endpoint: config.telemetry.jaeger.endpoint,
            })
          )
        );
      }

      // Prometheus exporter for metrics
      const metricReaders = [];
      if (config.telemetry.prometheus.enabled) {
        metricReaders.push(
          new PrometheusExporter({
            port: config.telemetry.prometheus.port,
            endpoint: config.telemetry.prometheus.endpoint,
          })
        );
      }

      // Initialize SDK
      this.sdk = new NodeSDK({
        resource,
        spanProcessors: exporters,
        metricReader: metricReaders.length > 0 ? metricReaders[0] : undefined,
        instrumentations: [
          getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-fs': {
              enabled: false, // Disable file system instrumentation to reduce noise
            },
            '@opentelemetry/instrumentation-http': {
              enabled: true,
              requestHook: (span, request) => {
                span.setAttributes({
                  'http.request.header.user-agent': request.getHeader('user-agent'),
                  'http.request.header.content-type': request.getHeader('content-type'),
                });
              },
              responseHook: (span, response) => {
                span.setAttributes({
                  'http.response.header.content-type': response.getHeader('content-type'),
                });
              },
            },
            '@opentelemetry/instrumentation-express': {
              enabled: true,
            },
            '@opentelemetry/instrumentation-redis': {
              enabled: true,
            },
          }),
        ],
      });

      // Start the SDK
      this.sdk.start();

      // Get tracer and meter
      this.tracer = trace.getTracer('database-agent', '1.0.0');
      this.meter = metrics.getMeter('database-agent', '1.0.0');

      // Initialize metrics instruments
      this.initializeMetrics();

      this.isInitialized = true;
      
      console.log('Telemetry service initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize telemetry service:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Initialize metrics instruments
   */
  initializeMetrics() {
    if (!this.meter) return;

    // Counters
    this.counters.set('requests_total', 
      this.meter.createCounter('database_agent_requests_total', {
        description: 'Total number of requests processed',
      })
    );
    
    this.counters.set('tasks_total', 
      this.meter.createCounter('database_agent_tasks_total', {
        description: 'Total number of tasks processed',
      })
    );
    
    this.counters.set('ai_requests_total', 
      this.meter.createCounter('database_agent_ai_requests_total', {
        description: 'Total number of AI API requests',
      })
    );
    
    this.counters.set('cache_operations_total', 
      this.meter.createCounter('database_agent_cache_operations_total', {
        description: 'Total number of cache operations',
      })
    );
    
    this.counters.set('errors_total', 
      this.meter.createCounter('database_agent_errors_total', {
        description: 'Total number of errors',
      })
    );

    // Histograms
    this.histograms.set('request_duration', 
      this.meter.createHistogram('database_agent_request_duration_seconds', {
        description: 'Request duration in seconds',
        boundaries: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      })
    );
    
    this.histograms.set('task_duration', 
      this.meter.createHistogram('database_agent_task_duration_seconds', {
        description: 'Task processing duration in seconds',
        boundaries: [1, 5, 10, 30, 60, 120, 300, 600],
      })
    );
    
    this.histograms.set('ai_request_duration', 
      this.meter.createHistogram('database_agent_ai_request_duration_seconds', {
        description: 'AI API request duration in seconds',
        boundaries: [0.5, 1, 2, 5, 10, 20, 30, 60],
      })
    );
    
    this.histograms.set('cache_operation_duration', 
      this.meter.createHistogram('database_agent_cache_operation_duration_seconds', {
        description: 'Cache operation duration in seconds',
        boundaries: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      })
    );

    // Up-Down Counters
    this.upDownCounters.set('active_tasks', 
      this.meter.createUpDownCounter('database_agent_active_tasks', {
        description: 'Number of currently active tasks',
      })
    );
    
    this.upDownCounters.set('active_connections', 
      this.meter.createUpDownCounter('database_agent_active_connections', {
        description: 'Number of active connections',
      })
    );

    // Gauges (using observable gauges)
    this.meter.createObservableGauge('database_agent_memory_usage_bytes', {
      description: 'Memory usage in bytes',
    }).addCallback((result) => {
      const memUsage = process.memoryUsage();
      result.observe(memUsage.heapUsed, { type: 'heap_used' });
      result.observe(memUsage.heapTotal, { type: 'heap_total' });
      result.observe(memUsage.rss, { type: 'rss' });
      result.observe(memUsage.external, { type: 'external' });
    });
    
    this.meter.createObservableGauge('database_agent_uptime_seconds', {
      description: 'Service uptime in seconds',
    }).addCallback((result) => {
      result.observe(process.uptime());
    });
  }

  /**
   * Start a new span
   */
  startSpan(name, attributes = {}) {
    if (!this.tracer) {
      return {
        setAttributes: () => {},
        recordException: () => {},
        setStatus: () => {},
        end: () => {},
      };
    }

    return this.tracer.startSpan(name, {
      attributes: {
        'service.name': 'database-agent',
        'service.version': '1.0.0',
        ...attributes,
      },
    });
  }

  /**
   * Start a span with automatic context management
   */
  startActiveSpan(name, fn, attributes = {}) {
    if (!this.tracer) {
      return fn({
        setAttributes: () => {},
        recordException: () => {},
        setStatus: () => {},
        end: () => {},
      });
    }

    return this.tracer.startActiveSpan(name, {
      attributes: {
        'service.name': 'database-agent',
        'service.version': '1.0.0',
        ...attributes,
      },
    }, fn);
  }

  /**
   * Record an exception in the current span
   */
  recordException(error, attributes = {}) {
    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error, attributes);
      span.setStatus({ code: trace.SpanStatusCode.ERROR, message: error.message });
    }
  }

  /**
   * Increment a counter
   */
  incrementCounter(name, value = 1, attributes = {}) {
    const counter = this.counters.get(name);
    if (counter) {
      counter.add(value, attributes);
    }
  }

  /**
   * Record a histogram value
   */
  recordHistogram(name, value, attributes = {}) {
    const histogram = this.histograms.get(name);
    if (histogram) {
      histogram.record(value, attributes);
    }
  }

  /**
   * Update an up-down counter
   */
  updateUpDownCounter(name, value, attributes = {}) {
    const upDownCounter = this.upDownCounters.get(name);
    if (upDownCounter) {
      upDownCounter.add(value, attributes);
    }
  }

  /**
   * Record request metrics
   */
  recordRequest(method, route, statusCode, duration, attributes = {}) {
    const baseAttributes = {
      method,
      route,
      status_code: statusCode.toString(),
      ...attributes,
    };

    this.incrementCounter('requests_total', 1, baseAttributes);
    this.recordHistogram('request_duration', duration / 1000, baseAttributes);

    if (statusCode >= 400) {
      this.incrementCounter('errors_total', 1, {
        ...baseAttributes,
        error_type: statusCode >= 500 ? 'server_error' : 'client_error',
      });
    }
  }

  /**
   * Record task metrics
   */
  recordTask(taskType, status, duration, attributes = {}) {
    const baseAttributes = {
      task_type: taskType,
      status,
      ...attributes,
    };

    this.incrementCounter('tasks_total', 1, baseAttributes);
    
    if (duration) {
      this.recordHistogram('task_duration', duration / 1000, baseAttributes);
    }

    if (status === 'started') {
      this.updateUpDownCounter('active_tasks', 1, { task_type: taskType });
    } else if (['completed', 'failed', 'cancelled'].includes(status)) {
      this.updateUpDownCounter('active_tasks', -1, { task_type: taskType });
    }
  }

  /**
   * Record AI request metrics
   */
  recordAiRequest(model, operation, duration, tokens = null, attributes = {}) {
    const baseAttributes = {
      model,
      operation,
      ...attributes,
    };

    this.incrementCounter('ai_requests_total', 1, baseAttributes);
    this.recordHistogram('ai_request_duration', duration / 1000, baseAttributes);

    if (tokens) {
      this.recordHistogram('ai_tokens_used', tokens, baseAttributes);
    }
  }

  /**
   * Record cache operation metrics
   */
  recordCacheOperation(operation, hit, duration, attributes = {}) {
    const baseAttributes = {
      operation,
      hit: hit ? 'true' : 'false',
      ...attributes,
    };

    this.incrementCounter('cache_operations_total', 1, baseAttributes);
    this.recordHistogram('cache_operation_duration', duration / 1000, baseAttributes);
  }

  /**
   * Record connection metrics
   */
  recordConnection(type, action, attributes = {}) {
    const baseAttributes = {
      connection_type: type,
      ...attributes,
    };

    if (action === 'opened') {
      this.updateUpDownCounter('active_connections', 1, baseAttributes);
    } else if (action === 'closed') {
      this.updateUpDownCounter('active_connections', -1, baseAttributes);
    }
  }

  /**
   * Create a timing function
   */
  createTimer() {
    const startTime = Date.now();
    
    return {
      end: () => Date.now() - startTime,
      endAndRecord: (histogramName, attributes = {}) => {
        const duration = Date.now() - startTime;
        this.recordHistogram(histogramName, duration / 1000, attributes);
        return duration;
      },
    };
  }

  /**
   * Middleware for Express to automatically trace requests
   */
  createExpressMiddleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Start span for the request
      const span = this.startSpan(`${req.method} ${req.route?.path || req.path}`, {
        'http.method': req.method,
        'http.url': req.url,
        'http.route': req.route?.path,
        'http.user_agent': req.get('User-Agent'),
        'http.remote_addr': req.ip,
      });

      // Override res.end to capture response data
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Date.now() - startTime;
        
        // Set span attributes
        span.setAttributes({
          'http.status_code': res.statusCode,
          'http.response.size': res.get('Content-Length') || 0,
        });
        
        // Record metrics
        telemetryService.recordRequest(
          req.method,
          req.route?.path || req.path,
          res.statusCode,
          duration,
          {
            user_agent: req.get('User-Agent'),
          }
        );
        
        // End span
        if (res.statusCode >= 400) {
          span.setStatus({
            code: trace.SpanStatusCode.ERROR,
            message: `HTTP ${res.statusCode}`,
          });
        }
        span.end();
        
        // Call original end
        originalEnd.apply(this, args);
      };

      next();
    };
  }

  /**
   * Get telemetry status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      jaeger: {
        enabled: config.telemetry.jaeger.enabled,
        endpoint: config.telemetry.jaeger.endpoint,
      },
      prometheus: {
        enabled: config.telemetry.prometheus.enabled,
        port: config.telemetry.prometheus.port,
        endpoint: config.telemetry.prometheus.endpoint,
      },
    };
  }

  /**
   * Shutdown telemetry service
   */
  async shutdown() {
    if (this.sdk) {
      try {
        await this.sdk.shutdown();
        console.log('Telemetry service shutdown complete');
      } catch (error) {
        console.error('Error during telemetry service shutdown:', error);
      }
    }
  }
}

// Create singleton instance
const telemetryService = new TelemetryService();

module.exports = {
  telemetryService,
  TelemetryService,
};