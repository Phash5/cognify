import EventEmitter from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Distributed tracer for microservices
 */
class DistributedTracer extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      serviceName: process.env.SERVICE_NAME || 'unknown-service',
      serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
      enableOpenTelemetry: process.env.TRACING_OTEL !== 'false',
      enableJaeger: process.env.TRACING_JAEGER === 'true',
      enableZipkin: process.env.TRACING_ZIPKIN === 'true',
      enableCustom: true,
      samplingRate: parseFloat(process.env.TRACING_SAMPLING_RATE) || 1.0,
      maxSpans: parseInt(process.env.TRACING_MAX_SPANS) || 10000,
      flushInterval: parseInt(process.env.TRACING_FLUSH_INTERVAL) || 30000,
      enableAutoInstrumentation: true,
      enableHttpTracing: true,
      enableDatabaseTracing: true,
      enableEventTracing: true,
      ...options
    };

    this.logger = options.logger;
    
    // Active spans storage
    this.activeSpans = new Map();
    this.completedSpans = [];
    
    // Trace context storage
    this.traceContexts = new Map();
    
    // Statistics
    this.stats = {
      spansCreated: 0,
      spansCompleted: 0,
      tracesStarted: 0,
      tracesCompleted: 0,
      errors: 0,
      lastFlush: null
    };

    // Flush timer
    this.flushTimer = null;
    
    // Start periodic flush if enabled
    if (this.options.flushInterval > 0) {
      this._startPeriodicFlush();
    }

    // Initialize tracing providers
    this._initializeProviders();
  }

  /**
   * Initialize tracing providers
   */
  _initializeProviders() {
    try {
      if (this.options.enableOpenTelemetry) {
        this._initializeOpenTelemetry();
      }
      
      if (this.options.enableJaeger) {
        this._initializeJaeger();
      }
      
      if (this.options.enableZipkin) {
        this._initializeZipkin();
      }

      if (this.logger) {
        this.logger.debug('Tracing providers initialized', {
          openTelemetry: this.options.enableOpenTelemetry,
          jaeger: this.options.enableJaeger,
          zipkin: this.options.enableZipkin,
          serviceName: this.options.serviceName
        });
      }
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Failed to initialize tracing providers', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
    }
  }

  /**
   * Initialize OpenTelemetry
   */
  _initializeOpenTelemetry() {
    // Note: In a real implementation, you would import and configure OpenTelemetry
    // const { NodeSDK } = require('@opentelemetry/sdk-node');
    // const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    // 
    // this.otelSDK = new NodeSDK({
    //   serviceName: this.options.serviceName,
    //   instrumentations: [getNodeAutoInstrumentations()]
    // });
    // 
    // this.otelSDK.start();
    
    if (this.logger) {
      this.logger.debug('OpenTelemetry initialized', {
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Initialize Jaeger
   */
  _initializeJaeger() {
    // Note: In a real implementation, you would configure Jaeger exporter
    // const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');
    
    if (this.logger) {
      this.logger.debug('Jaeger initialized', {
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Initialize Zipkin
   */
  _initializeZipkin() {
    // Note: In a real implementation, you would configure Zipkin exporter
    // const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');
    
    if (this.logger) {
      this.logger.debug('Zipkin initialized', {
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Start periodic spans flush
   */
  _startPeriodicFlush() {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        this.stats.errors++;
        
        if (this.logger) {
          this.logger.error('Periodic spans flush failed', {
            error: error.message,
            serviceName: this.options.serviceName
          });
        }
      });
    }, this.options.flushInterval);
  }

  /**
   * Start a new trace
   * @param {string} operationName - Operation name
   * @param {Object} options - Trace options
   * @returns {Object} Trace context
   */
  startTrace(operationName, options = {}) {
    const traceId = options.traceId || this._generateTraceId();
    const spanId = this._generateSpanId();
    
    const traceContext = {
      traceId,
      spanId,
      parentSpanId: null,
      operationName,
      serviceName: this.options.serviceName,
      serviceVersion: this.options.serviceVersion,
      startTime: Date.now(),
      tags: {
        'service.name': this.options.serviceName,
        'service.version': this.options.serviceVersion,
        ...options.tags
      },
      logs: [],
      baggage: options.baggage || {},
      sampled: this._shouldSample()
    };
    
    this.traceContexts.set(traceId, traceContext);
    this.stats.tracesStarted++;
    
    this.emit('traceStarted', traceContext);

    if (this.logger) {
      this.logger.debug('Trace started', {
        traceId,
        spanId,
        operationName,
        serviceName: this.options.serviceName
      });
    }
    
    return traceContext;
  }

  /**
   * Start a new span
   * @param {string} operationName - Operation name
   * @param {Object} options - Span options
   * @returns {Object} Span context
   */
  startSpan(operationName, options = {}) {
    const traceId = options.traceId || this._generateTraceId();
    const spanId = this._generateSpanId();
    const parentSpanId = options.parentSpanId || null;
    
    const span = {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      serviceName: this.options.serviceName,
      serviceVersion: this.options.serviceVersion,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      status: 'started',
      tags: {
        'service.name': this.options.serviceName,
        'service.version': this.options.serviceVersion,
        'span.kind': options.kind || 'internal',
        ...options.tags
      },
      logs: [],
      baggage: options.baggage || {},
      sampled: options.sampled !== undefined ? options.sampled : this._shouldSample(),
      references: options.references || []
    };
    
    this.activeSpans.set(spanId, span);
    this.stats.spansCreated++;
    
    this.emit('spanStarted', span);

    if (this.logger) {
      this.logger.debug('Span started', {
        traceId,
        spanId,
        parentSpanId,
        operationName,
        serviceName: this.options.serviceName
      });
    }
    
    return span;
  }

  /**
   * Finish a span
   * @param {string} spanId - Span ID
   * @param {Object} options - Finish options
   */
  finishSpan(spanId, options = {}) {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      if (this.logger) {
        this.logger.warn('Attempted to finish non-existent span', {
          spanId,
          serviceName: this.options.serviceName
        });
      }
      return;
    }
    
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = options.error ? 'error' : 'completed';
    
    if (options.error) {
      span.tags['error'] = true;
      span.tags['error.message'] = options.error.message;
      span.tags['error.stack'] = options.error.stack;
    }
    
    if (options.tags) {
      Object.assign(span.tags, options.tags);
    }
    
    this.activeSpans.delete(spanId);
    this.completedSpans.push(span);
    this.stats.spansCompleted++;
    
    // Keep only recent spans to prevent memory issues
    if (this.completedSpans.length > this.options.maxSpans) {
      this.completedSpans = this.completedSpans.slice(-Math.floor(this.options.maxSpans / 2));
    }
    
    this.emit('spanFinished', span);

    if (this.logger) {
      this.logger.debug('Span finished', {
        traceId: span.traceId,
        spanId,
        operationName: span.operationName,
        duration: span.duration,
        status: span.status,
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Add tags to a span
   * @param {string} spanId - Span ID
   * @param {Object} tags - Tags to add
   */
  addTags(spanId, tags) {
    const span = this.activeSpans.get(spanId);
    if (span) {
      Object.assign(span.tags, tags);
      
      this.emit('spanTagsAdded', { spanId, tags });
    }
  }

  /**
   * Add a log entry to a span
   * @param {string} spanId - Span ID
   * @param {Object} log - Log entry
   */
  addLog(spanId, log) {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.logs.push({
        timestamp: Date.now(),
        ...log
      });
      
      this.emit('spanLogAdded', { spanId, log });
    }
  }

  /**
   * Set baggage for a span
   * @param {string} spanId - Span ID
   * @param {string} key - Baggage key
   * @param {string} value - Baggage value
   */
  setBaggage(spanId, key, value) {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.baggage[key] = value;
      
      this.emit('spanBaggageSet', { spanId, key, value });
    }
  }

  /**
   * Get baggage from a span
   * @param {string} spanId - Span ID
   * @param {string} key - Baggage key
   * @returns {string} Baggage value
   */
  getBaggage(spanId, key) {
    const span = this.activeSpans.get(spanId);
    return span ? span.baggage[key] : undefined;
  }

  /**
   * Create a child span
   * @param {string} parentSpanId - Parent span ID
   * @param {string} operationName - Operation name
   * @param {Object} options - Span options
   * @returns {Object} Child span
   */
  createChildSpan(parentSpanId, operationName, options = {}) {
    const parentSpan = this.activeSpans.get(parentSpanId);
    if (!parentSpan) {
      throw new Error(`Parent span ${parentSpanId} not found`);
    }
    
    return this.startSpan(operationName, {
      ...options,
      traceId: parentSpan.traceId,
      parentSpanId,
      baggage: { ...parentSpan.baggage, ...options.baggage },
      sampled: parentSpan.sampled
    });
  }

  /**
   * Trace HTTP request
   * @param {Object} request - Request information
   * @param {Object} options - Tracing options
   * @returns {Object} Span context
   */
  traceHttpRequest(request, options = {}) {
    const {
      method,
      url,
      headers = {},
      userAgent = 'unknown'
    } = request;
    
    const operationName = `HTTP ${method.toUpperCase()}`;
    
    // Extract trace context from headers
    const traceId = headers['x-trace-id'] || options.traceId;
    const parentSpanId = headers['x-parent-span-id'] || options.parentSpanId;
    
    const span = this.startSpan(operationName, {
      ...options,
      traceId,
      parentSpanId,
      kind: 'server',
      tags: {
        'http.method': method.toUpperCase(),
        'http.url': url,
        'http.user_agent': userAgent,
        'component': 'http',
        ...options.tags
      }
    });
    
    return span;
  }

  /**
   * Trace HTTP response
   * @param {string} spanId - Span ID
   * @param {Object} response - Response information
   */
  traceHttpResponse(spanId, response) {
    const {
      statusCode,
      contentLength = 0,
      duration = 0
    } = response;
    
    const tags = {
      'http.status_code': statusCode,
      'http.response_size': contentLength
    };
    
    if (statusCode >= 400) {
      tags['error'] = true;
      tags['http.status_class'] = `${Math.floor(statusCode / 100)}xx`;
    }
    
    this.addTags(spanId, tags);
    
    if (duration > 0) {
      this.addLog(spanId, {
        event: 'response_sent',
        duration
      });
    }
  }

  /**
   * Trace database operation
   * @param {Object} operation - Database operation
   * @param {Object} options - Tracing options
   * @returns {Object} Span context
   */
  traceDatabaseOperation(operation, options = {}) {
    const {
      type, // 'mongodb', 'mysql', 'postgresql', etc.
      operation: dbOperation, // 'find', 'insert', 'update', 'delete'
      collection,
      query = {},
      database
    } = operation;
    
    const operationName = `${type}.${dbOperation}`;
    
    const span = this.startSpan(operationName, {
      ...options,
      kind: 'client',
      tags: {
        'db.type': type,
        'db.operation': dbOperation,
        'db.collection.name': collection,
        'db.name': database,
        'component': 'database',
        ...options.tags
      }
    });
    
    // Add query information (sanitized)
    if (query && Object.keys(query).length > 0) {
      this.addLog(span.spanId, {
        event: 'query',
        query: this._sanitizeQuery(query)
      });
    }
    
    return span;
  }

  /**
   * Trace event emission
   * @param {Object} event - Event information
   * @param {Object} options - Tracing options
   * @returns {Object} Span context
   */
  traceEventEmission(event, options = {}) {
    const {
      eventName,
      payload = {},
      distributed = false
    } = event;
    
    const operationName = `event.emit.${eventName}`;
    
    const span = this.startSpan(operationName, {
      ...options,
      kind: 'producer',
      tags: {
        'event.name': eventName,
        'event.distributed': distributed,
        'component': 'event',
        ...options.tags
      }
    });
    
    // Add payload information (sanitized)
    if (payload && Object.keys(payload).length > 0) {
      this.addLog(span.spanId, {
        event: 'payload',
        payload: this._sanitizePayload(payload)
      });
    }
    
    return span;
  }

  /**
   * Trace event reception
   * @param {Object} event - Event information
   * @param {Object} options - Tracing options
   * @returns {Object} Span context
   */
  traceEventReception(event, options = {}) {
    const {
      eventName,
      fromService = 'unknown',
      distributed = false
    } = event;
    
    const operationName = `event.receive.${eventName}`;
    
    const span = this.startSpan(operationName, {
      ...options,
      kind: 'consumer',
      tags: {
        'event.name': eventName,
        'event.from_service': fromService,
        'event.distributed': distributed,
        'component': 'event',
        ...options.tags
      }
    });
    
    return span;
  }

  /**
   * Trace function execution
   * @param {string} functionName - Function name
   * @param {Function} fn - Function to trace
   * @param {Object} options - Tracing options
   * @returns {Promise} Function result
   */
  async traceFunction(functionName, fn, options = {}) {
    const span = this.startSpan(functionName, {
      ...options,
      kind: 'internal',
      tags: {
        'function.name': functionName,
        'component': 'function',
        ...options.tags
      }
    });
    
    try {
      const result = await fn();
      
      this.addTags(span.spanId, {
        'function.success': true
      });
      
      this.finishSpan(span.spanId);
      return result;
    } catch (error) {
      this.addTags(span.spanId, {
        'function.success': false,
        'error': true,
        'error.message': error.message
      });
      
      this.finishSpan(span.spanId, { error });
      throw error;
    }
  }

  /**
   * Extract trace context from headers
   * @param {Object} headers - HTTP headers
   * @returns {Object} Trace context
   */
  extractTraceContext(headers) {
    return {
      traceId: headers['x-trace-id'],
      spanId: headers['x-span-id'],
      parentSpanId: headers['x-parent-span-id'],
      sampled: headers['x-trace-sampled'] === 'true',
      baggage: this._parseBaggage(headers['x-trace-baggage'])
    };
  }

  /**
   * Inject trace context into headers
   * @param {Object} span - Span context
   * @param {Object} headers - HTTP headers
   */
  injectTraceContext(span, headers = {}) {
    headers['x-trace-id'] = span.traceId;
    headers['x-span-id'] = span.spanId;
    
    if (span.parentSpanId) {
      headers['x-parent-span-id'] = span.parentSpanId;
    }
    
    headers['x-trace-sampled'] = span.sampled.toString();
    
    if (span.baggage && Object.keys(span.baggage).length > 0) {
      headers['x-trace-baggage'] = this._serializeBaggage(span.baggage);
    }
    
    return headers;
  }

  /**
   * Generate trace ID
   * @returns {string} Trace ID
   */
  _generateTraceId() {
    return uuidv4().replace(/-/g, '');
  }

  /**
   * Generate span ID
   * @returns {string} Span ID
   */
  _generateSpanId() {
    return uuidv4().replace(/-/g, '').substring(0, 16);
  }

  /**
   * Determine if trace should be sampled
   * @returns {boolean} Should sample
   */
  _shouldSample() {
    return Math.random() < this.options.samplingRate;
  }

  /**
   * Sanitize database query for logging
   * @param {Object} query - Database query
   * @returns {Object} Sanitized query
   */
  _sanitizeQuery(query) {
    // Remove sensitive fields and limit size
    const sanitized = { ...query };
    
    // Remove common sensitive fields
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.secret;
    delete sanitized.key;
    
    // Limit string length
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'string' && value.length > 100) {
        sanitized[key] = value.substring(0, 100) + '...';
      }
    }
    
    return sanitized;
  }

  /**
   * Sanitize event payload for logging
   * @param {Object} payload - Event payload
   * @returns {Object} Sanitized payload
   */
  _sanitizePayload(payload) {
    return this._sanitizeQuery(payload); // Same logic for now
  }

  /**
   * Parse baggage from header
   * @param {string} baggageHeader - Baggage header value
   * @returns {Object} Baggage object
   */
  _parseBaggage(baggageHeader) {
    if (!baggageHeader) return {};
    
    const baggage = {};
    const pairs = baggageHeader.split(',');
    
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        baggage[key.trim()] = decodeURIComponent(value.trim());
      }
    }
    
    return baggage;
  }

  /**
   * Serialize baggage to header
   * @param {Object} baggage - Baggage object
   * @returns {string} Baggage header value
   */
  _serializeBaggage(baggage) {
    return Object.entries(baggage)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join(',');
  }

  /**
   * Get active spans
   * @returns {Array} Active spans
   */
  getActiveSpans() {
    return Array.from(this.activeSpans.values());
  }

  /**
   * Get completed spans
   * @returns {Array} Completed spans
   */
  getCompletedSpans() {
    return [...this.completedSpans];
  }

  /**
   * Get trace by ID
   * @param {string} traceId - Trace ID
   * @returns {Array} Spans in trace
   */
  getTrace(traceId) {
    const spans = [];
    
    // Add active spans
    for (const span of this.activeSpans.values()) {
      if (span.traceId === traceId) {
        spans.push(span);
      }
    }
    
    // Add completed spans
    for (const span of this.completedSpans) {
      if (span.traceId === traceId) {
        spans.push(span);
      }
    }
    
    return spans.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Get tracing statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeSpans: this.activeSpans.size,
      completedSpans: this.completedSpans.length,
      traceContexts: this.traceContexts.size
    };
  }

  /**
   * Flush completed spans
   * @returns {Promise<void>}
   */
  async flush() {
    try {
      const spans = [...this.completedSpans];
      
      if (spans.length === 0) {
        return;
      }
      
      this.emit('spansFlush', spans);
      
      // Clear flushed spans
      this.completedSpans = [];
      
      this.stats.lastFlush = Date.now();

      if (this.logger) {
        this.logger.debug('Spans flushed', {
          count: spans.length,
          serviceName: this.options.serviceName
        });
      }
    } catch (error) {
      this.stats.errors++;
      
      if (this.logger) {
        this.logger.error('Spans flush failed', {
          error: error.message,
          serviceName: this.options.serviceName
        });
      }
      
      throw error;
    }
  }

  /**
   * Reset tracer state
   */
  reset() {
    this.activeSpans.clear();
    this.completedSpans = [];
    this.traceContexts.clear();
    
    this.stats = {
      spansCreated: 0,
      spansCompleted: 0,
      tracesStarted: 0,
      tracesCompleted: 0,
      errors: 0,
      lastFlush: null
    };

    this.emit('tracerReset');

    if (this.logger) {
      this.logger.info('Tracer reset', {
        serviceName: this.options.serviceName
      });
    }
  }

  /**
   * Close tracer
   */
  close() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Finish all active spans
    for (const spanId of this.activeSpans.keys()) {
      this.finishSpan(spanId, {
        tags: { 'tracer.closed': true }
      });
    }
    
    this.removeAllListeners();

    if (this.logger) {
      this.logger.info('Tracer closed', {
        serviceName: this.options.serviceName
      });
    }
  }
}

/**
 * Create a tracer instance
 * @param {Object} options - Configuration options
 * @returns {DistributedTracer} Tracer instance
 */
export function createTracer(options = {}) {
  return new DistributedTracer(options);
}

/**
 * Default tracer instance
 */
export const defaultTracer = createTracer();

export default {
  DistributedTracer,
  createTracer,
  defaultTracer
};