const { NodeSDK } = require('@opentelemetry/sdk-node');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { metrics, trace } = require('@opentelemetry/api');
const logger = require('../middleware/logger');

class TelemetryService {
  constructor() {
    this.sdk = null;
    this.meter = null;
    this.tracer = null;
    this.prometheusExporter = null;
    this.metrics = {};
  }

  init() {
    try {
      // Initialize Prometheus exporter
      this.prometheusExporter = new PrometheusExporter({
        port: process.env.OTEL_EXPORTER_PROMETHEUS_PORT || 9465,
        endpoint: '/metrics'
      });

      // Initialize OpenTelemetry SDK
      this.sdk = new NodeSDK({
        serviceName: process.env.OTEL_SERVICE_NAME || 'cognify-ai-orchestrator',
        serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
        metricReader: this.prometheusExporter
      });

      this.sdk.start();

      // Get meter and tracer
      this.meter = metrics.getMeter('cognify-ai-orchestrator', '1.0.0');
      this.tracer = trace.getTracer('cognify-ai-orchestrator', '1.0.0');

      this.initializeMetrics();

      logger.info('Telemetry service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize telemetry service:', error);
      throw error;
    }
  }

  initializeMetrics() {
    // HTTP request metrics
    this.metrics.httpRequests = this.meter.createCounter('http_requests_total', {
      description: 'Total number of HTTP requests'
    });

    this.metrics.httpRequestDuration = this.meter.createHistogram('http_request_duration_ms', {
      description: 'HTTP request duration in milliseconds'
    });

    // Task orchestration metrics
    this.metrics.tasksCreated = this.meter.createCounter('tasks_created_total', {
      description: 'Total number of tasks created'
    });

    this.metrics.tasksCompleted = this.meter.createCounter('tasks_completed_total', {
      description: 'Total number of tasks completed'
    });

    this.metrics.tasksFailed = this.meter.createCounter('tasks_failed_total', {
      description: 'Total number of tasks failed'
    });

    this.metrics.taskDuration = this.meter.createHistogram('task_duration_ms', {
      description: 'Task execution duration in milliseconds'
    });

    this.metrics.activeTasks = this.meter.createUpDownCounter('active_tasks', {
      description: 'Number of currently active tasks'
    });

    // Agent metrics
    this.metrics.agentRequests = this.meter.createCounter('agent_requests_total', {
      description: 'Total number of requests sent to agents'
    });

    this.metrics.agentResponseTime = this.meter.createHistogram('agent_response_time_ms', {
      description: 'Agent response time in milliseconds'
    });

    this.metrics.agentErrors = this.meter.createCounter('agent_errors_total', {
      description: 'Total number of agent errors'
    });

    this.metrics.activeAgents = this.meter.createUpDownCounter('active_agents', {
      description: 'Number of currently active agents'
    });

    // Event bus metrics
    this.metrics.eventsPublished = this.meter.createCounter('events_published_total', {
      description: 'Total number of events published'
    });

    this.metrics.eventsConsumed = this.meter.createCounter('events_consumed_total', {
      description: 'Total number of events consumed'
    });

    // System metrics
    this.metrics.memoryUsage = this.meter.createObservableGauge('memory_usage_bytes', {
      description: 'Memory usage in bytes'
    });

    this.metrics.cpuUsage = this.meter.createObservableGauge('cpu_usage_percent', {
      description: 'CPU usage percentage'
    });

    // Register observable metrics callbacks
    this.metrics.memoryUsage.addCallback((result) => {
      const memUsage = process.memoryUsage();
      result.observe(memUsage.heapUsed, { type: 'heap_used' });
      result.observe(memUsage.heapTotal, { type: 'heap_total' });
      result.observe(memUsage.rss, { type: 'rss' });
    });

    this.metrics.cpuUsage.addCallback((result) => {
      const cpuUsage = process.cpuUsage();
      result.observe(cpuUsage.user / 1000000, { type: 'user' });
      result.observe(cpuUsage.system / 1000000, { type: 'system' });
    });
  }

