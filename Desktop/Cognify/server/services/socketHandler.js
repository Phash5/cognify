const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const { logger } = require('../middleware/logger');

// Store active connections
const activeConnections = new Map();

// Socket authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user || !user.isActive) {
      return next(new Error('Authentication error: Invalid user'));
    }
    
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error: Invalid token'));
  }
};

// Handle socket connections
const handleConnection = (io) => {
  // Apply authentication middleware
  io.use(authenticateSocket);
  
  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    
    // Store the connection
    activeConnections.set(userId, {
      socketId: socket.id,
      user: socket.user,
      connectedAt: new Date()
    });
    
    logger.info('User connected via WebSocket', {
      userId,
      socketId: socket.id,
      username: socket.user.username
    });
    
    // Join user to their personal room
    socket.join(`user_${userId}`);
    
    // Handle joining project rooms
    socket.on('join_project', async (projectId) => {
      try {
        const Project = require('../models/Project');
        const project = await Project.findById(projectId);
        
        if (!project) {
          socket.emit('error', { message: 'Project not found' });
          return;
        }
        
        // Check if user has access to the project
        const hasAccess = project.owner.toString() === userId ||
          project.collaborators.some(collab => collab.user.toString() === userId);
        
        if (!hasAccess) {
          socket.emit('error', { message: 'Access denied to project' });
          return;
        }
        
        socket.join(`project_${projectId}`);
        socket.emit('joined_project', { projectId });
        
        // Notify other project members
        socket.to(`project_${projectId}`).emit('user_joined_project', {
          userId,
          username: socket.user.username,
          projectId
        });
        
        logger.info('User joined project room', {
          userId,
          projectId,
          username: socket.user.username
        });
      } catch (error) {
        logger.error('Error joining project room', { error: error.message, userId, projectId });
        socket.emit('error', { message: 'Failed to join project' });
      }
    });
    
    // Handle leaving project rooms
    socket.on('leave_project', (projectId) => {
      socket.leave(`project_${projectId}`);
      socket.emit('left_project', { projectId });
      
      // Notify other project members
      socket.to(`project_${projectId}`).emit('user_left_project', {
        userId,
        username: socket.user.username,
        projectId
      });
      
      logger.info('User left project room', {
        userId,
        projectId,
        username: socket.user.username
      });
    });
    
    // Handle chat messages
    socket.on('send_message', async (data) => {
      try {
        const { chatId, content, type = 'user' } = data;
        
        if (!chatId || !content) {
          socket.emit('error', { message: 'Chat ID and content are required' });
          return;
        }
        
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
          socket.emit('error', { message: 'Chat not found' });
          return;
        }
        
        // Check if user has access to the chat
        if (chat.user.toString() !== userId) {
          socket.emit('error', { message: 'Access denied to chat' });
          return;
        }
        
        // Add message to chat
        const message = await chat.addMessage({
          type,
          content,
          metadata: {
            socketId: socket.id,
            timestamp: new Date()
          }
        });
        
        // Emit message to user and project members if applicable
        const rooms = [`user_${userId}`];
        if (chat.project) {
          rooms.push(`project_${chat.project}`);
        }
        
        rooms.forEach(room => {
          io.to(room).emit('new_message', {
            chatId,
            message,
            sender: {
              id: userId,
              username: socket.user.username,
              avatar: socket.user.avatar
            }
          });
        });
        
        logger.info('Message sent', {
          userId,
          chatId,
          messageType: type,
          contentLength: content.length
        });
      } catch (error) {
        logger.error('Error sending message', { error: error.message, userId, data });
        socket.emit('error', { message: 'Failed to send message' });
      }
    });
    
    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const { chatId } = data;
      socket.to(`project_${chatId}`).emit('user_typing', {
        userId,
        username: socket.user.username,
        chatId
      });
    });
    
    socket.on('typing_stop', (data) => {
      const { chatId } = data;
      socket.to(`project_${chatId}`).emit('user_stopped_typing', {
        userId,
        username: socket.user.username,
        chatId
      });
    });
    
    // Handle AI agent status updates
    socket.on('agent_status_update', (data) => {
      const { projectId, agent, status, task } = data;
      
      // Broadcast to project members
      socket.to(`project_${projectId}`).emit('agent_status_changed', {
        agent,
        status,
        task,
        timestamp: new Date()
      });
      
      logger.info('Agent status updated', {
        userId,
        projectId,
        agent,
        status,
        task
      });
    });
    
    // Handle deployment status updates
    socket.on('deployment_status_update', (data) => {
      const { projectId, status, logs, url } = data;
      
      // Broadcast to project members
      socket.to(`project_${projectId}`).emit('deployment_status_changed', {
        status,
        logs,
        url,
        timestamp: new Date()
      });
      
      logger.info('Deployment status updated', {
        userId,
        projectId,
        status
      });
    });
    
    // Handle disconnect
    socket.on('disconnect', (reason) => {
      activeConnections.delete(userId);
      
      logger.info('User disconnected from WebSocket', {
        userId,
        socketId: socket.id,
        username: socket.user.username,
        reason
      });
      
      // Notify project rooms that user disconnected
      socket.rooms.forEach(room => {
        if (room.startsWith('project_')) {
          socket.to(room).emit('user_disconnected', {
            userId,
            username: socket.user.username
          });
        }
      });
    });
    
    // Handle errors
    socket.on('error', (error) => {
      logger.error('Socket error', {
        userId,
        socketId: socket.id,
        error: error.message
      });
    });
  });
};

// Utility functions
const getActiveConnections = () => {
  return Array.from(activeConnections.values());
};

const getUserConnection = (userId) => {
  return activeConnections.get(userId.toString());
};

const isUserOnline = (userId) => {
  return activeConnections.has(userId.toString());
};

const sendToUser = (io, userId, event, data) => {
  io.to(`user_${userId}`).emit(event, data);
};

const sendToProject = (io, projectId, event, data) => {
  io.to(`project_${projectId}`).emit(event, data);
};

module.exports = {
  handleConnection,
  getActiveConnections,
  getUserConnection,
  isUserOnline,
  sendToUser,
  sendToProject
};

// Export the main handler as default
module.exports.default = handleConnection;