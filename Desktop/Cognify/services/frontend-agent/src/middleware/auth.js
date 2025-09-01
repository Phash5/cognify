const jwt = require('jsonwebtoken');
const { logger } = require('../config/logger');
const { tracer } = require('../config/telemetry');

/**
 * Authentication middleware for the Frontend AI Agent service
 */
class AuthMiddleware {
  /**
   * Verify JWT token
   */
  static verifyToken = (req, res, next) => {
    const span = tracer.startSpan('auth.verifyToken');
    
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          error: 'Authorization header is required'
        });
      }

      const token = authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Token is required'
        });
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        logger.error('JWT_SECRET environment variable is not set');
        return res.status(500).json({
          success: false,
          error: 'Server configuration error'
        });
      }

      const decoded = jwt.verify(token, secret);
      req.user = decoded;
      
      logger.debug('Token verified successfully', {
        userId: decoded.id,
        userType: decoded.type
      });
      
      next();
    } catch (error) {
      logger.warn('Token verification failed', {
        error: error.message,
        ip: req.ip
      });
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token has expired'
        });
      }
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token'
        });
      }
      
      return res.status(401).json({
        success: false,
        error: 'Authentication failed'
      });
    } finally {
      span.end();
    }
  };

  /**
   * Verify API key for service-to-service communication
   */
  static verifyApiKey = (req, res, next) => {
    const span = tracer.startSpan('auth.verifyApiKey');
    
    try {
      const apiKey = req.headers['x-api-key'] || req.query.apiKey;
      
      if (!apiKey) {
        return res.status(401).json({
          success: false,
          error: 'API key is required'
        });
      }

      const validApiKey = process.env.API_KEY;
      if (!validApiKey) {
        logger.error('API_KEY environment variable is not set');
        return res.status(500).json({
          success: false,
          error: 'Server configuration error'
        });
      }

      if (apiKey !== validApiKey) {
        logger.warn('Invalid API key provided', {
          providedKey: apiKey.substring(0, 8) + '...',
          ip: req.ip
        });
        return res.status(401).json({
          success: false,
          error: 'Invalid API key'
        });
      }

      logger.debug('API key verified successfully', {
        ip: req.ip
      });
      
      next();
    } catch (error) {
      logger.error('API key verification failed', {
        error: error.message,
        ip: req.ip
      });
      
      return res.status(500).json({
        success: false,
        error: 'Authentication failed'
      });
    } finally {
      span.end();
    }
  };

  /**
   * Optional authentication - allows both authenticated and unauthenticated requests
   */
  static optionalAuth = (req, res, next) => {
    const span = tracer.startSpan('auth.optionalAuth');
    
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        // No auth header, continue without user info
        req.user = null;
        return next();
      }

      const token = authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;

      if (!token) {
        req.user = null;
        return next();
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        req.user = null;
        return next();
      }

      try {
        const decoded = jwt.verify(token, secret);
        req.user = decoded;
        
        logger.debug('Optional auth - token verified', {
          userId: decoded.id
        });
      } catch (error) {
        // Invalid token, but continue without user info
        req.user = null;
        
        logger.debug('Optional auth - invalid token, continuing without auth', {
          error: error.message
        });
      }
      
      next();
    } catch (error) {
      logger.error('Optional auth middleware error', {
        error: error.message
      });
      
      req.user = null;
      next();
    } finally {
      span.end();
    }
  };

  /**
   * Check if user has required role
   */
  static requireRole = (requiredRole) => {
    return (req, res, next) => {
      const span = tracer.startSpan('auth.requireRole');
      
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required'
          });
        }

        if (!req.user.role || req.user.role !== requiredRole) {
          logger.warn('Insufficient permissions', {
            userId: req.user.id,
            userRole: req.user.role,
            requiredRole,
            ip: req.ip
          });
          
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions'
          });
        }

        logger.debug('Role check passed', {
          userId: req.user.id,
          role: req.user.role
        });
        
        next();
      } catch (error) {
        logger.error('Role check failed', {
          error: error.message,
          userId: req.user?.id
        });
        
        return res.status(500).json({
          success: false,
          error: 'Authorization failed'
        });
      } finally {
        span.end();
      }
    };
  };

  /**
   * Check if user has any of the required roles
   */
  static requireAnyRole = (requiredRoles) => {
    return (req, res, next) => {
      const span = tracer.startSpan('auth.requireAnyRole');
      
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required'
          });
        }

        if (!req.user.role || !requiredRoles.includes(req.user.role)) {
          logger.warn('Insufficient permissions for any required role', {
            userId: req.user.id,
            userRole: req.user.role,
            requiredRoles,
            ip: req.ip
          });
          
          return res.status(403).json({
            success: false,
            error: 'Insufficient permissions'
          });
        }

        logger.debug('Role check passed for any role', {
          userId: req.user.id,
          role: req.user.role,
          requiredRoles
        });
        
        next();
      } catch (error) {
        logger.error('Any role check failed', {
          error: error.message,
          userId: req.user?.id
        });
        
        return res.status(500).json({
          success: false,
          error: 'Authorization failed'
        });
      } finally {
        span.end();
      }
    };
  };
}

module.exports = { AuthMiddleware };