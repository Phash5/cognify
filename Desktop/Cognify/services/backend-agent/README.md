# Backend AI Agent Service

AI-powered backend development assistant microservice that specializes in generating Node.js APIs, database schemas, authentication systems, middleware, tests, and deployment configurations.

## 🚀 Features

### Core Backend Development
- **API Generation**: Create RESTful APIs with Express, Fastify, Koa, or NestJS
- **Database Schema Design**: Generate schemas for MongoDB, PostgreSQL, MySQL, Redis
- **Authentication Systems**: JWT, OAuth, session-based, and API key authentication
- **Middleware Development**: Custom middleware for validation, logging, security
- **Testing Suite Generation**: Unit tests, integration tests, API tests
- **Code Optimization**: Performance analysis and improvement suggestions

### Advanced Features
- **Documentation Generation**: Swagger/OpenAPI specs, README files, API docs
- **Deployment Configurations**: Docker, Kubernetes, CI/CD pipelines
- **Security Implementation**: Input validation, rate limiting, CORS, helmet
- **Monitoring & Logging**: Winston logging, OpenTelemetry, Prometheus metrics
- **Real-time Task Management**: Queue-based processing with Redis
- **Caching Strategies**: Redis and in-memory caching solutions

## 🏗️ Quick Start

### Prerequisites
- Node.js 18+ and npm 8+
- Redis server (for caching and task queue)
- OpenAI API key
- Docker (optional)

### Installation

1. **Clone and navigate to the service**:
   ```bash
   cd services/backend-agent
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

4. **Start Redis** (if not already running):
   ```bash
   redis-server
   ```

5. **Run the service**:
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

The service will be available at `http://localhost:3002`

### Docker Deployment

```bash
# Build the image
npm run docker:build

# Run with Docker
npm run docker:run

# Or use Docker Compose
docker-compose up --build
```

## 📚 API Documentation

Once running, visit `http://localhost:3002/api-docs` for interactive Swagger documentation.

### Key Endpoints

#### Agent Capabilities
- `GET /api/agent/capabilities` - Get available backend development features
- `GET /api/agent/status` - Get current agent status and metrics

#### Code Generation
- `POST /api/agent/generate/api` - Generate RESTful API endpoints
- `POST /api/agent/generate/database` - Generate database schemas
- `POST /api/agent/generate/auth` - Generate authentication systems
- `POST /api/agent/generate/middleware` - Generate custom middleware
- `POST /api/agent/generate/tests` - Generate test suites
- `POST /api/agent/generate/docs` - Generate documentation

#### Code Analysis & Optimization
- `POST /api/agent/optimize` - Analyze and optimize backend code

#### Task Management
- `GET /api/tasks` - List tasks with filtering and pagination
- `GET /api/tasks/{taskId}` - Get specific task details
- `POST /api/tasks/{taskId}/cancel` - Cancel a running task
- `POST /api/tasks/{taskId}/retry` - Retry a failed task
- `GET /api/tasks/{taskId}/result` - Get task results
- `GET /api/tasks/stats` - Get task statistics

#### Health & Monitoring
- `GET /health` - Basic health check
- `GET /health/detailed` - Comprehensive health status
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe
- `GET /metrics` - Prometheus metrics

## 🏛️ Architecture

### Service Structure
```
src/
├── config/          # Configuration management
├── services/         # Core business logic
│   ├── backendService.js    # Main AI service
│   └── cacheService.js      # Redis caching
├── routes/           # API route handlers
│   ├── agent.js      # Agent endpoints
│   ├── tasks.js      # Task management
│   └── health.js     # Health checks
├── middleware/       # Express middleware
│   ├── auth.js       # Authentication
│   ├── rateLimiter.js # Rate limiting
│   └── errorHandler.js # Error handling
├── utils/            # Utility functions
│   ├── logger.js     # Winston logging
│   ├── telemetry.js  # OpenTelemetry
│   └── validation.js # Input validation
└── server.js         # Main application entry
```

### Key Services

#### BackendService
Core AI service that handles:
- OpenAI integration for code generation
- Task queue management
- Framework-specific code generation
- Database schema generation
- Authentication system creation
- Performance optimization

#### CacheService
Redis-based caching with:
- Intelligent cache invalidation
- Fallback to in-memory cache
- Performance metrics
- Health monitoring

### Middleware Stack
- **Authentication**: JWT and API key validation
- **Rate Limiting**: Configurable limits for different endpoints
- **Validation**: Joi and express-validator integration
- **Error Handling**: Comprehensive error processing
- **Logging**: Structured logging with Winston
- **Telemetry**: OpenTelemetry tracing and metrics

