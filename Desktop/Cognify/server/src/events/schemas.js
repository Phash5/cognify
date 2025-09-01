// Domain Event Schemas with Versioning

const Joi = require('joi');

// Base event schema
const baseEventSchema = Joi.object({
  id: Joi.string().uuid().required(),
  type: Joi.string().required(),
  version: Joi.string().pattern(/^\d+\.\d+$/).required(),
  timestamp: Joi.string().isoDate().required(),
  aggregateId: Joi.string().uuid().required(),
  aggregateType: Joi.string().required(),
  payload: Joi.object().required(),
  metadata: Joi.object({
    source: Joi.string().required(),
    correlationId: Joi.string().uuid().required(),
    causationId: Joi.string().uuid().optional(),
    userId: Joi.string().optional(),
    sessionId: Joi.string().optional(),
    userAgent: Joi.string().optional(),
    ipAddress: Joi.string().ip().optional()
  }).unknown(true).optional()
});

// Project Events
const projectCreatedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  metadata: Joi.object({
    name: Joi.string().required(),
    description: Joi.string().optional(),
    version: Joi.string().optional(),
    createdAt: Joi.string().isoDate().required(),
    updatedAt: Joi.string().isoDate().required(),
    owner: Joi.string().required(),
    tags: Joi.array().items(Joi.string()).optional()
  }).required(),
  architecture: Joi.object({
    frontend: Joi.object({
      framework: Joi.string().valid('react', 'vue', 'angular', 'svelte').required(),
      language: Joi.string().valid('javascript', 'typescript').required(),
      styling: Joi.string().valid('css', 'scss', 'tailwind', 'styled-components').required(),
      buildTool: Joi.string().valid('vite', 'webpack', 'parcel').required()
    }).optional(),
    backend: Joi.object({
      runtime: Joi.string().valid('nodejs', 'python', 'java', 'go').required(),
      framework: Joi.string().valid('express', 'fastify', 'koa', 'nestjs').required(),
      language: Joi.string().valid('javascript', 'typescript', 'python', 'java', 'go').required(),
      apiStyle: Joi.string().valid('rest', 'graphql', 'grpc').required()
    }).optional(),
    database: Joi.object({
      type: Joi.string().valid('mongodb', 'postgresql', 'mysql', 'sqlite').required(),
      collections: Joi.array().items(Joi.object({
        name: Joi.string().required(),
        schema: Joi.object().required(),
        indexes: Joi.array().items(Joi.object()).optional()
      })).optional()
    }).optional(),
    infrastructure: Joi.object({
      provider: Joi.string().valid('aws', 'gcp', 'azure', 'vercel', 'railway').required(),
      containerization: Joi.string().valid('docker', 'podman').optional(),
      orchestration: Joi.string().valid('kubernetes', 'docker-compose', 'nomad').optional()
    }).optional()
  }).optional()
});

const projectUpdatedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  changes: Joi.object().required(),
  previousVersion: Joi.string().optional(),
  updatedFields: Joi.array().items(Joi.string()).required()
});

const projectDeletedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  deletedAt: Joi.string().isoDate().required(),
  reason: Joi.string().optional()
});

// Conversation Events
const conversationStartedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  conversationId: Joi.string().uuid().required(),
  intent: Joi.string().valid('feature_request', 'bug_fix', 'deployment', 'question', 'optimization').optional(),
  initialMessage: Joi.object({
    id: Joi.string().uuid().required(),
    role: Joi.string().valid('user', 'assistant', 'system').required(),
    content: Joi.string().required(),
    timestamp: Joi.string().isoDate().required(),
    metadata: Joi.object().optional()
  }).required()
});

const messageAddedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  conversationId: Joi.string().uuid().required(),
  message: Joi.object({
    id: Joi.string().uuid().required(),
    role: Joi.string().valid('user', 'assistant', 'system').required(),
    content: Joi.string().required(),
    timestamp: Joi.string().isoDate().required(),
    metadata: Joi.object().optional()
  }).required()
});

const conversationResolvedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  conversationId: Joi.string().uuid().required(),
  resolvedAt: Joi.string().isoDate().required(),
  resolution: Joi.string().optional()
});

// Deployment Events
const deploymentInitiatedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  deploymentId: Joi.string().uuid().required(),
  environment: Joi.string().valid('development', 'staging', 'production').required(),
  triggeredBy: Joi.string().required(),
  branch: Joi.string().optional(),
  commit: Joi.string().optional(),
  config: Joi.object().optional()
});

const deploymentCompletedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  deploymentId: Joi.string().uuid().required(),
  status: Joi.string().valid('success', 'failed').required(),
  url: Joi.string().uri().optional(),
  deployedAt: Joi.string().isoDate().required(),
  duration: Joi.number().positive().optional(),
  logs: Joi.array().items(Joi.string()).optional()
});

// Build Events
const buildStartedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  buildId: Joi.string().uuid().required(),
  triggeredBy: Joi.string().required(),
  branch: Joi.string().optional(),
  commit: Joi.string().optional(),
  buildConfig: Joi.object().optional()
});

const buildCompletedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  buildId: Joi.string().uuid().required(),
  status: Joi.string().valid('success', 'failed').required(),
  artifacts: Joi.array().items(Joi.string()).optional(),
  logs: Joi.array().items(Joi.string()).optional(),
  duration: Joi.number().positive().optional(),
  completedAt: Joi.string().isoDate().required()
});

// File Events
const fileCreatedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  filePath: Joi.string().required(),
  content: Joi.string().optional(),
  size: Joi.number().positive().optional(),
  mimeType: Joi.string().optional(),
  createdBy: Joi.string().required()
});

const fileUpdatedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  filePath: Joi.string().required(),
  changes: Joi.object({
    content: Joi.string().optional(),
    size: Joi.number().positive().optional(),
    mimeType: Joi.string().optional()
  }).required(),
  updatedBy: Joi.string().required()
});

const fileDeletedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  filePath: Joi.string().required(),
  deletedBy: Joi.string().required()
});

// AI Agent Events
const agentTaskStartedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  taskId: Joi.string().uuid().required(),
  agentType: Joi.string().valid('frontend', 'backend', 'database', 'devops', 'orchestrator').required(),
  task: Joi.object({
    type: Joi.string().required(),
    description: Joi.string().required(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
    estimatedDuration: Joi.number().positive().optional()
  }).required(),
  assignedBy: Joi.string().required()
});

const agentTaskCompletedPayloadV1 = Joi.object({
  projectId: Joi.string().uuid().required(),
  taskId: Joi.string().uuid().required(),
  agentType: Joi.string().valid('frontend', 'backend', 'database', 'devops', 'orchestrator').required(),
  result: Joi.object({
    status: Joi.string().valid('success', 'failed', 'partial').required(),
    output: Joi.object().optional(),
    errors: Joi.array().items(Joi.string()).optional(),
    duration: Joi.number().positive().optional()
  }).required(),
  completedAt: Joi.string().isoDate().required()
});

// Event Schema Registry
const eventSchemas = {
  // Project Events
  'project.created': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('project.created').required(),
      aggregateType: Joi.string().valid('project').required(),
      payload: projectCreatedPayloadV1
    })
  },
  'project.updated': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('project.updated').required(),
      aggregateType: Joi.string().valid('project').required(),
      payload: projectUpdatedPayloadV1
    })
  },
  'project.deleted': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('project.deleted').required(),
      aggregateType: Joi.string().valid('project').required(),
      payload: projectDeletedPayloadV1
    })
  },

  // Conversation Events
  'conversation.started': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('conversation.started').required(),
      aggregateType: Joi.string().valid('conversation').required(),
      payload: conversationStartedPayloadV1
    })
  },
  'message.added': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('message.added').required(),
      aggregateType: Joi.string().valid('conversation').required(),
      payload: messageAddedPayloadV1
    })
  },
  'conversation.resolved': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('conversation.resolved').required(),
      aggregateType: Joi.string().valid('conversation').required(),
      payload: conversationResolvedPayloadV1
    })
  },

  // Deployment Events
  'deployment.initiated': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('deployment.initiated').required(),
      aggregateType: Joi.string().valid('deployment').required(),
      payload: deploymentInitiatedPayloadV1
    })
  },
  'deployment.completed': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('deployment.completed').required(),
      aggregateType: Joi.string().valid('deployment').required(),
      payload: deploymentCompletedPayloadV1
    })
  },

  // Build Events
  'build.started': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('build.started').required(),
      aggregateType: Joi.string().valid('build').required(),
      payload: buildStartedPayloadV1
    })
  },
  'build.completed': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('build.completed').required(),
      aggregateType: Joi.string().valid('build').required(),
      payload: buildCompletedPayloadV1
    })
  },

  // File Events
  'file.created': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('file.created').required(),
      aggregateType: Joi.string().valid('file').required(),
      payload: fileCreatedPayloadV1
    })
  },
  'file.updated': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('file.updated').required(),
      aggregateType: Joi.string().valid('file').required(),
      payload: fileUpdatedPayloadV1
    })
  },
  'file.deleted': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('file.deleted').required(),
      aggregateType: Joi.string().valid('file').required(),
      payload: fileDeletedPayloadV1
    })
  },

  // AI Agent Events
  'agent.task.started': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('agent.task.started').required(),
      aggregateType: Joi.string().valid('agent').required(),
      payload: agentTaskStartedPayloadV1
    })
  },
  'agent.task.completed': {
    '1.0': baseEventSchema.keys({
      type: Joi.string().valid('agent.task.completed').required(),
      aggregateType: Joi.string().valid('agent').required(),
      payload: agentTaskCompletedPayloadV1
    })
  }
};

// Validation function
function validateEvent(event) {
  const { type, version } = event;
  
  if (!eventSchemas[type]) {
    throw new Error(`Unknown event type: ${type}`);
  }
  
  if (!eventSchemas[type][version]) {
    throw new Error(`Unknown version ${version} for event type: ${type}`);
  }
  
  const schema = eventSchemas[type][version];
  const { error, value } = schema.validate(event);
  
  if (error) {
    throw new Error(`Event validation failed: ${error.message}`);
  }
  
  return value;
}

// Get supported versions for an event type
function getSupportedVersions(eventType) {
  if (!eventSchemas[eventType]) {
    throw new Error(`Unknown event type: ${eventType}`);
  }
  
  return Object.keys(eventSchemas[eventType]);
}

// Get latest version for an event type
function getLatestVersion(eventType) {
  const versions = getSupportedVersions(eventType);
  return versions.sort((a, b) => {
    const [aMajor, aMinor] = a.split('.').map(Number);
    const [bMajor, bMinor] = b.split('.').map(Number);
    
    if (aMajor !== bMajor) return bMajor - aMajor;
    return bMinor - aMinor;
  })[0];
}

// Check if version is supported
function isVersionSupported(eventType, version) {
  return eventSchemas[eventType] && eventSchemas[eventType][version];
}

module.exports = {
  eventSchemas,
  validateEvent,
  getSupportedVersions,
  getLatestVersion,
  isVersionSupported
};