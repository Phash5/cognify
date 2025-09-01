# CI/CD Pipeline Documentation

This document describes the Continuous Integration and Continuous Deployment (CI/CD) pipeline implemented for the Cognify AI Platform.

## Overview

Our CI/CD pipeline is built using GitHub Actions and includes:
- Automated testing and code quality checks
- Security vulnerability scanning
- Docker containerization
- Automated deployments to staging and production
- Dependency management and updates

## Pipeline Components

### 1. Continuous Integration (CI)

**File**: `.github/workflows/ci.yml`

**Triggers**:
- Push to `main` and `develop` branches
- Pull requests to `main` and `develop` branches

**Jobs**:
- **Frontend Tests**: Runs React tests with coverage
- **Backend Tests**: Runs Node.js tests with coverage
- **Security Audit**: Snyk vulnerability scanning
- **Code Quality**: SonarCloud analysis
- **Integration Tests**: End-to-end testing

### 2. Continuous Deployment (CD)

**File**: `.github/workflows/cd.yml`

**Triggers**:
- Successful CI completion on `main` branch (staging)
- Tag pushes matching `v*` pattern (production)

**Jobs**:
- **Staging Deployment**: Deploys to staging environment
- **Production Deployment**: Deploys to production environment
- **Docker Build & Push**: Builds and pushes container images
- **Notifications**: Slack notifications for deployment status

### 3. Dependency Management

**File**: `.github/workflows/dependency-update.yml`

**Schedule**: Weekly (Sundays at 2 AM UTC)

**Features**:
- Automated dependency updates
- Security vulnerability scanning
- Automated PR creation for updates
- Test execution after updates

## Docker Configuration

### Development Environment

```bash
# Start all services
npm run docker:up

# Stop all services
npm run docker:down

# Build images
npm run docker:build
```

### Production Environment

```bash
# Production deployment
docker-compose -f docker-compose.prod.yml up -d
```

## Environment Setup

### Required Secrets

Configure these secrets in your GitHub repository:

#### Deployment
- `VERCEL_TOKEN`: Vercel deployment token
- `VERCEL_ORG_ID`: Vercel organization ID
- `VERCEL_PROJECT_ID_STAGING`: Staging project ID
- `VERCEL_PROJECT_ID_PRODUCTION`: Production project ID
- `RAILWAY_TOKEN`: Railway deployment token

#### Container Registry
- `GITHUB_TOKEN`: GitHub token for container registry

#### Code Quality & Security
- `SONAR_TOKEN`: SonarCloud authentication token
- `SNYK_TOKEN`: Snyk security scanning token

#### Notifications
- `SLACK_WEBHOOK_URL`: Slack webhook for notifications

#### Monitoring
- `SENTRY_AUTH_TOKEN`: Sentry error tracking token
- `SENTRY_ORG`: Sentry organization
- `SENTRY_PROJECT`: Sentry project name

### Environment Variables

Copy `.env.ci` to `.env` and configure:

```bash
cp .env.ci .env
# Edit .env with your actual values
```

## Available Scripts

### Root Level
```bash
npm run build:all          # Build both client and server
npm run test               # Run all tests
npm run test:integration   # Run integration tests
npm run lint               # Lint all code
npm run security:audit     # Security audit
npm run docker:build       # Build Docker images
npm run deploy:staging     # Deploy to staging
npm run deploy:production  # Deploy to production
```

### Client
```bash
cd client
npm run build              # Build React app
npm run test               # Run React tests
npm run test:coverage      # Run tests with coverage
npm run lint               # Lint React code
```

### Server
```bash
cd server
npm run test:ci            # Run tests for CI
npm run test:integration   # Run integration tests
npm run security:audit     # Security audit
npm run docker:build       # Build server Docker image
```

## Deployment Environments

### Staging
- **Trigger**: Push to `main` branch
- **URL**: `https://cognify-staging.vercel.app`
- **Database**: Staging MongoDB instance
- **Purpose**: Testing and validation

### Production
- **Trigger**: Git tag push (e.g., `v1.0.0`)
- **URL**: `https://cognify.vercel.app`
- **Database**: Production MongoDB instance
- **Purpose**: Live application

## Monitoring & Observability

### Code Quality
- **SonarCloud**: Code quality metrics and security hotspots
- **Coverage**: Test coverage reports
- **Linting**: ESLint for code style consistency

### Security
- **Snyk**: Vulnerability scanning for dependencies
- **npm audit**: Built-in security auditing
- **Dependabot**: Automated security updates

### Performance
- **Lighthouse**: Performance auditing in CI
- **Bundle analysis**: JavaScript bundle size monitoring

### Error Tracking
- **Sentry**: Real-time error monitoring
- **Health checks**: Application health monitoring

## Troubleshooting

### Common Issues

1. **CI Failures**
   - Check test failures in GitHub Actions logs
   - Verify environment variables are set
   - Ensure dependencies are up to date

2. **Deployment Failures**
   - Verify deployment secrets are configured
   - Check build logs for errors
   - Ensure environment variables are set correctly

3. **Docker Issues**
   - Verify Docker is running
   - Check Dockerfile syntax
   - Ensure all required files are included

### Debugging Commands

```bash
# Check CI locally
npm run test:ci
npm run lint
npm run security:audit

# Test Docker build
npm run docker:build
npm run docker:up

# Health check
npm run health:check
```

## Best Practices

1. **Branch Protection**
   - Require PR reviews
   - Require status checks to pass
   - Require branches to be up to date

2. **Security**
   - Regular dependency updates
   - Security scanning in CI
   - Secrets management

3. **Testing**
   - Maintain high test coverage (>80%)
   - Include integration tests
   - Test in staging before production

4. **Monitoring**
   - Set up alerts for failures
   - Monitor application performance
   - Track deployment metrics

## Contributing

When contributing to this project:

1. Create a feature branch from `develop`
2. Make your changes
3. Ensure all tests pass locally
4. Create a pull request to `develop`
5. Wait for CI checks to pass
6. Request code review
7. Merge after approval

## Support

For CI/CD related issues:
1. Check GitHub Actions logs
2. Review this documentation
3. Contact the DevOps team
4. Create an issue in the repository