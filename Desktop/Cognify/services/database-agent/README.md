# Database AI Agent

AI-powered database development and optimization service for the Cognify platform. This microservice specializes in database schema generation, query optimization, migration scripts, and performance analysis using advanced AI capabilities.

## Features

### Core Database Development
- **Schema Generation**: AI-powered database schema design and generation
- **Query Optimization**: Intelligent SQL query analysis and optimization
- **Migration Scripts**: Automated database migration generation
- **Performance Analysis**: Database performance monitoring and optimization recommendations
- **Multi-Database Support**: MongoDB, MySQL, PostgreSQL, SQLite

### Advanced Features
- **Real-time Task Management**: Asynchronous processing with progress tracking
- **Intelligent Caching**: Redis-based caching for improved performance
- **Rate Limiting**: Configurable rate limiting for API protection
- **OpenTelemetry Integration**: Comprehensive observability and tracing
- **Health Monitoring**: Detailed health checks and metrics
- **Security**: JWT authentication, API key support, input validation

## Quick Start

### Prerequisites
- Node.js 18+ and npm 8+
- Redis server
- OpenAI API key
- MongoDB (optional, for metadata storage)

### Installation

1. **Clone and navigate to the service**:
   ```bash
   cd services/database-agent
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the service**:
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

### Docker Deployment

1. **Build the image**:
   ```bash
   npm run docker:build
   ```

2. **Run the container**:
   ```bash
   npm run docker:run
   ```

3. **Using Docker Compose**:
   ```bash
   # Development
   npm run docker:dev
   
   # Production
   npm run docker:prod
   ```

## API Documentation

The service provides a comprehensive REST API for database development tasks.

### Key Endpoints

#### Agent Capabilities
- `GET /api/agent/capabilities` - Get agent capabilities and supported features
- `GET /api/agent/status` - Get current agent status and metrics

#### Database Schema Generation
- `POST /api/agent/generate-schema` - Generate database schema from requirements
  ```json
  {
    "requirements": "E-commerce platform with users, products, orders",
    "databaseType": "mongodb",
    "options": {
      "includeIndexes": true,
      "includeConstraints": true,
      "codeStyle": "camelCase"
    }
  }
  ```

#### Query Optimization
- `POST /api/agent/optimize-query` - Optimize SQL/NoSQL queries
  ```json
  {
    "query": "SELECT * FROM users WHERE email LIKE '%@gmail.com'",
    "databaseType": "mysql",
    "options": {
      "analysisDepth": "deep",
      "includeExplainPlan": true,
      "suggestIndexes": true
    }
  }
  ```

#### Migration Generation
- `POST /api/agent/generate-migration` - Generate database migration scripts
  ```json
  {
    "fromSchema": {...},
    "toSchema": {...},
    "databaseType": "postgresql",
    "options": {
      "includeRollback": true,
      "safeMode": true,
      "batchSize": 1000
    }
  }
  ```

#### Performance Analysis
- `POST /api/agent/analyze-performance` - Analyze database performance
  ```json
  {
    "metrics": {...},
    "queries": [...],
    "databaseType": "mongodb",
    "options": {
      "includeIndexAnalysis": true,
      "includeMemoryAnalysis": true,
      "slowQueryThreshold": 1000
    }
  }
  ```

#### Task Management
- `GET /api/tasks` - List tasks with filtering and pagination
- `GET /api/tasks/:id` - Get specific task details
- `DELETE /api/tasks/:id` - Cancel a running task
- `POST /api/tasks/:id/retry` - Retry a failed task
- `GET /api/tasks/:id/result` - Get task results
- `GET /api/tasks/:id/download` - Download task results as file
- `GET /api/tasks/stats` - Get task statistics

#### Health and Monitoring
- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Comprehensive health information
- `GET /api/health/ready` - Kubernetes readiness probe
- `GET /api/health/live` - Kubernetes liveness probe
- `GET /api/health/metrics` - Service metrics

### Interactive API Documentation

Access the Swagger UI documentation at `http://localhost:3003/api/docs` (development only).

## Architecture

### Service Structure
```
src/
├── config/          # Configuration management
├── services/         # Core business logic
│   ├── databaseService.js    # Main AI database service
│   └── cacheService.js       # Redis caching service
├── middleware/       # Express middleware
│   ├── auth.js              # Authentication & authorization
│   ├── rateLimiter.js       # Rate limiting
│   └── errorHandler.js      # Error handling
├── routes/          # API route definitions
│   ├── agent.js            # Agent capabilities routes
│   ├── tasks.js            # Task management routes
│   └── health.js           # Health check routes
├── utils/           # Utility functions
│   ├── logger.js           # Structured logging
│   ├── telemetry.js        # OpenTelemetry setup
│   └── validation.js       # Input validation
├── app.js           # Express application setup
└── server.js        # Server entry point
```

