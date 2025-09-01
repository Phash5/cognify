const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { metrics, trace } = require('@opentelemetry/api');
const logger = require('../utils/logger');

class TelemetryService {
  constructor() {
    this.sdk = null;
    this.meterProvider = null;
    this.meter = null;
    this.tracer = null;
    this.metrics = {
      httpRequests: null,
      httpDuration: null,
      eventBusMessages: null,
      projectOperations: null,
      activeConnections: null,
      errorCount: null
    };
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Create resource with service information
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'cognify-server',
        [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
        [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'cognify',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development'
      });

      // Configure Prometheus exporter
      const prometheusExporter = new PrometheusExporter({
        port: parseInt(process.env.PROMETHEUS_PORT) || 9090,
        endpoint: '/metrics'
      }, () => {
        logger.info(`Prometheus metrics available at http://localhost:${parseInt(process.env.PROMETHEUS_PORT) || 9090}/metrics`);
      });

      // Create meter provider with Prometheus exporter
      this.meterProvider = new MeterProvider({
        resource,
        readers: [prometheusExporter]
      });

      // Set global meter provider
      metrics.setGlobalMeterProvider(this.meterProvider);

      // Get meter instance
      this.meter = metrics.getMeter('cognify-server', '1.0.0');

      // Initialize Node SDK for tracing
      this.sdk = new NodeSDK({
        resource,
        instrumentations: [
          // Auto-instrumentation will be added here
        ]
      });

      // Start the SDK
      await this.sdk.start();

      // Get tracer instance
      this.tracer = trace.getTracer('cognify-server', '1.0.0');

      // Initialize custom metrics
      this.initializeMetrics();

      this.isInitialized = true;
      logger.info('OpenTelemetry initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize OpenTelemetry:', error);
      throw error;
    }
  }

  initializeMetrics() {
    // HTTP request counter
    this.metrics.httpRequests = this.meter.createCounter('http_requests_total', {
      description: 'Total number of HTTP requests',
      unit: '1'
    });

    // HTTP request duration histogram
    this.metrics.httpDuration = this.meter.createHistogram('http_request_duration_ms', {
      description: 'Duration of HTTP requests in milliseconds',
      unit: 'ms',
      boundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
    });

    // Event bus message counter
    this.metrics.eventBusMessages = this.meter.createCounter('event_bus_messages_total', {
      description: 'Total number of event bus messages processed',
      unit: '1'
    });

    // Project operations counter
    this.metrics.projectOperations = this.meter.createCounter('project_operations_total', {
      description: 'Total number of project operations',
      unit: '1'
    });

    // Active connections gauge
    this.metrics.activeConnections = this.meter.createUpDownCounter('active_connections', {
      description: 'Number of active connections',
      unit: '1'
    });

    // Error counter
    this.metrics.errorCount = this.meter.createCounter('errors_total', {
      description: 'Total number of errors',
      unit: '1'
    });

    // Memory usage gauge
    this.metrics.memoryUsage = this.meter.createObservableGauge('memory_usage_bytes', {
      description: 'Memory usage in bytes',
      unit: 'bytes'
    });

    // CPU usage gauge
    this.metrics.cpuUsage = this.meter.createObservableGauge('cpu_usage_percent', {
      description: 'CPU usage percentage',
      unit: '%'
    });

    // Register observable metrics callbacks
    this.metrics.memoryUsage.addCallback((result) => {
      const memUsage = process.memoryUsage();
      result.observe(memUsage.heapUsed, { type: 'heap_used' });
      result.observe(memUsage.heapTotal, { type: 'heap_total' });
      result.observe(memUsage.rss, { type: 'rss' });
      result.observe(memUsage.external, { type: 'external' });
    });

    this.metrics.cpuUsage.addCallback((result) => {
      const cpuUsage = process.cpuUsage();
      result.observe(cpuUsage.user / 1000000, { type: 'user' }); // Convert to seconds
      result.observe(cpuUsage.system / 1000000, { type: 'system' }); // Convert to seconds
    });

    logger.info('Custom metrics initialized');
  }

  // Middleware for HTTP request tracking
  createHttpMiddleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Create span for the request
      const span = this.tracer.startSpan(`${req.method} ${req.route?.path || req.path}`, {
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
          'http.route': req.route?.path || req.path,
          'http.user_agent': req.get('User-Agent') || '',
          'user.id': req.user?.id || 'anonymous'
        }
      });

      // Track request start
      this.metrics.httpRequests.add(1, {
        method: req.method,
        route: req.route?.path || req.path
      });

      // Override res.end to capture response data
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Date.now() - startTime;
        
        // Record metrics
        this.metrics.httpDuration.record(duration, {
          method: req.method,
          route: req.route?.path || req.path,
          status_code: res.statusCode.toString()
        });

        // Update span with response data
        span.setAttributes({
          'http.status_code': res.statusCode,
          'http.response.size': res.get('Content-Length') || 0
        });

        // Set span status based on HTTP status code
        if (res.statusCode >= 400) {
          span.recordException(new Error(`HTTP ${res.statusCode}`));
          this.metrics.errorCount.add(1, {
            type: 'http_error',
            status_code: res.statusCode.toString()
          });
        }

        span.end();
        originalEnd.apply(this, args);
      }.bind(this);

      next();
    };
  }

  // Track event bus operations
  trackEventBusMessage(eventType, operation = 'publish') {
    if (!this.isInitialized) return;
    
    this.metrics.eventBusMessages.add(1, {
      event_type: eventType,
      operation
    });
  }

  // Track project operations
  trackProjectOperation(operation, projectId) {
    if (!this.isInitialized) return;
    
    this.metrics.projectOperations.add(1, {
      operation,
      project_id: projectId
    });
  }

  // Track active connections
  trackConnection(delta = 1) {
    if (!this.isInitialized) return;
    
    this.metrics.activeConnections.add(delta);
  }

  // Track errors
  trackError(errorType, context = {}) {
    if (!this.isInitialized) return;
    
    this.metrics.errorCount.add(1, {
      error_type: errorType,
      ...context
    });
  }

  // Create custom span
  createSpan(name, attributes = {}) {
    if (!this.isInitialized) return null;
    
    return this.tracer.startSpan(name, { attributes });
  }

  // Create custom counter
  createCounter(name, description, unit = '1') {
    if (!this.isInitialized) return null;
    
    return this.meter.createCounter(name, { description, unit });
  }

  // Create custom histogram
  createHistogram(name, description, unit = '1', boundaries = []) {
    if (!this.isInitialized) return null;
    
    return this.meter.createHistogram(name, { description, unit, boundaries });
  }

  // Create custom gauge
  createGauge(name, description, unit = '1') {
    if (!this.isInitialized) return null;
    
    return this.meter.createObservableGauge(name, { description, unit });
  }

  // Get health status
  getHealthStatus() {
    return {
      status: this.isInitialized ? 'healthy' : 'unhealthy',
      initialized: this.isInitialized,
      prometheus_port: parseInt(process.env.PROMETHEUS_PORT) || 9090,
      service_name: 'cognify-server',
      service_version: process.env.npm_package_version || '1.0.0'
    };
  }

  // Shutdown telemetry
  async shutdown() {
    try {
      if (this.sdk) {
        await this.sdk.shutdown();
      }
      if (this.meterProvider) {
        await this.meterProvider.shutdown();
      }
      this.isInitialized = false;
      logger.info('OpenTelemetry shutdown completed');
    } catch (error) {
      logger.error('Error during OpenTelemetry shutdown:', error);
      throw error;
    }
  }
}

// Singleton instance
const telemetryService = new TelemetryService();

module.exports = telemetryService;