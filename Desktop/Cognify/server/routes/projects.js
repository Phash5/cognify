const express = require('express');
const Project = require('../models/Project');
const { auth, authorize, checkProjectAccess } = require('../middleware/auth');
const { asyncHandler, validationError, notFoundError, forbiddenError } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');
const eventEmitter = require('../src/events/eventEmitter');
const telemetryService = require('../src/config/telemetry');

const router = express.Router();

// @desc    Get all projects for user
// @route   GET /api/projects
// @access  Private
router.get('/', auth, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, category, search, sortBy = 'updatedAt', sortOrder = 'desc' } = req.query;
  
  // Build query
  const query = {
    $or: [
      { owner: req.user._id },
      { 'collaborators.user': req.user._id }
    ]
  };
  
  if (status) query.status = status;
  if (category) query.category = category;
  if (search) {
    query.$and = query.$and || [];
    query.$and.push({
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ]
    });
  }
  
  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
    populate: [
      { path: 'owner', select: 'username email avatar' },
      { path: 'collaborators.user', select: 'username email avatar' }
    ]
  };
  
  const projects = await Project.paginate(query, options);
  
  res.json({
    success: true,
    data: projects
  });
}));

// @desc    Get single project
// @route   GET /api/projects/:id
// @access  Private
router.get('/:id', auth, checkProjectAccess, asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id)
    .populate('owner', 'username email avatar')
    .populate('collaborators.user', 'username email avatar');
  
  if (!project) {
    throw notFoundError('Project not found');
  }
  
  res.json({
    success: true,
    data: { project }
  });
}));

// @desc    Create new project
// @route   POST /api/projects
// @access  Private
router.post('/', auth, asyncHandler(async (req, res) => {
  const {
    name,
    description,
    category,
    priority,
    techStack,
    features,
    settings,
    visibility,
    tags
  } = req.body;
  
  // Validate required fields
  if (!name || !description) {
    throw validationError('Project name and description are required');
  }
  
  const project = new Project({
    name,
    description,
    category: category || 'web',
    priority: priority || 'medium',
    owner: req.user._id,
    techStack: techStack || {
      frontend: { name: 'React', version: '18.0.0' },
      backend: { name: 'Node.js', version: '18.0.0' },
      database: { name: 'MongoDB', version: '6.0.0' }
    },
    features: features || [],
    settings: {
      autoSave: true,
      aiAssistance: true,
      codeReview: false,
      ...settings
    },
    visibility: visibility || 'private',
    tags: tags || []
  });
  
  await project.save();
  
  await project.populate([
    { path: 'owner', select: 'username email avatar' }
  ]);
  
  // Track project creation metrics
  telemetryService.trackProjectOperation('create', project._id.toString());
  
  // Emit project created event
  try {
    await eventEmitter.emitProjectCreated({
      id: project._id.toString(),
      metadata: {
        name: project.name,
        description: project.description,
        version: '1.0.0',
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        owner: req.user.username || req.user.email,
        tags: project.tags
      },
      architecture: {
        frontend: {
          framework: project.techStack?.frontend?.name?.toLowerCase() || 'react',
          language: 'typescript',
          styling: 'css',
          buildTool: 'vite'
        },
        backend: {
          runtime: 'nodejs',
          framework: 'express',
          language: 'javascript',
          apiStyle: 'rest'
        },
        database: {
          type: project.techStack?.database?.name?.toLowerCase() || 'mongodb'
        },
        infrastructure: {
          provider: 'vercel',
          containerization: 'docker'
        }
      }
    }, {
      userId: req.user._id.toString(),
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip
    });
  } catch (eventError) {
    logger.error('Failed to emit project created event:', eventError);
    // Don't fail the request if event emission fails
  }
  
  logger.info('Project created', {
    projectId: project._id,
    userId: req.user._id,
    projectName: project.name
  });
  
  res.status(201).json({
    success: true,
    data: { project }
  });
}));

