/**
 * Authentication Middleware
 * JWT and API key authentication for the Database AI Agent
 */

'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/config');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');

/**
 * JWT Authentication Middleware
 */
const authenticateToken = (req, res, next) => {
  const span = telemetryService.startSpan('auth.jwt_authenticate');
  
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    span.setAttributes({
      'auth.type': 'jwt',
      'auth.has_token': !!token,
    });
    
    if (!token) {
      span.setAttributes({ 'auth.result': 'no_token' });
      logger.security('JWT authentication failed - no token provided', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      
      return res.status(401).json({
        success: false,
        error: {
          type: 'AuthenticationError',
          message: 'Access token required',
        },
      });
    }
    
    jwt.verify(token, config.auth.jwtSecret, (err, user) => {
      if (err) {
        span.recordException(err);
        span.setAttributes({ 'auth.result': 'invalid_token' });
        
        logger.security('JWT authentication failed - invalid token', {
          error: err.message,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
        });
        
        return res.status(403).json({
          success: false,
          error: {
            type: 'AuthenticationError',
            message: 'Invalid or expired token',
          },
        });
      }
      
      span.setAttributes({
        'auth.result': 'success',
        'auth.user_id': user.id,
        'auth.user_role': user.role,
      });
      
      req.user = user;
      
      logger.debug('JWT authentication successful', {
        userId: user.id,
        role: user.role,
        path: req.path,
      });
      
      next();
    });
    
  } catch (error) {
    span.recordException(error);
    span.setAttributes({ 'auth.result': 'error' });
    
    logger.error('JWT authentication error', {
      error: error.message,
      ip: req.ip,
      path: req.path,
    });
    
    res.status(500).json({
      success: false,
      error: {
        type: 'InternalServerError',
        message: 'Authentication service error',
      },
    });
  } finally {
    span.end();
  }
};

/**
 * Optional JWT Authentication Middleware
 * Authenticates if token is present, but doesn't require it
 */
const optionalAuth = (req, res, next) => {
  const span = telemetryService.startSpan('auth.optional_jwt_authenticate');
  
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    span.setAttributes({
      'auth.type': 'jwt_optional',
      'auth.has_token': !!token,
    });
    
    if (!token) {
      span.setAttributes({ 'auth.result': 'no_token_optional' });
      req.user = null;
      return next();
    }
    
    jwt.verify(token, config.auth.jwtSecret, (err, user) => {
      if (err) {
        span.setAttributes({ 'auth.result': 'invalid_token_optional' });
        logger.debug('Optional JWT authentication failed', {
          error: err.message,
          ip: req.ip,
          path: req.path,
        });
        req.user = null;
      } else {
        span.setAttributes({
          'auth.result': 'success_optional',
          'auth.user_id': user.id,
          'auth.user_role': user.role,
        });
        req.user = user;
      }
      
      next();
    });
    
  } catch (error) {
    span.recordException(error);
    span.setAttributes({ 'auth.result': 'error_optional' });
    
    logger.error('Optional JWT authentication error', {
      error: error.message,
      ip: req.ip,
      path: req.path,
    });
    
    req.user = null;
    next();
  } finally {
    span.end();
  }
};

/**
 * Role-based Authorization Middleware
 */
const requireRoles = (...roles) => {
  return (req, res, next) => {
    const span = telemetryService.startSpan('auth.role_check');
    
    try {
      span.setAttributes({
        'auth.type': 'role_check',
        'auth.required_roles': roles.join(','),
        'auth.user_role': req.user?.role,
      });
      
      if (!req.user) {
        span.setAttributes({ 'auth.result': 'no_user' });
        logger.security('Role authorization failed - no authenticated user', {
          requiredRoles: roles,
          ip: req.ip,
          path: req.path,
        });
        
        return res.status(401).json({
          success: false,
          error: {
            type: 'AuthenticationError',
            message: 'Authentication required',
          },
        });
      }
      
      if (!roles.includes(req.user.role)) {
        span.setAttributes({ 'auth.result': 'insufficient_role' });
        logger.security('Role authorization failed - insufficient permissions', {
          userId: req.user.id,
          userRole: req.user.role,
          requiredRoles: roles,
          ip: req.ip,
          path: req.path,
        });
        
        return res.status(403).json({
          success: false,
          error: {
            type: 'AuthorizationError',
            message: 'Insufficient permissions',
          },
        });
      }
      
      span.setAttributes({ 'auth.result': 'role_authorized' });
      
      logger.debug('Role authorization successful', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
      });
      
      next();
      
    } catch (error) {
      span.recordException(error);
      span.setAttributes({ 'auth.result': 'role_error' });
      
      logger.error('Role authorization error', {
        error: error.message,
        userId: req.user?.id,
        requiredRoles: roles,
        path: req.path,
      });
      
      res.status(500).json({
        success: false,
        error: {
          type: 'InternalServerError',
          message: 'Authorization service error',
        },
      });
    } finally {
      span.end();
    }
  };
};

