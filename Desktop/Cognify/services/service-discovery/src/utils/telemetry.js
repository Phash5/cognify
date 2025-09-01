/**
 * Telemetry Utility
 * OpenTelemetry integration for distributed tracing and metrics
 */

'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { MeterProvider } = require('@opentelemetry/sdk-metrics');
const { metrics, trace } = require('@opentelemetry/api');
const config = require('../config/config');

class TelemetryService {
  constructor() {
    this.sdk = null;
    this.tracer = null;
    this.meter = null;
    this.isInitialized = false;
    
    // Metrics
    this.counters = new Map();
    this.histograms = new Map();
    this.gauges = new Map();
    
    this.init();
  }

  /**
   * Initialize OpenTelemetry
   */
  init() {
    try {
      if (!config.telemetry.enabled) {
        console.log('Telemetry disabled');
        return;
      }

      // Create resource
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.telemetry.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
        [SemanticResourceAttributes.SERVICE_NAMESPACE]: config.telemetry.serviceNamespace,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.server.environment,
      });

      // Configure exporters
      const exporters = [];

      // Jaeger exporter for tracing
      if (config.telemetry.jaeger.enabled) {
        exporters.push(
          new JaegerExporter({
            endpoint: config.telemetry.jaeger.endpoint,
          })
        );
      }

