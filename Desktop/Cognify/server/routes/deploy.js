const express = require('express');
const Project = require('../models/Project');
const { auth, checkProjectAccess } = require('../middleware/auth');
const { asyncHandler, validationError, notFoundError, forbiddenError } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');
const { getSocketService } = require('../services/socketService');

const router = express.Router();

// @desc    Get deployment status for project
// @route   GET /api/deploy/:projectId/status
// @access  Private
router.get('/:projectId/status', auth, checkProjectAccess, asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.projectId);
  
  if (!project) {
    throw notFoundError('Project not found');
  }
  
  const deploymentStatus = {
    status: project.deployment.status,
    environment: project.deployment.environment,
    url: project.deployment.url,
    lastDeployment: project.deployment.lastDeployment,
    logs: project.deployment.logs.slice(-10), // Last 10 logs
    buildStatus: project.deployment.buildStatus,
    healthCheck: project.deployment.healthCheck
  };
  
  res.json({
    success: true,
    data: { deployment: deploymentStatus }
  });
}));

// @desc    Deploy project
// @route   POST /api/deploy/:projectId
// @access  Private
router.post('/:projectId', auth, checkProjectAccess, asyncHandler(async (req, res) => {
  const { environment = 'staging', buildCommand, startCommand } = req.body;
  
  const project = await Project.findById(req.params.projectId);
  
  if (!project) {
    throw notFoundError('Project not found');
  }
  
  // Check if user has deployment permissions
  const isOwner = project.owner.toString() === req.user._id.toString();
  const collaborator = project.collaborators.find(
    c => c.user.toString() === req.user._id.toString()
  );
  const canDeploy = isOwner || (collaborator && collaborator.permissions.includes('deploy'));
  
  if (!canDeploy) {
    throw forbiddenError('You do not have permission to deploy this project');
  }
  
  // Validate environment
  const validEnvironments = ['development', 'staging', 'production'];
  if (!validEnvironments.includes(environment)) {
    throw validationError(`Environment must be one of: ${validEnvironments.join(', ')}`);
  }
  
  // Start deployment process
  const deploymentId = generateDeploymentId();
  
  // Update project deployment status
  project.deployment.status = 'deploying';
  project.deployment.environment = environment;
  project.deployment.buildStatus = 'building';
  project.deployment.logs.push({
    timestamp: new Date(),
    level: 'info',
    message: `Deployment started by ${req.user.username}`,
    deploymentId
  });
  
  await project.save();
  
  // Simulate deployment process (in real implementation, this would trigger actual deployment)
  simulateDeployment(project, deploymentId, {
    environment,
    buildCommand: buildCommand || 'npm run build',
    startCommand: startCommand || 'npm start',
    userId: req.user._id
  });
  
  logger.info('Deployment started', {
    projectId: project._id,
    userId: req.user._id,
    environment,
    deploymentId
  });
  
  res.json({
    success: true,
    message: 'Deployment started successfully',
    data: {
      deploymentId,
      status: 'deploying',
      environment
    }
  });
}));

// @desc    Get deployment logs
// @route   GET /api/deploy/:projectId/logs
// @access  Private
router.get('/:projectId/logs', auth, checkProjectAccess, asyncHandler(async (req, res) => {
  const { limit = 50, level, deploymentId } = req.query;
  
  const project = await Project.findById(req.params.projectId);
  
  if (!project) {
    throw notFoundError('Project not found');
  }
  
  let logs = project.deployment.logs;
  
  // Filter by deployment ID if specified
  if (deploymentId) {
    logs = logs.filter(log => log.deploymentId === deploymentId);
  }
  
  // Filter by log level if specified
  if (level) {
    logs = logs.filter(log => log.level === level);
  }
  
  // Limit results
  logs = logs.slice(-parseInt(limit));
  
  res.json({
    success: true,
    data: { logs }
  });
}));

