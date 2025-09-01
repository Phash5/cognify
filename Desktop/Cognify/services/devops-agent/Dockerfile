# DevOps AI Agent Dockerfile
# Multi-stage build for production optimization

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --silent

# Copy source code
COPY src/ ./src/

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S devops -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=devops:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=devops:nodejs /app/src ./src
COPY --chown=devops:nodejs package*.json ./

# Create necessary directories
RUN mkdir -p /app/logs /app/tmp && \
    chown -R devops:nodejs /app/logs /app/tmp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3003
ENV HOST=0.0.0.0

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3003/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Switch to non-root user
USER devops

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "src/server.js"]

# OCI Image Labels
LABEL org.opencontainers.image.title="DevOps AI Agent"
LABEL org.opencontainers.image.description="AI-powered DevOps automation service for deployment, infrastructure, monitoring, and configuration management"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.authors="Cognify AI Team"
LABEL org.opencontainers.image.url="https://github.com/cognify-ai/devops-agent"
LABEL org.opencontainers.image.source="https://github.com/cognify-ai/devops-agent"
LABEL org.opencontainers.image.vendor="Cognify AI"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.created="2024-01-20T00:00:00Z"
LABEL org.opencontainers.image.revision="main"