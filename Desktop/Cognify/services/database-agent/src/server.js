/**
 * Database AI Agent Server
 * Entry point for the Database AI Agent service
 */

'use strict';

const app = require('./app');
const config = require('./config/config');
const logger = require('./utils/logger');
const { telemetryService } = require('./utils/telemetry');

// Initialize telemetry
telemetryService.init();

// Start server
const server = app.listen(config.server.port, config.server.host, () => {
  const address = server.address();
  const host = address.address === '::' ? 'localhost' : address.address;
  const port = address.port;
  
  logger.logStartup(`Database AI Agent server started`, {
    host,
    port,
    env: config.server.env,
    nodeVersion: process.version,
    pid: process.pid,
    timestamp: new Date().toISOString(),
  });
  
  // Log configuration summary
  logger.logConfig({
    server: {
      host: config.server.host,
      port: config.server.port,
      env: config.server.env,
    },
    features: {
      openai: config.openai.enabled,
      cache: config.cache.enabled,
      rateLimit: config.rateLimit.enabled,
      telemetry: config.telemetry.enabled,
    },
    database: {
      supportedTypes: config.database.supportedTypes,
      defaultTimeout: config.database.defaultTimeout,
    },
  });
  
  // Record startup metrics
  telemetryService.incrementCounter('service_starts_total', {
    service: 'database-agent',
    version: '1.0.0',
  });
  
  telemetryService.recordGauge('service_info', 1, {
    service: 'database-agent',
    version: '1.0.0',
    node_version: process.version,
    env: config.server.env,
  });
});

// Store server reference for graceful shutdown
app.server = server;

// Handle server errors
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }
  
  const bind = typeof config.server.port === 'string'
    ? 'Pipe ' + config.server.port
    : 'Port ' + config.server.port;
  
  switch (error.code) {
    case 'EACCES':
      logger.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      logger.error('Server error', {
        error: error.message,
        code: error.code,
        stack: error.stack,
      });
      throw error;
  }
});

// Handle server listening
server.on('listening', () => {
  const address = server.address();
  const bind = typeof address === 'string'
    ? 'pipe ' + address
    : 'port ' + address.port;
  
  logger.info(`Database AI Agent listening on ${bind}`);
});

// Handle server close
server.on('close', () => {
  logger.logShutdown('Database AI Agent server closed');
});

module.exports = server;