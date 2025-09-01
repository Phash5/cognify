# Service Discovery

A robust, scalable service registry and discovery microservice for the Cognify AI platform. This service provides centralized service registration, health monitoring, load balancing, and service discovery capabilities for distributed microservices architecture.

## Features

### Core Service Registry
- **Service Registration**: Register service instances with metadata, health check URLs, and tags
- **Service Discovery**: Find and retrieve healthy service instances with filtering options
- **Health Monitoring**: Automated health checks with configurable intervals and failure thresholds
- **Heartbeat Management**: Track service liveness through periodic heartbeat updates
- **TTL Management**: Automatic cleanup of expired service instances

### Load Balancing
- **Multiple Strategies**: Round-robin, least connections, random, and weighted load balancing
- **Zone Awareness**: Route traffic based on availability zones or regions
- **Connection Tracking**: Monitor active connections per service instance

### High Availability
- **Redis Persistence**: Optional Redis backend for service registry persistence
- **Graceful Degradation**: Continue operation even if Redis is unavailable
- **Cluster Support**: Designed for horizontal scaling and clustering

### Monitoring & Observability
- **OpenTelemetry Integration**: Distributed tracing with Jaeger support
- **Prometheus Metrics**: Comprehensive metrics for monitoring and alerting
- **Structured Logging**: JSON-formatted logs with request correlation
- **Health Endpoints**: Built-in health and readiness checks

### Security
- **API Key Authentication**: Secure API access with configurable API keys
- **Rate Limiting**: Protect against abuse with configurable rate limits
- **CORS Support**: Cross-origin resource sharing configuration
- **Security Headers**: Helmet.js integration for security best practices

### Developer Experience
- **RESTful API**: Clean, intuitive REST API for all operations
- **Debug Endpoints**: Development-only endpoints for debugging and testing
- **Mock Services**: Built-in mock service registration for testing
- **Comprehensive Documentation**: Detailed API documentation and examples

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Redis (optional, for persistence)
- Docker (optional, for containerized deployment)

### Installation

1. **Clone and install dependencies**:
   ```bash
   cd services/service-discovery
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the service**:
   ```bash
   npm start
   ```

### Docker Deployment

1. **Build the image**:
   ```bash
   docker build -t cognify/service-discovery .
   ```

2. **Run with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

## API Documentation

### Base URL
```
http://localhost:3004/api/v1
```

### Authentication
Include API key in headers:
```bash
X-API-Key: your-api-key
# or
Authorization: Bearer your-api-key
```

### Service Registration

**Register a service instance**:
```bash
POST /services/register
Content-Type: application/json

