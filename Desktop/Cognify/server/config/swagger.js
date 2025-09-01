const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Cognify API',
      version: '1.0.0',
      description: 'AI-powered coding platform API documentation',
      contact: {
        name: 'Cognify Team',
        email: 'support@cognify.ai'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://api.cognify.ai'
          : 'http://localhost:5000',
        description: process.env.NODE_ENV === 'production' 
          ? 'Production server'
          : 'Development server'
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
        Error: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Error message'
            },
            code: {
              type: 'string',
              description: 'Error code'
            },
            details: {
              type: 'object',
              description: 'Additional error details'
            }
          },
          required: ['message']
        },
        ProjectState: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique project identifier'
            },
            metadata: {
              $ref: '#/components/schemas/ProjectMetadata'
            },
            architecture: {
              $ref: '#/components/schemas/ProjectArchitecture'
            },
            codebase: {
              $ref: '#/components/schemas/ProjectCodebase'
            },
            deployments: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/DeploymentHistory'
              }
            },
            conversations: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/ConversationThread'
              }
            }
          },
          required: ['id', 'metadata']
        },
        ProjectMetadata: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Project name'
            },
            description: {
              type: 'string',
              description: 'Project description'
            },
            version: {
              type: 'string',
              description: 'Project version'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            },
            owner: {
              type: 'string',
              description: 'Project owner ID'
            },
            tags: {
              type: 'array',
              items: {
                type: 'string'
              }
            }
          },
          required: ['name', 'owner']
        },
        ProjectArchitecture: {
          type: 'object',
          properties: {
            frontend: {
              $ref: '#/components/schemas/FrontendConfig'
            },
            backend: {
              $ref: '#/components/schemas/BackendConfig'
            },
            database: {
              $ref: '#/components/schemas/DatabaseSchema'
            },
            infrastructure: {
              $ref: '#/components/schemas/InfraConfig'
            }
          }
        },
        FrontendConfig: {
          type: 'object',
          properties: {
            framework: {
              type: 'string',
              enum: ['react', 'vue', 'angular', 'svelte']
            },
            language: {
              type: 'string',
              enum: ['javascript', 'typescript']
            },
            styling: {
              type: 'string',
              enum: ['css', 'scss', 'tailwind', 'styled-components']
            },
            buildTool: {
              type: 'string',
              enum: ['vite', 'webpack', 'parcel']
            }
          }
        },
        BackendConfig: {
          type: 'object',
          properties: {
            runtime: {
              type: 'string',
              enum: ['nodejs', 'python', 'java', 'go']
            },
            framework: {
              type: 'string',
              enum: ['express', 'fastify', 'koa', 'nestjs']
            },
            language: {
              type: 'string',
              enum: ['javascript', 'typescript', 'python', 'java', 'go']
            },
            apiStyle: {
              type: 'string',
              enum: ['rest', 'graphql', 'grpc']
            }
          }
        },
        DatabaseSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['mongodb', 'postgresql', 'mysql', 'sqlite']
            },
            collections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  schema: { type: 'object' },
                  indexes: { type: 'array', items: { type: 'object' } }
                }
              }
            }
          }
        },
        InfraConfig: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              enum: ['aws', 'gcp', 'azure', 'vercel', 'railway']
            },
            containerization: {
              type: 'string',
              enum: ['docker', 'podman']
            },
            orchestration: {
              type: 'string',
              enum: ['kubernetes', 'docker-compose', 'nomad']
            }
          }
        },
        ProjectCodebase: {
          type: 'object',
          properties: {
            files: {
              type: 'object',
              description: 'File tree structure'
            },
            dependencies: {
              type: 'object',
              description: 'Package manifest'
            },
            tests: {
              type: 'object',
              description: 'Test suite configuration'
            }
          }
        },
        DeploymentHistory: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            environment: {
              type: 'string',
              enum: ['development', 'staging', 'production']
            },
            status: {
              type: 'string',
              enum: ['pending', 'building', 'deploying', 'success', 'failed']
            },
            url: { type: 'string' },
            deployedAt: {
              type: 'string',
              format: 'date-time'
            },
            logs: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        },
        ConversationThread: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            messages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  role: {
                    type: 'string',
                    enum: ['user', 'assistant', 'system']
                  },
                  content: { type: 'string' },
                  timestamp: {
                    type: 'string',
                    format: 'date-time'
                  },
                  metadata: { type: 'object' }
                }
              }
            },
            intent: {
              type: 'string',
              enum: ['feature_request', 'bug_fix', 'deployment', 'question', 'optimization']
            },
            status: {
              type: 'string',
              enum: ['active', 'resolved', 'archived']
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
  apis: ['./routes/*.js', './models/*.js'] // Path to the API files
};

const specs = swaggerJSDoc(options);

module.exports = {
  specs,
  swaggerUi,
  setup: swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Cognify API Documentation'
  })
};