/**
 * Permission-based Authorization Middleware
 */
const requirePermissions = (...permissions) => {
  return (req, res, next) => {
    const span = telemetryService.startSpan('auth.permission_check');
    
    try {
      span.setAttributes({
        'auth.type': 'permission_check',
        'auth.required_permissions': permissions.join(','),
        'auth.user_permissions': req.user?.permissions?.join(',') || '',
      });
      
      if (!req.user) {
        span.setAttributes({ 'auth.result': 'no_user' });
        logger.security('Permission authorization failed - no authenticated user', {
          requiredPermissions: permissions,
          ip: req.ip,
          path: req.path,
        });
        
        return res.status(401).json({
          success: false,
          error: {
            type: 'AuthenticationError',
            message: 'Authentication required',
          },
        });
      }
      
      const userPermissions = req.user.permissions || [];
      const hasAllPermissions = permissions.every(permission => 
        userPermissions.includes(permission)
      );
      
      if (!hasAllPermissions) {
        span.setAttributes({ 'auth.result': 'insufficient_permissions' });
        logger.security('Permission authorization failed - insufficient permissions', {
          userId: req.user.id,
          userPermissions,
          requiredPermissions: permissions,
          ip: req.ip,
          path: req.path,
        });
        
        return res.status(403).json({
          success: false,
          error: {
            type: 'AuthorizationError',
            message: 'Insufficient permissions',
          },
        });
      }
      
      span.setAttributes({ 'auth.result': 'permission_authorized' });
      
      logger.debug('Permission authorization successful', {
        userId: req.user.id,
        userPermissions,
        requiredPermissions: permissions,
        path: req.path,
      });
      
      next();
      
    } catch (error) {
      span.recordException(error);
      span.setAttributes({ 'auth.result': 'permission_error' });
      
      logger.error('Permission authorization error', {
        error: error.message,
        userId: req.user?.id,
        requiredPermissions: permissions,
        path: req.path,
      });
      
      res.status(500).json({
        success: false,
        error: {
          type: 'InternalServerError',
          message: 'Authorization service error',
        },
      });
    } finally {
      span.end();
    }
  };
};

/**
 * API Key Authentication Middleware
 */
