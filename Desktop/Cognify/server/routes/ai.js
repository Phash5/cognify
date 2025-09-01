const express = require('express');
const { generateResponse, AI_AGENTS, determineAgent } = require('../services/aiService');
const Chat = require('../models/Chat');
const Project = require('../models/Project');
const { auth, checkProjectAccess } = require('../middleware/auth');
const { asyncHandler, validationError, notFoundError } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');

const router = express.Router();

// @desc    Get available AI agents
// @route   GET /api/ai/agents
// @access  Private
router.get('/agents', auth, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: { agents: AI_AGENTS }
  });
}));

// @desc    Generate AI response for chat message
// @route   POST /api/ai/generate
// @access  Private
router.post('/generate', auth, asyncHandler(async (req, res) => {
  const { message, chatId, projectId, context } = req.body;
  
  if (!message) {
    throw validationError('Message is required');
  }
  
  if (!chatId) {
    throw validationError('Chat ID is required');
  }
  
  // Get chat and verify access
  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw notFoundError('Chat not found');
  }
  
  if (chat.user.toString() !== req.user._id.toString()) {
    throw forbiddenError('Access denied to this chat');
  }
  
  // Get project if specified
  let project = null;
  if (projectId) {
    project = await Project.findById(projectId);
    if (!project) {
      throw notFoundError('Project not found');
    }
  }
  
  // Prepare context for AI generation
  const aiContext = {
    activeAgent: context?.activeAgent || chat.context?.activeAgent || 'general_agent',
    currentTask: context?.currentTask || chat.context?.currentTask,
    projectPhase: context?.projectPhase || chat.context?.projectPhase || 'planning',
    technologies: project?.techStack ? [
      { category: 'frontend', name: project.techStack.frontend.name },
      { category: 'backend', name: project.techStack.backend.name },
      { category: 'database', name: project.techStack.database.name }
    ] : [],
    files: context?.files || chat.context?.files || [],
    variables: context?.variables || chat.context?.variables || {}
  };
  
  try {
    // Generate AI response
    const aiResponse = await generateResponse({
      message,
      chat,
      user: req.user,
      context: aiContext
    });
    
    // Update chat context if agent changed
    if (aiResponse.agent !== aiContext.activeAgent) {
      chat.context.activeAgent = aiResponse.agent;
      await chat.save();
    }
    
    logger.info('AI response generated', {
      chatId: chat._id,
      userId: req.user._id,
      agent: aiResponse.agent,
      action: aiResponse.action,
      hasCode: aiResponse.codeBlocks?.length > 0
    });
    
    res.json({
      success: true,
      data: { response: aiResponse }
    });
    
  } catch (error) {
    logger.error('AI generation failed', {
      chatId: chat._id,
      userId: req.user._id,
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to generate AI response',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}));

// @desc    Switch AI agent for chat
// @route   POST /api/ai/switch-agent
// @access  Private
router.post('/switch-agent', auth, asyncHandler(async (req, res) => {
  const { chatId, agent } = req.body;
  
  if (!chatId || !agent) {
    throw validationError('Chat ID and agent are required');
  }
  
  if (!AI_AGENTS[agent]) {
    throw validationError('Invalid agent specified');
  }
  
  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw notFoundError('Chat not found');
  }
  
  if (chat.user.toString() !== req.user._id.toString()) {
    throw forbiddenError('Access denied to this chat');
  }
  
  // Update chat context
  chat.context.activeAgent = agent;
  await chat.save();
  
  logger.info('AI agent switched', {
    chatId: chat._id,
    userId: req.user._id,
    newAgent: agent
  });
  
  res.json({
    success: true,
    message: `Switched to ${AI_AGENTS[agent].name}`,
    data: { 
      agent,
      agentInfo: AI_AGENTS[agent]
    }
  });
}));

// @desc    Get AI suggestions for project
// @route   GET /api/ai/suggestions/:projectId
// @access  Private
router.get('/suggestions/:projectId', auth, checkProjectAccess, asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.projectId);
  
  if (!project) {
    throw notFoundError('Project not found');
  }
  
  // Generate suggestions based on project status and features
  const suggestions = generateProjectSuggestions(project);
  
  res.json({
    success: true,
    data: { suggestions }
  });
}));

// @desc    Generate code template
// @route   POST /api/ai/template
// @access  Private
router.post('/template', auth, asyncHandler(async (req, res) => {
  const { type, name, features, framework, projectId } = req.body;
  
  if (!type || !name) {
    throw validationError('Template type and name are required');
  }
  
  let project = null;
  if (projectId) {
    project = await Project.findById(projectId);
    if (!project) {
      throw notFoundError('Project not found');
    }
  }
  
  // Generate code template
  const template = generateCodeTemplate({
    type,
    name,
    features: features || [],
    framework: framework || 'react',
    project
  });
  
  logger.info('Code template generated', {
    userId: req.user._id,
    projectId,
    type,
    name,
    framework
  });
  
  res.json({
    success: true,
    data: { template }
  });
}));

// @desc    Analyze code and provide suggestions
// @route   POST /api/ai/analyze
// @access  Private
router.post('/analyze', auth, asyncHandler(async (req, res) => {
  const { code, language, context } = req.body;
  
  if (!code) {
    throw validationError('Code is required for analysis');
  }
  
  // Analyze code and provide suggestions
  const analysis = analyzeCode(code, language || 'javascript', context);
  
  logger.info('Code analyzed', {
    userId: req.user._id,
    language,
    codeLength: code.length
  });
  
  res.json({
    success: true,
    data: { analysis }
  });
}));

// @desc    Get AI chat history with specific agent
// @route   GET /api/ai/history/:chatId/:agent
// @access  Private
router.get('/history/:chatId/:agent', auth, asyncHandler(async (req, res) => {
  const { chatId, agent } = req.params;
  const { limit = 50 } = req.query;
  
  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw notFoundError('Chat not found');
  }
  
  if (chat.user.toString() !== req.user._id.toString()) {
    throw forbiddenError('Access denied to this chat');
  }
  
  // Get messages from specific agent
  const agentMessages = chat.messages
    .filter(msg => msg.metadata?.agent === agent)
    .slice(-parseInt(limit))
    .map(msg => ({
      id: msg._id,
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: msg.metadata
    }));
  
  res.json({
    success: true,
    data: { 
      messages: agentMessages,
      agent: AI_AGENTS[agent] || null
    }
  });
}));

