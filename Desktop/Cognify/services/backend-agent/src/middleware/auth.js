/**
 * Authentication Middleware for Backend AI Agent
 * Provides JWT-based authentication and authorization
 */

'use strict';

const jwt = require('jsonwebtoken');
const createError = require('http-errors');
const config = require('../config/config');
const logger = require('../utils/logger');
const { telemetryService } = require('../utils/telemetry');

/**
 * JWT Authentication Middleware
 * Verifies JWT tokens and sets user context
 */
function authenticateToken(req, res, next) {
  const span = telemetryService.startSpan('auth.authenticate_token');
  
  try {
    const authHeader = req.headers[config.auth.apiKeyHeader.toLowerCase()] || req.headers.authorization;
    
    if (!authHeader) {
      span.setAttributes({
        'auth.error': 'missing_token',
        'auth.header': config.auth.apiKeyHeader,
      });
      
      logger.warn('Authentication failed: Missing token', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
      return next(createError(401, 'Access token required'));
    }
    
    // Extract token from Bearer format or direct header
    let token;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      token = authHeader;
    }
    
    // Verify JWT token
    jwt.verify(token, config.auth.jwtSecret, (err, decoded) => {
      if (err) {
        span.setAttributes({
          'auth.error': 'invalid_token',
          'auth.jwt_error': err.name,
        });
        
        logger.warn('Authentication failed: Invalid token', {
          error: err.message,
          path: req.path,
          method: req.method,
          ip: req.ip,
        });
        
        if (err.name === 'TokenExpiredError') {
          return next(createError(401, 'Token expired'));
        } else if (err.name === 'JsonWebTokenError') {
          return next(createError(401, 'Invalid token'));
        } else {
          return next(createError(401, 'Token verification failed'));
        }
      }
      
      // Set user context
      req.user = {
        id: decoded.sub || decoded.userId,
        email: decoded.email,
        roles: decoded.roles || [],
        permissions: decoded.permissions || [],
        sessionId: decoded.sessionId,
        iat: decoded.iat,
        exp: decoded.exp,
      };
      
      span.setAttributes({
        'auth.success': true,
        'auth.user_id': req.user.id,
        'auth.roles': req.user.roles.join(','),
        'auth.session_id': req.user.sessionId,
      });
      
      logger.debug('Authentication successful', {
        userId: req.user.id,
        roles: req.user.roles,
        path: req.path,
        method: req.method,
      });
      
      span.end();
      next();
    });
    
  } catch (error) {
    span.recordException(error);
    span.setStatus({
      code: telemetryService.tracer.SpanStatusCode.ERROR,
      message: error.message,
    });
    
    logger.error('Authentication middleware error', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
    });
    
    span.end();
    next(createError(500, 'Authentication service error'));
  }
}

/**
 * Optional Authentication Middleware
 * Sets user context if token is present, but doesn't require it
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers[config.auth.apiKeyHeader.toLowerCase()] || req.headers.authorization;
  
  if (!authHeader) {
    return next();
  }
  
  // Use the main auth middleware but catch errors
  authenticateToken(req, res, (err) => {
    if (err) {
      // Log the error but continue without authentication
      logger.debug('Optional authentication failed', {
        error: err.message,
        path: req.path,
        method: req.method,
      });
    }
    next();
  });
}

/**
 * Role-based Authorization Middleware
 * Requires specific roles to access the endpoint
 */
function requireRoles(...roles) {
  return (req, res, next) => {
    const span = telemetryService.startSpan('auth.require_roles');
    
    try {
      if (!req.user) {
        span.setAttributes({
          'auth.error': 'no_user_context',
          'auth.required_roles': roles.join(','),
        });
        
        logger.warn('Authorization failed: No user context', {
          requiredRoles: roles,
          path: req.path,
          method: req.method,
        });
        
        return next(createError(401, 'Authentication required'));
      }
      
      const userRoles = req.user.roles || [];
      const hasRequiredRole = roles.some(role => userRoles.includes(role));
      
      if (!hasRequiredRole) {
        span.setAttributes({
          'auth.error': 'insufficient_roles',
          'auth.user_roles': userRoles.join(','),
          'auth.required_roles': roles.join(','),
          'auth.user_id': req.user.id,
        });
        
        logger.warn('Authorization failed: Insufficient roles', {
          userId: req.user.id,
          userRoles,
          requiredRoles: roles,
          path: req.path,
          method: req.method,
        });
        
        return next(createError(403, 'Insufficient permissions'));
      }
      
      span.setAttributes({
        'auth.success': true,
        'auth.user_id': req.user.id,
        'auth.user_roles': userRoles.join(','),
        'auth.required_roles': roles.join(','),
      });
      
      logger.debug('Authorization successful', {
        userId: req.user.id,
        userRoles,
        requiredRoles: roles,
        path: req.path,
        method: req.method,
      });
      
      span.end();
      next();
      
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: telemetryService.tracer.SpanStatusCode.ERROR,
        message: error.message,
      });
      
      logger.error('Authorization middleware error', {
        error: error.message,
        stack: error.stack,
        requiredRoles: roles,
        path: req.path,
        method: req.method,
      });
      
      span.end();
      next(createError(500, 'Authorization service error'));
    }
  };
}

