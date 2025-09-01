# DevOps AI Agent

AI-powered DevOps automation service for deployment, infrastructure, monitoring, and configuration management. This microservice provides intelligent automation capabilities for modern DevOps workflows using OpenAI's advanced language models.

## 🚀 Features

### Core DevOps Capabilities
- **Deployment Automation**: Generate deployment configurations for Kubernetes, Docker, AWS, Azure, GCP, Heroku, and Vercel
- **Infrastructure as Code**: Create Terraform, Pulumi, and cloud-native infrastructure templates
- **Monitoring Setup**: Configure monitoring solutions with Prometheus, Grafana, DataDog, New Relic, and Splunk
- **Configuration Management**: Generate Ansible, Chef, Puppet, and Helm configurations

### Advanced Features
- **AI-Powered Generation**: Intelligent code generation based on requirements and best practices
- **Multi-Platform Support**: Works with major cloud providers and deployment platforms
- **Task Management**: Asynchronous task processing with progress tracking
- **Caching System**: Redis-based caching for improved performance
- **Rate Limiting**: Comprehensive rate limiting for API protection
- **Monitoring & Observability**: OpenTelemetry integration with Jaeger and Prometheus
- **Security**: JWT/API key authentication, input validation, and security headers

## 🏁 Quick Start

### Prerequisites
- Node.js 18+ and npm 8+
- Redis server
- OpenAI API key
- Docker (optional)

### Installation

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd devops-agent
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start Redis:**
```bash
# Using Docker
docker run -d -p 6379:6379 redis:alpine

# Or install locally
# Follow Redis installation guide for your OS
```

4. **Start the service:**
```bash
# Development
npm run dev

# Production
npm start
```

### Docker Deployment

```bash
# Build and run
npm run docker:build
npm run docker:run

# Or use Docker Compose
npm run docker:dev
```

## 📚 API Documentation

The service provides a comprehensive REST API documented with OpenAPI/Swagger.

- **API Documentation**: `http://localhost:3003/docs`
- **Health Checks**: `http://localhost:3003/health`
- **Metrics**: `http://localhost:3003/metrics`

### Key Endpoints

#### Agent Capabilities
```http
GET /agent/capabilities
```
Retrieve available DevOps capabilities and supported platforms.

#### Deployment Generation
```http
POST /agent/deployment
Content-Type: application/json
X-API-Key: your-api-key

{
  "platform": "kubernetes",
  "environment": "production",
  "application": {
    "name": "my-app",
    "type": "web",
    "runtime": "node:18",
    "port": 3000
  },
  "requirements": {
    "cpu": "500m",
    "memory": "512Mi",
    "replicas": 3
  }
}
```

#### Infrastructure Generation
```http
POST /agent/infrastructure
Content-Type: application/json
X-API-Key: your-api-key

{
  "provider": "aws",
  "environment": "production",
  "region": "us-west-2",
  "resources": [
    {
      "type": "vm",
      "name": "web-server",
      "specifications": {
        "instance_type": "t3.medium",
        "ami": "ami-0c55b159cbfafe1d0"
      }
    }
  ]
}
```

#### Monitoring Setup
```http
POST /agent/monitoring
Content-Type: application/json
X-API-Key: your-api-key

{
  "type": "prometheus",
  "environment": "production",
  "targets": [
    {
      "name": "web-app",
      "endpoint": "http://web-app:3000/metrics",
      "interval": "30s"
    }
  ],
  "alerts": [
    {
      "name": "HighCPUUsage",
      "condition": "cpu_usage > 80",
      "duration": "5m"
    }
  ]
}
```

#### Configuration Management
```http
POST /agent/configuration
Content-Type: application/json
X-API-Key: your-api-key

{
  "tool": "ansible",
  "environment": "production",
  "tasks": [
    {
      "name": "install-nginx",
      "type": "package",
      "package": "nginx",
      "state": "present"
    }
  ]
}
```

#### Task Management
```http
# Get task status
GET /tasks/{taskId}

# List tasks
GET /tasks?status=completed&limit=10

# Cancel task
DELETE /tasks/{taskId}

# Get task result
GET /tasks/{taskId}/result
```

#### Health and Monitoring
```http
# Basic health check
GET /health

# Detailed health check
GET /health/detailed

# Readiness check
GET /health/ready

# Liveness check
GET /health/live

# Prometheus metrics
GET /metrics

# JSON metrics
GET /metrics/json
```

## 🏗️ Architecture

### Service Structure
```
src/
├── config/          # Configuration management
├── services/        # Core business logic
│   ├── devopsService.js    # Main DevOps AI service
│   └── cacheService.js     # Redis caching service
├── routes/          # API route handlers
│   ├── agent.js            # DevOps agent endpoints
│   ├── tasks.js            # Task management endpoints
│   ├── health.js           # Health check endpoints
│   └── metrics.js          # Metrics endpoints
├── middleware/      # Express middleware
├── utils/           # Utility functions
│   ├── logger.js           # Winston logging
│   ├── telemetry.js        # OpenTelemetry setup
│   └── validation.js       # Input validation
├── app.js           # Express application setup
└── server.js        # Server entry point
```

### Key Services

