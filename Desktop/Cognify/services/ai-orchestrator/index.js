const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

// Import configurations and services
const swaggerConfig = require('./src/config/swagger');
const telemetryService = require('./src/config/telemetry');
const eventBus = require('./src/services/eventBus');
const orchestratorService = require('./src/services/orchestratorService');
const logger = require('./src/middleware/logger');
const errorHandler = require('./src/middleware/errorHandler');

// Import routes
const orchestratorRoutes = require('./src/controllers/orchestratorController');
const agentRoutes = require('./src/controllers/agentController');
const taskRoutes = require('./src/controllers/taskController');

const app = express();
const PORT = process.env.ORCHESTRATOR_PORT || 3001;

// Initialize telemetry
telemetryService.init();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Telemetry middleware
app.use(telemetryService.httpMiddleware());

// Swagger documentation
const specs = swaggerJsdoc(swaggerConfig);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// API routes
app.use('/api/orchestrator', orchestratorRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/tasks', taskRoutes);

// Health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'ai-orchestrator',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/health', async (req, res) => {
  try {
    const telemetryHealth = await telemetryService.healthCheck();
    const eventBusHealth = await eventBus.healthCheck();
    const orchestratorHealth = await orchestratorService.healthCheck();

    const overallHealth = telemetryHealth.status === 'healthy' && 
                         eventBusHealth.status === 'healthy' && 
                         orchestratorHealth.status === 'healthy';

    res.status(overallHealth ? 200 : 503).json({
      status: overallHealth ? 'healthy' : 'unhealthy',
      service: 'ai-orchestrator',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        telemetry: telemetryHealth,
        eventBus: eventBusHealth,
        orchestrator: orchestratorHealth
      },
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'ai-orchestrator',
      error: error.message
    });
  }
});

// Metrics endpoint
app.get('/metrics', telemetryService.metricsHandler());

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    service: 'ai-orchestrator'
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close telemetry
    await telemetryService.shutdown();
    
    // Close event bus connections
    await eventBus.disconnect();
    
    // Close orchestrator service
    await orchestratorService.shutdown();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    // Initialize event bus
    await eventBus.connect();
    logger.info('Event bus connected');
    
    // Initialize orchestrator service
    await orchestratorService.init();
    logger.info('Orchestrator service initialized');
    
    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`AI Orchestrator service running on port ${PORT}`);
      logger.info(`API Documentation: http://localhost:${PORT}/api-docs`);
      logger.info(`Health Check: http://localhost:${PORT}/health`);
      logger.info(`Metrics: http://localhost:${PORT}/metrics`);
    });
  } catch (error) {
    logger.error('Failed to start AI Orchestrator service:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;