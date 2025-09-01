const { Agent } = require('../models/Agent');
const { frontendService } = require('../services/frontendService');
const { logger } = require('../config/logger');
const { tracer } = require('../config/telemetry');

/**
 * Controller for handling agent-related HTTP requests
 */
class AgentController {
  constructor() {
    this.agent = null;
  }

  /**
   * Initialize the agent controller
   */
  async initialize() {
    try {
      this.agent = new Agent({
        id: process.env.AGENT_ID || `frontend-agent-${Date.now()}`,
        type: 'frontend',
        endpoint: `http://localhost:${process.env.PORT || 3002}`,
        capabilities: {
          frameworks: ['react', 'vue', 'angular', 'svelte'],
          languages: ['javascript', 'typescript', 'jsx', 'tsx'],
          styling: ['css', 'scss', 'tailwind', 'styled-components', 'emotion'],
          tools: ['webpack', 'vite', 'babel', 'eslint', 'prettier']
        },
        supportedTaskTypes: [
          'component_generation',
          'code_review',
          'optimization',
          'styling',
          'testing',
          'refactoring'
        ]
      });

      await this.agent.register();
      logger.info('Agent controller initialized successfully', {
        agentId: this.agent.id,
        type: this.agent.type
      });
    } catch (error) {
      logger.error('Failed to initialize agent controller', { error: error.message });
      throw error;
    }
  }

  /**
   * Get agent status
   */
  getStatus = async (req, res) => {
    const span = tracer.startSpan('agent.getStatus');
    
    try {
      if (!this.agent) {
        return res.status(503).json({
          success: false,
          error: 'Agent not initialized'
        });
      }

      const status = {
        id: this.agent.id,
        type: this.agent.type,
        status: this.agent.status,
        capabilities: this.agent.capabilities,
        supportedTaskTypes: this.agent.supportedTaskTypes,
        metrics: this.agent.metrics,
        lastHeartbeat: this.agent.lastHeartbeat,
        uptime: Date.now() - this.agent.startTime
      };

      res.json({
        success: true,
        data: status
      });

      logger.http('Agent status retrieved', {
        agentId: this.agent.id,
        status: this.agent.status
      });
    } catch (error) {
      logger.error('Error getting agent status', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    } finally {
      span.end();
    }
  };

  /**
   * Update agent capabilities
   */
  updateCapabilities = async (req, res) => {
    const span = tracer.startSpan('agent.updateCapabilities');
    
    try {
      if (!this.agent) {
        return res.status(503).json({
          success: false,
          error: 'Agent not initialized'
        });
      }

      const { capabilities } = req.body;
      
      if (!capabilities || typeof capabilities !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Invalid capabilities format'
        });
      }

      this.agent.capabilities = { ...this.agent.capabilities, ...capabilities };
      await this.agent.updateCapabilities(capabilities);

      res.json({
        success: true,
        data: {
          capabilities: this.agent.capabilities
        }
      });

      logger.info('Agent capabilities updated', {
        agentId: this.agent.id,
        capabilities
      });
    } catch (error) {
      logger.error('Error updating agent capabilities', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    } finally {
      span.end();
    }
  };

  /**
   * Get agent metrics
   */
  getMetrics = async (req, res) => {
    const span = tracer.startSpan('agent.getMetrics');
    
    try {
      if (!this.agent) {
        return res.status(503).json({
          success: false,
          error: 'Agent not initialized'
        });
      }

      const metrics = {
        ...this.agent.metrics,
        uptime: Date.now() - this.agent.startTime,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      };

      res.json({
        success: true,
        data: metrics
      });

      logger.http('Agent metrics retrieved', {
        agentId: this.agent.id
      });
    } catch (error) {
      logger.error('Error getting agent metrics', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    } finally {
      span.end();
    }
  };

  /**
   * Handle heartbeat from orchestrator
   */
  heartbeat = async (req, res) => {
    const span = tracer.startSpan('agent.heartbeat');
    
    try {
      if (!this.agent) {
        return res.status(503).json({
          success: false,
          error: 'Agent not initialized'
        });
      }

      await this.agent.heartbeat();

      res.json({
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          status: this.agent.status
        }
      });

      logger.debug('Heartbeat received', {
        agentId: this.agent.id
      });
    } catch (error) {
      logger.error('Error processing heartbeat', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    } finally {
      span.end();
    }
  };

  /**
   * Set agent to maintenance mode
   */
  setMaintenanceMode = async (req, res) => {
    const span = tracer.startSpan('agent.setMaintenanceMode');
    
    try {
      if (!this.agent) {
        return res.status(503).json({
          success: false,
          error: 'Agent not initialized'
        });
      }

      const { enabled = true } = req.body;
      
      if (enabled) {
        await this.agent.enterMaintenance();
      } else {
        await this.agent.exitMaintenance();
      }

      res.json({
        success: true,
        data: {
          maintenanceMode: enabled,
          status: this.agent.status
        }
      });

      logger.info('Agent maintenance mode changed', {
        agentId: this.agent.id,
        maintenanceMode: enabled
      });
    } catch (error) {
      logger.error('Error setting maintenance mode', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    } finally {
      span.end();
    }
  };

  /**
   * Health check endpoint
   */
  healthCheck = async (req, res) => {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        agent: this.agent ? {
          id: this.agent.id,
          status: this.agent.status,
          lastHeartbeat: this.agent.lastHeartbeat
        } : null
      };

      res.json(health);
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      res.status(503).json({
        status: 'unhealthy',
        error: error.message
      });
    }
  };

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      if (this.agent) {
        await this.agent.unregister();
        logger.info('Agent controller shutdown completed', {
          agentId: this.agent.id
        });
      }
    } catch (error) {
      logger.error('Error during agent controller shutdown', { error: error.message });
    }
  }
}

module.exports = { AgentController };