- **DevOpsService**: Core AI-powered DevOps automation logic
- **CacheService**: Redis-based caching for AI responses and task results
- **TelemetryService**: OpenTelemetry integration for tracing and metrics
- **Logger**: Structured logging with Winston

### Middleware Stack

- **Security**: Helmet, CORS, input validation
- **Authentication**: JWT and API key support
- **Rate Limiting**: General, AI-specific, and DevOps operation-specific limits
- **Monitoring**: Request logging, metrics collection, distributed tracing
- **Error Handling**: Centralized error handling with proper HTTP status codes

## 🛠️ Development

### Code Style
- ESLint with Airbnb configuration
- Prettier for code formatting
- Husky for git hooks
- Lint-staged for pre-commit checks

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run integration tests
npm run test:integration

# Run unit tests
npm run test:unit
```

### Environment Variables
See `.env.example` for all available configuration options:

- **Server**: Port, host, CORS origins
- **Database**: Redis connection settings
- **AI**: OpenAI API configuration
- **Security**: JWT secrets, API keys
- **Rate Limiting**: Request limits and windows
- **DevOps**: Platform and tool configurations
- **Monitoring**: Telemetry and metrics settings

## 🚀 Deployment

### Docker
```bash
# Build image
docker build -t devops-agent .

# Run container
docker run -p 3003:3003 --env-file .env devops-agent
```

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: devops-agent
spec:
  replicas: 3
  selector:
    matchLabels:
      app: devops-agent
  template:
    metadata:
      labels:
        app: devops-agent
    spec:
      containers:
      - name: devops-agent
        image: devops-agent:latest
        ports:
        - containerPort: 3003
        env:
        - name: NODE_ENV
          value: "production"
        - name: REDIS_HOST
          value: "redis-service"
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: openai-secret
              key: api-key
```

### Environment-Specific Configurations

- **Development**: Debug logging, mock services, hot reload
- **Staging**: Production-like setup with test data
- **Production**: Optimized performance, security hardening, monitoring

## 📊 Monitoring

### Health Checks
- **Basic**: `/health` - Simple alive check
- **Detailed**: `/health/detailed` - Comprehensive system status
- **Readiness**: `/health/ready` - Service ready to accept requests
- **Liveness**: `/health/live` - Service is alive (Kubernetes probe)

### Metrics
- **Prometheus**: `/metrics` - Prometheus-format metrics
- **JSON**: `/metrics/json` - Human-readable metrics
- **Performance**: `/metrics/performance` - Performance-specific metrics
- **DevOps**: `/metrics/devops` - DevOps operation metrics

### Logging
- **Structured JSON logs** with Winston
- **Log levels**: error, warn, info, debug
- **Log rotation** with daily rotation and retention
- **Request logging** with correlation IDs

### Tracing
- **OpenTelemetry** integration
- **Jaeger** for distributed tracing
- **Span creation** for all major operations
- **Correlation** across service boundaries

## 🔒 Security

### Authentication
- **JWT tokens** for user authentication
- **API keys** for service-to-service communication
- **Multiple API keys** support for different environments

### Security Headers
- **Helmet.js** for security headers
- **CORS** configuration
- **Content Security Policy**
- **Rate limiting** protection

### Input Validation
- **Joi schemas** for request validation
- **Express-validator** middleware
- **Sanitization** of user inputs
- **File upload** restrictions

### Rate Limiting
- **General API** rate limiting
- **AI-specific** rate limiting
- **DevOps operation-specific** limits
- **IP-based** and **user-based** limiting

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Run linting: `npm run lint`
6. Commit your changes: `git commit -m 'Add amazing feature'`
7. Push to the branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

### Development Guidelines
- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all CI checks pass

## 🐛 Troubleshooting

### Common Issues

**Service won't start:**
- Check Redis connection
- Verify OpenAI API key
- Check port availability
- Review environment variables

**High memory usage:**
- Check cache size limits
- Review task queue size
- Monitor for memory leaks
- Adjust Node.js memory limits

**Rate limiting issues:**
- Review rate limit configuration
- Check Redis for rate limit data
- Monitor rate limit metrics
- Adjust limits based on usage

**AI responses are slow:**
- Check OpenAI API status
- Review network connectivity
- Monitor AI request metrics
- Consider caching strategies

### Debug Mode
```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Enable debug routes (development only)
DEV_ENABLE_DEBUG_ROUTES=true npm run dev
```

### Health Check Commands
```bash
# Check service health
curl http://localhost:3003/health

# Check detailed health
curl http://localhost:3003/health/detailed

# Check metrics
curl http://localhost:3003/metrics
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [API Docs](http://localhost:3003/docs)
- **Issues**: [GitHub Issues](https://github.com/cognify-ai/devops-agent/issues)
- **Email**: support@cognify.ai
- **Slack**: #devops-agent channel

## 🗺️ Roadmap

- [ ] GitOps integration (ArgoCD, Flux)
- [ ] Security scanning integration
- [ ] Cost optimization recommendations
- [ ] Multi-cloud deployment strategies
- [ ] Advanced monitoring dashboards
- [ ] Infrastructure drift detection
- [ ] Automated rollback capabilities
- [ ] Performance optimization suggestions