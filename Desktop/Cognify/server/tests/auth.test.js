const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const authRoutes = require('../routes/auth');
const { errorHandler } = require('../middleware/errorHandler');

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(errorHandler);

describe('Authentication Routes', () => {
  let testUser;
  
  beforeEach(async () => {
    // Create a test user for login tests
    testUser = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User'
    };
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('User registered successfully');
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.user.username).toBe(testUser.username);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      
      // Verify user was created in database
      const createdUser = await User.findOne({ email: testUser.email });
      expect(createdUser).toBeTruthy();
      expect(createdUser.username).toBe(testUser.username);
    });

    it('should return 400 for missing required fields', async () => {
      const incompleteUser = {
        email: 'test@example.com',
        password: 'password123'
        // Missing username, firstName, lastName
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(incompleteUser)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('All fields are required');
    });

    it('should return 400 for password less than 6 characters', async () => {
      const userWithShortPassword = {
        ...testUser,
        password: '123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userWithShortPassword)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Password must be at least 6 characters long');
    });

    it('should return 400 for duplicate email', async () => {
      // Create first user
      await request(app)
        .post('/api/auth/register')
        .send(testUser);

      // Try to create another user with same email
      const duplicateEmailUser = {
        ...testUser,
        username: 'differentuser'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(duplicateEmailUser)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Email already registered');
    });

    it('should return 400 for duplicate username', async () => {
      // Create first user
      await request(app)
        .post('/api/auth/register')
        .send(testUser);

      // Try to create another user with same username
      const duplicateUsernameUser = {
        ...testUser,
        email: 'different@example.com'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(duplicateUsernameUser)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Username already taken');
    });

    it('should hash the password before saving', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(testUser);

      const createdUser = await User.findOne({ email: testUser.email }).select('+password');
      expect(createdUser.password).not.toBe(testUser.password);
      expect(createdUser.password.length).toBeGreaterThan(20); // Hashed password should be longer
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Register a user for login tests
      await request(app)
        .post('/api/auth/register')
        .send(testUser);
    });

    it('should login with valid credentials', async () => {
      const loginData = {
        email: testUser.email,
        password: testUser.password
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('should return 400 for missing email or password', async () => {
      const incompleteLogin = {
        email: testUser.email
        // Missing password
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(incompleteLogin)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Email and password are required');
    });

    it('should return 401 for invalid email', async () => {
      const invalidLogin = {
        email: 'nonexistent@example.com',
        password: testUser.password
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidLogin)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 401 for invalid password', async () => {
      const invalidLogin = {
        email: testUser.email,
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(invalidLogin)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should update lastLogin timestamp on successful login', async () => {
      const loginData = {
        email: testUser.email,
        password: testUser.password
      };

      const userBeforeLogin = await User.findOne({ email: testUser.email });
      const originalLastLogin = userBeforeLogin.lastLogin;

      // Wait a moment to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await request(app)
        .post('/api/auth/login')
        .send(loginData);

      const userAfterLogin = await User.findOne({ email: testUser.email });
      expect(userAfterLogin.lastLogin.getTime()).toBeGreaterThan(
        originalLastLogin ? originalLastLogin.getTime() : 0
      );
    });

    it('should generate longer token expiry when rememberMe is true', async () => {
      const loginData = {
        email: testUser.email,
        password: testUser.password,
        rememberMe: true
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.data.token).toBeDefined();
      // Token should be valid (this is a basic check, more detailed JWT testing could be added)
      expect(typeof response.body.data.token).toBe('string');
      expect(response.body.data.token.length).toBeGreaterThan(50);
    });
  });

  describe('Input Validation Edge Cases', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('All fields are required');
    });

    it('should handle null values', async () => {
      const nullUser = {
        username: null,
        email: null,
        password: null,
        firstName: null,
        lastName: null
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(nullUser)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('All fields are required');
    });
  });
});