## 🛠️ Development

### Code Style
```bash
# Lint code
npm run lint
npm run lint:fix

# Format code
npm run format
npm run format:check

# Validate everything
npm run validate
```

### Testing
```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Integration tests
npm run test:integration
```

### Environment Variables

Key configuration options:

| Variable | Description | Default |
|----------|-------------|----------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3002` |
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `JWT_SECRET` | JWT signing secret | Required |
| `RATE_LIMIT_ENABLED` | Enable rate limiting | `true` |
| `CACHE_ENABLED` | Enable caching | `true` |
| `TELEMETRY_ENABLED` | Enable telemetry | `true` |

See `.env.example` for complete configuration options.

## 🚀 Deployment

### Docker

The service includes a multi-stage Dockerfile optimized for production:

```dockerfile
# Build and run
docker build -t cognify/backend-agent .
docker run -p 3002:3002 --env-file .env cognify/backend-agent
```

### Kubernetes

Example deployment configuration:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend-agent
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend-agent
  template:
    metadata:
      labels:
        app: backend-agent
    spec:
      containers:
      - name: backend-agent
        image: cognify/backend-agent:latest
        ports:
        - containerPort: 3002
        env:
        - name: NODE_ENV
          value: "production"
        - name: REDIS_HOST
          value: "redis-service"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3002
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3002
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Environment-Specific Configurations

#### Development
- Detailed logging and debugging
- Hot reloading with nodemon
- Swagger documentation enabled
- Relaxed rate limiting

#### Production
- Optimized logging levels
- Strict security headers
- Enhanced rate limiting
- Performance monitoring
- Graceful shutdown handling

## 📊 Monitoring

### Health Checks
- **Basic**: `/health` - Simple status check
- **Detailed**: `/health/detailed` - Comprehensive system status
- **Readiness**: `/health/ready` - Kubernetes readiness probe
- **Liveness**: `/health/live` - Kubernetes liveness probe

### Metrics
- **Prometheus**: `/metrics` endpoint
- **Custom Metrics**: Task processing, cache performance, AI requests
- **System Metrics**: Memory, CPU, response times

### Logging
- **Structured Logging**: JSON format with Winston
- **Log Levels**: Configurable (error, warn, info, debug)
- **Log Rotation**: Daily rotation with retention policies
- **Correlation IDs**: Request tracing across services

### Tracing
- **OpenTelemetry**: Distributed tracing
- **Jaeger Integration**: Trace visualization
- **Custom Spans**: AI operations, database queries, cache operations

## 🔒 Security

### Authentication & Authorization
- JWT token validation
- API key authentication
- Role-based access control
- Resource ownership validation

### Security Headers
- Helmet.js for security headers
- CORS configuration
- Content Security Policy
- HSTS enforcement

### Input Validation
- Joi schema validation
- Express-validator middleware
- XSS protection
- SQL injection prevention
- File upload restrictions

### Rate Limiting
- General API rate limiting
- AI-specific rate limiting
- Burst protection
- IP-based limiting

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** following the coding standards
4. **Add tests** for new functionality
5. **Run the validation suite**: `npm run validate`
6. **Commit your changes**: `git commit -m 'Add amazing feature'`
7. **Push to the branch**: `git push origin feature/amazing-feature`
8. **Open a Pull Request**

### Development Guidelines
- Follow ESLint and Prettier configurations
- Write comprehensive tests
- Update documentation for new features
- Use conventional commit messages
- Ensure all CI checks pass

## 🐛 Troubleshooting

### Common Issues

#### Service Won't Start
- Check Redis connection
- Verify OpenAI API key
- Ensure port 3002 is available
- Check environment variables

#### High Memory Usage
- Monitor task queue size
- Check for memory leaks in AI operations
- Adjust cache size limits
- Review log retention settings

#### Slow Response Times
- Check OpenAI API latency
- Monitor Redis performance
- Review rate limiting settings
- Analyze database query performance

#### Authentication Errors
- Verify JWT secret configuration
- Check token expiration settings
- Validate API key format
- Review CORS settings

### Debug Mode

Enable debug logging:
```bash
DEBUG=backend-agent:* npm run dev
```

### Performance Monitoring

Monitor key metrics:
- Task processing time
- AI request latency
- Cache hit/miss ratios
- Memory and CPU usage
- Error rates

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## 🙏 Acknowledgments

- OpenAI for providing the AI capabilities
- Express.js community for the robust framework
- Redis team for the excellent caching solution
- OpenTelemetry project for observability standards
- All contributors and maintainers

---

**Backend AI Agent** - Part of the Cognify AI Development Platform

For more information, visit the [main Cognify repository](../../README.md).