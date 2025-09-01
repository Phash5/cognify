const { Task } = require('../models/Task');
const { frontendService } = require('../services/frontendService');
const { logger } = require('../config/logger');
const { tracer } = require('../config/telemetry');
const { v4: uuidv4 } = require('uuid');

/**
 * Controller for handling task-related HTTP requests
 */
class TaskController {
  constructor() {
    this.tasks = new Map();
  }

  /**
   * Create a new task
   */
  createTask = async (req, res) => {
    const span = tracer.startSpan('task.create');
    
    try {
      const {
        type,
        description,
        framework,
        language,
        styling,
        requirements,
        constraints,
        context,
        priority = 'medium'
      } = req.body;

      // Validate required fields
      if (!type || !description) {
        return res.status(400).json({
          success: false,
          error: 'Type and description are required'
        });
      }

      // Validate task type
      const validTypes = [
        'component_generation',
        'code_review',
        'optimization',
        'styling',
        'testing',
        'refactoring'
      ];

      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid task type. Must be one of: ${validTypes.join(', ')}`
        });
      }

      const taskId = uuidv4();
      const task = new Task({
        id: taskId,
        type,
        description,
        framework,
        language,
        styling,
        requirements,
        constraints,
        context,
        priority
      });

      // Validate the task
      const validation = task.validate();
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'Task validation failed',
          details: validation.errors
        });
      }

      // Store the task
      this.tasks.set(taskId, task);

      // Add task to frontend service for processing
      await frontendService.addTask(task);

      res.status(201).json({
        success: true,
        data: {
          id: task.id,
          type: task.type,
          status: task.status,
          priority: task.priority,
          createdAt: task.createdAt,
          estimatedDuration: task.estimateCompletionTime(),
          complexity: task.calculateComplexity()
        }
      });

      logger.info('Task created successfully', {
        taskId: task.id,
        type: task.type,
        priority: task.priority
      });
    } catch (error) {
      logger.error('Error creating task', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    } finally {
      span.end();
    }
  };

  /**
   * Get task by ID
   */
  getTask = async (req, res) => {
    const span = tracer.startSpan('task.get');
    
    try {
      const { taskId } = req.params;
      
      if (!taskId) {
        return res.status(400).json({
          success: false,
          error: 'Task ID is required'
        });
      }

      const task = this.tasks.get(taskId);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found'
        });
      }

      res.json({
        success: true,
        data: {
          id: task.id,
          type: task.type,
          description: task.description,
          framework: task.framework,
          language: task.language,
          styling: task.styling,
          requirements: task.requirements,
          constraints: task.constraints,
          context: task.context,
          priority: task.priority,
          status: task.status,
          progress: task.progress,
          result: task.result,
          error: task.error,
          createdAt: task.createdAt,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
          assignedAgent: task.assignedAgent,
          estimatedDuration: task.estimateCompletionTime(),
          complexity: task.calculateComplexity(),
          duration: task.getDuration()
        }
      });

      logger.http('Task retrieved', {
        taskId: task.id,
        status: task.status
      });
    } catch (error) {
      logger.error('Error getting task', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    } finally {
      span.end();
    }
  };

  /**
   * Get all tasks with optional filtering
   */
  getTasks = async (req, res) => {
    const span = tracer.startSpan('task.getAll');
    
    try {
      const {
        status,
        type,
        priority,
        framework,
        language,
        limit = 50,
        offset = 0
      } = req.query;

      let tasks = Array.from(this.tasks.values());

      // Apply filters
      if (status) {
        tasks = tasks.filter(task => task.status === status);
      }
      if (type) {
        tasks = tasks.filter(task => task.type === type);
      }
      if (priority) {
        tasks = tasks.filter(task => task.priority === priority);
      }
      if (framework) {
        tasks = tasks.filter(task => task.framework === framework);
      }
      if (language) {
        tasks = tasks.filter(task => task.language === language);
      }

      // Sort by creation time (newest first)
      tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Apply pagination
      const total = tasks.length;
      const paginatedTasks = tasks.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

      const taskData = paginatedTasks.map(task => ({
        id: task.id,
        type: task.type,
        description: task.description,
        framework: task.framework,
        language: task.language,
        priority: task.priority,
        status: task.status,
        progress: task.progress,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        assignedAgent: task.assignedAgent,
        estimatedDuration: task.estimateCompletionTime(),
        complexity: task.calculateComplexity(),
        duration: task.getDuration()
      }));

      res.json({
        success: true,
        data: {
          tasks: taskData,
          pagination: {
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: parseInt(offset) + parseInt(limit) < total
          }
        }
      });

      logger.http('Tasks retrieved', {
        total,
        filtered: taskData.length,
        filters: { status, type, priority, framework, language }
      });
    } catch (error) {
      logger.error('Error getting tasks', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    } finally {
      span.end();
    }
  };

  /**
   * Update task progress
   */
  updateTaskProgress = async (req, res) => {
    const span = tracer.startSpan('task.updateProgress');
    
    try {
      const { taskId } = req.params;
      const { progress, status, result, error } = req.body;
      
      if (!taskId) {
        return res.status(400).json({
          success: false,
          error: 'Task ID is required'
        });
      }

      const task = this.tasks.get(taskId);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found'
        });
      }

      // Update task properties
      if (progress !== undefined) {
        task.updateProgress(progress);
      }
      if (status) {
        if (status === 'completed' && result) {
          task.complete(result);
        } else if (status === 'failed' && error) {
          task.fail(error);
        } else if (status === 'cancelled') {
          task.cancel();
        }
      }

      res.json({
        success: true,
        data: {
          id: task.id,
          status: task.status,
          progress: task.progress,
          result: task.result,
          error: task.error,
          updatedAt: new Date().toISOString()
        }
      });

      logger.info('Task progress updated', {
        taskId: task.id,
        status: task.status,
        progress: task.progress
      });
    } catch (error) {
      logger.error('Error updating task progress', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    } finally {
      span.end();
    }
  };

  /**
   * Cancel a task
   */
  cancelTask = async (req, res) => {
    const span = tracer.startSpan('task.cancel');
    
    try {
      const { taskId } = req.params;
      
      if (!taskId) {
        return res.status(400).json({
          success: false,
          error: 'Task ID is required'
        });
      }

      const task = this.tasks.get(taskId);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found'
        });
      }

      if (task.status === 'completed' || task.status === 'failed') {
        return res.status(400).json({
          success: false,
          error: 'Cannot cancel completed or failed task'
        });
      }

      task.cancel();

      res.json({
        success: true,
        data: {
          id: task.id,
          status: task.status,
          cancelledAt: new Date().toISOString()
        }
      });

      logger.info('Task cancelled', {
        taskId: task.id
      });
    } catch (error) {
      logger.error('Error cancelling task', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    } finally {
      span.end();
    }
  };

  /**
   * Retry a failed task
   */
  retryTask = async (req, res) => {
    const span = tracer.startSpan('task.retry');
    
    try {
      const { taskId } = req.params;
      
      if (!taskId) {
        return res.status(400).json({
          success: false,
          error: 'Task ID is required'
        });
      }

      const task = this.tasks.get(taskId);
      
      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found'
        });
      }

      if (task.status !== 'failed') {
        return res.status(400).json({
          success: false,
          error: 'Only failed tasks can be retried'
        });
      }

      task.retry();
      await frontendService.addTask(task);

      res.json({
        success: true,
        data: {
          id: task.id,
          status: task.status,
          retriedAt: new Date().toISOString(),
          retryCount: task.retryCount
        }
      });

      logger.info('Task retried', {
        taskId: task.id,
        retryCount: task.retryCount
      });
    } catch (error) {
      logger.error('Error retrying task', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    } finally {
      span.end();
    }
  };

  /**
   * Get task statistics
   */
  getTaskStats = async (req, res) => {
    const span = tracer.startSpan('task.getStats');
    
    try {
      const tasks = Array.from(this.tasks.values());
      
      const stats = {
        total: tasks.length,
        byStatus: {},
        byType: {},
        byPriority: {},
        byFramework: {},
        averageCompletionTime: 0,
        successRate: 0
      };

      // Calculate statistics
      tasks.forEach(task => {
        // By status
        stats.byStatus[task.status] = (stats.byStatus[task.status] || 0) + 1;
        
        // By type
        stats.byType[task.type] = (stats.byType[task.type] || 0) + 1;
        
        // By priority
        stats.byPriority[task.priority] = (stats.byPriority[task.priority] || 0) + 1;
        
        // By framework
        if (task.framework) {
          stats.byFramework[task.framework] = (stats.byFramework[task.framework] || 0) + 1;
        }
      });

      // Calculate completion metrics
      const completedTasks = tasks.filter(task => task.status === 'completed');
      const failedTasks = tasks.filter(task => task.status === 'failed');
      
      if (completedTasks.length > 0) {
        const totalDuration = completedTasks.reduce((sum, task) => sum + task.getDuration(), 0);
        stats.averageCompletionTime = totalDuration / completedTasks.length;
      }
      
      const finishedTasks = completedTasks.length + failedTasks.length;
      if (finishedTasks > 0) {
        stats.successRate = (completedTasks.length / finishedTasks) * 100;
      }

      res.json({
        success: true,
        data: stats
      });

      logger.http('Task statistics retrieved', {
        totalTasks: stats.total
      });
    } catch (error) {
      logger.error('Error getting task statistics', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    } finally {
      span.end();
    }
  };
}

module.exports = { TaskController };