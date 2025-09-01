# Frontend AI Agent Service Dockerfile
# Multi-stage build for optimized production image

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S frontend-agent -u 1001

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Set working directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S frontend-agent -u 1001

# Copy built application from builder stage
COPY --from=builder --chown=frontend-agent:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=frontend-agent:nodejs /app/package*.json ./
COPY --from=builder --chown=frontend-agent:nodejs /app/index.js ./
COPY --from=builder --chown=frontend-agent:nodejs /app/src ./src

# Create necessary directories
RUN mkdir -p /app/logs /app/temp && \
    chown -R frontend-agent:nodejs /app/logs /app/temp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3002
ENV METRICS_PORT=9464
ENV LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3002/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Expose ports
EXPOSE 3002 9464

# Switch to non-root user
USER frontend-agent

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "index.js"]

# Labels for metadata
LABEL maintainer="Cognify Team"
LABEL service="frontend-agent"
LABEL version="1.0.0"
LABEL description="Specialized AI Agent for Frontend Development Tasks"
LABEL org.opencontainers.image.title="Frontend AI Agent"
LABEL org.opencontainers.image.description="Microservice for handling frontend-specific AI tasks"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="Cognify"
LABEL org.opencontainers.image.licenses="MIT"