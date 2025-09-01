const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Frontend AI Agent API',
      version: '1.0.0',
      description: 'Specialized AI Agent for Frontend/React development tasks',
      contact: {
        name: 'Cognify Team',
        email: 'support@cognify.dev'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3002',
        description: 'Development server'
      },
      {
        url: 'https://frontend-agent.cognify.dev',
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
        TaskRequest: {
          type: 'object',
          required: ['type', 'description'],
          properties: {
            type: {
              type: 'string',
              enum: ['component_generation', 'code_review', 'optimization', 'styling', 'testing', 'refactoring'],
              description: 'Type of frontend task to perform'
            },
            description: {
              type: 'string',
              description: 'Detailed description of the task'
            },
            framework: {
              type: 'string',
              enum: ['react', 'vue', 'angular', 'vanilla'],
              default: 'react',
              description: 'Frontend framework to use'
            },
            language: {
              type: 'string',
              enum: ['javascript', 'typescript'],
              default: 'typescript',
              description: 'Programming language preference'
            },
            styling: {
              type: 'string',
              enum: ['css', 'scss', 'tailwind', 'styled-components', 'emotion'],
              default: 'tailwind',
              description: 'Styling approach to use'
            },
            requirements: {
              type: 'object',
              properties: {
                responsive: {
                  type: 'boolean',
                  default: true,
                  description: 'Should be responsive design'
                },
                accessibility: {
                  type: 'string',
                  enum: ['basic', 'wcag-aa', 'wcag-aaa'],
                  default: 'wcag-aa',
                  description: 'Accessibility compliance level'
                },
                testing: {
                  type: 'boolean',
                  default: true,
                  description: 'Include test files'
                },
                storybook: {
                  type: 'boolean',
                  default: false,
                  description: 'Include Storybook stories'
                },
                documentation: {
                  type: 'boolean',
                  default: true,
                  description: 'Include JSDoc documentation'
                }
              }
            },
            constraints: {
              type: 'object',
              properties: {
                maxFileSize: {
                  type: 'string',
                  default: '50KB',
                  description: 'Maximum file size limit'
                },
                browserSupport: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  default: ['Chrome >= 90', 'Firefox >= 88', 'Safari >= 14'],
                  description: 'Browser support requirements'
                },
                performance: {
                  type: 'object',
                  properties: {
                    bundleSize: {
                      type: 'string',
                      description: 'Maximum bundle size'
                    },
                    renderTime: {
                      type: 'string',
                      description: 'Maximum render time'
                    }
                  }
                }
              }
            },
            context: {
              type: 'object',
              properties: {
                existingCode: {
                  type: 'string',
                  description: 'Existing code to work with'
                },
                projectStructure: {
                  type: 'object',
                  description: 'Current project structure'
                },
                dependencies: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'Available dependencies'
                },
                designSystem: {
                  type: 'object',
                  description: 'Design system specifications'
                }
              }
            }
          }
        },
        TaskResult: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the task completed successfully'
            },
            taskId: {
              type: 'string',
              format: 'uuid',
              description: 'Unique task identifier'
            },
            result: {
              type: 'object',
              properties: {
                files: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      path: {
                        type: 'string',
                        description: 'File path'
                      },
                      content: {
                        type: 'string',
                        description: 'File content'
                      },
                      type: {
                        type: 'string',
                        enum: ['component', 'style', 'test', 'story', 'type'],
                        description: 'Type of file'
                      }
                    }
                  }
                },
                explanation: {
                  type: 'string',
                  description: 'Explanation of the generated code'
                },
                suggestions: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'Additional suggestions for improvement'
                },
                dependencies: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: {
                        type: 'string'
                      },
                      version: {
                        type: 'string'
                      },
                      type: {
                        type: 'string',
                        enum: ['dependency', 'devDependency', 'peerDependency']
                      }
                    }
                  },
                  description: 'Required dependencies'
                }
              }
            },
            metrics: {
              type: 'object',
              properties: {
                executionTime: {
                  type: 'number',
                  description: 'Task execution time in milliseconds'
                },
                linesOfCode: {
                  type: 'number',
                  description: 'Total lines of code generated'
                },
                filesGenerated: {
                  type: 'number',
                  description: 'Number of files generated'
                },
                complexity: {
                  type: 'string',
                  enum: ['low', 'medium', 'high'],
                  description: 'Code complexity level'
                }
              }
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Task completion timestamp'
            }
          }
        },
        ComponentRequest: {
          type: 'object',
          required: ['name', 'description'],
          properties: {
            name: {
              type: 'string',
              description: 'Component name (PascalCase)'
            },
            description: {
              type: 'string',
              description: 'Component description and functionality'
            },
            props: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string'
                  },
                  type: {
                    type: 'string'
                  },
                  required: {
                    type: 'boolean',
                    default: false
                  },
                  description: {
                    type: 'string'
                  },
                  defaultValue: {
                    type: 'string'
                  }
                }
              },
              description: 'Component props specification'
            },
            state: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string'
                  },
                  type: {
                    type: 'string'
                  },
                  initialValue: {
                    type: 'string'
                  },
                  description: {
                    type: 'string'
                  }
                }
              },
              description: 'Component state specification'
            },
            events: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string'
                  },
                  description: {
                    type: 'string'
                  },
                  parameters: {
                    type: 'array',
                    items: {
                      type: 'string'
                    }
                  }
                }
              },
              description: 'Component events specification'
            },
            styling: {
              type: 'object',
              properties: {
                approach: {
                  type: 'string',
                  enum: ['css', 'scss', 'tailwind', 'styled-components', 'emotion'],
                  default: 'tailwind'
                },
                theme: {
                  type: 'object',
                  description: 'Theme specifications'
                },
                responsive: {
                  type: 'boolean',
                  default: true
                }
              }
            }
          }
        },
        OptimizationRequest: {
          type: 'object',
          required: ['code', 'type'],
          properties: {
            code: {
              type: 'string',
              description: 'Code to optimize'
            },
            type: {
              type: 'string',
              enum: ['performance', 'bundle-size', 'accessibility', 'seo', 'security'],
              description: 'Type of optimization to perform'
            },
            metrics: {
              type: 'object',
              properties: {
                currentPerformance: {
                  type: 'object',
                  description: 'Current performance metrics'
                },
                targetMetrics: {
                  type: 'object',
                  description: 'Target performance metrics'
                }
              }
            },
            constraints: {
              type: 'object',
              properties: {
                maintainFunctionality: {
                  type: 'boolean',
                  default: true
                },
                preserveAPI: {
                  type: 'boolean',
                  default: true
                },
                maxChanges: {
                  type: 'string',
                  enum: ['minimal', 'moderate', 'extensive'],
                  default: 'moderate'
                }
              }
            }
          }
        },
        AgentStatus: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Agent unique identifier'
            },
            type: {
              type: 'string',
              enum: ['frontend'],
              description: 'Agent type'
            },
            status: {
              type: 'string',
              enum: ['online', 'busy', 'maintenance', 'offline'],
              description: 'Current agent status'
            },
            capabilities: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Agent capabilities'
            },
            currentTasks: {
              type: 'number',
              description: 'Number of currently executing tasks'
            },
            maxConcurrentTasks: {
              type: 'number',
              description: 'Maximum concurrent tasks'
            },
            loadFactor: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Current load factor (0-1)'
            },
            averageResponseTime: {
              type: 'number',
              description: 'Average response time in milliseconds'
            },
            lastHeartbeat: {
              type: 'string',
              format: 'date-time',
              description: 'Last heartbeat timestamp'
            },
            version: {
              type: 'string',
              description: 'Agent version'
            }
          }
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the request was successful'
            },
            data: {
              type: 'object',
              description: 'Response data'
            },
            error: {
              type: 'string',
              description: 'Error message if request failed'
            },
            code: {
              type: 'string',
              description: 'Error code if request failed'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Response timestamp'
            }
          }
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'unhealthy', 'degraded'],
              description: 'Overall health status'
            },
            service: {
              type: 'string',
              description: 'Service name'
            },
            version: {
              type: 'string',
              description: 'Service version'
            },
            uptime: {
              type: 'number',
              description: 'Service uptime in seconds'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Health check timestamp'
            },
            dependencies: {
              type: 'object',
              description: 'Status of external dependencies'
            },
            metrics: {
              type: 'object',
              properties: {
                activeTasks: {
                  type: 'number'
                },
                completedTasks: {
                  type: 'number'
                },
                failedTasks: {
                  type: 'number'
                },
                memoryUsage: {
                  type: 'string'
                },
                cpuUsage: {
                  type: 'string'
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
    './src/routes/*.js',
    './src/controllers/*.js'
  ]
};

module.exports = swaggerJsdoc(options);