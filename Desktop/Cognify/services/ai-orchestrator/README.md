# AI Orchestrator Service

The AI Orchestrator Service is a microservice responsible for coordinating and managing AI agents in the Cognify platform. It handles task distribution, agent registration, load balancing, and provides a centralized coordination layer for all AI operations.

## Features

### Core Functionality
- **Task Orchestration**: Coordinate complex multi-step AI tasks across specialized agents
- **Agent Management**: Register, monitor, and manage AI agents (Frontend, Backend, Database, DevOps)
- **Load Balancing**: Distribute tasks based on agent availability and performance metrics
- **Dependency Management**: Handle task dependencies and execution order
- **Event-Driven Architecture**: Redis-based event system for real-time coordination

### Monitoring & Observability
- **OpenTelemetry Integration**: Comprehensive metrics and tracing
- **Health Checks**: Service and agent health monitoring
- **Performance Metrics**: Task execution times, agent performance, system resources
- **Structured Logging**: Winston-based logging with multiple transports

### API Features
- **RESTful API**: Complete REST API with OpenAPI/Swagger documentation
- **Rate Limiting**: Protection against abuse and overload
- **Input Validation**: Comprehensive request validation
- **Error Handling**: Structured error responses with proper HTTP status codes

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   Database      │
│     Agent       │    │     Agent       │    │     Agent       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌─────────────────────────────────────────────────┐
         │           AI Orchestrator Service               │
         │  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
         │  │    Task     │  │   Agent     │  │  Event   │ │
         │  │ Management  │  │ Management  │  │  System  │ │
         │  └─────────────┘  └─────────────┘  └──────────┘ │
         └─────────────────────────────────────────────────┘
                                 │
         ┌─────────────────────────────────────────────────┐
         │              Infrastructure                     │
         │  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
         │  │  Redis   │  │ MongoDB  │  │ Prometheus   │   │
         │  │ (Events) │  │ (State)  │  │ (Metrics)    │   │
         │  └──────────┘  └──────────┘  └──────────────┘   │
         └─────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites
- Node.js 18+
- Redis (for event system)
- MongoDB (for persistent state)
- Docker (optional, for containerized deployment)

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the service**:
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

### Environment Variables

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# MongoDB Configuration (optional, for persistent state)
MONGODB_URL=mongodb://localhost:27017/cognify

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=logs/orchestrator.log

# Metrics Configuration
METRICS_PORT=9090
PROMETHEUS_ENABLED=true

# Security Configuration
JWT_SECRET=your-jwt-secret
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Docker Deployment

1. **Build the image**:
   ```bash
   docker build -t ai-orchestrator .
   ```

2. **Run the container**:
   ```bash
   docker run -d \
     --name ai-orchestrator \
     -p 3001:3001 \
     -e REDIS_URL=redis://redis:6379 \
     ai-orchestrator
   ```

3. **Using Docker Compose** (recommended):
   ```yaml
   version: '3.8'
   services:
     ai-orchestrator:
       build: .
       ports:
         - "3001:3001"
       environment:
         - REDIS_URL=redis://redis:6379
         - NODE_ENV=production
       depends_on:
         - redis
       healthcheck:
         test: ["CMD", "node", "healthcheck.js"]
         interval: 30s
         timeout: 10s
         retries: 3
   ```

## API Documentation

The service provides a comprehensive REST API documented with OpenAPI/Swagger.

### Base URL
```
http://localhost:3001/api
```

### Main Endpoints

#### Orchestration
- `POST /orchestrator/orchestrate` - Orchestrate a complex request
- `GET /orchestrator/orchestrations/{id}` - Get orchestration details
- `GET /orchestrator/orchestrations/{id}/tasks` - Get orchestration tasks

#### Agent Management
- `POST /orchestrator/agents` - Register a new agent
- `GET /orchestrator/agents` - List all agents
- `GET /orchestrator/agents/{id}` - Get agent details
- `DELETE /orchestrator/agents/{id}` - Unregister agent
- `POST /orchestrator/agents/{id}/heartbeat` - Update agent heartbeat

#### Task Management
- `POST /orchestrator/tasks` - Create a new task
- `GET /orchestrator/tasks` - List tasks with filtering
- `GET /orchestrator/tasks/{id}` - Get task details
- `POST /orchestrator/tasks/{id}/cancel` - Cancel a task
- `POST /orchestrator/tasks/{id}/retry` - Retry a failed task

#### Agent Operations
- `GET /agents/discover` - Discover available agents
- `GET /agents/capabilities` - Get agent capabilities
- `POST /agents/{id}/assign` - Assign task to agent
- `POST /agents/{id}/complete` - Mark task as completed
- `POST /agents/{id}/fail` - Mark task as failed

#### Task Operations
- `GET /tasks/queue` - Get task queue
- `GET /tasks/{id}/dependencies` - Get task dependencies
- `POST /tasks/{id}/dependencies` - Add task dependency
- `POST /tasks/{id}/progress` - Update task progress
- `GET /tasks/{id}/logs` - Get task execution logs

