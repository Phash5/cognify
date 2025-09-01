const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token is not valid. User not found.'
      });
    }
    
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated.'
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired.'
      });
    }
    
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication.'
    });
  }
};

// Middleware to check if user has specific role
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Please authenticate first.'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }
    
    next();
  };
};

// Middleware to check subscription level
const checkSubscription = (requiredLevel) => {
  const subscriptionLevels = {
    'free': 1,
    'pro': 2,
    'enterprise': 3
  };
  
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Please authenticate first.'
      });
    }
    
    const userLevel = subscriptionLevels[req.user.subscription.type] || 1;
    const required = subscriptionLevels[requiredLevel] || 1;
    
    if (userLevel < required) {
      return res.status(403).json({
        success: false,
        message: `This feature requires ${requiredLevel} subscription.`,
        currentSubscription: req.user.subscription.type,
        requiredSubscription: requiredLevel
      });
    }
    
    // Check if subscription is still active (for paid plans)
    if (req.user.subscription.type !== 'free' && req.user.subscription.endDate) {
      if (new Date() > req.user.subscription.endDate) {
        return res.status(403).json({
          success: false,
          message: 'Subscription has expired. Please renew to continue.',
          subscriptionExpired: true
        });
      }
    }
    
    next();
  };
};

// Middleware to check project ownership or collaboration
const checkProjectAccess = (requiredRole = 'viewer') => {
  const roleHierarchy = {
    'viewer': 1,
    'editor': 2,
    'admin': 3,
    'owner': 4
  };
  
  return async (req, res, next) => {
    try {
      const projectId = req.params.projectId || req.body.projectId;
      
      if (!projectId) {
        return res.status(400).json({
          success: false,
          message: 'Project ID is required.'
        });
      }
      
      const Project = require('../models/Project');
      const project = await Project.findById(projectId);
      
      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found.'
        });
      }
      
      let userRole = null;
      
      // Check if user is the owner
      if (project.owner.toString() === req.user._id.toString()) {
        userRole = 'owner';
      } else {
        // Check if user is a collaborator
        const collaboration = project.collaborators.find(
          collab => collab.user.toString() === req.user._id.toString()
        );
        
        if (collaboration) {
          userRole = collaboration.role;
        }
      }
      
      if (!userRole) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not a member of this project.'
        });
      }
      
      const userRoleLevel = roleHierarchy[userRole] || 0;
      const requiredRoleLevel = roleHierarchy[requiredRole] || 1;
      
      if (userRoleLevel < requiredRoleLevel) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required role: ${requiredRole} or higher.`,
          currentRole: userRole,
          requiredRole: requiredRole
        });
      }
      
      req.project = project;
      req.userRole = userRole;
      next();
    } catch (error) {
      console.error('Project access check error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error during project access check.'
      });
    }
  };
};

// Optional auth middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// Middleware to refresh token if it's about to expire
const refreshTokenIfNeeded = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.decode(token);
      const now = Date.now() / 1000;
      const timeUntilExpiry = decoded.exp - now;
      
      // If token expires in less than 1 hour, include refresh suggestion
      if (timeUntilExpiry < 3600) {
        res.set('X-Token-Refresh-Suggested', 'true');
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  auth,
  authorize,
  checkSubscription,
  checkProjectAccess,
  optionalAuth,
  refreshTokenIfNeeded
};