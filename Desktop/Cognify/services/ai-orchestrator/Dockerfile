# Multi-stage build for AI Orchestrator Service
FROM node:18-alpine AS base

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S orchestrator -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Change ownership to non-root user
RUN chown -R orchestrator:nodejs /app
USER orchestrator

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start the application
CMD ["dumb-init", "node", "index.js"]

# Development stage
FROM base AS development
USER root
RUN npm install --only=development
USER orchestrator
CMD ["dumb-init", "npm", "run", "dev"]

# Production stage
FROM base AS production
# Already configured for production in base stage