/**
 * Constants for the Frontend AI Agent service
 */

// Service Information
const SERVICE_INFO = {
  NAME: 'frontend-agent',
  VERSION: '1.0.0',
  DESCRIPTION: 'Specialized AI Agent for Frontend Development Tasks',
  TYPE: 'frontend'
};

// Task Types
const TASK_TYPES = {
  COMPONENT_GENERATION: 'component_generation',
  CODE_REVIEW: 'code_review',
  OPTIMIZATION: 'optimization',
  STYLING: 'styling',
  TESTING: 'testing',
  REFACTORING: 'refactoring',
  LAYOUT_GENERATION: 'layout_generation',
  THEME_GENERATION: 'theme_generation',
  ACCESSIBILITY_AUDIT: 'accessibility_audit'
};

// Task Status
const TASK_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout'
};

// Task Priority
const TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

// Agent Status
const AGENT_STATUS = {
  INITIALIZING: 'initializing',
  READY: 'ready',
  BUSY: 'busy',
  MAINTENANCE: 'maintenance',
  ERROR: 'error',
  OFFLINE: 'offline'
};

// Supported Frameworks
const FRAMEWORKS = {
  REACT: 'react',
  VUE: 'vue',
  ANGULAR: 'angular',
  SVELTE: 'svelte',
  VANILLA: 'vanilla',
  NEXT: 'next',
  NUXT: 'nuxt',
  GATSBY: 'gatsby'
};

// Supported Languages
const LANGUAGES = {
  JAVASCRIPT: 'javascript',
  TYPESCRIPT: 'typescript',
  JSX: 'jsx',
  TSX: 'tsx',
  HTML: 'html',
  CSS: 'css',
  SCSS: 'scss',
  SASS: 'sass',
  LESS: 'less'
};

// Styling Options
const STYLING_OPTIONS = {
  CSS: 'css',
  SCSS: 'scss',
  SASS: 'sass',
  LESS: 'less',
  TAILWIND: 'tailwind',
  STYLED_COMPONENTS: 'styled-components',
  EMOTION: 'emotion',
  CSS_MODULES: 'css-modules',
  MATERIAL_UI: 'material-ui',
  CHAKRA_UI: 'chakra-ui',
  ANT_DESIGN: 'ant-design',
  BOOTSTRAP: 'bootstrap',
  BULMA: 'bulma'
};

// Component Types
const COMPONENT_TYPES = {
  FUNCTIONAL: 'functional',
  CLASS: 'class',
  HOOK: 'hook',
  LAYOUT: 'layout',
  UI: 'ui',
  FORM: 'form',
  NAVIGATION: 'navigation',
  DATA_DISPLAY: 'data-display',
  FEEDBACK: 'feedback',
  UTILITY: 'utility'
};

// Test Types
const TEST_TYPES = {
  UNIT: 'unit',
  INTEGRATION: 'integration',
  E2E: 'e2e',
  SNAPSHOT: 'snapshot',
  ACCESSIBILITY: 'accessibility',
  PERFORMANCE: 'performance',
  VISUAL: 'visual'
};

// Testing Frameworks
const TESTING_FRAMEWORKS = {
  JEST: 'jest',
  VITEST: 'vitest',
  MOCHA: 'mocha',
  JASMINE: 'jasmine',
  CYPRESS: 'cypress',
  PLAYWRIGHT: 'playwright',
  TESTING_LIBRARY: 'testing-library',
  ENZYME: 'enzyme'
};

// Optimization Types
const OPTIMIZATION_TYPES = {
  PERFORMANCE: 'performance',
  BUNDLE_SIZE: 'bundle-size',
  MEMORY: 'memory',
  RENDERING: 'rendering',
  ACCESSIBILITY: 'accessibility',
  SEO: 'seo',
  CODE_QUALITY: 'code-quality',
  SECURITY: 'security'
};

// Layout Types
const LAYOUT_TYPES = {
  GRID: 'grid',
  FLEXBOX: 'flexbox',
  CSS_GRID: 'css-grid',
  MASONRY: 'masonry',
  SIDEBAR: 'sidebar',
  DASHBOARD: 'dashboard',
  CARD: 'card',
  LIST: 'list',
  TABLE: 'table'
};

// Theme Styles
const THEME_STYLES = {
  MODERN: 'modern',
  CLASSIC: 'classic',
  MINIMAL: 'minimal',
  BOLD: 'bold',
  PLAYFUL: 'playful',
  PROFESSIONAL: 'professional',
  DARK: 'dark',
  LIGHT: 'light'
};

// WCAG Levels
const WCAG_LEVELS = {
  A: 'A',
  AA: 'AA',
  AAA: 'AAA'
};

