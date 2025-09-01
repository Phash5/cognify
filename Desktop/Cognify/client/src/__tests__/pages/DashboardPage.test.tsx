import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from '../../pages/Dashboard/DashboardPage';
import { useAuthStore } from '../../store/authStore';

// Mock the auth store
jest.mock('../../store/authStore', () => ({
  useAuthStore: jest.fn(),
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
};

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {component}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('DashboardPage', () => {
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

  const mockAuthStore = {
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
    token: 'mock-token',
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    checkAuth: jest.fn(),
    updateUser: jest.fn(),
    changePassword: jest.fn(),
    refreshToken: jest.fn(),
    clearError: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthStore.mockReturnValue(mockAuthStore);
    // Mock setTimeout to avoid waiting in tests
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should render dashboard with welcome message', async () => {
    renderWithProviders(<DashboardPage />);

    // Fast-forward through the loading timeout
    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
      expect(screen.getByText(mockUser.firstName)).toBeInTheDocument();
    });
  });

  it('should render dashboard stats cards', async () => {
    renderWithProviders(<DashboardPage />);

    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.getByText(/total projects/i)).toBeInTheDocument();
      expect(screen.getByText(/active chats/i)).toBeInTheDocument();
      expect(screen.getByText(/lines generated/i)).toBeInTheDocument();
      expect(screen.getByText(/deployments today/i)).toBeInTheDocument();
    });
  });

  it('should render recent projects section', async () => {
    renderWithProviders(<DashboardPage />);

    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.getByText(/recent projects/i)).toBeInTheDocument();
      expect(screen.getByText(/view all projects/i)).toBeInTheDocument();
    });
  });

  it('should render quick actions section', async () => {
    renderWithProviders(<DashboardPage />);

    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.getByText(/quick actions/i)).toBeInTheDocument();
      expect(screen.getByText(/new chat/i)).toBeInTheDocument();
      expect(screen.getByText(/new project/i)).toBeInTheDocument();
      expect(screen.getByText(/deploy/i)).toBeInTheDocument();
      expect(screen.getByText(/analytics/i)).toBeInTheDocument();
    });
  });

  it('should navigate to projects page when View All is clicked', async () => {
    renderWithProviders(<DashboardPage />);

    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      const viewAllButton = screen.getByText(/view all/i);
      fireEvent.click(viewAllButton);
      // Since it's a Link component, we check the href instead of navigate
      expect(viewAllButton.closest('a')).toHaveAttribute('href', '/projects');
    });
  });

  it('should have correct link for New Project', async () => {
    renderWithProviders(<DashboardPage />);

    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      const newProjectButton = screen.getByText(/new project/i);
      expect(newProjectButton.closest('a')).toHaveAttribute('href', '/projects/new');
    });
  });

  it('should have correct link for Deploy', async () => {
    renderWithProviders(<DashboardPage />);

    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      const deployButton = screen.getByText(/deploy/i);
      expect(deployButton.closest('a')).toHaveAttribute('href', '/deploy');
    });
  });

  it('should have correct link for Analytics', async () => {
    renderWithProviders(<DashboardPage />);

    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      const analyticsButton = screen.getByText(/analytics/i);
      expect(analyticsButton.closest('a')).toHaveAttribute('href', '/analytics');
    });
  });

  it('should render recent chats section', async () => {
    renderWithProviders(<DashboardPage />);

    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.getByText(/recent chats/i)).toBeInTheDocument();
    });
  });

  it('should display project information', async () => {
    renderWithProviders(<DashboardPage />);

    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.getByText(/e-commerce platform/i)).toBeInTheDocument();
      expect(screen.getByText(/task management app/i)).toBeInTheDocument();
      expect(screen.getByText(/analytics dashboard/i)).toBeInTheDocument();
    });
  });

  it('should handle loading state', () => {
    mockUseAuthStore.mockReturnValue({
      ...mockAuthStore,
      isLoading: true,
    });

    renderWithProviders(<DashboardPage />);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('should display chat information', async () => {
    renderWithProviders(<DashboardPage />);

    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.getByText(/frontend component design/i)).toBeInTheDocument();
      expect(screen.getByText(/database schema optimization/i)).toBeInTheDocument();
      expect(screen.getByText(/api authentication setup/i)).toBeInTheDocument();
    });
  });

  it('should show loading state initially', () => {
    renderWithProviders(<DashboardPage />);

    // Before advancing timers, should show loading spinner
    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
  });

  it('should have proper heading structure', async () => {
    renderWithProviders(<DashboardPage />);

    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      // Check for main heading
      const mainHeading = screen.getByRole('heading', { level: 1 });
      expect(mainHeading).toBeInTheDocument();
      expect(mainHeading).toHaveTextContent(/welcome back/i);

      // Check for section headings
      const sectionHeadings = screen.getAllByRole('heading', { level: 2 });
      expect(sectionHeadings.length).toBeGreaterThan(0);
    });
  });

  it('should display user name in welcome message', async () => {
    renderWithProviders(<DashboardPage />);

    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      expect(screen.getByText(new RegExp(mockUser.firstName, 'i'))).toBeInTheDocument();
    });
  });

  it('should handle responsive design', async () => {
    // Mock window.innerWidth for mobile
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768,
    });

    renderWithProviders(<DashboardPage />);

    jest.advanceTimersByTime(1000);

    await waitFor(() => {
      // Check that mobile-specific elements are rendered
      const mobileMenu = screen.getByRole('button', { name: /menu/i });
      expect(mobileMenu).toBeInTheDocument();
    });
  });
});