      // Initialize SDK
      this.sdk = new NodeSDK({
        resource,
        traceExporter: exporters.length > 0 ? exporters[0] : undefined,
        instrumentations: [
          getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-fs': {
              enabled: false, // Disable file system instrumentation to reduce noise
            },
          }),
        ],
      });

      // Start SDK
      this.sdk.start();

      // Get tracer
      this.tracer = trace.getTracer(
        config.telemetry.serviceName,
        process.env.npm_package_version || '1.0.0'
      );

      // Initialize metrics
      this.initMetrics();

      this.isInitialized = true;
      console.log('Telemetry initialized successfully', {
        serviceName: config.telemetry.serviceName,
        jaegerEnabled: config.telemetry.jaeger.enabled,
        prometheusEnabled: config.telemetry.prometheus.enabled,
      });

    } catch (error) {
      console.error('Failed to initialize telemetry', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Initialize metrics
   */
  initMetrics() {
    try {
      // Prometheus exporter for metrics
      if (config.telemetry.prometheus.enabled) {
        const prometheusExporter = new PrometheusExporter({
          port: config.telemetry.prometheus.port,
          endpoint: config.telemetry.prometheus.endpoint,
        });

        const meterProvider = new MeterProvider({
          resource: this.sdk.resource,
          readers: [prometheusExporter],
        });

        metrics.setGlobalMeterProvider(meterProvider);
      }

      // Get meter
      this.meter = metrics.getMeter(
        config.telemetry.serviceName,
        process.env.npm_package_version || '1.0.0'
      );

      // Create service-specific metrics
      this.createServiceMetrics();

    } catch (error) {
      console.error('Failed to initialize metrics', {
        error: error.message,
      });
    }
  }

  /**
   * Create service-specific metrics
   */
  createServiceMetrics() {
    if (!this.meter) {
      return;
    }

    try {
      // Service registry metrics
      this.counters.set('service_registrations_total', 
        this.meter.createCounter('service_registrations_total', {
          description: 'Total number of service registrations',
        })
      );

      this.counters.set('service_deregistrations_total', 
        this.meter.createCounter('service_deregistrations_total', {
          description: 'Total number of service deregistrations',
        })
      );

      this.counters.set('service_discoveries_total', 
        this.meter.createCounter('service_discoveries_total', {
          description: 'Total number of service discoveries',
        })
      );

      this.counters.set('health_checks_total', 
        this.meter.createCounter('health_checks_total', {
          description: 'Total number of health checks performed',
        })
      );

      this.counters.set('health_check_failures_total', 
        this.meter.createCounter('health_check_failures_total', {
          description: 'Total number of health check failures',
        })
      );

      this.counters.set('registry_errors_total', 
        this.meter.createCounter('registry_errors_total', {
          description: 'Total number of registry errors',
        })
      );

      // Gauges for current state
      this.gauges.set('services_registered', 
        this.meter.createObservableGauge('services_registered', {
          description: 'Number of currently registered services',
        })
      );

      this.gauges.set('service_instances_total', 
        this.meter.createObservableGauge('service_instances_total', {
          description: 'Total number of service instances',
        })
      );

      this.gauges.set('service_instances_healthy', 
        this.meter.createObservableGauge('service_instances_healthy', {
          description: 'Number of healthy service instances',
        })
      );

      this.gauges.set('service_instances_unhealthy', 
        this.meter.createObservableGauge('service_instances_unhealthy', {
          description: 'Number of unhealthy service instances',
        })
      );

      // Histograms for timing
      this.histograms.set('service_registration_duration', 
        this.meter.createHistogram('service_registration_duration', {
          description: 'Duration of service registration operations',
          unit: 'ms',
        })
      );

      this.histograms.set('service_discovery_duration', 
        this.meter.createHistogram('service_discovery_duration', {
          description: 'Duration of service discovery operations',
          unit: 'ms',
        })
      );

      this.histograms.set('health_check_duration', 
        this.meter.createHistogram('health_check_duration', {
          description: 'Duration of health check operations',
          unit: 'ms',
        })
      );

      // HTTP metrics
      this.counters.set('http_requests_total', 
        this.meter.createCounter('http_requests_total', {
          description: 'Total number of HTTP requests',
        })
      );

      this.histograms.set('http_request_duration', 
        this.meter.createHistogram('http_request_duration', {
          description: 'Duration of HTTP requests',
          unit: 'ms',
        })
      );

    } catch (error) {
      console.error('Failed to create service metrics', {
        error: error.message,
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
   * Get the active span
   */
  getActiveSpan() {
    if (!this.isInitialized) {
      return null;
    }

    return trace.getActiveSpan();
  }

  /**
   * Increment a counter metric
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
   * Update a gauge value
   */
  updateGauge(name, value, attributes = {}) {
    // Gauges are typically updated through observable callbacks
    // This method can be used to store values that will be read by the callback
    if (!this.gaugeValues) {
      this.gaugeValues = new Map();
    }
    
    this.gaugeValues.set(name, { value, attributes });
  }

  /**
   * Record service registration metrics
   */
  recordServiceRegistration(serviceName, duration) {
    this.incrementCounter('service_registrations_total', 1, {
      service_name: serviceName,
    });
    
    if (duration !== undefined) {
      this.recordHistogram('service_registration_duration', duration, {
        service_name: serviceName,
      });
    }
  }

  /**
   * Record service deregistration metrics
   */
  recordServiceDeregistration(serviceName) {
    this.incrementCounter('service_deregistrations_total', 1, {
      service_name: serviceName,
    });
  }

  /**
   * Record service discovery metrics
   */
  recordServiceDiscovery(serviceName, instancesFound, duration) {
    this.incrementCounter('service_discoveries_total', 1, {
      service_name: serviceName,
    });
    
    if (duration !== undefined) {
      this.recordHistogram('service_discovery_duration', duration, {
        service_name: serviceName,
        instances_found: instancesFound.toString(),
      });
    }
  }

  /**
   * Record health check metrics
   */
  recordHealthCheck(serviceName, instanceId, success, duration) {
    this.incrementCounter('health_checks_total', 1, {
      service_name: serviceName,
      instance_id: instanceId,
      success: success.toString(),
    });
    
    if (!success) {
      this.incrementCounter('health_check_failures_total', 1, {
        service_name: serviceName,
        instance_id: instanceId,
      });
    }
    
    if (duration !== undefined) {
      this.recordHistogram('health_check_duration', duration, {
        service_name: serviceName,
        instance_id: instanceId,
        success: success.toString(),
      });
    }
  }

  /**
   * Record registry error
   */
  recordRegistryError(operation, errorType) {
    this.incrementCounter('registry_errors_total', 1, {
      operation,
      error_type: errorType,
    });
  }

  /**
   * Record HTTP request metrics
   */
  recordHttpRequest(method, route, statusCode, duration) {
    this.incrementCounter('http_requests_total', 1, {
      method,
      route,
      status_code: statusCode.toString(),
    });
    
    if (duration !== undefined) {
      this.recordHistogram('http_request_duration', duration, {
        method,
        route,
        status_code: statusCode.toString(),
      });
    }
  }

  /**
   * Update registry state metrics
   */
  updateRegistryMetrics(metrics) {
    this.updateGauge('services_registered', metrics.totalServices);
    this.updateGauge('service_instances_total', metrics.totalInstances);
    this.updateGauge('service_instances_healthy', metrics.healthyInstances);
    this.updateGauge('service_instances_unhealthy', metrics.unhealthyInstances);
  }

  /**
   * Create a timing utility
   */
  createTimer(name, attributes = {}) {
    const start = Date.now();
    
    return {
      end: () => {
        const duration = Date.now() - start;
        this.recordHistogram(name, duration, attributes);
        return duration;
      }
    };
  }

  /**
   * Middleware for Express to add tracing
   */
  getTracingMiddleware() {
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
          'http.request_id': req.requestId,
        },
      });

      // Add span to request for later use
      req.span = span;

      // Override res.end to finish span
      const originalEnd = res.end;
      res.end = function(chunk, encoding) {
        span.setAttributes({
          'http.status_code': res.statusCode,
          'http.response.size': res.get('Content-Length') || 0,
        });

        if (res.statusCode >= 400) {
          span.setStatus({
            code: 2, // ERROR
            message: `HTTP ${res.statusCode}`,
          });
        }

        span.end();
        originalEnd.call(this, chunk, encoding);
      };

      next();
    };
  }

  /**
   * Middleware for Express to add metrics
   */
  getMetricsMiddleware() {
    return (req, res, next) => {
      const start = Date.now();

      // Override res.end to record metrics
      const originalEnd = res.end;
      res.end = function(chunk, encoding) {
        const duration = Date.now() - start;
        
        telemetryService.recordHttpRequest(
          req.method,
          req.route?.path || req.path,
          res.statusCode,
          duration
        );

        originalEnd.call(this, chunk, encoding);
      };

      next();
    };
  }

  /**
   * Shutdown telemetry
   */
  async shutdown() {
    if (this.sdk) {
      try {
        await this.sdk.shutdown();
        console.log('Telemetry shutdown completed');
      } catch (error) {
        console.error('Error shutting down telemetry', {
          error: error.message,
        });
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