{
  "name": "user-service",
  "host": "localhost",
  "port": 3001,
  "protocol": "http",
  "version": "1.0.0",
  "healthCheckUrl": "http://localhost:3001/health",
  "metadata": {
    "region": "us-east-1",
    "datacenter": "dc1"
  },
  "tags": ["api", "user-management"],
  "zone": "us-east-1a",
  "weight": 1,
  "ttl": 300
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "instanceId": "uuid-here",
    "status": "registered",
    "heartbeatInterval": 30000,
    "ttl": 300
  },
  "timestamp": "2024-01-20T10:00:00.000Z"
}
```

### Service Discovery

**Discover service instances**:
```bash
GET /services/user-service?healthyOnly=true&zone=us-east-1a&loadBalance=true&strategy=round_robin
```

**Response**:
```json
{
  "success": true,
  "data": {
    "serviceName": "user-service",
    "instances": [
      {
        "id": "uuid-here",
        "host": "localhost",
        "port": 3001,
        "protocol": "http",
        "version": "1.0.0",
        "status": "healthy",
        "metadata": {
          "region": "us-east-1",
          "datacenter": "dc1"
        },
        "tags": ["api", "user-management"],
        "zone": "us-east-1a",
        "weight": 1,
        "connections": 5,
        "lastHealthCheck": "2024-01-20T09:59:30.000Z",
        "url": "http://localhost:3001"
      }
    ],
    "totalInstances": 3,
    "healthyInstances": 2,
    "loadBalancing": {
      "strategy": "round_robin",
      "applied": true
    }
  },
  "timestamp": "2024-01-20T10:00:00.000Z"
}
```

### Service Management

**Update heartbeat**:
```bash
POST /services/{instanceId}/heartbeat
```

**Deregister service**:
```bash
DELETE /services/{instanceId}
```

**List all services**:
```bash
GET /services
```

### Health & Monitoring

**Health check**:
```bash
GET /health
```

**Readiness check**:
```bash
GET /ready
```

**Metrics**:
```bash
GET /metrics
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|----------|
| `NODE_ENV` | Environment (development/production) | `development` |
| `PORT` | Server port | `3004` |
| `HOST` | Server host | `localhost` |
| `REDIS_ENABLED` | Enable Redis persistence | `false` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `API_KEY_ENABLED` | Enable API key authentication | `false` |
| `API_KEYS` | Comma-separated API keys | `` |
| `TELEMETRY_ENABLED` | Enable OpenTelemetry | `false` |
| `JAEGER_ENDPOINT` | Jaeger collector endpoint | `` |
| `PROMETHEUS_ENABLED` | Enable Prometheus metrics | `false` |

### Service Registry Configuration

```javascript
{
  "registry": {
    "defaultTtl": 300,
    "heartbeatInterval": 30000,
    "healthCheckInterval": 60000,
    "cleanupInterval": 120000,
    "maxRetries": 3,
    "loadBalancing": {
      "strategy": "round_robin"
    },
    "zones": {
      "default": "us-east-1a"
    }
  }
}
```

## Architecture

### Service Structure
```
src/
├── config/
│   └── config.js          # Configuration management
├── services/
│   └── serviceRegistry.js # Core service registry logic
├── utils/
│   ├── logger.js          # Structured logging
│   └── telemetry.js       # OpenTelemetry integration
└── server.js              # Express server and API routes
```

### Key Components

- **ServiceRegistry**: Core service registry with in-memory storage and Redis persistence
- **Health Monitor**: Automated health checking with configurable intervals
- **Load Balancer**: Multiple load balancing strategies for service selection
- **Telemetry**: OpenTelemetry integration for tracing and metrics
- **Logger**: Structured logging with multiple transports

### Data Flow

1. **Service Registration**: Services register with metadata and health check URLs
2. **Health Monitoring**: Periodic health checks update service status
3. **Service Discovery**: Clients query for healthy service instances
4. **Load Balancing**: Apply load balancing strategy to select instances
5. **Cleanup**: Remove expired or unhealthy services automatically

## Development

### Code Style
- ESLint configuration for consistent code style
- Prettier for code formatting
- Husky for pre-commit hooks

### Testing
```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Development Server
```bash
# Start with auto-reload
npm run dev

# Start with debugging
npm run debug
```

### Debug Endpoints

When `NODE_ENV=development`:

- `GET /debug/registry` - View complete registry state
- `POST /debug/mock-service` - Register a mock service for testing

## Deployment

### Docker

**Single container**:
```bash
docker run -d \
  --name service-discovery \
  -p 3004:3004 \
  -e NODE_ENV=production \
  -e REDIS_ENABLED=true \
  -e REDIS_HOST=redis \
  cognify/service-discovery
```

**With Docker Compose**:
```yaml
version: '3.8'
services:
  service-discovery:
    build: .
    ports:
      - "3004:3004"
    environment:
      - NODE_ENV=production
      - REDIS_ENABLED=true
      - REDIS_HOST=redis
    depends_on:
      - redis
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

### Kubernetes

