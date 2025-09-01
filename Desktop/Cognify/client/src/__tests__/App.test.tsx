import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from '../App';
import { useAuthStore } from '../store/authStore';

// Mock the auth store
jest.mock('../store/authStore');
const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

// Mock components to avoid complex rendering
jest.mock('../pages/Landing/LandingPage', () => {
  return function MockLandingPage() {
    return <div data-testid="landing-page">Landing Page</div>;
  };
});

jest.mock('../pages/Auth/LoginPage', () => {
  return function MockLoginPage() {
    return <div data-testid="login-page">Login Page</div>;
  };
});

jest.mock('../pages/Dashboard/DashboardPage', () => {
  return function MockDashboardPage() {
    return <div data-testid="dashboard-page">Dashboard Page</div>;
  };
});

jest.mock('../components/Layout/Layout', () => {
  return function MockLayout({ children }: { children: React.ReactNode }) {
    return <div data-testid="layout">{children}</div>;
  };
});

jest.mock('../components/Auth/ProtectedRoute', () => {
  return function MockProtectedRoute({ children }: { children: React.ReactNode }) {
    return <div data-testid="protected-route">{children}</div>;
  };
});

jest.mock('../components/UI/LoadingSpinner', () => {
  return function MockLoadingSpinner() {
    return <div data-testid="loading-spinner">Loading...</div>;
  };
});

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
};

const renderApp = (queryClient = createTestQueryClient()) => {
  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  );
};

describe('App Component', () => {
  const mockCheckAuth = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should show loading spinner when isLoading is true', () => {
      mockUseAuthStore.mockReturnValue({
        user: null,
        isLoading: true,
        isAuthenticated: false,
        checkAuth: mockCheckAuth,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: null,
      });

      renderApp();

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.queryByTestId('landing-page')).not.toBeInTheDocument();
    });
  });

  describe('Authentication Flow', () => {
    it('should call checkAuth on mount', async () => {
      mockUseAuthStore.mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        checkAuth: mockCheckAuth,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: null,
      });

      renderApp();

      await waitFor(() => {
        expect(mockCheckAuth).toHaveBeenCalledTimes(1);
      });
    });

    it('should show landing page when user is not authenticated', () => {
      mockUseAuthStore.mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        checkAuth: mockCheckAuth,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: null,
      });

      renderApp();

      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    });

    it('should redirect to dashboard when user is authenticated', () => {
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

      mockUseAuthStore.mockReturnValue({
        user: mockUser,
        isLoading: false,
        isAuthenticated: true,
        checkAuth: mockCheckAuth,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: 'mock-token',
      });

      renderApp();

      // Should redirect to dashboard, so landing page should not be visible
      expect(screen.queryByTestId('landing-page')).not.toBeInTheDocument();
    });
  });

  describe('Toast Configuration', () => {
    it('should render Toaster component', () => {
      mockUseAuthStore.mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        checkAuth: mockCheckAuth,
        login: jest.fn(),
        register: jest.fn(),
        logout: jest.fn(),
        updateUser: jest.fn(),
        changePassword: jest.fn(),
        refreshToken: jest.fn(),
        clearError: jest.fn(),
        token: null,
      });

      renderApp();

      expect(screen.getByTestId('toaster')).toBeInTheDocument();
    });
  });

  describe('Query Client Configuration', () => {
    it('should configure QueryClient with correct default options', () => {
      const queryClient = createTestQueryClient();
      const defaultOptions = queryClient.getDefaultOptions();

      expect(defaultOptions.queries?.retry).toBe(false); // We set it to false for testing
      expect(defaultOptions.mutations?.retry).toBe(false);
    });
  });
});