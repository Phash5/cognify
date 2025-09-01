const { NodeSDK } = require('@opentelemetry/sdk-node');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { MeterProvider } = require('@opentelemetry/sdk-metrics');
const { metrics, trace } = require('@opentelemetry/api');
const logger = require('./logger');

// Prometheus exporter configuration
const prometheusExporter = new PrometheusExporter({
  port: 9464, // Different port for frontend agent
  endpoint: '/metrics'
}, () => {
  logger.info('Prometheus metrics server started on port 9464');
});

// SDK configuration
const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'frontend-agent',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'cognify',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development'
  }),
  instrumentations: [getNodeAutoInstrumentations()],
  metricReader: prometheusExporter
});

// Initialize SDK
sdk.start()
  .then(() => {
    logger.info('OpenTelemetry initialized successfully');
  })
  .catch((error) => {
    logger.error('Error initializing OpenTelemetry:', error);
  });

// Get meter and tracer instances
const meter = metrics.getMeter('frontend-agent', '1.0.0');
const tracer = trace.getTracer('frontend-agent', '1.0.0');

// Custom metrics
const httpRequestsTotal = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests'
});

const httpRequestDuration = meter.createHistogram('http_request_duration_ms', {
  description: 'Duration of HTTP requests in milliseconds'
});

const activeConnections = meter.createUpDownCounter('active_connections', {
  description: 'Number of active connections'
});

// Frontend-specific metrics
const tasksTotal = meter.createCounter('frontend_tasks_total', {
  description: 'Total number of frontend tasks processed'
});

const taskDuration = meter.createHistogram('frontend_task_duration_ms', {
  description: 'Duration of frontend task execution in milliseconds'
});

const activeTasks = meter.createUpDownCounter('frontend_active_tasks', {
  description: 'Number of currently active frontend tasks'
});

const codeGeneration = meter.createCounter('frontend_code_generation_total', {
  description: 'Total number of code generation operations'
});

const componentGeneration = meter.createCounter('frontend_component_generation_total', {
  description: 'Total number of component generation operations'
});

const codeOptimization = meter.createCounter('frontend_code_optimization_total', {
  description: 'Total number of code optimization operations'
});

const testGeneration = meter.createCounter('frontend_test_generation_total', {
  description: 'Total number of test generation operations'
});

const aiModelCalls = meter.createCounter('ai_model_calls_total', {
  description: 'Total number of AI model API calls'
});

const aiModelLatency = meter.createHistogram('ai_model_latency_ms', {
  description: 'Latency of AI model API calls in milliseconds'
});

const aiTokensUsed = meter.createCounter('ai_tokens_used_total', {
  description: 'Total number of AI tokens consumed'
});

// System metrics
const memoryUsage = meter.createObservableGauge('memory_usage_bytes', {
  description: 'Memory usage in bytes'
});

const cpuUsage = meter.createObservableGauge('cpu_usage_percent', {
  description: 'CPU usage percentage'
});

// Register system metrics callbacks
memoryUsage.addCallback((result) => {
  const usage = process.memoryUsage();
  result.observe(usage.heapUsed, { type: 'heap_used' });
  result.observe(usage.heapTotal, { type: 'heap_total' });
  result.observe(usage.rss, { type: 'rss' });
  result.observe(usage.external, { type: 'external' });
});

cpuUsage.addCallback((result) => {
  const usage = process.cpuUsage();
  const totalUsage = (usage.user + usage.system) / 1000000; // Convert to seconds
  result.observe(totalUsage, { type: 'total' });
});

// Middleware for HTTP request tracking
const httpMetricsMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Increment active connections
  activeConnections.add(1);
  
  // Track request
  const span = tracer.startSpan(`${req.method} ${req.route?.path || req.path}`);
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Record metrics
    httpRequestsTotal.add(1, {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode.toString()
    });
    
    httpRequestDuration.record(duration, {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode.toString()
    });
    
    // Decrement active connections
    activeConnections.add(-1);
    
    // End span
    span.setAttributes({
      'http.method': req.method,
      'http.url': req.url,
      'http.status_code': res.statusCode,
      'http.response_time': duration
    });
    span.end();
  });
  
  next();
};

// Helper functions for tracking frontend operations
const trackTask = (taskType, duration, success = true) => {
  tasksTotal.add(1, {
    type: taskType,
    status: success ? 'success' : 'failure'
  });
  
  if (duration) {
    taskDuration.record(duration, {
      type: taskType,
      status: success ? 'success' : 'failure'
    });
  }
};

const trackActiveTask = (increment = true) => {
  activeTasks.add(increment ? 1 : -1);
};

const trackCodeGeneration = (type, linesOfCode, success = true) => {
  codeGeneration.add(1, {
    type,
    status: success ? 'success' : 'failure'
  });
  
  if (type === 'component') {
    componentGeneration.add(1, {
      status: success ? 'success' : 'failure'
    });
  }
};

const trackOptimization = (type, improvement, success = true) => {
  codeOptimization.add(1, {
    type,
    status: success ? 'success' : 'failure'
  });
};

const trackTestGeneration = (testType, testCount, success = true) => {
  testGeneration.add(1, {
    type: testType,
    status: success ? 'success' : 'failure'
  });
};

const trackAIModelCall = (model, operation, latency, tokensUsed, success = true) => {
  aiModelCalls.add(1, {
    model,
    operation,
    status: success ? 'success' : 'failure'
  });
  
  if (latency) {
    aiModelLatency.record(latency, {
      model,
      operation,
      status: success ? 'success' : 'failure'
    });
  }
  
  if (tokensUsed) {
    aiTokensUsed.add(tokensUsed, {
      model,
      operation,
      type: 'total'
    });
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => {
      logger.info('OpenTelemetry terminated');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Error terminating OpenTelemetry:', error);
      process.exit(1);
    });
});

module.exports = {
  sdk,
  meter,
  tracer,
  httpMetricsMiddleware,
  trackTask,
  trackActiveTask,
  trackCodeGeneration,
  trackOptimization,
  trackTestGeneration,
  trackAIModelCall
};