**Deployment**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: service-discovery
spec:
  replicas: 3
  selector:
    matchLabels:
      app: service-discovery
  template:
    metadata:
      labels:
        app: service-discovery
    spec:
      containers:
      - name: service-discovery
        image: cognify/service-discovery:latest
        ports:
        - containerPort: 3004
        env:
        - name: NODE_ENV
          value: "production"
        - name: REDIS_ENABLED
          value: "true"
        - name: REDIS_HOST
          value: "redis-service"
        livenessProbe:
          httpGet:
            path: /health
            port: 3004
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3004
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Environment-Specific Configurations

**Development**:
- Debug endpoints enabled
- Verbose logging
- Mock services support
- Hot reloading

**Staging**:
- Production-like configuration
- Reduced logging verbosity
- Health checks enabled
- Metrics collection

**Production**:
- Security hardening
- Performance optimization
- Comprehensive monitoring
- Error tracking

## Monitoring

### Health Checks

- **Liveness**: `/health` - Service is running
- **Readiness**: `/ready` - Service is ready to accept traffic
- **Metrics**: `/metrics` - Service metrics and statistics

### Prometheus Metrics

- `service_registrations_total` - Total service registrations
- `service_deregistrations_total` - Total service deregistrations
- `service_discoveries_total` - Total service discoveries
- `health_checks_total` - Total health checks performed
- `services_registered` - Currently registered services
- `service_instances_healthy` - Healthy service instances
- `http_requests_total` - HTTP request count
- `http_request_duration` - HTTP request duration

### Logging

**Log Levels**: `error`, `warn`, `info`, `debug`

**Log Format**:
```json
{
  "timestamp": "2024-01-20T10:00:00.000Z",
  "level": "info",
  "service": "service-discovery",
  "message": "Service registered",
  "serviceName": "user-service",
  "instanceId": "uuid-here",
  "requestId": "req-uuid"
}
```

### Distributed Tracing

- **Jaeger Integration**: Distributed tracing for request flows
- **Span Attributes**: Service names, instance IDs, operation types
- **Error Tracking**: Exception recording and error spans

## Security

### Authentication
- API key-based authentication
- Configurable API key validation
- Request rate limiting

### Security Headers
- Content Security Policy
- HSTS (HTTP Strict Transport Security)
- X-Frame-Options
- X-Content-Type-Options

### Input Validation
- Request payload validation
- Parameter sanitization
- Error message sanitization

### Rate Limiting
- General rate limiting for all endpoints
- Service-specific rate limits
- IP-based rate limiting

## Troubleshooting

### Common Issues

**Service registration fails**:
- Check API key configuration
- Verify required fields (name, host, port)
- Check rate limiting settings

**Health checks failing**:
- Verify health check URL accessibility
- Check network connectivity
- Review health check timeout settings

**Redis connection issues**:
- Verify Redis server availability
- Check connection credentials
- Review network configuration

**High memory usage**:
- Monitor service instance count
- Check cleanup interval settings
- Review TTL configurations

### Debug Commands

```bash
# Check service status
curl http://localhost:3004/health

# View registry state (development only)
curl http://localhost:3004/debug/registry

# Test service registration
curl -X POST http://localhost:3004/api/v1/services/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"name":"test","host":"localhost","port":3000}'

# Test service discovery
curl "http://localhost:3004/api/v1/services/test" \
  -H "X-API-Key: your-key"
```

### Log Analysis

```bash
# View recent logs
tail -f logs/service-discovery.log

# Filter error logs
grep '"level":"error"' logs/service-discovery.log

# Monitor service registrations
grep '"message":"Service registered"' logs/service-discovery.log
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

### Development Guidelines

- Follow existing code style
- Add comprehensive tests
- Update documentation
- Use semantic commit messages

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the API documentation

## Roadmap

- [ ] gRPC support for service communication
- [ ] Service mesh integration (Istio, Linkerd)
- [ ] Advanced load balancing algorithms
- [ ] Service dependency tracking
- [ ] Circuit breaker integration
- [ ] Multi-datacenter support
- [ ] GraphQL API support
- [ ] WebSocket support for real-time updates