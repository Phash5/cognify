# Backend AI Agent Dockerfile
# Multi-stage build for optimized production image

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend-agent -u 1001 -G nodejs

# Copy package files
COPY package*.json ./

# Copy production dependencies from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY --chown=backend-agent:nodejs src/ ./src/

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3002
ENV HOST=0.0.0.0

# Create logs directory
RUN mkdir -p /app/logs && chown -R backend-agent:nodejs /app/logs

# Create temp directory for file uploads
RUN mkdir -p /app/temp && chown -R backend-agent:nodejs /app/temp

# Switch to non-root user
USER backend-agent

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "src/server.js"]

# Labels for metadata
LABEL maintainer="Cognify Team <team@cognify.dev>"
LABEL version="1.0.0"
LABEL description="Backend AI Agent - AI-powered backend development assistant"
LABEL org.opencontainers.image.title="Backend AI Agent"
LABEL org.opencontainers.image.description="AI-powered backend development assistant microservice"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="Cognify"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/cognify/cognify"