// @desc    Update project
// @route   PUT /api/projects/:id
// @access  Private
router.put('/:id', auth, checkProjectAccess, asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  
  if (!project) {
    throw notFoundError('Project not found');
  }
  
  // Check if user is owner or has edit permissions
  const isOwner = project.owner.toString() === req.user._id.toString();
  const collaborator = project.collaborators.find(
    c => c.user.toString() === req.user._id.toString()
  );
  const canEdit = isOwner || (collaborator && collaborator.permissions.includes('edit'));
  
  if (!canEdit) {
    throw forbiddenError('You do not have permission to edit this project');
  }
  
  const allowedUpdates = [
    'name', 'description', 'category', 'priority', 'techStack',
    'features', 'settings', 'visibility', 'tags', 'status'
  ];
  
  const updates = {};
  Object.keys(req.body).forEach(key => {
    if (allowedUpdates.includes(key)) {
      updates[key] = req.body[key];
    }
  });
  
  const updatedProject = await Project.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true, runValidators: true }
  ).populate([
    { path: 'owner', select: 'username email avatar' },
    { path: 'collaborators.user', select: 'username email avatar' }
  ]);
  
  // Track project update metrics
  telemetryService.trackProjectOperation('update', project._id.toString());
  
  // Emit project updated event
  try {
    await eventEmitter.emitProjectUpdated(
      project._id.toString(),
      updates,
      project.version || '1.0.0',
      {
        userId: req.user._id.toString(),
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip
      }
    );
  } catch (eventError) {
    logger.error('Failed to emit project updated event:', eventError);
    // Don't fail the request if event emission fails
  }
  
  logger.info('Project updated', {
    projectId: project._id,
    userId: req.user._id,
    updates: Object.keys(updates)
  });
  
  res.json({
    success: true,
    data: { project: updatedProject }
  });
}));

// @desc    Delete project
// @route   DELETE /api/projects/:id
// @access  Private
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  
  if (!project) {
    throw notFoundError('Project not found');
  }
  
  // Only owner can delete project
  if (project.owner.toString() !== req.user._id.toString()) {
    throw forbiddenError('Only project owner can delete the project');
  }
  
  await Project.findByIdAndDelete(req.params.id);
  
  // Track project deletion metrics
  telemetryService.trackProjectOperation('delete', project._id.toString());
  
  // Emit project deleted event
  try {
    await eventEmitter.emitProjectDeleted(
      project._id.toString(),
      project.version || '1.0.0',
      {
        userId: req.user._id.toString(),
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip
      }
    );
  } catch (eventError) {
    logger.error('Failed to emit project deleted event:', eventError);
    // Don't fail the request if event emission fails
  }
  
  logger.info('Project deleted', {
    projectId: project._id,
    userId: req.user._id,
    projectName: project.name
  });
  
  res.json({
    success: true,
    message: 'Project deleted successfully'
  });
}));

// @desc    Add collaborator to project
// @route   POST /api/projects/:id/collaborators
// @access  Private
router.post('/:id/collaborators', auth, asyncHandler(async (req, res) => {
  const { email, permissions = ['read'] } = req.body;
  
  if (!email) {
    throw validationError('Collaborator email is required');
  }
  
  const project = await Project.findById(req.params.id);
  
  if (!project) {
    throw notFoundError('Project not found');
  }
  
  // Only owner can add collaborators
  if (project.owner.toString() !== req.user._id.toString()) {
    throw forbiddenError('Only project owner can add collaborators');
  }
  
  // Find user by email
  const User = require('../models/User');
  const collaboratorUser = await User.findOne({ email });
  
  if (!collaboratorUser) {
    throw notFoundError('User not found with this email');
  }
  
  // Check if user is already a collaborator
  const existingCollaborator = project.collaborators.find(
    c => c.user.toString() === collaboratorUser._id.toString()
  );
  
  if (existingCollaborator) {
    throw validationError('User is already a collaborator on this project');
  }
  
  // Add collaborator
  project.collaborators.push({
    user: collaboratorUser._id,
    permissions,
    addedAt: new Date()
  });
  
  await project.save();
  
  await project.populate([
    { path: 'owner', select: 'username email avatar' },
    { path: 'collaborators.user', select: 'username email avatar' }
  ]);
  
  logger.info('Collaborator added to project', {
    projectId: project._id,
    ownerId: req.user._id,
    collaboratorId: collaboratorUser._id,
    permissions
  });
  
  res.json({
    success: true,
    data: { project }
  });
}));

