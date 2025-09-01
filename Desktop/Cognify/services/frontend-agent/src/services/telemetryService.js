/**
 * Telemetry Service for Frontend AI Agent
 * Handles OpenTelemetry instrumentation, metrics, and tracing
 */

'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { PeriodicExportingMetricReader, ConsoleMetricExporter } = require('@opentelemetry/sdk-metrics');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { BatchSpanProcessor, ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-node');
const { metrics, trace } = require('@opentelemetry/api');
const logger = require('../utils/logger');

class TelemetryService {
  constructor() {
    this.sdk = null;
    this.meter = null;
    this.tracer = null;
    this.metrics = {
      httpRequests: null,
      httpDuration: null,
      aiOperations: null,
      aiTokens: null,
      aiCost: null,
      cacheHits: null,
      cacheMisses: null,
      errorCount: null,
      activeConnections: null,
      memoryUsage: null,
      cpuUsage: null,
    };
    this.isInitialized = false;
  }

  /**
   * Initialize OpenTelemetry SDK
   */
  async initialize() {
    try {
      const serviceName = 'frontend-agent';
      const serviceVersion = process.env.npm_package_version || '1.0.0';
      const environment = process.env.NODE_ENV || 'development';

      // Create resource
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
        [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'cognify',
        [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: `${serviceName}-${process.pid}`,
      });

      // Configure metric readers
      const metricReaders = [];

      // Prometheus exporter for metrics
      if (process.env.METRICS_ENABLED !== 'false') {
        const prometheusExporter = new PrometheusExporter({
          port: parseInt(process.env.METRICS_PORT) || 9464,
          endpoint: '/metrics',
        });
        metricReaders.push(prometheusExporter);
      }

      // Console exporter for development
      if (environment === 'development') {
        metricReaders.push(
          new PeriodicExportingMetricReader({
            exporter: new ConsoleMetricExporter(),
            exportIntervalMillis: 30000,
          })
        );
      }

      // Configure span processors
      const spanProcessors = [];

      // Jaeger exporter for traces
      if (process.env.JAEGER_ENDPOINT) {
        const jaegerExporter = new JaegerExporter({
          endpoint: process.env.JAEGER_ENDPOINT,
        });
        spanProcessors.push(new BatchSpanProcessor(jaegerExporter));
      }

      // Console exporter for development
      if (environment === 'development') {
        spanProcessors.push(new BatchSpanProcessor(new ConsoleSpanExporter()));
      }

      // Initialize SDK
      this.sdk = new NodeSDK({
        resource,
        metricReader: metricReaders,
        spanProcessor: spanProcessors,
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
                  'http.request.header.x-forwarded-for': request.getHeader('x-forwarded-for'),
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

      // Start SDK
      this.sdk.start();

      // Get meter and tracer
      this.meter = metrics.getMeter(serviceName, serviceVersion);
      this.tracer = trace.getTracer(serviceName, serviceVersion);

      // Initialize custom metrics
      this.initializeMetrics();

      this.isInitialized = true;
      logger.lifecycle('telemetry_initialized', {
        serviceName,
        serviceVersion,
        environment,
        metricsEnabled: process.env.METRICS_ENABLED !== 'false',
        jaegerEnabled: !!process.env.JAEGER_ENDPOINT,
      });
    } catch (error) {
      logger.logError(error, { component: 'telemetry', operation: 'initialize' });
      throw error;
    }
  }

  /**
   * Initialize custom metrics
   */
  initializeMetrics() {
    // HTTP request counter
    this.metrics.httpRequests = this.meter.createCounter('http_requests_total', {
      description: 'Total number of HTTP requests',
      unit: '1',
    });

    // HTTP request duration histogram
    this.metrics.httpDuration = this.meter.createHistogram('http_request_duration_ms', {
      description: 'HTTP request duration in milliseconds',
      unit: 'ms',
      boundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    });

    // AI operations counter
    this.metrics.aiOperations = this.meter.createCounter('ai_operations_total', {
      description: 'Total number of AI operations',
      unit: '1',
    });

    // AI tokens counter
    this.metrics.aiTokens = this.meter.createCounter('ai_tokens_total', {
      description: 'Total number of AI tokens consumed',
      unit: '1',
    });

    // AI cost counter
    this.metrics.aiCost = this.meter.createCounter('ai_cost_total', {
      description: 'Total AI operation cost',
      unit: 'usd',
    });

    // Cache hits counter
    this.metrics.cacheHits = this.meter.createCounter('cache_hits_total', {
      description: 'Total number of cache hits',
      unit: '1',
    });

    // Cache misses counter
    this.metrics.cacheMisses = this.meter.createCounter('cache_misses_total', {
      description: 'Total number of cache misses',
      unit: '1',
    });

    // Error counter
    this.metrics.errorCount = this.meter.createCounter('errors_total', {
      description: 'Total number of errors',
      unit: '1',
    });

    // Active connections gauge
    this.metrics.activeConnections = this.meter.createUpDownCounter('active_connections', {
      description: 'Number of active connections',
      unit: '1',
    });

    // Memory usage gauge
    this.metrics.memoryUsage = this.meter.createObservableGauge('memory_usage_bytes', {
      description: 'Memory usage in bytes',
      unit: 'bytes',
    });

    // CPU usage gauge
    this.metrics.cpuUsage = this.meter.createObservableGauge('cpu_usage_percent', {
      description: 'CPU usage percentage',
      unit: 'percent',
    });

    // Register memory usage callback
    this.metrics.memoryUsage.addCallback((result) => {
      const memUsage = process.memoryUsage();
      result.observe(memUsage.heapUsed, { type: 'heap_used' });
      result.observe(memUsage.heapTotal, { type: 'heap_total' });
      result.observe(memUsage.rss, { type: 'rss' });
      result.observe(memUsage.external, { type: 'external' });
    });

    // Register CPU usage callback
    this.metrics.cpuUsage.addCallback((result) => {
      const cpuUsage = process.cpuUsage();
      const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
      result.observe(totalUsage, { type: 'total' });
      result.observe(cpuUsage.user / 1000000, { type: 'user' });
      result.observe(cpuUsage.system / 1000000, { type: 'system' });
    });
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(method, route, statusCode, duration, labels = {}) {
    if (!this.isInitialized) return;

    const attributes = {
      method,
      route,
      status_code: statusCode.toString(),
      status_class: `${Math.floor(statusCode / 100)}xx`,
      ...labels,
    };

    this.metrics.httpRequests.add(1, attributes);
    this.metrics.httpDuration.record(duration, attributes);
  }

  /**
   * Record AI operation metrics
   */
  recordAiOperation(operation, model, tokens, cost, success = true, labels = {}) {
    if (!this.isInitialized) return;

    const attributes = {
      operation,
      model,
      success: success.toString(),
      ...labels,
    };

    this.metrics.aiOperations.add(1, attributes);
    if (tokens) this.metrics.aiTokens.add(tokens, attributes);
    if (cost) this.metrics.aiCost.add(cost, attributes);
  }

  /**
   * Record cache metrics
   */
  recordCacheOperation(operation, key, hit, labels = {}) {
    if (!this.isInitialized) return;

    const attributes = {
      operation,
      key_type: typeof key,
      ...labels,
    };

    if (hit) {
      this.metrics.cacheHits.add(1, attributes);
    } else {
      this.metrics.cacheMisses.add(1, attributes);
    }
  }

  /**
   * Record error metrics
   */
  recordError(errorType, errorCode, labels = {}) {
    if (!this.isInitialized) return;

    const attributes = {
      error_type: errorType,
      error_code: errorCode,
      ...labels,
    };

    this.metrics.errorCount.add(1, attributes);
  }

  /**
   * Update active connections
   */
  updateActiveConnections(delta, labels = {}) {
    if (!this.isInitialized) return;

    this.metrics.activeConnections.add(delta, labels);
  }

  /**
   * Create a new span
   */
  createSpan(name, options = {}) {
    if (!this.isInitialized) return null;

    return this.tracer.startSpan(name, options);
  }

  /**
   * Create a new span with automatic context management
   */
  withSpan(name, fn, options = {}) {
    if (!this.isInitialized) {
      return fn();
    }

    return this.tracer.startActiveSpan(name, options, async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: 1 }); // OK
        return result;
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: 2, message: error.message }); // ERROR
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get current trace context
   */
  getTraceContext() {
    if (!this.isInitialized) return null;

    const span = trace.getActiveSpan();
    if (!span) return null;

    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags,
    };
  }

