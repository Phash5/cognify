const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

describe('User Model', () => {
  let validUserData;

  beforeEach(() => {
    validUserData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User'
    };
  });

  describe('Schema Validation', () => {
    it('should create a user with valid data', async () => {
      const user = new User(validUserData);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect(savedUser.username).toBe(validUserData.username);
      expect(savedUser.email).toBe(validUserData.email);
      expect(savedUser.firstName).toBe(validUserData.firstName);
      expect(savedUser.lastName).toBe(validUserData.lastName);
      expect(savedUser.role).toBe('user'); // default value
      expect(savedUser.subscription.type).toBe('free'); // default value
      expect(savedUser.preferences.theme).toBe('auto'); // default value
      expect(savedUser.isActive).toBe(true); // default value
      expect(savedUser.emailVerified).toBe(false); // default value
    });

    it('should fail validation for missing required fields', async () => {
      const user = new User({});
      
      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.username).toBeDefined();
      expect(error.errors.email).toBeDefined();
      expect(error.errors.password).toBeDefined();
      expect(error.errors.firstName).toBeDefined();
      expect(error.errors.lastName).toBeDefined();
    });

    it('should fail validation for username less than 3 characters', async () => {
      const user = new User({
        ...validUserData,
        username: 'ab'
      });

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.username.message).toBe('Username must be at least 3 characters');
    });

    it('should fail validation for username more than 30 characters', async () => {
      const user = new User({
        ...validUserData,
        username: 'a'.repeat(31)
      });

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.username.message).toBe('Username cannot exceed 30 characters');
    });

    it('should fail validation for invalid email format', async () => {
      const user = new User({
        ...validUserData,
        email: 'invalid-email'
      });

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.email.message).toBe('Please enter a valid email');
    });

    it('should fail validation for password less than 6 characters', async () => {
      const user = new User({
        ...validUserData,
        password: '123'
      });

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.password.message).toBe('Password must be at least 6 characters');
    });

    it('should fail validation for firstName more than 50 characters', async () => {
      const user = new User({
        ...validUserData,
        firstName: 'a'.repeat(51)
      });

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.firstName.message).toBe('First name cannot exceed 50 characters');
    });

    it('should fail validation for lastName more than 50 characters', async () => {
      const user = new User({
        ...validUserData,
        lastName: 'a'.repeat(51)
      });

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.lastName.message).toBe('Last name cannot exceed 50 characters');
    });

    it('should fail validation for invalid role', async () => {
      const user = new User({
        ...validUserData,
        role: 'invalid-role'
      });

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.role).toBeDefined();
    });

    it('should fail validation for invalid subscription type', async () => {
      const user = new User({
        ...validUserData,
        subscription: { type: 'invalid-subscription' }
      });

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors['subscription.type']).toBeDefined();
    });

    it('should fail validation for invalid theme preference', async () => {
      const user = new User({
        ...validUserData,
        preferences: { theme: 'invalid-theme' }
      });

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors['preferences.theme']).toBeDefined();
    });

    it('should convert email to lowercase', async () => {
      const user = new User({
        ...validUserData,
        email: 'TEST@EXAMPLE.COM'
      });
      const savedUser = await user.save();

      expect(savedUser.email).toBe('test@example.com');
    });

    it('should trim whitespace from username, firstName, and lastName', async () => {
      const user = new User({
        ...validUserData,
        username: '  testuser  ',
        firstName: '  Test  ',
        lastName: '  User  '
      });
      const savedUser = await user.save();

      expect(savedUser.username).toBe('testuser');
      expect(savedUser.firstName).toBe('Test');
      expect(savedUser.lastName).toBe('User');
    });
  });

  describe('Virtual Properties', () => {
    it('should return full name from virtual property', async () => {
      const user = new User(validUserData);
      const savedUser = await user.save();

      expect(savedUser.fullName).toBe('Test User');
    });
  });

  describe('Pre-save Middleware', () => {
    it('should hash password before saving', async () => {
      const user = new User(validUserData);
      const savedUser = await user.save();

      // Get user with password field
      const userWithPassword = await User.findById(savedUser._id).select('+password');
      
      expect(userWithPassword.password).not.toBe(validUserData.password);
      expect(userWithPassword.password.length).toBeGreaterThan(20);
      expect(userWithPassword.password.startsWith('$2a$')).toBe(true); // bcrypt hash format
    });

    it('should not rehash password if not modified', async () => {
      const user = new User(validUserData);
      const savedUser = await user.save();
      
      const userWithPassword = await User.findById(savedUser._id).select('+password');
      const originalHash = userWithPassword.password;
      
      // Update a different field
      userWithPassword.firstName = 'Updated';
      await userWithPassword.save();
      
      const updatedUser = await User.findById(savedUser._id).select('+password');
      expect(updatedUser.password).toBe(originalHash);
    });
  });

  describe('Instance Methods', () => {
    let user;
    
    beforeEach(async () => {
      user = new User(validUserData);
      await user.save();
    });

    describe('comparePassword', () => {
      it('should return true for correct password', async () => {
        const userWithPassword = await User.findById(user._id).select('+password');
        const isMatch = await userWithPassword.comparePassword('password123');
        
        expect(isMatch).toBe(true);
      });

      it('should return false for incorrect password', async () => {
        const userWithPassword = await User.findById(user._id).select('+password');
        const isMatch = await userWithPassword.comparePassword('wrongpassword');
        
        expect(isMatch).toBe(false);
      });
    });

    describe('generateAuthToken', () => {
      it('should generate a valid JWT token', () => {
        const token = user.generateAuthToken();
        
        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        
        // Verify token can be decoded
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        expect(decoded.id).toBe(user._id.toString());
        expect(decoded.email).toBe(user.email);
        expect(decoded.role).toBe(user.role);
      });
    });

    describe('generateRefreshToken', () => {
      it('should generate a valid refresh token', () => {
        const refreshToken = user.generateRefreshToken();
        
        expect(refreshToken).toBeDefined();
        expect(typeof refreshToken).toBe('string');
        
        // Verify token can be decoded
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        expect(decoded.id).toBe(user._id.toString());
      });
    });

    describe('generatePasswordResetToken', () => {
      it('should generate password reset token and set expiry', () => {
        const resetToken = user.generatePasswordResetToken();
        
        expect(resetToken).toBeDefined();
        expect(typeof resetToken).toBe('string');
        expect(resetToken.length).toBe(64); // 32 bytes as hex string
        
        expect(user.resetPasswordToken).toBeDefined();
        expect(user.resetPasswordExpire).toBeDefined();
        expect(user.resetPasswordExpire.getTime()).toBeGreaterThan(Date.now());
      });
    });
  });

  describe('Static Methods', () => {
    let user;
    
    beforeEach(async () => {
      user = new User(validUserData);
      await user.save();
    });

    describe('findByCredentials', () => {
      it('should return user for valid credentials', async () => {
        const foundUser = await User.findByCredentials('test@example.com', 'password123');
        
        expect(foundUser).toBeDefined();
        expect(foundUser._id.toString()).toBe(user._id.toString());
        expect(foundUser.email).toBe(user.email);
      });

      it('should throw error for invalid email', async () => {
        await expect(
          User.findByCredentials('nonexistent@example.com', 'password123')
        ).rejects.toThrow('Invalid credentials');
      });

      it('should throw error for invalid password', async () => {
        await expect(
          User.findByCredentials('test@example.com', 'wrongpassword')
        ).rejects.toThrow('Invalid credentials');
      });
    });
  });

  describe('Unique Constraints', () => {
    beforeEach(async () => {
      const user = new User(validUserData);
      await user.save();
    });

    it('should not allow duplicate email', async () => {
      const duplicateUser = new User({
        ...validUserData,
        username: 'differentuser'
      });

      await expect(duplicateUser.save()).rejects.toThrow();
    });

    it('should not allow duplicate username', async () => {
      const duplicateUser = new User({
        ...validUserData,
        email: 'different@example.com'
      });

      await expect(duplicateUser.save()).rejects.toThrow();
    });
  });

  describe('Default Values', () => {
    it('should set correct default values', async () => {
      const user = new User(validUserData);
      const savedUser = await user.save();

      expect(savedUser.role).toBe('user');
      expect(savedUser.subscription.type).toBe('free');
      expect(savedUser.subscription.startDate).toBeDefined();
      expect(savedUser.subscription.endDate).toBeNull();
      expect(savedUser.subscription.stripeCustomerId).toBeNull();
      expect(savedUser.preferences.theme).toBe('auto');
      expect(savedUser.preferences.language).toBe('en');
      expect(savedUser.preferences.notifications.email).toBe(true);
      expect(savedUser.preferences.notifications.push).toBe(true);
      expect(savedUser.lastLogin).toBeNull();
      expect(savedUser.isActive).toBe(true);
      expect(savedUser.emailVerified).toBe(false);
      expect(savedUser.emailVerificationToken).toBeNull();
      expect(savedUser.resetPasswordToken).toBeNull();
      expect(savedUser.resetPasswordExpire).toBeNull();
      expect(savedUser.avatar).toBeNull();
    });
  });
});