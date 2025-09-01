const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth, authorize, optionalAuth } = require('../middleware/auth');

// Mock User model
jest.mock('../models/User');

describe('Auth Middleware', () => {
  let req, res, next;
  let mockUser;

  beforeEach(() => {
    req = {
      header: jest.fn(),
      user: null
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    next = jest.fn();
    
    mockUser = {
      _id: 'user123',
      email: 'test@example.com',
      username: 'testuser',
      role: 'user',
      isActive: true
    };
    
    // Mock environment variables
    process.env.JWT_SECRET = 'test-secret';
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('auth middleware', () => {
    it('should authenticate user with valid token', async () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);
      
      User.findById.mockResolvedValue(mockUser);
      
      await auth(req, res, next);
      
      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalledWith();
    });

    it('should return 401 when no token provided', async () => {
      req.header.mockReturnValue(null);
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied. No token provided.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when token is invalid', async () => {
      req.header.mockReturnValue('Bearer invalid-token');
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when token is expired', async () => {
      const expiredToken = jwt.sign(
        { id: 'user123', exp: Math.floor(Date.now() / 1000) - 60 }, // Expired 1 minute ago
        process.env.JWT_SECRET
      );
      req.header.mockReturnValue(`Bearer ${expiredToken}`);
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token expired.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when user not found', async () => {
      const token = jwt.sign({ id: 'nonexistent' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);
      
      User.findById.mockResolvedValue(null);
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token is not valid. User not found.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when user account is deactivated', async () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);
      
      const inactiveUser = { ...mockUser, isActive: false };
      User.findById.mockResolvedValue(inactiveUser);
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Account is deactivated.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle token without Bearer prefix', async () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(token); // No "Bearer " prefix
      
      User.findById.mockResolvedValue(mockUser);
      
      await auth(req, res, next);
      
      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalledWith();
    });

    it('should return 500 on database error', async () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);
      
      User.findById.mockRejectedValue(new Error('Database error'));
      
      // Mock console.error to avoid noise in tests
      jest.spyOn(console, 'error').mockImplementation(() => {});
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server error during authentication.'
      });
      expect(next).not.toHaveBeenCalled();
      
      console.error.mockRestore();
    });

    it('should exclude password field when finding user', async () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);
      
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });
      
      await auth(req, res, next);
      
      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(User.findById().select).toHaveBeenCalledWith('-password');
    });
  });

  describe('authorize middleware', () => {
    beforeEach(() => {
      req.user = mockUser;
    });

    it('should allow access for user with correct role', () => {
      const middleware = authorize('user', 'admin');
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalledWith();
    });

    it('should deny access for user with incorrect role', () => {
      req.user.role = 'user';
      const middleware = authorize('admin');
      
      middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied. Required role: admin'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access when user is not authenticated', () => {
      req.user = null;
      const middleware = authorize('user');
      
      middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied. Please authenticate first.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow access for user with any of multiple roles', () => {
      req.user.role = 'admin';
      const middleware = authorize('user', 'admin', 'developer');
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalledWith();
    });

    it('should show multiple roles in error message', () => {
      req.user.role = 'user';
      const middleware = authorize('admin', 'developer');
      
      middleware(req, res, next);
      
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied. Required role: admin or developer'
      });
    });
  });

  describe('optionalAuth middleware', () => {
    it('should set user when valid token is provided', async () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);
      
      User.findById.mockResolvedValue(mockUser);
      
      await optionalAuth(req, res, next);
      
      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalledWith();
    });

    it('should continue without user when no token is provided', async () => {
      req.header.mockReturnValue(null);
      
      await optionalAuth(req, res, next);
      
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    it('should continue without user when token is invalid', async () => {
      req.header.mockReturnValue('Bearer invalid-token');
      
      await optionalAuth(req, res, next);
      
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    it('should continue without user when user is not found', async () => {
      const token = jwt.sign({ id: 'nonexistent' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);
      
      User.findById.mockResolvedValue(null);
      
      await optionalAuth(req, res, next);
      
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    it('should continue without user when user is inactive', async () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);
      
      const inactiveUser = { ...mockUser, isActive: false };
      User.findById.mockResolvedValue(inactiveUser);
      
      await optionalAuth(req, res, next);
      
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    it('should continue without user on database error', async () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);
      
      User.findById.mockRejectedValue(new Error('Database error'));
      
      await optionalAuth(req, res, next);
      
      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    it('should exclude password field when finding user', async () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);
      
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });
      
      await optionalAuth(req, res, next);
      
      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(User.findById().select).toHaveBeenCalledWith('-password');
    });
  });

  describe('Token Extraction', () => {
    it('should extract token from Authorization header with Bearer prefix', async () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);
      
      User.findById.mockResolvedValue(mockUser);
      
      await auth(req, res, next);
      
      expect(req.user).toEqual(mockUser);
    });

    it('should handle Authorization header without Bearer prefix', async () => {
      const token = jwt.sign({ id: 'user123' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(token);
      
      User.findById.mockResolvedValue(mockUser);
      
      await auth(req, res, next);
      
      expect(req.user).toEqual(mockUser);
    });

    it('should handle empty Authorization header', async () => {
      req.header.mockReturnValue('');
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied. No token provided.'
      });
    });

    it('should handle whitespace-only Authorization header', async () => {
      req.header.mockReturnValue('   ');
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied. No token provided.'
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed JWT token', async () => {
      req.header.mockReturnValue('Bearer malformed.token.here');
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token.'
      });
    });

    it('should handle JWT with wrong secret', async () => {
      const token = jwt.sign({ id: 'user123' }, 'wrong-secret');
      req.header.mockReturnValue(`Bearer ${token}`);
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token.'
      });
    });

    it('should handle JWT without user ID', async () => {
      const token = jwt.sign({ email: 'test@example.com' }, process.env.JWT_SECRET);
      req.header.mockReturnValue(`Bearer ${token}`);
      
      User.findById.mockResolvedValue(null);
      
      await auth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token is not valid. User not found.'
      });
    });
  });
});