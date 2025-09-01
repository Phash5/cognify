/**
 * HTTP constants for inter-service communication
 */

/**
 * HTTP methods
 */
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS',
  TRACE: 'TRACE',
  CONNECT: 'CONNECT'
};

/**
 * HTTP status codes
 */
export const HTTP_STATUS = {
  // 1xx Informational
  CONTINUE: 100,
  SWITCHING_PROTOCOLS: 101,
  PROCESSING: 102,
  EARLY_HINTS: 103,

  // 2xx Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NON_AUTHORITATIVE_INFORMATION: 203,
  NO_CONTENT: 204,
  RESET_CONTENT: 205,
  PARTIAL_CONTENT: 206,
  MULTI_STATUS: 207,
  ALREADY_REPORTED: 208,
  IM_USED: 226,

  // 3xx Redirection
  MULTIPLE_CHOICES: 300,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  USE_PROXY: 305,
  TEMPORARY_REDIRECT: 307,
  PERMANENT_REDIRECT: 308,

  // 4xx Client Error
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  IM_A_TEAPOT: 418,
  MISDIRECTED_REQUEST: 421,
  UNPROCESSABLE_ENTITY: 422,
  LOCKED: 423,
  FAILED_DEPENDENCY: 424,
  TOO_EARLY: 425,
  UPGRADE_REQUIRED: 426,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
  UNAVAILABLE_FOR_LEGAL_REASONS: 451,

  // 5xx Server Error
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
  VARIANT_ALSO_NEGOTIATES: 506,
  INSUFFICIENT_STORAGE: 507,
  LOOP_DETECTED: 508,
  NOT_EXTENDED: 510,
  NETWORK_AUTHENTICATION_REQUIRED: 511
};

/**
 * HTTP headers commonly used in microservices
 */
export const HTTP_HEADERS = {
  // Standard headers
  ACCEPT: 'Accept',
  ACCEPT_ENCODING: 'Accept-Encoding',
  ACCEPT_LANGUAGE: 'Accept-Language',
  AUTHORIZATION: 'Authorization',
  CACHE_CONTROL: 'Cache-Control',
  CONTENT_ENCODING: 'Content-Encoding',
  CONTENT_LENGTH: 'Content-Length',
  CONTENT_TYPE: 'Content-Type',
  COOKIE: 'Cookie',
  DATE: 'Date',
  ETAG: 'ETag',
  EXPIRES: 'Expires',
  HOST: 'Host',
  IF_MODIFIED_SINCE: 'If-Modified-Since',
  IF_NONE_MATCH: 'If-None-Match',
  LAST_MODIFIED: 'Last-Modified',
  LOCATION: 'Location',
  PRAGMA: 'Pragma',
  REFERER: 'Referer',
  SERVER: 'Server',
  SET_COOKIE: 'Set-Cookie',
  USER_AGENT: 'User-Agent',
  VARY: 'Vary',
  WWW_AUTHENTICATE: 'WWW-Authenticate',

  // CORS headers
  ACCESS_CONTROL_ALLOW_ORIGIN: 'Access-Control-Allow-Origin',
  ACCESS_CONTROL_ALLOW_METHODS: 'Access-Control-Allow-Methods',
  ACCESS_CONTROL_ALLOW_HEADERS: 'Access-Control-Allow-Headers',
  ACCESS_CONTROL_ALLOW_CREDENTIALS: 'Access-Control-Allow-Credentials',
  ACCESS_CONTROL_EXPOSE_HEADERS: 'Access-Control-Expose-Headers',
  ACCESS_CONTROL_MAX_AGE: 'Access-Control-Max-Age',
  ACCESS_CONTROL_REQUEST_METHOD: 'Access-Control-Request-Method',
  ACCESS_CONTROL_REQUEST_HEADERS: 'Access-Control-Request-Headers',
  ORIGIN: 'Origin',

  // Security headers
  STRICT_TRANSPORT_SECURITY: 'Strict-Transport-Security',
  CONTENT_SECURITY_POLICY: 'Content-Security-Policy',
  X_CONTENT_TYPE_OPTIONS: 'X-Content-Type-Options',
  X_FRAME_OPTIONS: 'X-Frame-Options',
  X_XSS_PROTECTION: 'X-XSS-Protection',
  REFERRER_POLICY: 'Referrer-Policy',

  // Custom microservice headers
  X_REQUEST_ID: 'X-Request-ID',
  X_CORRELATION_ID: 'X-Correlation-ID',
  X_TRACE_ID: 'X-Trace-ID',
  X_SPAN_ID: 'X-Span-ID',
  X_SERVICE_NAME: 'X-Service-Name',
  X_SERVICE_VERSION: 'X-Service-Version',
  X_CLIENT_VERSION: 'X-Client-Version',
  X_API_KEY: 'X-API-Key',
  X_FORWARDED_FOR: 'X-Forwarded-For',
  X_FORWARDED_PROTO: 'X-Forwarded-Proto',
  X_FORWARDED_HOST: 'X-Forwarded-Host',
  X_REAL_IP: 'X-Real-IP',
  X_RATE_LIMIT_LIMIT: 'X-RateLimit-Limit',
  X_RATE_LIMIT_REMAINING: 'X-RateLimit-Remaining',
  X_RATE_LIMIT_RESET: 'X-RateLimit-Reset',
  X_RESPONSE_TIME: 'X-Response-Time',
  X_POWERED_BY: 'X-Powered-By'
};