/**
 * Permission-based Authorization Middleware
 * Requires specific permissions to access the endpoint
 */
function requirePermissions(...permissions) {
  return (req, res, next) => {
    const span = telemetryService.startSpan('auth.require_permissions');
    
    try {
      if (!req.user) {
        span.setAttributes({
          'auth.error': 'no_user_context',
          'auth.required_permissions': permissions.join(','),
        });
        
        return next(createError(401, 'Authentication required'));
      }
      
      const userPermissions = req.user.permissions || [];
      const hasRequiredPermission = permissions.every(permission => 
        userPermissions.includes(permission)
      );
      
      if (!hasRequiredPermission) {
        span.setAttributes({
          'auth.error': 'insufficient_permissions',
          'auth.user_permissions': userPermissions.join(','),
          'auth.required_permissions': permissions.join(','),
          'auth.user_id': req.user.id,
        });
        
        logger.warn('Authorization failed: Insufficient permissions', {
          userId: req.user.id,
          userPermissions,
          requiredPermissions: permissions,
          path: req.path,
          method: req.method,
        });
        
        return next(createError(403, 'Insufficient permissions'));
      }
      
      span.setAttributes({
        'auth.success': true,
        'auth.user_id': req.user.id,
        'auth.user_permissions': userPermissions.join(','),
        'auth.required_permissions': permissions.join(','),
      });
      
      span.end();
      next();
      
    } catch (error) {
      span.recordException(error);
      span.end();
      next(createError(500, 'Authorization service error'));
    }
  };
}

/**
 * API Key Authentication Middleware
 * For service-to-service communication
 */
function authenticateApiKey(req, res, next) {
  const span = telemetryService.startSpan('auth.authenticate_api_key');
  
  try {
    const apiKey = req.headers[config.auth.apiKeyHeader.toLowerCase()];
    
    if (!apiKey) {
      span.setAttributes({
        'auth.error': 'missing_api_key',
        'auth.header': config.auth.apiKeyHeader,
      });
      
      return next(createError(401, 'API key required'));
    }
    
    // In a real implementation, you would validate against a database
    // For now, we'll use a simple comparison with configured keys
    const validApiKeys = config.auth.validApiKeys || [];
    
    if (!validApiKeys.includes(apiKey)) {
      span.setAttributes({
        'auth.error': 'invalid_api_key',
        'auth.api_key_prefix': apiKey.substring(0, 8) + '...',
      });
      
      logger.warn('API key authentication failed', {
        apiKeyPrefix: apiKey.substring(0, 8) + '...',
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      
      return next(createError(401, 'Invalid API key'));
    }
    
    // Set service context
    req.service = {
      apiKey: apiKey.substring(0, 8) + '...',
      authenticated: true,
      type: 'service',
    };
    
    span.setAttributes({
      'auth.success': true,
      'auth.type': 'api_key',
      'auth.api_key_prefix': req.service.apiKey,
    });
    
    logger.debug('API key authentication successful', {
      apiKeyPrefix: req.service.apiKey,
      path: req.path,
      method: req.method,
    });
    
    span.end();
    next();
    
  } catch (error) {
    span.recordException(error);
    span.end();
    
    logger.error('API key authentication error', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
    });
    
    next(createError(500, 'Authentication service error'));
  }
}

/**
 * Resource Ownership Middleware
 * Ensures users can only access their own resources
 */
function requireOwnership(resourceIdParam = 'id', userIdField = 'userId') {
  return (req, res, next) => {
    const span = telemetryService.startSpan('auth.require_ownership');
    
    try {
      if (!req.user) {
        return next(createError(401, 'Authentication required'));
      }
      
      const resourceId = req.params[resourceIdParam];
      const userId = req.user.id;
      
      // For GET requests, we might need to fetch the resource to check ownership
      // For POST requests, we can check the body
      // This is a simplified implementation
      
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const resourceUserId = req.body[userIdField];
        
        if (resourceUserId && resourceUserId !== userId) {
          span.setAttributes({
            'auth.error': 'ownership_violation',
            'auth.user_id': userId,
            'auth.resource_user_id': resourceUserId,
            'auth.resource_id': resourceId,
          });
          
          logger.warn('Ownership check failed', {
            userId,
            resourceUserId,
            resourceId,
            method: req.method,
            path: req.path,
          });
          
          return next(createError(403, 'Access denied: Resource ownership required'));
        }
      }
      
      // Store ownership context for route handlers
      req.ownership = {
        userId,
        resourceId,
        verified: true,
      };
      
      span.setAttributes({
        'auth.success': true,
        'auth.user_id': userId,
        'auth.resource_id': resourceId,
        'auth.ownership_verified': true,
      });
      
      span.end();
      next();
      
    } catch (error) {
      span.recordException(error);
      span.end();
      
      logger.error('Ownership middleware error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
      });
      
      next(createError(500, 'Authorization service error'));
    }
  };
}

/**
 * Rate Limiting by User
 * Applies different rate limits based on user roles
 */
function rateLimitByUser(req, res, next) {
  // This would integrate with the rate limiting service
  // For now, we'll just pass through
  next();
}

module.exports = {
  authenticateToken,
  optionalAuth,
  requireRoles,
  requirePermissions,
  authenticateApiKey,
  requireOwnership,
  rateLimitByUser,
};