### Key Services

- **DatabaseService**: Core AI-powered database development service
- **CacheService**: Redis-based caching for performance optimization
- **TelemetryService**: OpenTelemetry integration for observability
- **Logger**: Structured logging with multiple transports

### Middleware Stack

- **Security**: Helmet, CORS, input validation
- **Authentication**: JWT tokens, API keys
- **Rate Limiting**: Configurable limits per endpoint
- **Error Handling**: Comprehensive error processing
- **Telemetry**: Request tracing and metrics

## Development

### Code Style

The project uses ESLint and Prettier for code formatting:

```bash
# Lint code
npm run lint
npm run lint:fix

# Format code
npm run format
npm run format:check
```

### Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# CI testing
npm run test:ci
```

### Environment Variables

Key environment variables (see `.env.example` for complete list):

- `OPENAI_API_KEY`: OpenAI API key for AI capabilities
- `REDIS_HOST`: Redis server host
- `JWT_SECRET`: Secret for JWT token signing
- `NODE_ENV`: Environment (development/production)
- `PORT`: Service port (default: 3003)

## Deployment

### Docker

The service includes optimized Docker configuration:

- Multi-stage build for smaller images
- Non-root user for security
- Health checks included
- Signal handling with dumb-init

### Kubernetes

Kubernetes deployment ready with:

- Readiness and liveness probes
- Resource limits and requests
- ConfigMap and Secret support
- Service discovery integration

### Environment-Specific Configurations

- **Development**: Full logging, Swagger docs, relaxed security
- **Staging**: Production-like with debug capabilities
- **Production**: Optimized performance, security hardened

## Monitoring

### Health Checks

- **Basic**: Simple service availability
- **Detailed**: Comprehensive dependency checks
- **Readiness**: Kubernetes readiness probe
- **Liveness**: Kubernetes liveness probe

### Metrics

- **Service Metrics**: Task processing, AI requests, cache performance
- **System Metrics**: Memory, CPU, uptime
- **Business Metrics**: Schema generations, query optimizations

### Logging

- **Structured Logging**: JSON format with correlation IDs
- **Multiple Transports**: Console, file, daily rotation
- **Log Levels**: Configurable verbosity
- **Security Events**: Authentication, authorization tracking

### Tracing

- **OpenTelemetry**: Distributed tracing support
- **Jaeger Integration**: Trace visualization
- **Custom Spans**: Database operations, AI requests

## Security

### Authentication

- **JWT Tokens**: Stateless authentication
- **API Keys**: Service-to-service authentication
- **Role-Based Access**: Configurable permissions

### Security Headers

- **Helmet**: Security headers middleware
- **CORS**: Cross-origin request handling
- **CSP**: Content Security Policy

### Input Validation

- **Joi Schemas**: Request validation
- **Sanitization**: HTML and SQL injection prevention
- **Rate Limiting**: API abuse prevention

### Data Protection

- **Encryption**: Sensitive data encryption
- **Secrets Management**: Environment-based secrets
- **Audit Logging**: Security event tracking

## Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make changes and test**: `npm test`
4. **Lint and format**: `npm run lint:fix && npm run format`
5. **Commit changes**: `git commit -m 'Add amazing feature'`
6. **Push to branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- Follow existing code style and patterns
- Add tests for new functionality
- Update documentation as needed
- Ensure all checks pass before submitting

## Troubleshooting

### Common Issues

1. **Service won't start**:
   - Check Redis connection
   - Verify OpenAI API key
   - Review environment variables

2. **AI requests failing**:
   - Validate OpenAI API key
   - Check rate limits
   - Review request format

3. **Performance issues**:
   - Monitor Redis cache hit rates
   - Check task queue length
   - Review resource usage

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Run with debugger
npm run dev:debug
```

### Health Checks

```bash
# Basic health
curl http://localhost:3003/api/health

# Detailed health
curl http://localhost:3003/api/health/detailed

# Service metrics
curl http://localhost:3003/api/health/metrics
```

## License

MIT License - see the [LICENSE](../../LICENSE) file for details.

## Support

For support and questions:

- **Issues**: [GitHub Issues](https://github.com/cognify/cognify/issues)
- **Documentation**: [API Docs](http://localhost:3003/api/docs)
- **Email**: support@cognify.ai

---

**Database AI Agent** - Intelligent database development and optimization powered by AI.