#### Monitoring
- `GET /orchestrator/health` - Health check
- `GET /orchestrator/stats` - Service statistics
- `GET /orchestrator/agents/{id}/stats` - Agent statistics

### API Documentation UI
Access the interactive API documentation at:
```
http://localhost:3001/api-docs
```

## Usage Examples

### Registering an Agent

```javascript
const response = await fetch('http://localhost:3001/api/orchestrator/agents', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'frontend',
    endpoint: 'http://frontend-agent:3002',
    capabilities: ['react', 'typescript', 'css'],
    maxConcurrentTasks: 5
  })
});

const agent = await response.json();
console.log('Agent registered:', agent.data.id);
```

### Orchestrating a Full-Stack Development Request

```javascript
const response = await fetch('http://localhost:3001/api/orchestrator/orchestrate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    request: {
      type: 'full_stack_development',
      description: 'Create a user authentication system',
      requirements: {
        frontend: 'React with TypeScript',
        backend: 'Node.js with Express',
        database: 'MongoDB with user schema',
        authentication: 'JWT-based'
      }
    },
    options: {
      priority: 'high',
      timeout: 1800000 // 30 minutes
    }
  })
});

const orchestration = await response.json();
console.log('Orchestration started:', orchestration.data.orchestrationId);
```

### Creating a Specific Task

```javascript
const response = await fetch('http://localhost:3001/api/orchestrator/tasks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'code_generation',
    agentType: 'frontend',
    request: {
      description: 'Create a responsive navigation component',
      framework: 'React',
      styling: 'Tailwind CSS'
    },
    priority: 'medium',
    requirements: {
      accessibility: 'WCAG 2.1 AA',
      responsive: true,
      testing: 'Jest + React Testing Library'
    }
  })
});

const task = await response.json();
console.log('Task created:', task.data.id);
```

## Event System

The orchestrator uses Redis Streams for event-driven communication:

### Event Types
- `task.created` - New task created
- `task.assigned` - Task assigned to agent
- `task.started` - Task execution started
- `task.progress` - Task progress updated
- `task.completed` - Task completed successfully
- `task.failed` - Task execution failed
- `agent.registered` - New agent registered
- `agent.heartbeat` - Agent heartbeat received
- `agent.offline` - Agent went offline

### Subscribing to Events

```javascript
const eventEmitter = require('./src/services/eventEmitter');

// Subscribe to task events
eventEmitter.subscribe('task.*', (event) => {
  console.log('Task event:', event.type, event.data);
});

// Subscribe to agent events
eventEmitter.subscribe('agent.*', (event) => {
  console.log('Agent event:', event.type, event.data);
});
```

## Monitoring and Metrics

### Prometheus Metrics
The service exposes metrics at `/metrics` endpoint:

- `orchestrator_http_requests_total` - Total HTTP requests
- `orchestrator_http_request_duration_seconds` - HTTP request duration
- `orchestrator_tasks_total` - Total tasks by status
- `orchestrator_agents_total` - Total agents by status
- `orchestrator_task_duration_seconds` - Task execution duration
- `orchestrator_agent_load_factor` - Agent load factor
- `orchestrator_event_bus_operations_total` - Event bus operations

### Health Checks
Health check endpoint provides detailed service status:

```json
{
  "status": "healthy",
  "service": "orchestrator",
  "version": "1.0.0",
  "uptime": 3600,
  "timestamp": "2024-01-20T10:30:00.000Z",
  "dependencies": {
    "redis": "connected",
    "mongodb": "connected"
  },
  "metrics": {
    "activeAgents": 4,
    "pendingTasks": 12,
    "completedTasks": 156,
    "memoryUsage": "45.2MB"
  }
}
```

## Development

### Project Structure
```
services/ai-orchestrator/
├── src/
│   ├── config/
│   │   ├── swagger.js          # OpenAPI configuration
│   │   └── telemetry.js        # OpenTelemetry setup
│   ├── controllers/
│   │   └── orchestratorController.js  # HTTP request handlers
│   ├── middleware/
│   │   └── logger.js           # Logging middleware
│   ├── models/
│   │   ├── Agent.js            # Agent model
│   │   └── Task.js             # Task model
│   ├── routes/
│   │   ├── agents.js           # Agent routes
│   │   ├── orchestrator.js     # Orchestrator routes
│   │   └── tasks.js            # Task routes
│   └── services/
│       ├── eventEmitter.js     # Event system
│       └── orchestratorService.js  # Core orchestration logic
├── Dockerfile                  # Container configuration
├── healthcheck.js             # Health check script
├── index.js                   # Application entry point
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

### Running Tests
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Linting and Formatting
```bash
# Run ESLint
npm run lint

# Fix linting issues
npm run lint:fix
```

## Contributing

1. Follow the existing code style and patterns
2. Add tests for new functionality
3. Update documentation for API changes
4. Ensure all tests pass before submitting
5. Use conventional commit messages

## License

This project is part of the Cognify platform and follows the same licensing terms.