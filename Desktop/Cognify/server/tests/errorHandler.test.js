const { 
  errorHandler, 
  asyncHandler, 
  AppError, 
  notFound, 
  validationError, 
  unauthorizedError, 
  forbiddenError, 
  notFoundError, 
  conflictError, 
  serverError, 
  serviceUnavailableError 
} = require('../middleware/errorHandler');

describe('Error Handler Middleware', () => {
  let req, res, next;
  
  beforeEach(() => {
    req = {
      url: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent'),
      path: '/test',
      requestId: 'test-request-id'
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    next = jest.fn();
    
    // Mock console.error to avoid noise in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('errorHandler', () => {
    it('should handle generic errors with default 500 status', () => {
      const error = new Error('Test error');
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Test error'
      });
    });

    it('should handle AppError with custom status code', () => {
      const error = new AppError('Custom error', 400);
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Custom error'
      });
    });

    it('should handle Mongoose CastError', () => {
      const error = new Error('Cast error');
      error.name = 'CastError';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Resource not found'
      });
    });

    it('should handle Mongoose duplicate key error', () => {
      const error = new Error('Duplicate key');
      error.code = 11000;
      error.keyValue = { email: 'test@example.com' };
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Email already exists'
      });
    });

    it('should handle Mongoose validation error', () => {
      const error = new Error('Validation error');
      error.name = 'ValidationError';
      error.errors = {
        email: { message: 'Email is required' },
        password: { message: 'Password is required' }
      };
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Email is required, Password is required'
      });
    });

    it('should handle JWT JsonWebTokenError', () => {
      const error = new Error('JWT error');
      error.name = 'JsonWebTokenError';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token'
      });
    });

    it('should handle JWT TokenExpiredError', () => {
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token expired'
      });
    });

    it('should handle Multer LIMIT_FILE_SIZE error', () => {
      const error = new Error('File too large');
      error.code = 'LIMIT_FILE_SIZE';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'File too large'
      });
    });

    it('should handle Multer LIMIT_FILE_COUNT error', () => {
      const error = new Error('Too many files');
      error.code = 'LIMIT_FILE_COUNT';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Too many files'
      });
    });

    it('should handle Multer LIMIT_UNEXPECTED_FILE error', () => {
      const error = new Error('Unexpected file');
      error.code = 'LIMIT_UNEXPECTED_FILE';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Unexpected file field'
      });
    });

    it('should handle MongoDB MongoNetworkError', () => {
      const error = new Error('Network error');
      error.name = 'MongoNetworkError';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Database connection error'
      });
    });

    it('should handle MongoDB MongoTimeoutError', () => {
      const error = new Error('Timeout error');
      error.name = 'MongoTimeoutError';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Database timeout error'
      });
    });

    it('should handle rate limiting errors', () => {
      const error = new Error('Rate limit exceeded');
      error.status = 429;
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Too many requests, please try again later'
      });
    });

    it('should handle JSON syntax errors', () => {
      const error = new SyntaxError('Invalid JSON');
      error.status = 400;
      error.body = {};
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid JSON format'
      });
    });

    it('should include stack trace and error details in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const error = new Error('Test error');
      error.stack = 'Error stack trace';
      
      errorHandler(error, req, res, next);
      
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Test error',
        stack: 'Error stack trace',
        error: error,
        details: {
          name: 'Error',
          code: undefined,
          path: '/test',
          method: 'GET',
          timestamp: expect.any(String)
        },
        requestId: 'test-request-id'
      });
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should not include stack trace in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const error = new Error('Test error');
      
      errorHandler(error, req, res, next);
      
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Test error',
        requestId: 'test-request-id'
      });
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should log error details', () => {
      const error = new Error('Test error');
      
      errorHandler(error, req, res, next);
      
      expect(console.error).toHaveBeenCalledWith('Error:', {
        message: 'Test error',
        stack: error.stack,
        url: '/test',
        method: 'GET',
        ip: '127.0.0.1',
        userAgent: 'test-user-agent',
        timestamp: expect.any(String)
      });
    });
  });

  describe('asyncHandler', () => {
    it('should call next with error when async function throws', async () => {
      const asyncFn = jest.fn().mockRejectedValue(new Error('Async error'));
      const wrappedFn = asyncHandler(asyncFn);
      
      await wrappedFn(req, res, next);
      
      expect(next).toHaveBeenCalledWith(new Error('Async error'));
    });

    it('should not call next when async function succeeds', async () => {
      const asyncFn = jest.fn().mockResolvedValue('success');
      const wrappedFn = asyncHandler(asyncFn);
      
      await wrappedFn(req, res, next);
      
      expect(asyncFn).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle synchronous functions that return promises', async () => {
      const syncFn = jest.fn().mockReturnValue(Promise.resolve('success'));
      const wrappedFn = asyncHandler(syncFn);
      
      await wrappedFn(req, res, next);
      
      expect(syncFn).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('AppError', () => {
    it('should create error with message and status code', () => {
      const error = new AppError('Test message', 400);
      
      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test message', 400);
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });
  });

  describe('notFound', () => {
    it('should create 404 error and call next', () => {
      req.originalUrl = '/nonexistent';
      
      notFound(req, res, next);
      
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Route /nonexistent not found',
          statusCode: 404
        })
      );
    });
  });

  describe('Error Helper Functions', () => {
    describe('validationError', () => {
      it('should create validation error with message', () => {
        const error = validationError('Invalid input');
        
        expect(error.message).toBe('Invalid input');
        expect(error.statusCode).toBe(400);
      });

      it('should create validation error with field', () => {
        const error = validationError('Invalid email', 'email');
        
        expect(error.message).toBe('Invalid email');
        expect(error.statusCode).toBe(400);
        expect(error.field).toBe('email');
      });
    });

    describe('unauthorizedError', () => {
      it('should create unauthorized error with default message', () => {
        const error = unauthorizedError();
        
        expect(error.message).toBe('Unauthorized access');
        expect(error.statusCode).toBe(401);
      });

      it('should create unauthorized error with custom message', () => {
        const error = unauthorizedError('Custom unauthorized message');
        
        expect(error.message).toBe('Custom unauthorized message');
        expect(error.statusCode).toBe(401);
      });
    });

    describe('forbiddenError', () => {
      it('should create forbidden error with default message', () => {
        const error = forbiddenError();
        
        expect(error.message).toBe('Access forbidden');
        expect(error.statusCode).toBe(403);
      });

      it('should create forbidden error with custom message', () => {
        const error = forbiddenError('Custom forbidden message');
        
        expect(error.message).toBe('Custom forbidden message');
        expect(error.statusCode).toBe(403);
      });
    });

    describe('notFoundError', () => {
      it('should create not found error with default message', () => {
        const error = notFoundError();
        
        expect(error.message).toBe('Resource not found');
        expect(error.statusCode).toBe(404);
      });

      it('should create not found error with custom resource', () => {
        const error = notFoundError('User');
        
        expect(error.message).toBe('User not found');
        expect(error.statusCode).toBe(404);
      });
    });

    describe('conflictError', () => {
      it('should create conflict error with default message', () => {
        const error = conflictError();
        
        expect(error.message).toBe('Resource conflict');
        expect(error.statusCode).toBe(409);
      });

      it('should create conflict error with custom message', () => {
        const error = conflictError('Custom conflict message');
        
        expect(error.message).toBe('Custom conflict message');
        expect(error.statusCode).toBe(409);
      });
    });

    describe('serverError', () => {
      it('should create server error with default message', () => {
        const error = serverError();
        
        expect(error.message).toBe('Internal server error');
        expect(error.statusCode).toBe(500);
      });

      it('should create server error with custom message', () => {
        const error = serverError('Custom server error');
        
        expect(error.message).toBe('Custom server error');
        expect(error.statusCode).toBe(500);
      });
    });

    describe('serviceUnavailableError', () => {
      it('should create service unavailable error with default message', () => {
        const error = serviceUnavailableError();
        
        expect(error.message).toBe('Service temporarily unavailable');
        expect(error.statusCode).toBe(503);
      });

      it('should create service unavailable error with custom message', () => {
        const error = serviceUnavailableError('Custom service error');
        
        expect(error.message).toBe('Custom service error');
        expect(error.statusCode).toBe(503);
      });
    });
  });
});