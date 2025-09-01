// Define mockAxiosInstance before using it in jest.mock
const mockAxiosInstance = {
  interceptors: {
    request: {
      use: jest.fn(),
      eject: jest.fn(),
    },
    response: {
      use: jest.fn(),
      eject: jest.fn(),
    },
  },
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
};

// Mock axios before importing anything else
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => mockAxiosInstance),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  },
}));

import { renderHook, act } from '@testing-library/react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';

const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock react-hot-toast
jest.mock('react-hot-toast');
const mockedToast = toast as jest.Mocked<typeof toast>;

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('AuthStore', () => {
  const mockUser = {
    _id: '1',
    username: 'testuser',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'user' as const,
    subscription: {
      plan: 'free' as const,
      status: 'active' as const,
    },
    preferences: {
      theme: 'light' as const,
      language: 'en',
      notifications: {
        email: true,
        push: true,
        desktop: true,
      },
    },
    createdAt: '2023-01-01',
    updatedAt: '2023-01-01',
  };

  const mockToken = 'mock-jwt-token';

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    
    // Reset store state
    useAuthStore.setState({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
    });

    // Reset all mock functions
    mockAxiosInstance.get.mockReset();
    mockAxiosInstance.post.mockReset();
    mockAxiosInstance.put.mockReset();
    mockAxiosInstance.delete.mockReset();
    mockAxiosInstance.patch.mockReset();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useAuthStore());
      
      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('Login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockResponse = {
        data: {
          data: {
            user: mockUser,
            token: mockToken,
          },
        },
      };

      // Reset and setup the mock for this test
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());
      
      await act(async () => {
        await result.current.login({
          email: 'test@example.com',
          password: 'password123',
        });
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.token).toBe(mockToken);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(mockedToast.success).toHaveBeenCalledWith(`Welcome back, ${mockUser.username}!`);
    });

    it('should handle login failure', async () => {
      const mockError = {
        response: {
          data: {
            message: 'Invalid credentials',
          },
        },
      };

      // Reset and setup the mock for this test
      mockAxiosInstance.post.mockRejectedValue(mockError);

      const { result } = renderHook(() => useAuthStore());
      
      await act(async () => {
        try {
          await result.current.login({
            email: 'test@example.com',
            password: 'wrongpassword',
          });
        } catch (error) {
          // Expected to throw
        }
      });

      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(mockedToast.error).toHaveBeenCalledWith('Invalid credentials');
    });

    it('should handle network error during login', async () => {
      const mockError = new Error('Network Error');

      // Reset and setup the mock for this test
      mockAxiosInstance.post.mockRejectedValue(mockError);

      const { result } = renderHook(() => useAuthStore());
      
      await act(async () => {
        try {
          await result.current.login({
            email: 'test@example.com',
            password: 'password123',
          });
        } catch (error) {
          // Expected to throw
        }
      });

      expect(result.current.isLoading).toBe(false);
      expect(mockedToast.error).toHaveBeenCalledWith('Login failed');
    });
  });

  describe('Register', () => {
    it('should register successfully with valid data', async () => {
      const mockResponse = {
        data: {
          data: {
            user: mockUser,
            token: mockToken,
          },
        },
      };

      // Reset and setup the mock for this test
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());
      
      await act(async () => {
        await result.current.register({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
        });
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.token).toBe(mockToken);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(mockedToast.success).toHaveBeenCalledWith(`Welcome to Cognify, ${mockUser.username}!`);
    });

    it('should handle registration failure', async () => {
      const mockError = {
        response: {
          data: {
            message: 'Email already exists',
          },
        },
      };

      const mockApi = {
        post: jest.fn().mockRejectedValue(mockError),
        get: jest.fn(),
        put: jest.fn(),
      };
      
      mockedAxios.create.mockReturnValue(mockApi as any);

      const { result } = renderHook(() => useAuthStore());
      
      await act(async () => {
        try {
          await result.current.register({
            username: 'testuser',
            email: 'test@example.com',
            password: 'password123',
          });
        } catch (error) {
          // Expected to throw
        }
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(mockedToast.error).toHaveBeenCalledWith('Registration failed');
    });
  });

  describe('Logout', () => {
    it('should logout and clear state', () => {
      const { result } = renderHook(() => useAuthStore());
      
      // Set initial authenticated state
      act(() => {
        useAuthStore.setState({
          user: mockUser,
          token: mockToken,
          isAuthenticated: true,
        });
      });

      act(() => {
        result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth-storage');
      expect(mockedToast.success).toHaveBeenCalledWith('Logged out successfully');
    });
  });

  describe('Check Auth', () => {
    it('should validate existing token and set user', async () => {
      const mockResponse = {
        data: {
          data: {
            user: mockUser,
          },
        },
      };

      // Reset and setup the mock for this test
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());
      
      // Set token first
      act(() => {
        useAuthStore.setState({ token: mockToken });
      });

      await act(async () => {
        await result.current.checkAuth();
      });

      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle invalid token', async () => {
      const mockError = {
        response: {
          status: 401,
        },
      };

      // Reset and setup the mock for this test
      mockAxiosInstance.get.mockRejectedValue(mockError);

      const { result } = renderHook(() => useAuthStore());
      
      // Set token first
      act(() => {
        useAuthStore.setState({ token: 'invalid-token' });
      });

      await act(async () => {
        await result.current.checkAuth();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth-storage');
    });

    it('should skip check if no token exists', async () => {
      const { result } = renderHook(() => useAuthStore());
      
      await act(async () => {
        await result.current.checkAuth();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  describe('Update User', () => {
    it('should update user profile successfully', async () => {
      const updatedUser = {
        ...mockUser,
        firstName: 'Updated',
        lastName: 'Name',
      };

      const mockResponse = {
        data: {
          data: {
            user: updatedUser,
          },
        },
      };

      // Reset and setup the mock for this test
      mockAxiosInstance.put.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());
      
      await act(async () => {
        await result.current.updateUser({
          firstName: 'Updated',
          lastName: 'Name',
        });
      });

      expect(result.current.user).toEqual(updatedUser);
      expect(result.current.isLoading).toBe(false);
      expect(mockedToast.success).toHaveBeenCalledWith('Profile updated successfully');
    });

    it('should handle update user failure', async () => {
      const mockError = {
        response: {
          data: {
            message: 'Update failed',
          },
        },
      };

      // Reset and setup the mock for this test
      mockAxiosInstance.put.mockRejectedValue(mockError);

      const { result } = renderHook(() => useAuthStore());
      
      await act(async () => {
        try {
          await result.current.updateUser({ firstName: 'Updated' });
        } catch (error) {
          // Expected to throw
        }
      });

      expect(result.current.isLoading).toBe(false);
      expect(mockedToast.error).toHaveBeenCalledWith('Update failed');
    });
  });

  describe('Change Password', () => {
    it('should change password successfully', async () => {
      // Reset and setup the mock for this test
      mockAxiosInstance.put.mockResolvedValue({});

      const { result } = renderHook(() => useAuthStore());
      
      await act(async () => {
        await result.current.changePassword('oldpassword', 'newpassword');
      });

      expect(result.current.isLoading).toBe(false);
      expect(mockedToast.success).toHaveBeenCalledWith('Password changed successfully');
    });

    it('should handle change password failure', async () => {
      const mockError = {
        response: {
          data: {
            message: 'Current password is incorrect',
          },
        },
      };

      // Reset and setup the mock for this test
      mockAxiosInstance.put.mockRejectedValue(mockError);

      const { result } = renderHook(() => useAuthStore());
      
      await act(async () => {
        try {
          await result.current.changePassword('wrongpassword', 'newpassword');
        } catch (error) {
          // Expected to throw
        }
      });

      expect(result.current.isLoading).toBe(false);
      expect(mockedToast.error).toHaveBeenCalledWith('Current password is incorrect');
    });
  });

  describe('Refresh Token', () => {
    it('should refresh token successfully', async () => {
      const newToken = 'new-jwt-token';
      const mockResponse = {
        data: {
          data: {
            token: newToken,
          },
        },
      };

      // Reset and setup the mock for this test
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuthStore());
      
      await act(async () => {
        await result.current.refreshToken();
      });

      expect(result.current.token).toBe(newToken);
    });

    it('should logout on refresh token failure', async () => {
      const mockError = new Error('Refresh failed');

      // Reset and setup the mock for this test
      mockAxiosInstance.post.mockRejectedValue(mockError);

      const { result } = renderHook(() => useAuthStore());
      
      // Set initial state
      act(() => {
        useAuthStore.setState({
          user: mockUser,
          token: mockToken,
          isAuthenticated: true,
        });
      });

      await act(async () => {
        try {
          await result.current.refreshToken();
        } catch (error) {
          // Expected to throw
        }
      });

      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });
});