// Helper function to generate project suggestions
const generateProjectSuggestions = (project) => {
  const suggestions = [];
  
  // Analyze project status and features
  const completedFeatures = project.features.filter(f => f.status === 'completed').length;
  const totalFeatures = project.features.length;
  const completionRate = totalFeatures > 0 ? (completedFeatures / totalFeatures) * 100 : 0;
  
  if (project.status === 'planning') {
    suggestions.push({
      type: 'next_step',
      priority: 'high',
      title: 'Start Development Phase',
      description: 'Your project planning looks good! Ready to start development?',
      action: 'switch_phase',
      data: { phase: 'development' }
    });
  }
  
  if (completionRate > 80) {
    suggestions.push({
      type: 'deployment',
      priority: 'medium',
      title: 'Consider Deployment',
      description: 'Your project is nearly complete. Time to think about deployment!',
      action: 'start_deployment',
      data: { phase: 'deployment' }
    });
  }
  
  // Technology-specific suggestions
  if (project.techStack.frontend.name === 'React') {
    suggestions.push({
      type: 'optimization',
      priority: 'low',
      title: 'Add React Performance Optimization',
      description: 'Consider adding React.memo and useMemo for better performance',
      action: 'generate_code',
      data: { type: 'optimization', framework: 'react' }
    });
  }
  
  return suggestions;
};

// Helper function to generate code templates
const generateCodeTemplate = ({ type, name, features, framework, project }) => {
  // This would integrate with the aiService generateCode function
  const { generateCode } = require('../services/aiService');
  
  return generateCode({
    type,
    name,
    features,
    framework
  }, null, {
    technologies: project ? [
      { category: 'frontend', name: project.techStack.frontend.name },
      { category: 'backend', name: project.techStack.backend.name }
    ] : []
  });
};

// Helper function to analyze code
const analyzeCode = (code, language, context) => {
  const analysis = {
    language,
    linesOfCode: code.split('\n').length,
    suggestions: [],
    issues: [],
    improvements: []
  };
  
  // Basic code analysis
  if (language === 'javascript' || language === 'jsx') {
    // Check for common issues
    if (code.includes('var ')) {
      analysis.suggestions.push({
        type: 'modernization',
        message: 'Consider using let/const instead of var',
        severity: 'low'
      });
    }
    
    if (code.includes('function(') && !code.includes('=>')) {
      analysis.suggestions.push({
        type: 'modernization',
        message: 'Consider using arrow functions for cleaner syntax',
        severity: 'low'
      });
    }
    
    if (!code.includes('try') && code.includes('await')) {
      analysis.issues.push({
        type: 'error_handling',
        message: 'Async operations should be wrapped in try-catch blocks',
        severity: 'medium'
      });
    }
  }
  
  // Performance suggestions
  if (code.length > 1000) {
    analysis.improvements.push({
      type: 'performance',
      message: 'Consider breaking this into smaller, more manageable functions',
      severity: 'medium'
    });
  }
  
  return analysis;
};

module.exports = router;