  /**
   * Add attributes to current span
   */
  addSpanAttributes(attributes) {
    if (!this.isInitialized) return;

    const span = trace.getActiveSpan();
    if (span) {
      span.setAttributes(attributes);
    }
  }

  /**
   * Add event to current span
   */
  addSpanEvent(name, attributes = {}) {
    if (!this.isInitialized) return;

    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }

  /**
   * Record exception in current span
   */
  recordException(error, attributes = {}) {
    if (!this.isInitialized) return;

    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error, attributes);
    }
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    return {
      status: this.isInitialized ? 'healthy' : 'unhealthy',
      initialized: this.isInitialized,
      metricsEnabled: process.env.METRICS_ENABLED !== 'false',
      tracingEnabled: !!process.env.JAEGER_ENDPOINT,
      uptime: process.uptime(),
    };
  }

  /**
   * Shutdown telemetry
   */
  async shutdown() {
    if (!this.isInitialized || !this.sdk) return;

    try {
      await this.sdk.shutdown();
      this.isInitialized = false;
      logger.lifecycle('telemetry_shutdown');
    } catch (error) {
      logger.logError(error, { component: 'telemetry', operation: 'shutdown' });
      throw error;
    }
  }
}

// Create singleton instance
const telemetryService = new TelemetryService();

module.exports = telemetryService;