// @desc    Stop deployment
// @route   POST /api/deploy/:projectId/stop
// @access  Private
router.post('/:projectId/stop', auth, checkProjectAccess, asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.projectId);
  
  if (!project) {
    throw notFoundError('Project not found');
  }
  
  // Check if user has deployment permissions
  const isOwner = project.owner.toString() === req.user._id.toString();
  const collaborator = project.collaborators.find(
    c => c.user.toString() === req.user._id.toString()
  );
  const canDeploy = isOwner || (collaborator && collaborator.permissions.includes('deploy'));
  
  if (!canDeploy) {
    throw forbiddenError('You do not have permission to stop deployment');
  }
  
  if (project.deployment.status !== 'deploying') {
    throw validationError('No active deployment to stop');
  }
  
  // Stop deployment
  project.deployment.status = 'stopped';
  project.deployment.buildStatus = 'cancelled';
  project.deployment.logs.push({
    timestamp: new Date(),
    level: 'warn',
    message: `Deployment stopped by ${req.user.username}`
  });
  
  await project.save();
  
  logger.info('Deployment stopped', {
    projectId: project._id,
    userId: req.user._id
  });
  
  res.json({
    success: true,
    message: 'Deployment stopped successfully'
  });
}));

// @desc    Get available deployment environments
// @route   GET /api/deploy/environments
// @access  Private
router.get('/environments', auth, asyncHandler(async (req, res) => {
  const environments = [
    {
      name: 'development',
      description: 'Development environment for testing',
      features: ['Hot reload', 'Debug mode', 'Development tools'],
      url: 'https://dev-{project-name}.cognify.app'
    },
    {
      name: 'staging',
      description: 'Staging environment for pre-production testing',
      features: ['Production-like', 'Testing tools', 'Performance monitoring'],
      url: 'https://staging-{project-name}.cognify.app'
    },
    {
      name: 'production',
      description: 'Production environment for live applications',
      features: ['High availability', 'Auto-scaling', 'Monitoring', 'CDN'],
      url: 'https://{project-name}.cognify.app'
    }
  ];
  
  res.json({
    success: true,
    data: { environments }
  });
}));

// @desc    Get deployment metrics
// @route   GET /api/deploy/:projectId/metrics
// @access  Private
router.get('/:projectId/metrics', auth, checkProjectAccess, asyncHandler(async (req, res) => {
  const { timeRange = '24h' } = req.query;
  
  const project = await Project.findById(req.params.projectId);
  
  if (!project) {
    throw notFoundError('Project not found');
  }
  
  // Simulate deployment metrics (in real implementation, this would come from monitoring services)
  const metrics = generateDeploymentMetrics(project, timeRange);
  
  res.json({
    success: true,
    data: { metrics }
  });
}));

// @desc    Configure deployment settings
// @route   PUT /api/deploy/:projectId/config
// @access  Private
router.put('/:projectId/config', auth, checkProjectAccess, asyncHandler(async (req, res) => {
  const {
    autoScale,
    minInstances,
    maxInstances,
    healthCheckPath,
    environmentVariables,
    buildCommand,
    startCommand
  } = req.body;
  
  const project = await Project.findById(req.params.projectId);
  
  if (!project) {
    throw notFoundError('Project not found');
  }
  
  // Check if user has deployment permissions
  const isOwner = project.owner.toString() === req.user._id.toString();
  const collaborator = project.collaborators.find(
    c => c.user.toString() === req.user._id.toString()
  );
  const canDeploy = isOwner || (collaborator && collaborator.permissions.includes('deploy'));
  
  if (!canDeploy) {
    throw forbiddenError('You do not have permission to configure deployment');
  }
  
  // Update deployment configuration
  const deploymentConfig = {
    autoScale: autoScale !== undefined ? autoScale : project.deployment.config?.autoScale || false,
    minInstances: minInstances || project.deployment.config?.minInstances || 1,
    maxInstances: maxInstances || project.deployment.config?.maxInstances || 3,
    healthCheckPath: healthCheckPath || project.deployment.config?.healthCheckPath || '/health',
    environmentVariables: environmentVariables || project.deployment.config?.environmentVariables || {},
    buildCommand: buildCommand || project.deployment.config?.buildCommand || 'npm run build',
    startCommand: startCommand || project.deployment.config?.startCommand || 'npm start'
  };
  
  project.deployment.config = deploymentConfig;
  await project.save();
  
  logger.info('Deployment configuration updated', {
    projectId: project._id,
    userId: req.user._id,
    config: deploymentConfig
  });
  
  res.json({
    success: true,
    message: 'Deployment configuration updated successfully',
    data: { config: deploymentConfig }
  });
}));

