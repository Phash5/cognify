# Frontend AI Agent Service

A specialized AI agent service for frontend development tasks, including React, Vue, and Angular code generation, optimization, and analysis. Part of the Cognify AI platform's microservices architecture.

## Features

### Code Generation
- **React Components**: Generate functional and class components with TypeScript support
- **Vue Components**: Create Vue 3 components with Composition API and Options API
- **Angular Components**: Generate Angular components with proper decorators and lifecycle hooks
- **Custom Hooks**: Create reusable React hooks with proper TypeScript definitions
- **Styling**: Generate CSS, SCSS, Sass, and styled-components

### Code Analysis & Optimization
- **Code Review**: Analyze code for best practices, performance issues, and security vulnerabilities
- **Performance Optimization**: Optimize bundle size, rendering performance, and memory usage
- **Accessibility Auditing**: Check for WCAG compliance and accessibility improvements
- **Test Generation**: Create unit tests, integration tests, and E2E tests

### AI-Powered Features
- **Intelligent Code Completion**: Context-aware code suggestions
- **Refactoring Assistance**: Automated code refactoring with safety checks
- **Documentation Generation**: Auto-generate component documentation and PropTypes
- **Migration Support**: Assist with framework migrations and version upgrades

## Quick Start

### Prerequisites
- Node.js 18+ 
- Redis server
- OpenAI API key

### Installation

```bash
# Clone the repository
git clone https://github.com/cognify-ai/cognify.git
cd cognify/services/frontend-agent

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Configuration

Update the `.env` file with your settings:

```env
# Required
OPENAI_API_KEY=sk-your-openai-api-key
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-key

# Optional
PORT=3001
NODE_ENV=development
LOG_LEVEL=info
```

### Running the Service

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm start

# With Docker
docker build -t frontend-agent .
docker run -p 3001:3001 frontend-agent
```

## API Documentation

Once the service is running, visit:
- **API Documentation**: http://localhost:3001/api-docs
- **Health Check**: http://localhost:3001/health
- **Metrics**: http://localhost:3001/metrics

### Key Endpoints

#### Code Generation
```http
POST /api/v1/code/generate/component
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "UserProfile",
  "framework": "react",
  "language": "typescript",
  "props": {
    "user": "User",
    "onEdit": "() => void"
  },
  "features": ["hooks", "responsive", "accessible"]
}
```

#### Code Optimization
```http
POST /api/v1/code/optimize
Content-Type: application/json
Authorization: Bearer <token>

{
  "code": "// Your component code here",
  "framework": "react",
  "optimizationType": "performance",
  "targetMetrics": ["bundle-size", "render-time"]
}
```

#### Code Review
```http
POST /api/v1/code/review
Content-Type: application/json
Authorization: Bearer <token>

{
  "code": "// Your code to review",
  "framework": "vue",
  "reviewType": "comprehensive",
  "strictness": "high"
}
```

## Architecture

### Service Structure
```
src/
├── config/          # Configuration files
├── controllers/     # Request handlers
├── middleware/      # Express middleware
├── routes/          # API route definitions
├── services/        # Business logic services
├── utils/           # Utility functions
├── validators/      # Input validation schemas
├── app.js          # Express application setup
└── server.js       # Server entry point
```

### Key Services
- **Frontend Service**: Core AI-powered code generation logic
- **Cache Service**: Redis-based caching for performance
- **Telemetry Service**: OpenTelemetry integration for monitoring
- **Validation Service**: Input validation and sanitization
- **Event Emitter**: Inter-service communication

### Middleware Stack
- **Authentication**: JWT and API key validation
- **Rate Limiting**: Redis-backed rate limiting
- **Validation**: Request/response validation
- **Security**: Helmet, CORS, XSS protection
- **Logging**: Structured logging with Winston
- **Error Handling**: Centralized error management

## Development

### Scripts
```bash
# Development
npm run dev          # Start with nodemon
npm run debug        # Start with debugger

# Testing
npm test             # Run tests
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report

# Code Quality
npm run lint         # ESLint
npm run lint:fix     # Fix linting issues
npm run format       # Prettier formatting
npm run validate     # Lint + test + format check

# Docker
npm run docker:build # Build Docker image
npm run docker:run   # Run container

# Health Checks
npm run health       # Check service health
npm run metrics      # Get metrics
```

### Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testPathPattern=services/frontendService

# Run tests with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Code Quality

The project uses:
- **ESLint**: Airbnb configuration with security plugins
- **Prettier**: Code formatting
- **Husky**: Git hooks for pre-commit validation
- **Jest**: Testing framework with coverage reporting

## Deployment

### Docker Deployment

```bash
# Build image
docker build -t cognify/frontend-agent .

# Run container
docker run -d \
  --name frontend-agent \
  -p 3001:3001 \
  -p 9464:9464 \
  -e OPENAI_API_KEY=your-key \
  -e REDIS_URL=redis://redis:6379 \
  cognify/frontend-agent
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend-agent
spec:
  replicas: 3
  selector:
    matchLabels:
      app: frontend-agent
  template:
    metadata:
      labels:
        app: frontend-agent
    spec:
      containers:
      - name: frontend-agent
        image: cognify/frontend-agent:latest
        ports:
        - containerPort: 3001
        - containerPort: 9464
        env:
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: openai-secret
              key: api-key
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Environment Variables

See `.env.example` for all available configuration options.

**Required:**
- `OPENAI_API_KEY`: OpenAI API key for AI features
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: Secret for JWT token validation

**Optional but Recommended:**
- `NODE_ENV`: Environment (development/production)
- `LOG_LEVEL`: Logging level (debug/info/warn/error)
- `TELEMETRY_ENABLED`: Enable OpenTelemetry tracing
- `PROMETHEUS_ENABLED`: Enable Prometheus metrics

## Monitoring

### Health Checks
- **Basic**: `GET /health` - Simple health status
- **Detailed**: `GET /health/detailed` - Comprehensive health with dependencies
- **Readiness**: `GET /health/ready` - Kubernetes readiness probe
- **Liveness**: `GET /health/live` - Kubernetes liveness probe

### Metrics
- **Prometheus**: Available at `/metrics` (port 9464)
- **Custom Metrics**: Request rates, response times, AI processing metrics
- **System Metrics**: Memory, CPU, Redis connection status

### Tracing
- **OpenTelemetry**: Distributed tracing support
- **Jaeger**: Compatible trace export
- **Custom Spans**: AI processing, cache operations, external API calls

## Security

### Authentication
- JWT token validation
- API key authentication
- Role-based access control

### Input Validation
- Joi schema validation
- XSS protection
- SQL injection prevention
- File upload restrictions

### Rate Limiting
- Redis-backed rate limiting
- Per-user and per-IP limits
- Separate limits for AI operations
- Burst protection

### Security Headers
- Helmet.js security headers
- CORS configuration
- Content Security Policy
- HSTS enforcement

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm run validate`
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push to branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Guidelines

- Follow the existing code style (ESLint + Prettier)
- Write tests for new features
- Update documentation as needed
- Use conventional commit messages
- Ensure all CI checks pass

## Troubleshooting

### Common Issues

**Service won't start:**
- Check Redis connection
- Verify OpenAI API key
- Check port availability
- Review environment variables

**AI requests failing:**
- Verify OpenAI API key and quota
- Check network connectivity
- Review rate limiting settings
- Check request payload size

**High memory usage:**
- Monitor cache size
- Check for memory leaks
- Review concurrent request limits
- Consider scaling horizontally

### Debugging

```bash
# Enable debug logging
DEBUG=frontend-agent:* npm run dev

# Start with Node.js debugger
npm run debug

# Check service health
curl http://localhost:3001/health/detailed

# View metrics
curl http://localhost:3001/metrics
```

### Logs

Logs are written to:
- Console (development)
- `./logs/` directory (production)
- Structured JSON format
- Daily rotation with compression

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [API Docs](http://localhost:3001/api-docs)
- **Issues**: [GitHub Issues](https://github.com/cognify-ai/cognify/issues)
- **Email**: dev@cognify.ai
- **Discord**: [Cognify Community](https://discord.gg/cognify)