// AI Models
const AI_MODELS = {
  GPT_4: 'gpt-4',
  GPT_4_TURBO: 'gpt-4-turbo',
  GPT_3_5_TURBO: 'gpt-3.5-turbo',
  TEXT_DAVINCI_003: 'text-davinci-003'
};

// AI Operations
const AI_OPERATIONS = {
  CODE_GENERATION: 'code_generation',
  CODE_REVIEW: 'code_review',
  CODE_OPTIMIZATION: 'code_optimization',
  COMPONENT_GENERATION: 'component_generation',
  TEST_GENERATION: 'test_generation',
  STYLING: 'styling',
  REFACTORING: 'refactoring',
  DOCUMENTATION: 'documentation'
};

// Event Types
const EVENT_TYPES = {
  TASK_CREATED: 'task.created',
  TASK_STARTED: 'task.started',
  TASK_PROGRESS: 'task.progress',
  TASK_COMPLETED: 'task.completed',
  TASK_FAILED: 'task.failed',
  TASK_CANCELLED: 'task.cancelled',
  AGENT_REGISTERED: 'agent.registered',
  AGENT_STATUS_CHANGED: 'agent.status_changed',
  AGENT_HEARTBEAT: 'agent.heartbeat',
  CODE_GENERATED: 'code.generated',
  COMPONENT_GENERATED: 'component.generated',
  OPTIMIZATION_COMPLETED: 'optimization.completed',
  TEST_GENERATED: 'test.generated',
  REVIEW_COMPLETED: 'review.completed'
};

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

// Error Codes
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  INVALID_TASK_TYPE: 'INVALID_TASK_TYPE',
  INVALID_FRAMEWORK: 'INVALID_FRAMEWORK',
  INVALID_LANGUAGE: 'INVALID_LANGUAGE',
  AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

// Rate Limits
const RATE_LIMITS = {
  GENERAL: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 1000
  },
  TASK_CREATION: {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 10
  },
  AI_PROCESSING: {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 5
  },
  AUTH: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 5
  },
  HEALTH_CHECK: {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 60
  },
  METRICS: {
    WINDOW_MS: 60 * 1000, // 1 minute
    MAX_REQUESTS: 30
  }
};

// Timeouts (in milliseconds)
const TIMEOUTS = {
  TASK_PROCESSING: 5 * 60 * 1000, // 5 minutes
  AI_REQUEST: 30 * 1000, // 30 seconds
  HTTP_REQUEST: 10 * 1000, // 10 seconds
  DATABASE_QUERY: 5 * 1000, // 5 seconds
  REDIS_OPERATION: 3 * 1000, // 3 seconds
  HEARTBEAT: 30 * 1000, // 30 seconds
  HEALTH_CHECK: 5 * 1000 // 5 seconds
};

// Retry Configuration
const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY: 1000, // 1 second
  MAX_DELAY: 10000, // 10 seconds
  BACKOFF_FACTOR: 2,
  JITTER: true
};

// Cache TTL (in seconds)
const CACHE_TTL = {
  TASK_RESULT: 3600, // 1 hour
  AGENT_STATUS: 300, // 5 minutes
  METRICS: 60, // 1 minute
  HEALTH_CHECK: 30, // 30 seconds
  AI_RESPONSE: 1800, // 30 minutes
  COMPONENT_TEMPLATE: 7200 // 2 hours
};

// File Size Limits (in bytes)
const FILE_SIZE_LIMITS = {
  CODE_FILE: 1024 * 1024, // 1 MB
  COMPONENT_FILE: 512 * 1024, // 512 KB
  STYLE_FILE: 256 * 1024, // 256 KB
  TEST_FILE: 512 * 1024, // 512 KB
  CONFIG_FILE: 64 * 1024, // 64 KB
  UPLOAD_MAX: 10 * 1024 * 1024 // 10 MB
};

// Validation Rules
const VALIDATION_RULES = {
  TASK_ID: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 100,
    PATTERN: /^[a-zA-Z0-9_-]+$/
  },
  TASK_DESCRIPTION: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 1000
  },
  COMPONENT_NAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 100,
    PATTERN: /^[A-Z][a-zA-Z0-9]*$/
  },
  FILE_NAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 255,
    PATTERN: /^[a-zA-Z0-9._-]+$/
  },
  URL: {
    PATTERN: /^https?:\/\/.+/
  },
  EMAIL: {
    PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  }
};

// Default Values
const DEFAULTS = {
  TASK_PRIORITY: TASK_PRIORITY.MEDIUM,
  FRAMEWORK: FRAMEWORKS.REACT,
  LANGUAGE: LANGUAGES.JAVASCRIPT,
  STYLING: STYLING_OPTIONS.CSS,
  TEST_TYPE: TEST_TYPES.UNIT,
  TESTING_FRAMEWORK: TESTING_FRAMEWORKS.JEST,
  AI_MODEL: AI_MODELS.GPT_4_TURBO,
  WCAG_LEVEL: WCAG_LEVELS.AA,
  THEME_STYLE: THEME_STYLES.MODERN,
  LAYOUT_TYPE: LAYOUT_TYPES.FLEXBOX,
  COMPONENT_TYPE: COMPONENT_TYPES.FUNCTIONAL
};