/**
 * Content types
 */
export const CONTENT_TYPES = {
  JSON: 'application/json',
  XML: 'application/xml',
  HTML: 'text/html',
  PLAIN: 'text/plain',
  CSS: 'text/css',
  JAVASCRIPT: 'application/javascript',
  FORM_URLENCODED: 'application/x-www-form-urlencoded',
  MULTIPART_FORM_DATA: 'multipart/form-data',
  OCTET_STREAM: 'application/octet-stream',
  PDF: 'application/pdf',
  ZIP: 'application/zip',
  GZIP: 'application/gzip',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  GIF: 'image/gif',
  SVG: 'image/svg+xml',
  ICO: 'image/x-icon',
  CSV: 'text/csv',
  YAML: 'application/x-yaml',
  PROTOBUF: 'application/x-protobuf',
  MSGPACK: 'application/x-msgpack'
};

/**
 * HTTP status code categories
 */
export const STATUS_CATEGORIES = {
  INFORMATIONAL: 'informational', // 1xx
  SUCCESS: 'success',             // 2xx
  REDIRECTION: 'redirection',     // 3xx
  CLIENT_ERROR: 'client_error',   // 4xx
  SERVER_ERROR: 'server_error'    // 5xx
};

/**
 * Utility functions for HTTP status codes
 */
