const express = require('express');
const Chat = require('../models/Chat');
const Project = require('../models/Project');
const { auth, checkProjectAccess } = require('../middleware/auth');
const { asyncHandler, validationError, notFoundError } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');
const aiService = require('../services/aiService');

const router = express.Router();

// @desc    Get all chats for user
// @route   GET /api/chat
// @access  Private
router.get('/', auth, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, project, search, isActive, isArchived } = req.query;
  
  const options = {
    limit: parseInt(limit),
    project: project || undefined,
    isActive: isActive !== undefined ? isActive === 'true' : undefined,
    isArchived: isArchived !== undefined ? isArchived === 'true' : undefined
  };

  let chats;
  
  if (search) {
    chats = await Chat.searchChats(req.user._id, search);
  } else {
    chats = await Chat.findByUser(req.user._id, options);
  }

  // Paginate results
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedChats = chats.slice(startIndex, endIndex);

  res.json({
    success: true,
    data: {
      chats: paginatedChats,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(chats.length / limit),
        count: paginatedChats.length,
        totalCount: chats.length
      }
    }
  });
}));

// @desc    Get specific chat
// @route   GET /api/chat/:id
// @access  Private
router.get('/:id', auth, asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id)
    .populate('user', 'username email firstName lastName avatar')
    .populate('project', 'name description status');

  if (!chat) {
    throw notFoundError('Chat');
  }

  // Check if user owns the chat
  if (chat.user._id.toString() !== req.user._id.toString()) {
    throw forbiddenError('Access denied to this chat');
  }

  res.json({
    success: true,
    data: { chat }
  });
}));

// @desc    Create new chat
// @route   POST /api/chat
// @access  Private
router.post('/', auth, asyncHandler(async (req, res) => {
  const { title, projectId, initialMessage } = req.body;

  if (!title) {
    throw validationError('Chat title is required');
  }

  // Validate project if provided
  let project = null;
  if (projectId) {
    project = await Project.findById(projectId);
    if (!project) {
      throw notFoundError('Project');
    }

    // Check if user has access to the project
    const hasAccess = project.owner.toString() === req.user._id.toString() ||
      project.collaborators.some(collab => collab.user.toString() === req.user._id.toString());
    
    if (!hasAccess) {
      throw forbiddenError('Access denied to this project');
    }
  }

  const chat = new Chat({
    title,
    user: req.user._id,
    project: projectId || null,
    context: {
      activeAgent: 'general_agent',
      projectPhase: project ? 'planning' : 'planning'
    }
  });

  // Add initial message if provided
  if (initialMessage) {
    await chat.addMessage({
      type: 'user',
      content: initialMessage,
      metadata: {
        agent: 'general_agent',
        action: 'chat'
      }
    });
  }

  await chat.save();
  await chat.populate('user', 'username email firstName lastName avatar');
  await chat.populate('project', 'name description status');

  logger.info('Chat created', {
    chatId: chat._id,
    userId: req.user._id,
    projectId: projectId || null,
    title
  });

  res.status(201).json({
    success: true,
    message: 'Chat created successfully',
    data: { chat }
  });
}));

// @desc    Send message to chat
// @route   POST /api/chat/:id/messages
// @access  Private
router.post('/:id/messages', auth, asyncHandler(async (req, res) => {
  const { content, type = 'user', agent = 'general_agent', action = 'chat' } = req.body;

  if (!content) {
    throw validationError('Message content is required');
  }

  const chat = await Chat.findById(req.params.id);
  if (!chat) {
    throw notFoundError('Chat');
  }

  // Check if user owns the chat
  if (chat.user.toString() !== req.user._id.toString()) {
    throw forbiddenError('Access denied to this chat');
  }

  // Add user message
  await chat.addMessage({
    type,
    content,
    metadata: {
      agent,
      action
    }
  });

  // Emit message to connected clients
  if (req.io) {
    req.io.to(`chat_${chat._id}`).emit('new_message', {
      chatId: chat._id,
      message: chat.messages[chat.messages.length - 1]
    });
  }

  // Generate AI response if it's a user message
  if (type === 'user') {
    try {
      // Set message status to processing
      const userMessage = chat.messages[chat.messages.length - 1];
      userMessage.status = 'processing';
      await chat.save();

      // Generate AI response
      const aiResponse = await aiService.generateResponse({
        message: content,
        chat,
        user: req.user,
        context: chat.context
      });

      // Add AI response
      await chat.addMessage({
        type: 'ai',
        content: aiResponse.content,
        metadata: {
          agent: aiResponse.agent || agent,
          action: aiResponse.action || 'chat',
          codeBlocks: aiResponse.codeBlocks || [],
          files: aiResponse.files || [],
          suggestions: aiResponse.suggestions || []
        }
      });

      // Update user message status
      userMessage.status = 'completed';
      await chat.save();

      // Emit AI response
      if (req.io) {
        req.io.to(`chat_${chat._id}`).emit('new_message', {
          chatId: chat._id,
          message: chat.messages[chat.messages.length - 1]
        });
      }

    } catch (error) {
      logger.error('AI response generation failed', {
        chatId: chat._id,
        userId: req.user._id,
        error: error.message
      });

      // Add error message
      await chat.addMessage({
        type: 'system',
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        metadata: {
          agent: 'system',
          action: 'error'
        },
        status: 'failed'
      });

      // Update user message status
      const userMessage = chat.messages[chat.messages.length - 2];
      userMessage.status = 'failed';
      await chat.save();
    }
  }

  await chat.populate('user', 'username email firstName lastName avatar');
  await chat.populate('project', 'name description status');

  res.json({
    success: true,
    message: 'Message sent successfully',
    data: { chat }
  });
}));

