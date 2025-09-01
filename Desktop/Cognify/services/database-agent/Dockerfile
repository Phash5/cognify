# Database AI Agent Dockerfile
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
    && ln -sf python3 /usr/bin/python

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S cognify -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder --chown=cognify:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=cognify:nodejs . .

# Create necessary directories
RUN mkdir -p logs tmp/cache tmp/uploads && \
    chown -R cognify:nodejs logs tmp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3003
ENV HOST=0.0.0.0

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3003/api/health || exit 1

# Switch to non-root user
USER cognify

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "src/server.js"]

# OCI Image Labels
LABEL org.opencontainers.image.title="Database AI Agent"
LABEL org.opencontainers.image.description="AI-powered database development and optimization service"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.authors="Cognify Team <team@cognify.ai>"
LABEL org.opencontainers.image.url="https://github.com/cognify/cognify"
LABEL org.opencontainers.image.source="https://github.com/cognify/cognify/tree/main/services/database-agent"
LABEL org.opencontainers.image.vendor="Cognify"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.created="2024-01-20T00:00:00Z"
LABEL org.opencontainers.image.revision="main"