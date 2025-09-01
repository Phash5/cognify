const swaggerConfig = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Cognify AI Orchestrator API',
      version: '1.0.0',
      description: 'AI Orchestrator service for coordinating specialized AI agents in the Cognify platform',
      contact: {
        name: 'Cognify Team',
        email: 'support@cognify.dev'
      }
    },
    servers: [
      {
        url: process.env.ORCHESTRATOR_API_URL || 'http://localhost:3001',
        description: 'Development server'
      },
      {
        url: 'https://api.cognify.dev/orchestrator',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Task: {
          type: 'object',
          required: ['id', 'type', 'status', 'priority'],
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique task identifier'
            },
            type: {
              type: 'string',
              enum: ['frontend', 'backend', 'database', 'devops', 'general'],
              description: 'Type of task determining which agent to assign'
            },
            status: {
              type: 'string',
              enum: ['pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled'],
              description: 'Current status of the task'
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'urgent'],
              description: 'Task priority level'
            },
            projectId: {
              type: 'string',
              description: 'Associated project identifier'
            },
            userId: {
              type: 'string',
              description: 'User who created the task'
            },
            assignedAgent: {
              type: 'string',
              description: 'Agent service assigned to handle this task'
            },
            payload: {
              type: 'object',
              description: 'Task-specific data and parameters'
            },
            result: {
              type: 'object',
              description: 'Task execution result'
            },
            metadata: {
              type: 'object',
              properties: {
                estimatedDuration: {
                  type: 'integer',
                  description: 'Estimated task duration in seconds'
                },
                dependencies: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'List of task IDs this task depends on'
                },
                tags: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'Task categorization tags'
                }
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Task creation timestamp'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp'
            },
            completedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Task completion timestamp'
            }
          }
        },
        Agent: {
          type: 'object',
          required: ['id', 'type', 'status', 'capabilities'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique agent identifier'
            },
            type: {
              type: 'string',
              enum: ['frontend', 'backend', 'database', 'devops', 'general'],
              description: 'Agent specialization type'
            },
            status: {
              type: 'string',
              enum: ['available', 'busy', 'offline', 'maintenance'],
              description: 'Current agent status'
            },
            capabilities: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'List of agent capabilities and technologies'
            },
            serviceUrl: {
              type: 'string',
              format: 'uri',
              description: 'Agent service endpoint URL'
            },
            currentLoad: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: 'Current workload percentage'
            },
            maxConcurrentTasks: {
              type: 'integer',
              minimum: 1,
              description: 'Maximum number of concurrent tasks'
            },
            activeTasks: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'List of currently active task IDs'
            },
            metadata: {
              type: 'object',
              properties: {
                version: {
                  type: 'string',
                  description: 'Agent service version'
                },
                lastHealthCheck: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Last successful health check'
                },
                averageResponseTime: {
                  type: 'number',
                  description: 'Average response time in milliseconds'
                }
              }
            }
          }
        },
        TaskRequest: {
          type: 'object',
          required: ['type', 'payload'],
          properties: {
            type: {
              type: 'string',
              enum: ['frontend', 'backend', 'database', 'devops', 'general'],
              description: 'Type of task to create'
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'urgent'],
              default: 'medium',
              description: 'Task priority level'
            },
            projectId: {
              type: 'string',
              description: 'Associated project identifier'
            },
            payload: {
              type: 'object',
              description: 'Task-specific data and parameters'
            },
            metadata: {
              type: 'object',
              description: 'Additional task metadata'
            }
          }
        },
        OrchestrationResult: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'Created task identifier'
            },
            assignedAgent: {
              type: 'string',
              description: 'Agent assigned to handle the task'
            },
            estimatedCompletion: {
              type: 'string',
              format: 'date-time',
              description: 'Estimated completion time'
            },
            status: {
              type: 'string',
              description: 'Initial task status'
            }
          }
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Indicates if the request was successful'
            },
            data: {
              type: 'object',
              description: 'Response data'
            },
            message: {
              type: 'string',
              description: 'Response message'
            },
            error: {
              type: 'string',
              description: 'Error message if request failed'
            }
          }
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean'
            },
            data: {
              type: 'array',
              items: {}
            },
            pagination: {
              type: 'object',
              properties: {
                page: {
                  type: 'integer',
                  minimum: 1
                },
                limit: {
                  type: 'integer',
                  minimum: 1,
                  maximum: 100
                },
                total: {
                  type: 'integer',
                  minimum: 0
                },
                pages: {
                  type: 'integer',
                  minimum: 0
                }
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './src/controllers/*.js',
    './src/models/*.js'
  ]
};

module.exports = swaggerConfig;