/**
 * Telemetry Utility for Backend AI Agent
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
    this.prometheusExporter = null;
    this.isInitialized = false;
    
    if (config.telemetry.enabled) {
      this.initialize();
    }
  }
  
  initialize() {
    try {
      // Create resource
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.telemetry.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: config.telemetry.serviceVersion,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.telemetry.environment,
        [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: `${config.telemetry.serviceName}-${process.pid}`,
        [SemanticResourceAttributes.HOST_NAME]: require('os').hostname(),
        [SemanticResourceAttributes.PROCESS_PID]: process.pid,
      });
      
      // Configure metric readers
      const metricReaders = [];
      
      // Prometheus exporter for metrics
      if (config.telemetry.prometheus.enabled) {
        this.prometheusExporter = new PrometheusExporter({
          port: config.telemetry.prometheus.port,
          endpoint: config.telemetry.prometheus.endpoint,
          prefix: config.telemetry.prometheus.prefix,
        });
        
        metricReaders.push(this.prometheusExporter);
        
        logger.info('Prometheus metrics exporter configured', {
          port: config.telemetry.prometheus.port,
          endpoint: config.telemetry.prometheus.endpoint,
          prefix: config.telemetry.prometheus.prefix,
        });
      }
      
      // Configure span processors
      const spanProcessors = [];
      
      // Jaeger exporter for traces
      const jaegerExporter = new JaegerExporter({
        endpoint: config.telemetry.jaeger.endpoint,
        agentHost: config.telemetry.jaeger.agentHost,
        agentPort: config.telemetry.jaeger.agentPort,
      });
      
      spanProcessors.push(new BatchSpanProcessor(jaegerExporter));
      
      logger.info('Jaeger trace exporter configured', {
        endpoint: config.telemetry.jaeger.endpoint,
        agentHost: config.telemetry.jaeger.agentHost,
        agentPort: config.telemetry.jaeger.agentPort,
      });
      
      // Initialize SDK
      this.sdk = new NodeSDK({
        resource,
        spanProcessors,
        metricReaders,
        instrumentations: [
          getNodeAutoInstrumentations({
            // Disable some instrumentations that might be noisy
            '@opentelemetry/instrumentation-fs': {
              enabled: false,
            },
            '@opentelemetry/instrumentation-dns': {
              enabled: false,
            },
            // Configure HTTP instrumentation
            '@opentelemetry/instrumentation-http': {
              enabled: true,
              ignoreIncomingRequestHook: (req) => {
                // Ignore health check and metrics endpoints
                return req.url?.includes('/health') || req.url?.includes('/metrics');
              },
              ignoreOutgoingRequestHook: (options) => {
                // Ignore internal health checks
                return options.hostname === 'localhost' && options.path?.includes('/health');
              },
            },
            // Configure Express instrumentation
            '@opentelemetry/instrumentation-express': {
              enabled: true,
            },
            // Configure Redis instrumentation
            '@opentelemetry/instrumentation-redis': {
              enabled: true,
            },
          }),
        ],
        sampler: this.createSampler(),
      });
      
      // Start the SDK
      this.sdk.start();
      
      // Get tracer and meter instances
      this.tracer = trace.getTracer(config.telemetry.serviceName, config.telemetry.serviceVersion);
      this.meter = metrics.getMeter(config.telemetry.serviceName, config.telemetry.serviceVersion);
      
      this.isInitialized = true;
      
      logger.info('Telemetry service initialized', {
        serviceName: config.telemetry.serviceName,
        serviceVersion: config.telemetry.serviceVersion,
        environment: config.telemetry.environment,
        sampleRate: config.telemetry.sampleRate,
      });
      
    } catch (error) {
      logger.error('Failed to initialize telemetry service', {
        error: error.message,
        stack: error.stack,
      });
      
      // Create no-op instances to prevent errors
      this.tracer = trace.getNoOpTracer();
      this.meter = metrics.getMeterProvider().getMeter('noop');
    }
  }
  
  createSampler() {
    const { TraceIdRatioBasedSampler, ParentBasedSampler } = require('@opentelemetry/sdk-trace-base');
    
    // Use parent-based sampling with ratio-based fallback
    return new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(config.telemetry.sampleRate),
    });
  }
  
  // Convenience methods for creating spans
  startSpan(name, options = {}) {
    if (!this.tracer) {
      return trace.getNoOpTracer().startSpan(name);
    }
    
    return this.tracer.startSpan(name, {
      kind: options.kind || undefined,
      attributes: {
        'service.name': config.telemetry.serviceName,
        'service.version': config.telemetry.serviceVersion,
        ...options.attributes,
      },
      parent: options.parent,
    });
  }
  
  // Convenience method for creating active spans
  startActiveSpan(name, fn, options = {}) {
    if (!this.tracer) {
      return fn(trace.getNoOpTracer().startSpan(name));
    }
    
    return this.tracer.startActiveSpan(name, {
      kind: options.kind || undefined,
      attributes: {
        'service.name': config.telemetry.serviceName,
        'service.version': config.telemetry.serviceVersion,
        ...options.attributes,
      },
      parent: options.parent,
    }, fn);
  }
  
  // Create counter metric
  createCounter(name, description, unit = '1') {
    if (!this.meter) {
      return {
        add: () => {},
      };
    }
    
    return this.meter.createCounter(name, {
      description,
      unit,
    });
  }
  
  // Create histogram metric
  createHistogram(name, description, unit = '1', boundaries) {
    if (!this.meter) {
      return {
        record: () => {},
      };
    }
    
    const options = {
      description,
      unit,
    };
    
    if (boundaries) {
      options.boundaries = boundaries;
    }
    
    return this.meter.createHistogram(name, options);
  }
  
  // Create up-down counter metric
  createUpDownCounter(name, description, unit = '1') {
    if (!this.meter) {
      return {
        add: () => {},
      };
    }
    
    return this.meter.createUpDownCounter(name, {
      description,
      unit,
    });
  }
  
  // Create gauge metric
  createGauge(name, description, unit = '1') {
    if (!this.meter) {
      return {
        addCallback: () => {},
      };
    }
    
    return this.meter.createObservableGauge(name, {
      description,
      unit,
    });
  }
  
  // Record exception in current span
  recordException(error, attributes = {}) {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.recordException(error, attributes);
      activeSpan.setStatus({
        code: trace.SpanStatusCode.ERROR,
        message: error.message,
      });
    }
  }
  
  // Add event to current span
  addEvent(name, attributes = {}) {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.addEvent(name, attributes);
    }
  }
  
  // Set attributes on current span
  setAttributes(attributes) {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes(attributes);
    }
  }
  
  // Set status on current span
  setStatus(status) {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setStatus(status);
    }
  }
  
  // Get current trace ID
  getTraceId() {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      return activeSpan.spanContext().traceId;
    }
    return null;
  }
  
  // Get current span ID
  getSpanId() {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      return activeSpan.spanContext().spanId;
    }
    return null;
  }
  
  // Middleware for Express to add tracing context
  middleware() {
    return (req, res, next) => {
      // Add trace ID to request for logging
      const traceId = this.getTraceId();
      if (traceId) {
        req.traceId = traceId;
        res.setHeader('X-Trace-Id', traceId);
      }
      
      // Add span ID to request for logging
      const spanId = this.getSpanId();
      if (spanId) {
        req.spanId = spanId;
        res.setHeader('X-Span-Id', spanId);
      }
      
      next();
    };
  }
  
  // Instrument async function with tracing
  instrument(name, fn, options = {}) {
    return async (...args) => {
      return this.startActiveSpan(name, async (span) => {
        try {
          const result = await fn(...args);
          
          if (options.recordResult) {
            span.setAttributes({
              'operation.result': typeof result === 'object' ? JSON.stringify(result) : String(result),
            });
          }
          
          span.setStatus({ code: trace.SpanStatusCode.OK });
          return result;
          
        } catch (error) {
          span.recordException(error);
          span.setStatus({
            code: trace.SpanStatusCode.ERROR,
            message: error.message,
          });
          throw error;
        }
      }, options);
    };
  }
  
  // Get metrics endpoint for Prometheus
  getMetricsEndpoint() {
    if (this.prometheusExporter) {
      return `http://localhost:${config.telemetry.prometheus.port}${config.telemetry.prometheus.endpoint}`;
    }
    return null;
  }
  
  // Get telemetry status
  getStatus() {
    return {
      enabled: config.telemetry.enabled,
      initialized: this.isInitialized,
      serviceName: config.telemetry.serviceName,
      serviceVersion: config.telemetry.serviceVersion,
      environment: config.telemetry.environment,
      sampleRate: config.telemetry.sampleRate,
      prometheus: {
        enabled: config.telemetry.prometheus.enabled,
        port: config.telemetry.prometheus.port,
        endpoint: config.telemetry.prometheus.endpoint,
      },
      jaeger: {
        endpoint: config.telemetry.jaeger.endpoint,
        agentHost: config.telemetry.jaeger.agentHost,
        agentPort: config.telemetry.jaeger.agentPort,
      },
    };
  }
  
  // Shutdown telemetry
  async shutdown() {
    if (this.sdk) {
      try {
        await this.sdk.shutdown();
        logger.info('Telemetry service shutdown completed');
      } catch (error) {
        logger.error('Error shutting down telemetry service', {
          error: error.message,
        });
      }
    }
  }
}

// Create singleton instance
const telemetryService = new TelemetryService();

// Export both the service and convenience methods
module.exports = {
  telemetryService,
  tracer: telemetryService.tracer,
  meter: telemetryService.meter,
  startSpan: telemetryService.startSpan.bind(telemetryService),
  startActiveSpan: telemetryService.startActiveSpan.bind(telemetryService),
  recordException: telemetryService.recordException.bind(telemetryService),
  addEvent: telemetryService.addEvent.bind(telemetryService),
  setAttributes: telemetryService.setAttributes.bind(telemetryService),
  setStatus: telemetryService.setStatus.bind(telemetryService),
  getTraceId: telemetryService.getTraceId.bind(telemetryService),
  getSpanId: telemetryService.getSpanId.bind(telemetryService),
  middleware: telemetryService.middleware.bind(telemetryService),
  instrument: telemetryService.instrument.bind(telemetryService),
  getStatus: telemetryService.getStatus.bind(telemetryService),
  shutdown: telemetryService.shutdown.bind(telemetryService),
};