// @desc    Remove collaborator from project
// @route   DELETE /api/projects/:id/collaborators/:userId
// @access  Private
router.delete('/:id/collaborators/:userId', auth, asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  
  if (!project) {
    throw notFoundError('Project not found');
  }
  
  // Only owner can remove collaborators
  if (project.owner.toString() !== req.user._id.toString()) {
    throw forbiddenError('Only project owner can remove collaborators');
  }
  
  // Remove collaborator
  project.collaborators = project.collaborators.filter(
    c => c.user.toString() !== req.params.userId
  );
  
  await project.save();
  
  logger.info('Collaborator removed from project', {
    projectId: project._id,
    ownerId: req.user._id,
    removedUserId: req.params.userId
  });
  
  res.json({
    success: true,
    message: 'Collaborator removed successfully'
  });
}));

// @desc    Update project status
// @route   PATCH /api/projects/:id/status
// @access  Private
router.patch('/:id/status', auth, checkProjectAccess, asyncHandler(async (req, res) => {
  const { status } = req.body;
  
  if (!status) {
    throw validationError('Status is required');
  }
  
  const validStatuses = ['planning', 'development', 'testing', 'deployment', 'completed', 'on_hold', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw validationError(`Status must be one of: ${validStatuses.join(', ')}`);
  }
  
  const project = await Project.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  ).populate([
    { path: 'owner', select: 'username email avatar' },
    { path: 'collaborators.user', select: 'username email avatar' }
  ]);
  
  if (!project) {
    throw notFoundError('Project not found');
  }
  
  logger.info('Project status updated', {
    projectId: project._id,
    userId: req.user._id,
    newStatus: status
  });
  
  res.json({
    success: true,
    data: { project }
  });
}));

// @desc    Get project statistics
// @route   GET /api/projects/:id/stats
// @access  Private
router.get('/:id/stats', auth, checkProjectAccess, asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  
  if (!project) {
    throw notFoundError('Project not found');
  }
  
  // Calculate project statistics
  const stats = {
    completionPercentage: project.completionPercentage,
    totalFeatures: project.features.length,
    completedFeatures: project.features.filter(f => f.status === 'completed').length,
    inProgressFeatures: project.features.filter(f => f.status === 'in_progress').length,
    pendingFeatures: project.features.filter(f => f.status === 'pending').length,
    totalEstimatedHours: project.totalEstimatedHours,
    totalActualHours: project.totalActualHours,
    collaboratorsCount: project.collaborators.length,
    lastActivity: project.updatedAt,
    aiGeneration: project.aiGeneration
  };
  
  res.json({
    success: true,
    data: { stats }
  });
}));

// @desc    Clone project
// @route   POST /api/projects/:id/clone
// @access  Private
router.post('/:id/clone', auth, checkProjectAccess, asyncHandler(async (req, res) => {
  const { name } = req.body;
  
  const originalProject = await Project.findById(req.params.id);
  
  if (!originalProject) {
    throw notFoundError('Project not found');
  }
  
  // Create cloned project
  const clonedProject = new Project({
    name: name || `${originalProject.name} (Copy)`,
    description: originalProject.description,
    category: originalProject.category,
    priority: originalProject.priority,
    owner: req.user._id,
    techStack: originalProject.techStack,
    features: originalProject.features.map(feature => ({
      ...feature.toObject(),
      status: 'pending',
      assignedAgent: feature.assignedAgent,
      estimatedHours: feature.estimatedHours,
      actualHours: 0
    })),
    settings: originalProject.settings,
    visibility: 'private',
    tags: originalProject.tags,
    status: 'planning'
  });
  
  await clonedProject.save();
  
  await clonedProject.populate([
    { path: 'owner', select: 'username email avatar' }
  ]);
  
  logger.info('Project cloned', {
    originalProjectId: originalProject._id,
    clonedProjectId: clonedProject._id,
    userId: req.user._id
  });
  
  res.status(201).json({
    success: true,
    data: { project: clonedProject }
  });
}));

module.exports = router;