// @desc    Update chat
// @route   PUT /api/chat/:id
// @access  Private
router.put('/:id', auth, asyncHandler(async (req, res) => {
  const { title, settings, context, tags } = req.body;

  const chat = await Chat.findById(req.params.id);
  if (!chat) {
    throw notFoundError('Chat');
  }

  // Check if user owns the chat
  if (chat.user.toString() !== req.user._id.toString()) {
    throw forbiddenError('Access denied to this chat');
  }

  // Update fields
  if (title) chat.title = title;
  if (settings) chat.settings = { ...chat.settings, ...settings };
  if (context) chat.context = { ...chat.context, ...context };
  if (tags) chat.tags = tags;

  await chat.save();
  await chat.populate('user', 'username email firstName lastName avatar');
  await chat.populate('project', 'name description status');

  logger.info('Chat updated', {
    chatId: chat._id,
    userId: req.user._id
  });

  res.json({
    success: true,
    message: 'Chat updated successfully',
    data: { chat }
  });
}));

// @desc    Archive/Unarchive chat
// @route   PATCH /api/chat/:id/archive
// @access  Private
router.patch('/:id/archive', auth, asyncHandler(async (req, res) => {
  const { isArchived = true } = req.body;

  const chat = await Chat.findById(req.params.id);
  if (!chat) {
    throw notFoundError('Chat');
  }

  // Check if user owns the chat
  if (chat.user.toString() !== req.user._id.toString()) {
    throw forbiddenError('Access denied to this chat');
  }

  chat.isArchived = isArchived;
  await chat.save();

  logger.info(`Chat ${isArchived ? 'archived' : 'unarchived'}`, {
    chatId: chat._id,
    userId: req.user._id
  });

  res.json({
    success: true,
    message: `Chat ${isArchived ? 'archived' : 'unarchived'} successfully`,
    data: { chat }
  });
}));

// @desc    Delete chat
// @route   DELETE /api/chat/:id
// @access  Private
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat) {
    throw notFoundError('Chat');
  }

  // Check if user owns the chat
  if (chat.user.toString() !== req.user._id.toString()) {
    throw forbiddenError('Access denied to this chat');
  }

  await Chat.findByIdAndDelete(req.params.id);

  logger.info('Chat deleted', {
    chatId: chat._id,
    userId: req.user._id
  });

  res.json({
    success: true,
    message: 'Chat deleted successfully'
  });
}));

// @desc    React to message
// @route   POST /api/chat/:id/messages/:messageId/react
// @access  Private
router.post('/:id/messages/:messageId/react', auth, asyncHandler(async (req, res) => {
  const { type } = req.body; // 'like', 'dislike', 'helpful', 'not_helpful'

  if (!['like', 'dislike', 'helpful', 'not_helpful'].includes(type)) {
    throw validationError('Invalid reaction type');
  }

  const chat = await Chat.findById(req.params.id);
  if (!chat) {
    throw notFoundError('Chat');
  }

  // Check if user owns the chat
  if (chat.user.toString() !== req.user._id.toString()) {
    throw forbiddenError('Access denied to this chat');
  }

  const message = chat.messages.id(req.params.messageId);
  if (!message) {
    throw notFoundError('Message');
  }

  // Remove existing reaction from this user
  message.reactions = message.reactions.filter(
    reaction => reaction.user.toString() !== req.user._id.toString()
  );

  // Add new reaction
  message.reactions.push({
    user: req.user._id,
    type
  });

  await chat.save();

  res.json({
    success: true,
    message: 'Reaction added successfully',
    data: { message }
  });
}));

// @desc    Get chat statistics
// @route   GET /api/chat/stats
// @access  Private
router.get('/stats', auth, asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const stats = await Chat.aggregate([
    { $match: { user: userId } },
    {
      $group: {
        _id: null,
        totalChats: { $sum: 1 },
        activeChats: {
          $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
        },
        archivedChats: {
          $sum: { $cond: [{ $eq: ['$isArchived', true] }, 1, 0] }
        },
        totalMessages: { $sum: '$statistics.messageCount' },
        totalCodeGenerated: { $sum: '$statistics.codeGenerated' },
        totalFilesCreated: { $sum: '$statistics.filesCreated' },
        totalTimeSpent: { $sum: '$statistics.timeSpent' }
      }
    }
  ]);

  const result = stats[0] || {
    totalChats: 0,
    activeChats: 0,
    archivedChats: 0,
    totalMessages: 0,
    totalCodeGenerated: 0,
    totalFilesCreated: 0,
    totalTimeSpent: 0
  };

  res.json({
    success: true,
    data: { stats: result }
  });
}));

module.exports = router;