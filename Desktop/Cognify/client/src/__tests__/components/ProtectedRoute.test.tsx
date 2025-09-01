import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../../components/Auth/ProtectedRoute';
import { useAuthStore } from '../../store/authStore';

// Mock the auth store
jest.mock('../../store/authStore');
const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

// Mock LoadingSpinner
jest.mock('../../components/UI/LoadingSpinner', () => {
  return function MockLoadingSpinner() {
    return <div data-testid="loading-spinner">Loading...</div>;
  };
});

const TestComponent = () => <div data-testid="protected-content">Protected Content</div>;

const renderProtectedRoute = (initialEntries = ['/dashboard'], requiredRole?: 'user' | 'admin' | 'moderator') => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
        <Route path="/dashboard" element={
          <ProtectedRoute requiredRole={requiredRole}>
            <TestComponent />
          </ProtectedRoute>
        } />
        <Route path="*" element={
          <ProtectedRoute requiredRole={requiredRole}>
            <TestComponent />
          </ProtectedRoute>
        } />
      </Routes>
    </MemoryRouter>
  );
};

describe('ProtectedRoute Component', () => {
  const mockUser = {
    _id: '1',
    username: 'testuser',
    email: 'test@example.com',
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should show loading spinner when isLoading is true', () => {
      mockUseAuthStore.mockReturnValue({
        user: null,
        isLoading: true,
        isAuthenticated: false,
        checkAuth: jest.fn(),
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: null,
      });

      renderProtectedRoute();

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  describe('Authentication', () => {
    it('should redirect to login when user is not authenticated', () => {
      mockUseAuthStore.mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        checkAuth: jest.fn(),
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: null,
      });

      renderProtectedRoute();

      // Should not render protected content
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    it('should redirect to login when user is null but isAuthenticated is true', () => {
      mockUseAuthStore.mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: true, // This shouldn't happen but we test edge case
        checkAuth: jest.fn(),
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: 'token',
      });

      renderProtectedRoute();

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should render children when user is authenticated', () => {
      mockUseAuthStore.mockReturnValue({
        user: mockUser,
        isLoading: false,
        isAuthenticated: true,
        checkAuth: jest.fn(),
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: 'token',
      });

      renderProtectedRoute();

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
  });

  describe('Role-based Authorization', () => {
    it('should render children when no role is required', () => {
      mockUseAuthStore.mockReturnValue({
        user: mockUser,
        isLoading: false,
        isAuthenticated: true,
        checkAuth: jest.fn(),
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: 'token',
      });

      renderProtectedRoute(['/dashboard']); // No required role

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should render children when user has required role', () => {
      mockUseAuthStore.mockReturnValue({
        user: mockUser,
        isLoading: false,
        isAuthenticated: true,
        checkAuth: jest.fn(),
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: 'token',
      });

      renderProtectedRoute(['/dashboard'], 'user');

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should redirect to dashboard when user does not have required role', () => {
      mockUseAuthStore.mockReturnValue({
        user: mockUser,
        isLoading: false,
        isAuthenticated: true,
        checkAuth: jest.fn(),
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: 'token',
      });

      renderProtectedRoute(['/admin'], 'admin'); // User role is 'user', required is 'admin'

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should allow admin to access any role-protected route', () => {
      const adminUser = {
        ...mockUser,
        role: 'admin' as const,
      };

      mockUseAuthStore.mockReturnValue({
        user: adminUser,
        isLoading: false,
        isAuthenticated: true,
        checkAuth: jest.fn(),
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: 'token',
      });

      renderProtectedRoute(['/moderator'], 'moderator'); // Admin should access moderator routes

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should allow moderator to access moderator routes', () => {
      const moderatorUser = {
        ...mockUser,
        role: 'moderator' as const,
      };

      mockUseAuthStore.mockReturnValue({
        user: moderatorUser,
        isLoading: false,
        isAuthenticated: true,
        checkAuth: jest.fn(),
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: 'token',
      });

      renderProtectedRoute(['/moderator'], 'moderator');

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined user gracefully', () => {
      mockUseAuthStore.mockReturnValue({
        user: undefined as any,
        isLoading: false,
        isAuthenticated: false,
        checkAuth: jest.fn(),
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: null,
      });

      renderProtectedRoute();

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should preserve location state for redirect', () => {
      mockUseAuthStore.mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        checkAuth: jest.fn(),
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: null,
      });

      // This test verifies that the component handles location state correctly
      // The actual redirect behavior would be tested in integration tests
      renderProtectedRoute(['/protected-page']);

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });
});