export const StatusUtils = {
  /**
   * Check if status code is informational (1xx)
   * @param {number} status - HTTP status code
   * @returns {boolean} True if informational
   */
  isInformational: (status) => status >= 100 && status < 200,

  /**
   * Check if status code is success (2xx)
   * @param {number} status - HTTP status code
   * @returns {boolean} True if success
   */
  isSuccess: (status) => status >= 200 && status < 300,

  /**
   * Check if status code is redirection (3xx)
   * @param {number} status - HTTP status code
   * @returns {boolean} True if redirection
   */
  isRedirection: (status) => status >= 300 && status < 400,

  /**
   * Check if status code is client error (4xx)
   * @param {number} status - HTTP status code
   * @returns {boolean} True if client error
   */
  isClientError: (status) => status >= 400 && status < 500,

  /**
   * Check if status code is server error (5xx)
   * @param {number} status - HTTP status code
   * @returns {boolean} True if server error
   */
  isServerError: (status) => status >= 500 && status < 600,

  /**
   * Check if status code indicates an error (4xx or 5xx)
   * @param {number} status - HTTP status code
   * @returns {boolean} True if error
   */
  isError: (status) => status >= 400,

  /**
   * Check if status code is retryable
   * @param {number} status - HTTP status code
   * @returns {boolean} True if retryable
   */
  isRetryable: (status) => {
    // Retry on 5xx errors (except 501 Not Implemented)
    if (status >= 500 && status !== 501) {
      return true;
    }
    // Retry on specific 4xx errors
    return [408, 429].includes(status);
  },

  /**
   * Get status category
   * @param {number} status - HTTP status code
   * @returns {string} Status category
   */
  getCategory: (status) => {
    if (StatusUtils.isInformational(status)) return STATUS_CATEGORIES.INFORMATIONAL;
    if (StatusUtils.isSuccess(status)) return STATUS_CATEGORIES.SUCCESS;
    if (StatusUtils.isRedirection(status)) return STATUS_CATEGORIES.REDIRECTION;
    if (StatusUtils.isClientError(status)) return STATUS_CATEGORIES.CLIENT_ERROR;
    if (StatusUtils.isServerError(status)) return STATUS_CATEGORIES.SERVER_ERROR;
    return 'unknown';
  },

  /**
   * Get status message
   * @param {number} status - HTTP status code
   * @returns {string} Status message
   */
  getMessage: (status) => {
    const messages = {
      100: 'Continue',
      101: 'Switching Protocols',
      102: 'Processing',
      103: 'Early Hints',
      200: 'OK',
      201: 'Created',
      202: 'Accepted',
      203: 'Non-Authoritative Information',
      204: 'No Content',
      205: 'Reset Content',
      206: 'Partial Content',
      207: 'Multi-Status',
      208: 'Already Reported',
      226: 'IM Used',
      300: 'Multiple Choices',
      301: 'Moved Permanently',
      302: 'Found',
      303: 'See Other',
      304: 'Not Modified',
      305: 'Use Proxy',
      307: 'Temporary Redirect',
      308: 'Permanent Redirect',
      400: 'Bad Request',
      401: 'Unauthorized',
      402: 'Payment Required',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      406: 'Not Acceptable',
      407: 'Proxy Authentication Required',
      408: 'Request Timeout',
      409: 'Conflict',
      410: 'Gone',
      411: 'Length Required',
      412: 'Precondition Failed',
      413: 'Payload Too Large',
      414: 'URI Too Long',
      415: 'Unsupported Media Type',
      416: 'Range Not Satisfiable',
      417: 'Expectation Failed',
      418: "I'm a teapot",
      421: 'Misdirected Request',
      422: 'Unprocessable Entity',
      423: 'Locked',
      424: 'Failed Dependency',
      425: 'Too Early',
      426: 'Upgrade Required',
      428: 'Precondition Required',
      429: 'Too Many Requests',
      431: 'Request Header Fields Too Large',
      451: 'Unavailable For Legal Reasons',
      500: 'Internal Server Error',
      501: 'Not Implemented',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
      505: 'HTTP Version Not Supported',
      506: 'Variant Also Negotiates',
      507: 'Insufficient Storage',
      508: 'Loop Detected',
      510: 'Not Extended',
      511: 'Network Authentication Required'
    };
    
    return messages[status] || 'Unknown Status';
  }
};

/**
 * Common HTTP timeout values (in milliseconds)
 */
export const TIMEOUTS = {
  CONNECT: 5000,      // 5 seconds
  REQUEST: 30000,     // 30 seconds
  RESPONSE: 30000,    // 30 seconds
  IDLE: 60000,        // 1 minute
  KEEP_ALIVE: 300000, // 5 minutes
  HEALTH_CHECK: 5000, // 5 seconds
  DISCOVERY: 10000    // 10 seconds
};

/**
 * Default retry configuration
 */
export const RETRY_DEFAULTS = {
  ATTEMPTS: 3,
  DELAY: 1000,        // 1 second
  MAX_DELAY: 30000,   // 30 seconds
  BACKOFF_FACTOR: 2,
  JITTER: true
};

/**
 * Circuit breaker defaults
 */
export const CIRCUIT_BREAKER_DEFAULTS = {
  FAILURE_THRESHOLD: 5,
  SUCCESS_THRESHOLD: 3,
  TIMEOUT: 60000,     // 1 minute
  MONITOR_PERIOD: 10000 // 10 seconds
};

export default {
  HTTP_METHODS,
  HTTP_STATUS,
  HTTP_HEADERS,
  CONTENT_TYPES,
  STATUS_CATEGORIES,
  StatusUtils,
  TIMEOUTS,
  RETRY_DEFAULTS,
  CIRCUIT_BREAKER_DEFAULTS
};