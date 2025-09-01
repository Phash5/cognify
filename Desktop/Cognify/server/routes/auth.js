const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { auth, refreshTokenIfNeeded } = require('../middleware/auth');
const { asyncHandler, validationError, unauthorizedError, notFoundError } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');

const router = express.Router();

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', asyncHandler(async (req, res) => {
  const { username, email, password, firstName, lastName } = req.body;

  // Validation
  if (!username || !email || !password || !firstName || !lastName) {
    throw validationError('All fields are required');
  }

  if (password.length < 6) {
    throw validationError('Password must be at least 6 characters long');
  }

  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ email }, { username }]
  });

  if (existingUser) {
    if (existingUser.email === email) {
      throw validationError('Email already registered');
    }
    if (existingUser.username === username) {
      throw validationError('Username already taken');
    }
  }

  // Create user
  const user = new User({
    username,
    email,
    password,
    firstName,
    lastName
  });

  await user.save();

  // Generate tokens
  const token = user.generateAuthToken();
  const refreshToken = user.generateRefreshToken();

  logger.info('User registered successfully', {
    userId: user._id,
    email: user.email,
    username: user.username
  });

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        avatar: user.avatar,
        role: user.role,
        subscription: user.subscription,
        preferences: user.preferences,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt
      },
      token,
      refreshToken
    }
  });
}));

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password, rememberMe } = req.body;

  // Validation
  if (!email || !password) {
    throw validationError('Email and password are required');
  }

  // Find user and include password
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    throw unauthorizedError('Invalid credentials');
  }

  if (!user.isActive) {
    throw unauthorizedError('Account is deactivated');
  }

  // Check password
  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    throw unauthorizedError('Invalid credentials');
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Generate tokens
  const tokenExpiry = rememberMe ? '30d' : '7d';
  const token = jwt.sign(
    { 
      id: user._id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: tokenExpiry }
  );
  const refreshToken = user.generateRefreshToken();

  logger.info('User logged in successfully', {
    userId: user._id,
    email: user.email,
    rememberMe
  });

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        avatar: user.avatar,
        role: user.role,
        subscription: user.subscription,
        preferences: user.preferences,
        emailVerified: user.emailVerified,
        lastLogin: user.lastLogin
      },
      token,
      refreshToken
    }
  });
}));

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
router.get('/me', auth, refreshTokenIfNeeded, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        fullName: req.user.fullName,
        avatar: req.user.avatar,
        role: req.user.role,
        subscription: req.user.subscription,
        preferences: req.user.preferences,
        emailVerified: req.user.emailVerified,
        lastLogin: req.user.lastLogin,
        createdAt: req.user.createdAt
      }
    }
  });
}));

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
router.put('/profile', auth, asyncHandler(async (req, res) => {
  const { firstName, lastName, username, preferences } = req.body;
  const user = req.user;

  // Check if username is taken by another user
  if (username && username !== user.username) {
    const existingUser = await User.findOne({ username, _id: { $ne: user._id } });
    if (existingUser) {
      throw validationError('Username already taken');
    }
    user.username = username;
  }

  // Update fields
  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (preferences) {
    user.preferences = { ...user.preferences, ...preferences };
  }

  await user.save();

  logger.info('User profile updated', {
    userId: user._id,
    email: user.email
  });

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        avatar: user.avatar,
        role: user.role,
        subscription: user.subscription,
        preferences: user.preferences,
        emailVerified: user.emailVerified
      }
    }
  });
}));

// @desc    Change password
// @route   PUT /api/auth/password
// @access  Private
router.put('/password', auth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw validationError('Current password and new password are required');
  }

  if (newPassword.length < 6) {
    throw validationError('New password must be at least 6 characters long');
  }

  // Get user with password
  const user = await User.findById(req.user._id).select('+password');

  // Verify current password
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    throw unauthorizedError('Current password is incorrect');
  }

  // Update password
  user.password = newPassword;
  await user.save();

  logger.info('User password changed', {
    userId: user._id,
    email: user.email
  });

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
}));

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Public
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw validationError('Refresh token is required');
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {
      throw unauthorizedError('Invalid refresh token');
    }

    // Generate new tokens
    const newToken = user.generateAuthToken();
    const newRefreshToken = user.generateRefreshToken();

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    throw unauthorizedError('Invalid refresh token');
  }
}));

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw validationError('Email is required');
  }

  const user = await User.findOne({ email });

  if (!user) {
    // Don't reveal if email exists or not
    return res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent'
    });
  }

  // Generate reset token
  const resetToken = user.generatePasswordResetToken();
  await user.save();

  // In a real application, you would send an email here
  // For now, we'll just log it
  logger.info('Password reset requested', {
    userId: user._id,
    email: user.email,
    resetToken // In production, don't log the actual token
  });

  res.json({
    success: true,
    message: 'If the email exists, a password reset link has been sent',
    // In development, include the token for testing
    ...(process.env.NODE_ENV === 'development' && { resetToken })
  });
}));

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
router.post('/reset-password/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password) {
    throw validationError('Password is required');
  }

  if (password.length < 6) {
    throw validationError('Password must be at least 6 characters long');
  }

  // Hash the token
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  // Find user with valid reset token
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    throw unauthorizedError('Invalid or expired reset token');
  }

  // Update password and clear reset token
  user.password = password;
  user.resetPasswordToken = null;
  user.resetPasswordExpire = null;
  await user.save();

  logger.info('Password reset successfully', {
    userId: user._id,
    email: user.email
  });

  res.json({
    success: true,
    message: 'Password reset successfully'
  });
}));

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', auth, asyncHandler(async (req, res) => {
  // In a real application with token blacklisting, you would add the token to a blacklist
  logger.info('User logged out', {
    userId: req.user._id,
    email: req.user.email
  });

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}));

module.exports = router;