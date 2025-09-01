const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Project = require('../models/Project');
const { logger } = require('../middleware/logger');
const { generateResponse } = require('./aiService');

class SocketService {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userSockets = new Map(); // socketId -> user info
    this.chatRooms = new Map(); // chatId -> Set of socketIds
    this.projectRooms = new Map(); // projectId -> Set of socketIds
    
    this.setupSocketHandlers();
  }
  
  setupSocketHandlers() {
    this.io.use(this.authenticateSocket.bind(this));
    
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
      
      // Chat events
      socket.on('join_chat', (data) => this.handleJoinChat(socket, data));
      socket.on('leave_chat', (data) => this.handleLeaveChat(socket, data));
      socket.on('send_message', (data) => this.handleSendMessage(socket, data));
      socket.on('typing_start', (data) => this.handleTypingStart(socket, data));
      socket.on('typing_stop', (data) => this.handleTypingStop(socket, data));
      socket.on('message_reaction', (data) => this.handleMessageReaction(socket, data));
      
      // Project events
      socket.on('join_project', (data) => this.handleJoinProject(socket, data));
      socket.on('leave_project', (data) => this.handleLeaveProject(socket, data));
      socket.on('project_update', (data) => this.handleProjectUpdate(socket, data));
      
      // AI events
      socket.on('ai_request', (data) => this.handleAIRequest(socket, data));
      socket.on('switch_agent', (data) => this.handleSwitchAgent(socket, data));
      
      // Deployment events
      socket.on('deployment_status', (data) => this.handleDeploymentStatus(socket, data));
      
      // Collaboration events
      socket.on('cursor_position', (data) => this.handleCursorPosition(socket, data));
      socket.on('code_selection', (data) => this.handleCodeSelection(socket, data));
      
      // Disconnect
      socket.on('disconnect', () => this.handleDisconnection(socket));
    });
  }
  
  async authenticateSocket(socket, next) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return next(new Error('User not found'));
      }
      
      socket.user = user;
      next();
    } catch (error) {
      logger.error('Socket authentication failed', {
        socketId: socket.id,
        error: error.message
      });
      next(new Error('Authentication failed'));
    }
  }
  
  handleConnection(socket) {
    const user = socket.user;
    
    // Store user connection
    this.connectedUsers.set(user._id.toString(), socket.id);
    this.userSockets.set(socket.id, {
      userId: user._id.toString(),
      username: user.username,
      avatar: user.avatar
    });
    
    // Notify user is online
    socket.broadcast.emit('user_online', {
      userId: user._id,
      username: user.username,
      avatar: user.avatar
    });
    
    logger.info('User connected via WebSocket', {
      userId: user._id,
      username: user.username,
      socketId: socket.id
    });
    
    // Send connection confirmation
    socket.emit('connected', {
      message: 'Connected successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar
      }
    });
  }
  
  async handleJoinChat(socket, data) {
    try {
      const { chatId } = data;
      
      if (!chatId) {
        socket.emit('error', { message: 'Chat ID is required' });
        return;
      }
      
      // Verify chat access
      const chat = await Chat.findById(chatId);
      if (!chat) {
        socket.emit('error', { message: 'Chat not found' });
        return;
      }
      
      if (chat.user.toString() !== socket.user._id.toString()) {
        socket.emit('error', { message: 'Access denied to this chat' });
        return;
      }
      
      // Join chat room
      socket.join(`chat_${chatId}`);
      
      if (!this.chatRooms.has(chatId)) {
        this.chatRooms.set(chatId, new Set());
      }
      this.chatRooms.get(chatId).add(socket.id);
      
      socket.emit('chat_joined', { chatId });
      
      logger.info('User joined chat', {
        userId: socket.user._id,
        chatId,
        socketId: socket.id
      });
    } catch (error) {
      logger.error('Error joining chat', {
        userId: socket.user._id,
        chatId: data.chatId,
        error: error.message
      });
      socket.emit('error', { message: 'Failed to join chat' });
    }
  }
  
  handleLeaveChat(socket, data) {
    const { chatId } = data;
    
    socket.leave(`chat_${chatId}`);
    
    if (this.chatRooms.has(chatId)) {
      this.chatRooms.get(chatId).delete(socket.id);
      if (this.chatRooms.get(chatId).size === 0) {
        this.chatRooms.delete(chatId);
      }
    }
    
    socket.emit('chat_left', { chatId });
  }
  
  async handleSendMessage(socket, data) {
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
      
      if (chat.user.toString() !== socket.user._id.toString()) {
        socket.emit('error', { message: 'Access denied to this chat' });
        return;
      }
      
      // Add user message to chat
      const userMessage = await chat.addMessage({
        type,
        content,
        metadata: {
          socketId: socket.id
        }
      });
      
      // Broadcast message to chat room
      this.io.to(`chat_${chatId}`).emit('new_message', {
        chatId,
        message: userMessage
      });
      
      // Generate AI response if it's a user message
      if (type === 'user') {
        this.generateAIResponse(socket, chat, content);
      }
      
      logger.info('Message sent', {
        userId: socket.user._id,
        chatId,
        messageType: type,
        contentLength: content.length
      });
    } catch (error) {
      logger.error('Error sending message', {
        userId: socket.user._id,
        chatId: data.chatId,
        error: error.message
      });
      socket.emit('error', { message: 'Failed to send message' });
    }
  }
  
  async generateAIResponse(socket, chat, userMessage) {
    try {
      // Show typing indicator
      this.io.to(`chat_${chat._id}`).emit('ai_typing', {
        chatId: chat._id,
        agent: chat.context.activeAgent || 'general_agent'
      });
      
      // Generate AI response
      const aiResponse = await generateResponse({
        message: userMessage,
        chat,
        user: socket.user,
        context: chat.context
      });
      
      // Add AI message to chat
      const aiMessage = await chat.addMessage({
        type: 'ai',
        content: aiResponse.content,
        metadata: {
          agent: aiResponse.agent,
          action: aiResponse.action,
          codeBlocks: aiResponse.codeBlocks || [],
          files: aiResponse.files || [],
          suggestions: aiResponse.suggestions || []
        }
      });
      
      // Stop typing indicator and send AI response
      this.io.to(`chat_${chat._id}`).emit('ai_typing_stop', {
        chatId: chat._id
      });
      
      this.io.to(`chat_${chat._id}`).emit('new_message', {
        chatId: chat._id,
        message: aiMessage
      });
      
      // If AI generated code or files, emit special event
      if (aiResponse.codeBlocks?.length > 0 || aiResponse.files?.length > 0) {
        this.io.to(`chat_${chat._id}`).emit('code_generated', {
          chatId: chat._id,
          codeBlocks: aiResponse.codeBlocks,
          files: aiResponse.files
        });
      }
      
      logger.info('AI response generated', {
        chatId: chat._id,
        agent: aiResponse.agent,
        action: aiResponse.action,
        hasCode: aiResponse.codeBlocks?.length > 0
      });
    } catch (error) {
      logger.error('Error generating AI response', {
        chatId: chat._id,
        error: error.message
      });
      
      this.io.to(`chat_${chat._id}`).emit('ai_typing_stop', {
        chatId: chat._id
      });
      
      this.io.to(`chat_${chat._id}`).emit('ai_error', {
        chatId: chat._id,
        message: 'Failed to generate AI response'
      });
    }
  }
  
  handleTypingStart(socket, data) {
    const { chatId } = data;
    
    socket.to(`chat_${chatId}`).emit('user_typing', {
      chatId,
      userId: socket.user._id,
      username: socket.user.username
    });
  }
  
  handleTypingStop(socket, data) {
    const { chatId } = data;
    
    socket.to(`chat_${chatId}`).emit('user_typing_stop', {
      chatId,
      userId: socket.user._id
    });
  }
  
  async handleMessageReaction(socket, data) {
    try {
      const { chatId, messageId, reaction } = data;
      
      const chat = await Chat.findById(chatId);
      if (!chat) {
        socket.emit('error', { message: 'Chat not found' });
        return;
      }
      
      const message = chat.messages.id(messageId);
      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }
      
      // Toggle reaction
      const existingReaction = message.reactions.find(
        r => r.user.toString() === socket.user._id.toString() && r.emoji === reaction
      );
      
      if (existingReaction) {
        message.reactions.pull(existingReaction._id);
      } else {
        message.reactions.push({
          user: socket.user._id,
          emoji: reaction
        });
      }
      
      await chat.save();
      
      // Broadcast reaction update
      this.io.to(`chat_${chatId}`).emit('message_reaction_update', {
        chatId,
        messageId,
        reactions: message.reactions
      });
    } catch (error) {
      logger.error('Error handling message reaction', {
        userId: socket.user._id,
        error: error.message
      });
      socket.emit('error', { message: 'Failed to update reaction' });
    }
  }
  
  async handleJoinProject(socket, data) {
    try {
      const { projectId } = data;
      
      const project = await Project.findById(projectId);
      if (!project) {
        socket.emit('error', { message: 'Project not found' });
        return;
      }
      
      // Check project access
      const isOwner = project.owner.toString() === socket.user._id.toString();
      const isCollaborator = project.collaborators.some(
        c => c.user.toString() === socket.user._id.toString()
      );
      
      if (!isOwner && !isCollaborator) {
        socket.emit('error', { message: 'Access denied to this project' });
        return;
      }
      
      socket.join(`project_${projectId}`);
      
      if (!this.projectRooms.has(projectId)) {
        this.projectRooms.set(projectId, new Set());
      }
      this.projectRooms.get(projectId).add(socket.id);
      
      socket.emit('project_joined', { projectId });
      
      // Notify other project members
      socket.to(`project_${projectId}`).emit('user_joined_project', {
        projectId,
        user: {
          id: socket.user._id,
          username: socket.user.username,
          avatar: socket.user.avatar
        }
      });
    } catch (error) {
      logger.error('Error joining project', {
        userId: socket.user._id,
        projectId: data.projectId,
        error: error.message
      });
      socket.emit('error', { message: 'Failed to join project' });
    }
  }
  
  handleLeaveProject(socket, data) {
    const { projectId } = data;
    
    socket.leave(`project_${projectId}`);
    
    if (this.projectRooms.has(projectId)) {
      this.projectRooms.get(projectId).delete(socket.id);
      if (this.projectRooms.get(projectId).size === 0) {
        this.projectRooms.delete(projectId);
      }
    }
    
    socket.to(`project_${projectId}`).emit('user_left_project', {
      projectId,
      userId: socket.user._id
    });
    
    socket.emit('project_left', { projectId });
  }
  
  handleProjectUpdate(socket, data) {
    const { projectId, update } = data;
    
    // Broadcast project update to all project members
    socket.to(`project_${projectId}`).emit('project_updated', {
      projectId,
      update,
      updatedBy: {
        id: socket.user._id,
        username: socket.user.username
      }
    });
  }
  
  async handleAIRequest(socket, data) {
    try {
      const { chatId, message, context } = data;
      
      const chat = await Chat.findById(chatId);
      if (!chat) {
        socket.emit('error', { message: 'Chat not found' });
        return;
      }
      
      await this.generateAIResponse(socket, chat, message);
    } catch (error) {
      logger.error('Error handling AI request', {
        userId: socket.user._id,
        error: error.message
      });
      socket.emit('error', { message: 'Failed to process AI request' });
    }
  }
  
  async handleSwitchAgent(socket, data) {
    try {
      const { chatId, agent } = data;
      
      const chat = await Chat.findById(chatId);
      if (!chat) {
        socket.emit('error', { message: 'Chat not found' });
        return;
      }
      
      chat.context.activeAgent = agent;
      await chat.save();
      
      this.io.to(`chat_${chatId}`).emit('agent_switched', {
        chatId,
        agent,
        switchedBy: socket.user.username
      });
    } catch (error) {
      logger.error('Error switching agent', {
        userId: socket.user._id,
        error: error.message
      });
      socket.emit('error', { message: 'Failed to switch agent' });
    }
  }
  
  handleDeploymentStatus(socket, data) {
    const { projectId, status } = data;
    
    // Broadcast deployment status to project members
    this.io.to(`project_${projectId}`).emit('deployment_status_update', {
      projectId,
      status,
      timestamp: new Date()
    });
  }
  
  handleCursorPosition(socket, data) {
    const { projectId, file, position } = data;
    
    // Broadcast cursor position to other project collaborators
    socket.to(`project_${projectId}`).emit('collaborator_cursor', {
      projectId,
      file,
      position,
      user: {
        id: socket.user._id,
        username: socket.user.username,
        avatar: socket.user.avatar
      }
    });
  }
  
  handleCodeSelection(socket, data) {
    const { projectId, file, selection } = data;
    
    // Broadcast code selection to other project collaborators
    socket.to(`project_${projectId}`).emit('collaborator_selection', {
      projectId,
      file,
      selection,
      user: {
        id: socket.user._id,
        username: socket.user.username,
        avatar: socket.user.avatar
      }
    });
  }
  
  handleDisconnection(socket) {
    const userInfo = this.userSockets.get(socket.id);
    
    if (userInfo) {
      // Remove user from connected users
      this.connectedUsers.delete(userInfo.userId);
      this.userSockets.delete(socket.id);
      
      // Remove from all rooms
      this.chatRooms.forEach((sockets, chatId) => {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          this.chatRooms.delete(chatId);
        }
      });
      
      this.projectRooms.forEach((sockets, projectId) => {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          this.projectRooms.delete(projectId);
        }
      });
      
      // Notify others that user is offline
      socket.broadcast.emit('user_offline', {
        userId: userInfo.userId,
        username: userInfo.username
      });
      
      logger.info('User disconnected from WebSocket', {
        userId: userInfo.userId,
        username: userInfo.username,
        socketId: socket.id
      });
    }
  }
  
  // Public methods for external use
  
  notifyProjectUpdate(projectId, update, excludeUserId = null) {
    const notification = {
      projectId,
      update,
      timestamp: new Date()
    };
    
    if (excludeUserId) {
      const excludeSocketId = this.connectedUsers.get(excludeUserId.toString());
      if (excludeSocketId) {
        this.io.to(`project_${projectId}`).except(excludeSocketId).emit('project_updated', notification);
      } else {
        this.io.to(`project_${projectId}`).emit('project_updated', notification);
      }
    } else {
      this.io.to(`project_${projectId}`).emit('project_updated', notification);
    }
  }
  
  notifyDeploymentUpdate(projectId, deploymentStatus) {
    this.io.to(`project_${projectId}`).emit('deployment_status_update', {
      projectId,
      status: deploymentStatus,
      timestamp: new Date()
    });
  }
  
  getConnectedUsers() {
    return Array.from(this.connectedUsers.entries()).map(([userId, socketId]) => {
      const userInfo = this.userSockets.get(socketId);
      return {
        userId,
        socketId,
        username: userInfo?.username,
        avatar: userInfo?.avatar
      };
    });
  }
  
  isUserOnline(userId) {
    return this.connectedUsers.has(userId.toString());
  }
}

// Global socket service instance
let socketServiceInstance = null;

const setSocketService = (instance) => {
  socketServiceInstance = instance;
};

const getSocketService = () => {
  return socketServiceInstance;
};

module.exports = { SocketService, setSocketService, getSocketService };