const authenticateApiKey = (req, res, next) => {
  const span = telemetryService.startSpan('auth.api_key_authenticate');
  
  try {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    span.setAttributes({
      'auth.type': 'api_key',
      'auth.has_api_key': !!apiKey,
    });
    
    if (!apiKey) {
      span.setAttributes({ 'auth.result': 'no_api_key' });
      logger.security('API key authentication failed - no key provided', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      
      return res.status(401).json({
        success: false,
        error: {
          type: 'AuthenticationError',
          message: 'API key required',
        },
      });
    }
    
    // Validate API key format
    if (!config.auth.apiKeys.includes(apiKey)) {
      span.setAttributes({ 'auth.result': 'invalid_api_key' });
      logger.security('API key authentication failed - invalid key', {
        apiKeyPrefix: apiKey.substring(0, 8) + '...',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });
      
      return res.status(403).json({
        success: false,
        error: {
          type: 'AuthenticationError',
          message: 'Invalid API key',
        },
      });
    }
    
    span.setAttributes({ 'auth.result': 'api_key_success' });
    
    // Set API key user context
    req.user = {
      id: 'api-key-user',
      role: 'api',
      permissions: ['database:read', 'database:write'],
      apiKey: true,
    };
    
    logger.debug('API key authentication successful', {
      apiKeyPrefix: apiKey.substring(0, 8) + '...',
      path: req.path,
    });
    
    next();
    
  } catch (error) {
    span.recordException(error);
    span.setAttributes({ 'auth.result': 'api_key_error' });
    
    logger.error('API key authentication error', {
      error: error.message,
      ip: req.ip,
      path: req.path,
    });
    
    res.status(500).json({
      success: false,
      error: {
        type: 'InternalServerError',
        message: 'Authentication service error',
      },
    });
  } finally {
    span.end();
  }
};

/**
 * Resource Ownership Middleware
 * Ensures user can only access their own resources
 */
const requireOwnership = (resourceIdParam = 'id', userIdField = 'userId') => {
  return async (req, res, next) => {
    const span = telemetryService.startSpan('auth.ownership_check');
    
    try {
      span.setAttributes({
        'auth.type': 'ownership_check',
        'auth.resource_id_param': resourceIdParam,
        'auth.user_id_field': userIdField,
      });
      
      if (!req.user) {
        span.setAttributes({ 'auth.result': 'no_user' });
        return res.status(401).json({
          success: false,
          error: {
            type: 'AuthenticationError',
            message: 'Authentication required',
          },
        });
      }
      
      // Skip ownership check for admin users
      if (req.user.role === 'admin') {
        span.setAttributes({ 'auth.result': 'admin_bypass' });
        return next();
      }
      
      const resourceId = req.params[resourceIdParam];
      
      if (!resourceId) {
        span.setAttributes({ 'auth.result': 'no_resource_id' });
        return res.status(400).json({
          success: false,
          error: {
            type: 'ValidationError',
            message: 'Resource ID required',
          },
        });
      }
      
      // For this implementation, we'll check if the resource belongs to the user
      // In a real implementation, you would query the database to check ownership
      const resourceUserId = req.body[userIdField] || req.query[userIdField];
      
      if (resourceUserId && resourceUserId !== req.user.id) {
        span.setAttributes({ 'auth.result': 'ownership_denied' });
        logger.security('Resource ownership check failed', {
          userId: req.user.id,
          resourceId,
          resourceUserId,
          path: req.path,
        });
        
        return res.status(403).json({
          success: false,
          error: {
            type: 'AuthorizationError',
            message: 'Access denied - resource not owned by user',
          },
        });
      }
      
      span.setAttributes({ 'auth.result': 'ownership_granted' });
      
      logger.debug('Resource ownership check passed', {
        userId: req.user.id,
        resourceId,
        path: req.path,
      });
      
      next();
      
    } catch (error) {
      span.recordException(error);
      span.setAttributes({ 'auth.result': 'ownership_error' });
      
      logger.error('Resource ownership check error', {
        error: error.message,
        userId: req.user?.id,
        resourceIdParam,
        path: req.path,
      });
      
      res.status(500).json({
        success: false,
        error: {
          type: 'InternalServerError',
          message: 'Authorization service error',
        },
      });
    } finally {
      span.end();
    }
  };
};

/**
 * Combined Authentication Middleware
 * Supports both JWT and API key authentication
 */
const authenticate = (req, res, next) => {
  const span = telemetryService.startSpan('auth.combined_authenticate');
  
  try {
    const authHeader = req.headers['authorization'];
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    span.setAttributes({
      'auth.type': 'combined',
      'auth.has_jwt': !!authHeader,
      'auth.has_api_key': !!apiKey,
    });
    
    // Try API key first
    if (apiKey) {
      return authenticateApiKey(req, res, next);
    }
    
    // Fall back to JWT
    if (authHeader) {
      return authenticateToken(req, res, next);
    }
    
    // No authentication provided
    span.setAttributes({ 'auth.result': 'no_auth' });
    logger.security('Authentication failed - no credentials provided', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
    });
    
    return res.status(401).json({
      success: false,
      error: {
        type: 'AuthenticationError',
        message: 'Authentication required (JWT token or API key)',
      },
    });
    
  } catch (error) {
    span.recordException(error);
    span.setAttributes({ 'auth.result': 'combined_error' });
    
    logger.error('Combined authentication error', {
      error: error.message,
      ip: req.ip,
      path: req.path,
    });
    
    res.status(500).json({
      success: false,
      error: {
        type: 'InternalServerError',
        message: 'Authentication service error',
      },
    });
  } finally {
    span.end();
  }
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireRoles,
  requirePermissions,
  authenticateApiKey,
  requireOwnership,
  authenticate,
};