// Helper function to generate deployment ID
const generateDeploymentId = () => {
  return `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Helper function to simulate deployment process
const simulateDeployment = async (project, deploymentId, options) => {
  const { environment, buildCommand, startCommand, userId } = options;
  const socketService = getSocketService();
  
  try {
    // Simulate build process
    setTimeout(async () => {
      const logEntry = {
        timestamp: new Date(),
        level: 'info',
        message: `Running build command: ${buildCommand}`,
        deploymentId
      };
      
      project.deployment.logs.push(logEntry);
      await project.save();
      
      // Emit real-time update
      if (socketService) {
        socketService.notifyDeploymentUpdate(project._id, {
          status: 'building',
          logs: [logEntry],
          deploymentId
        });
      }
    }, 1000);
    
    // Simulate build completion
    setTimeout(async () => {
      const logEntry = {
        timestamp: new Date(),
        level: 'info',
        message: 'Build completed successfully',
        deploymentId
      };
      
      project.deployment.buildStatus = 'success';
      project.deployment.logs.push(logEntry);
      await project.save();
      
      // Emit real-time update
      if (socketService) {
        socketService.notifyDeploymentUpdate(project._id, {
          status: 'deploying',
          buildStatus: 'success',
          logs: [logEntry],
          deploymentId
        });
      }
    }, 5000);
    
    // Simulate deployment completion
    setTimeout(async () => {
      const projectName = project.name.toLowerCase().replace(/\s+/g, '-');
      const deploymentUrl = `https://${environment === 'production' ? '' : environment + '-'}${projectName}.cognify.app`;
      
      const logEntry = {
        timestamp: new Date(),
        level: 'success',
        message: `Deployment completed successfully. Available at: ${deploymentUrl}`,
        deploymentId
      };
      
      const healthCheck = {
        status: 'healthy',
        lastCheck: new Date(),
        responseTime: Math.floor(Math.random() * 100) + 50 // Random response time
      };
      
      project.deployment.status = 'deployed';
      project.deployment.url = deploymentUrl;
      project.deployment.lastDeployment = new Date();
      project.deployment.healthCheck = healthCheck;
      project.deployment.logs.push(logEntry);
      
      await project.save();
      
      // Emit real-time update
      if (socketService) {
        socketService.notifyDeploymentUpdate(project._id, {
          status: 'deployed',
          url: deploymentUrl,
          healthCheck,
          logs: [logEntry],
          deploymentId,
          lastDeployment: new Date()
        });
      }
      
      logger.info('Deployment completed', {
        projectId: project._id,
        userId,
        environment,
        url: deploymentUrl,
        deploymentId
      });
    }, 10000);
    
  } catch (error) {
    // Handle deployment failure
    setTimeout(async () => {
      const logEntry = {
        timestamp: new Date(),
        level: 'error',
        message: `Deployment failed: ${error.message}`,
        deploymentId
      };
      
      project.deployment.status = 'failed';
      project.deployment.buildStatus = 'failed';
      project.deployment.logs.push(logEntry);
      
      await project.save();
      
      // Emit real-time update
      if (socketService) {
        socketService.notifyDeploymentUpdate(project._id, {
          status: 'failed',
          buildStatus: 'failed',
          logs: [logEntry],
          deploymentId,
          error: error.message
        });
      }
      
      logger.error('Deployment failed', {
        projectId: project._id,
        userId,
        error: error.message,
        deploymentId
      });
    }, 8000);
  }
};

// Helper function to generate deployment metrics
const generateDeploymentMetrics = (project, timeRange) => {
  // Simulate metrics data
  const now = new Date();
  const hoursBack = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 1;
  
  const metrics = {
    uptime: {
      percentage: 99.9,
      totalTime: hoursBack * 60 * 60 * 1000,
      downtime: hoursBack * 60 * 60 * 1000 * 0.001
    },
    performance: {
      averageResponseTime: Math.floor(Math.random() * 200) + 100,
      requestsPerMinute: Math.floor(Math.random() * 1000) + 500,
      errorRate: Math.random() * 0.01 // 0-1% error rate
    },
    resources: {
      cpuUsage: Math.random() * 80 + 10, // 10-90% CPU usage
      memoryUsage: Math.random() * 70 + 20, // 20-90% memory usage
      diskUsage: Math.random() * 50 + 30 // 30-80% disk usage
    },
    scaling: {
      currentInstances: project.deployment.config?.minInstances || 1,
      maxInstances: project.deployment.config?.maxInstances || 3,
      autoScaleEvents: Math.floor(Math.random() * 5)
    },
    traffic: {
      totalRequests: Math.floor(Math.random() * 10000) + 5000,
      uniqueVisitors: Math.floor(Math.random() * 1000) + 500,
      bandwidth: Math.floor(Math.random() * 100) + 50 // GB
    }
  };
  
  return metrics;
};

module.exports = router;