// Environment Variables
const ENV_VARS = {
  NODE_ENV: 'NODE_ENV',
  PORT: 'PORT',
  REDIS_URL: 'REDIS_URL',
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  ORCHESTRATOR_URL: 'ORCHESTRATOR_URL',
  JWT_SECRET: 'JWT_SECRET',
  API_KEY: 'API_KEY',
  LOG_LEVEL: 'LOG_LEVEL',
  METRICS_PORT: 'METRICS_PORT'
};

// Metrics Names
const METRICS = {
  HTTP_REQUESTS_TOTAL: 'http_requests_total',
  HTTP_REQUEST_DURATION: 'http_request_duration_seconds',
  TASKS_TOTAL: 'frontend_tasks_total',
  TASK_DURATION: 'frontend_task_duration_seconds',
  AI_CALLS_TOTAL: 'frontend_ai_calls_total',
  AI_LATENCY: 'frontend_ai_latency_seconds',
  AI_TOKENS: 'frontend_ai_tokens_total',
  ACTIVE_CONNECTIONS: 'frontend_active_connections',
  MEMORY_USAGE: 'frontend_memory_usage_bytes',
  CPU_USAGE: 'frontend_cpu_usage_percent',
  ERROR_RATE: 'frontend_error_rate'
};

// Log Levels
const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  HTTP: 'http',
  VERBOSE: 'verbose',
  DEBUG: 'debug',
  SILLY: 'silly'
};

// API Endpoints
const API_ENDPOINTS = {
  HEALTH: '/health',
  HEALTH_DETAILED: '/health/detailed',
  HEALTH_READY: '/health/ready',
  HEALTH_LIVE: '/health/live',
  METRICS: '/metrics',
  METRICS_FRONTEND: '/metrics/frontend',
  METRICS_PERFORMANCE: '/metrics/performance',
  METRICS_AI: '/metrics/ai',
  AGENT_STATUS: '/api/agent/status',
  AGENT_CAPABILITIES: '/api/agent/capabilities',
  AGENT_METRICS: '/api/agent/metrics',
  AGENT_HEARTBEAT: '/api/agent/heartbeat',
  TASKS: '/api/tasks',
  TASK_BY_ID: '/api/tasks/:id',
  TASK_PROGRESS: '/api/tasks/:id/progress',
  TASK_CANCEL: '/api/tasks/:id/cancel',
  TASK_RETRY: '/api/tasks/:id/retry',
  TASK_STATS: '/api/tasks/stats',
  CODE_GENERATE: '/api/code/generate',
  CODE_OPTIMIZE: '/api/code/optimize',
  CODE_REVIEW: '/api/code/review',
  CODE_TEST: '/api/code/test',
  UI_STYLE_GENERATE: '/api/ui/style/generate',
  UI_THEME_GENERATE: '/api/ui/theme/generate',
  UI_LAYOUT_GENERATE: '/api/ui/layout/generate',
  UI_ACCESSIBILITY_AUDIT: '/api/ui/accessibility/audit'
};

// Swagger Tags
const SWAGGER_TAGS = {
  HEALTH: 'Health',
  METRICS: 'Metrics',
  AGENT: 'Agent Management',
  TASKS: 'Task Management',
  CODE: 'Code Operations',
  UI_STYLING: 'UI Styling',
  UI_THEMING: 'UI Theming',
  UI_LAYOUT: 'UI Layout',
  UI_ACCESSIBILITY: 'UI Accessibility'
};

module.exports = {
  SERVICE_INFO,
  TASK_TYPES,
  TASK_STATUS,
  TASK_PRIORITY,
  AGENT_STATUS,
  FRAMEWORKS,
  LANGUAGES,
  STYLING_OPTIONS,
  COMPONENT_TYPES,
  TEST_TYPES,
  TESTING_FRAMEWORKS,
  OPTIMIZATION_TYPES,
  LAYOUT_TYPES,
  THEME_STYLES,
  WCAG_LEVELS,
  AI_MODELS,
  AI_OPERATIONS,
  EVENT_TYPES,
  HTTP_STATUS,
  ERROR_CODES,
  RATE_LIMITS,
  TIMEOUTS,
  RETRY_CONFIG,
  CACHE_TTL,
  FILE_SIZE_LIMITS,
  VALIDATION_RULES,
  DEFAULTS,
  ENV_VARS,
  METRICS,
  LOG_LEVELS,
  API_ENDPOINTS,
  SWAGGER_TAGS
};