  // HTTP middleware for tracking requests
  httpMiddleware() {
    return (req, res, next) => {
      const startTime = Date.now();
      const span = this.tracer.startSpan(`${req.method} ${req.path}`);

      // Add request attributes to span
      span.setAttributes({
        'http.method': req.method,
        'http.url': req.url,
        'http.route': req.path,
        'user.agent': req.get('User-Agent') || 'unknown'
      });

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        
        // Record metrics
        this.metrics.httpRequests.add(1, {
          method: req.method,
          route: req.path,
          status_code: res.statusCode.toString()
        });

        this.metrics.httpRequestDuration.record(duration, {
          method: req.method,
          route: req.path,
          status_code: res.statusCode.toString()
        });

        // Update span
        span.setAttributes({
          'http.status_code': res.statusCode,
          'http.response_size': res.get('Content-Length') || 0
        });

        span.end();
      });

      next();
    };
  }

  // Track task operations
  trackTaskOperation(operation, taskType, taskId, metadata = {}) {
    const span = this.tracer.startSpan(`task.${operation}`);
    
    span.setAttributes({
      'task.operation': operation,
      'task.type': taskType,
      'task.id': taskId,
      ...metadata
    });

    switch (operation) {
      case 'create':
        this.metrics.tasksCreated.add(1, { type: taskType });
        this.metrics.activeTasks.add(1, { type: taskType });
        break;
      case 'complete':
        this.metrics.tasksCompleted.add(1, { type: taskType });
        this.metrics.activeTasks.add(-1, { type: taskType });
        if (metadata.duration) {
          this.metrics.taskDuration.record(metadata.duration, { type: taskType });
        }
        break;
      case 'fail':
        this.metrics.tasksFailed.add(1, { type: taskType });
        this.metrics.activeTasks.add(-1, { type: taskType });
        break;
    }

    span.end();
  }

  // Track agent operations
  trackAgentOperation(operation, agentType, agentId, metadata = {}) {
    const span = this.tracer.startSpan(`agent.${operation}`);
    
    span.setAttributes({
      'agent.operation': operation,
      'agent.type': agentType,
      'agent.id': agentId,
      ...metadata
    });

    switch (operation) {
      case 'request':
        this.metrics.agentRequests.add(1, { type: agentType });
        break;
      case 'response':
        if (metadata.responseTime) {
          this.metrics.agentResponseTime.record(metadata.responseTime, { type: agentType });
        }
        break;
      case 'error':
        this.metrics.agentErrors.add(1, { type: agentType });
        break;
      case 'register':
        this.metrics.activeAgents.add(1, { type: agentType });
        break;
      case 'unregister':
        this.metrics.activeAgents.add(-1, { type: agentType });
        break;
    }

    span.end();
  }

  // Track event operations
  trackEventOperation(operation, eventType, metadata = {}) {
    const span = this.tracer.startSpan(`event.${operation}`);
    
    span.setAttributes({
      'event.operation': operation,
      'event.type': eventType,
      ...metadata
    });

    switch (operation) {
      case 'publish':
        this.metrics.eventsPublished.add(1, { type: eventType });
        break;
      case 'consume':
        this.metrics.eventsConsumed.add(1, { type: eventType });
        break;
    }

    span.end();
  }

  // Create custom span
  createSpan(name, attributes = {}) {
    const span = this.tracer.startSpan(name);
    span.setAttributes(attributes);
    return span;
  }

  // Create custom metric
  createMetric(name, type, description, unit = '') {
    switch (type) {
      case 'counter':
        return this.meter.createCounter(name, { description, unit });
      case 'histogram':
        return this.meter.createHistogram(name, { description, unit });
      case 'gauge':
        return this.meter.createObservableGauge(name, { description, unit });
      default:
        throw new Error(`Unknown metric type: ${type}`);
    }
  }

  // Health check
  async healthCheck() {
    try {
      return {
        status: 'healthy',
        service: 'telemetry',
        timestamp: new Date().toISOString(),
        metrics: {
          enabled: !!this.meter,
          tracing: !!this.tracer,
          prometheus: !!this.prometheusExporter
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'telemetry',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Metrics handler for Prometheus
  metricsHandler() {
    return (req, res) => {
      res.set('Content-Type', 'text/plain');
      res.send('# Metrics endpoint - handled by Prometheus exporter\n');
    };
  }

  // Shutdown
  async shutdown() {
    try {
      if (this.sdk) {
        await this.sdk.shutdown();
      }
      logger.info('Telemetry service shutdown completed');
    } catch (error) {
      logger.error('Error during telemetry shutdown:', error);
      throw error;
    }
  }
}

module.exports = new TelemetryService();