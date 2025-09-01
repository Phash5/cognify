import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Sidebar from '../../../components/Layout/Sidebar';

// Mock framer-motion completely
jest.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef<HTMLDivElement, any>(({ children, ...props }, ref) => (
      <div ref={ref} {...props}>{children}</div>
    )),
    span: React.forwardRef<HTMLSpanElement, any>(({ children, ...props }, ref) => (
      <span ref={ref} {...props}>{children}</span>
    )),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock all heroicons
jest.mock('@heroicons/react/24/outline', () => ({
  HomeIcon: () => <div data-testid="home-icon">Home</div>,
  ChatBubbleLeftRightIcon: () => <div data-testid="chat-icon">Chat</div>,
  FolderIcon: () => <div data-testid="folder-icon">Folder</div>,
  CogIcon: () => <div data-testid="cog-icon">Settings</div>,
  UserIcon: () => <div data-testid="user-icon">User</div>,
  RocketLaunchIcon: () => <div data-testid="rocket-icon">Deploy</div>,
  ChartBarIcon: () => <div data-testid="chart-icon">Analytics</div>,
  QuestionMarkCircleIcon: () => <div data-testid="help-icon">Help</div>,
  ChevronLeftIcon: () => <div data-testid="chevron-left-icon">Left</div>,
  ChevronRightIcon: () => <div data-testid="chevron-right-icon">Right</div>,
}));

// Mock react-router-dom
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => ({ pathname: '/dashboard' }),
  NavLink: ({ children, to, className, title, ...props }: any) => (
    <a href={to} className={className} title={title} {...props}>
      {children}
    </a>
  ),
}));

// Mock the auth store
jest.mock('../../../store/authStore', () => ({
  useAuthStore: () => ({
    user: {
      _id: '1',
      username: 'testuser',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      avatar: null,
      role: 'user',
      subscription: {
        plan: 'free',
        status: 'active'
      },
      preferences: {
        theme: 'light',
        language: 'en',
        notifications: {
          email: true,
          push: true,
          desktop: true
        }
      },
      createdAt: '2023-01-01T00:00:00.000Z',
      updatedAt: '2023-01-01T00:00:00.000Z'
    },
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    checkAuth: jest.fn(),
    updateUser: jest.fn(),
    changePassword: jest.fn(),
    refreshToken: jest.fn(),
    clearError: jest.fn()
  })
}));

const renderSidebar = (props = {}) => {
  const defaultProps = {
    isCollapsed: false,
    onToggle: jest.fn(),
    ...props
  };

  return render(
    <BrowserRouter>
      <Sidebar {...defaultProps} />
    </BrowserRouter>
  );
};

describe('Sidebar Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render without crashing', () => {
    expect(() => renderSidebar()).not.toThrow();
  });

  it('should render the Cognify logo', () => {
    renderSidebar();
    expect(screen.getByText('Cognify')).toBeInTheDocument();
  });

  it('should render user information', () => {
    renderSidebar();
    expect(screen.getByText('testuser')).toBeInTheDocument();
    expect(screen.getByText('free plan')).toBeInTheDocument();
  });

  it('should render navigation links', () => {
    renderSidebar();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getAllByText('Chat')).toHaveLength(2); // One from icon mock, one from nav text
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getAllByText('Deploy')).toHaveLength(2); // One from icon mock, one from nav text
    expect(screen.getAllByText('Analytics')).toHaveLength(2); // One from icon mock, one from nav text
  });

  it('should render secondary navigation', () => {
    renderSidebar();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getAllByText('Settings')).toHaveLength(2); // One from icon mock, one from nav text
    expect(screen.getAllByText('Help')).toHaveLength(2); // One from icon mock, one from nav text
  });

  it('should handle collapsed state', () => {
    expect(() => renderSidebar({ isCollapsed: true })).not.toThrow();
  });
});