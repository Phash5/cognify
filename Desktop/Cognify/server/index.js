const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const chatRoutes = require('./routes/chat');
const aiRoutes = require('./routes/ai');
const deployRoutes = require('./routes/deploy');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { logger, requestLogger } = require('./middleware/logger');

// Import services
const connectDB = require('./config/database');
const { SocketService, setSocketService } = require('./services/socketService');
const swaggerConfig = require('./config/swagger');
const eventEmitter = require('./src/events/eventEmitter');
const telemetryService = require('./src/config/telemetry');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Connect to database
connectDB();

// Initialize telemetry (must be done early)
telemetryService.initialize().catch(err => {
  logger.error('Failed to initialize telemetry:', err);
});

// Initialize event system
eventEmitter.initialize().catch(err => {
  logger.error('Failed to initialize event system:', err);
});

// Setup Swagger documentation
const specs = swaggerJsdoc(swaggerConfig);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Cognify API Documentation'
}));

// Security middleware
app.use(helmet());
app.use(compression());

// Add telemetry middleware for HTTP tracking
app.use(telemetryService.createHttpMiddleware());

// Rate limiting
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(requestLogger);

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const telemetryHealth = telemetryService.getHealthStatus();
    const eventBusHealth = await eventEmitter.healthCheck();
    
    const overallStatus = telemetryHealth.status === 'healthy' && eventBusHealth.status === 'healthy' ? 'OK' : 'DEGRADED';
    
    res.status(200).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        telemetry: telemetryHealth,
        eventBus: eventBusHealth
      },
      endpoints: {
        api_docs: '/api-docs',
        metrics: `http://localhost:${telemetryHealth.prometheus_port}/metrics`
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// API health endpoint for detailed service status
app.get('/api/health', async (req, res) => {
  try {
    const telemetryHealth = telemetryService.getHealthStatus();
    const eventBusHealth = await eventEmitter.healthCheck();
    
    res.status(200).json({
      success: true,
      data: {
        services: {
          telemetry: telemetryHealth,
          eventBus: eventBusHealth
        },
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          version: process.version,
          platform: process.platform
        }
      }
    });
  } catch (error) {
    logger.error('API health check failed:', error);
    res.status(503).json({
      success: false,
      error: {
        message: 'Health check failed',
        details: error.message
      }
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/deploy', deployRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling middleware
app.use(errorHandler);

// Socket.io connection handling
const socketService = new SocketService(io);
setSocketService(socketService);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await gracefulShutdown();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await gracefulShutdown();
});

async function gracefulShutdown() {
  try {
    // Stop accepting new connections
    server.close(async () => {
      logger.info('HTTP server closed');
      
      // Shutdown telemetry
      try {
        await telemetryService.shutdown();
        logger.info('Telemetry service shutdown completed');
      } catch (error) {
        logger.error('Error shutting down telemetry:', error);
      }
      
      // Shutdown event system
      try {
        await eventEmitter.disconnect();
        logger.info('Event system shutdown completed');
      } catch (error) {
        logger.error('Error shutting down event system:', error);
      }
      
      logger.info('Process terminated');
      process.exit(0);
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
    
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Cognify AI Platform server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 CORS enabled for: ${corsOptions.origin}`);
});

module.exports = { app, server, io };