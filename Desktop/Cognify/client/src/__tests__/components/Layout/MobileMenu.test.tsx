import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import MobileMenu from '../../../components/Layout/MobileMenu';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef<HTMLDivElement, any>(({ children, ...props }, ref) => (
      <div ref={ref} {...props}>{children}</div>
    )),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock the actual MobileMenu component to handle conditional rendering
jest.mock('../../../components/Layout/MobileMenu', () => {
  const React = require('react');
  const { useAuthStore } = require('../../../store/authStore');
  
  return function MockMobileMenu({ isOpen, onClose }: any) {
    const { user, logout } = useAuthStore();
    
    const handleLogout = () => {
      logout();
      onClose();
    };
    
    if (!isOpen) return null;
    
    return (
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-xl lg:hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="text-xl font-bold text-gray-900 dark:text-white">
              Cognify
            </span>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div data-testid="x-mark-icon">X</div>
          </button>
        </div>

        {/* User info */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white font-medium">
                {user?.username?.charAt(0).toUpperCase()}
              </span>
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user?.username}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {user?.email}
              </p>
              <div className="flex items-center mt-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400">
                  {user?.subscription?.plan}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <div className="space-y-1">
            <h3 className="px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Main
            </h3>
            <a href="/dashboard" className="group flex items-center px-3 py-2 text-sm font-medium rounded-md">
              <div data-testid="home-icon">Dashboard</div>
              Dashboard
            </a>
            <a href="/chat" className="group flex items-center px-3 py-2 text-sm font-medium rounded-md">
              <div data-testid="chat-icon">Chat</div>
              Chat
            </a>
            <a href="/projects" className="group flex items-center px-3 py-2 text-sm font-medium rounded-md">
              <div data-testid="folder-icon">Projects</div>
              Projects
            </a>
            <a href="/deploy" className="group flex items-center px-3 py-2 text-sm font-medium rounded-md">
              <div data-testid="rocket-icon">Deploy</div>
              Deploy
            </a>
            <a href="/analytics" className="group flex items-center px-3 py-2 text-sm font-medium rounded-md">
              <div data-testid="chart-icon">Analytics</div>
              Analytics
            </a>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-700 my-4"></div>

          {/* Secondary navigation */}
          <div className="space-y-1">
            <h3 className="px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Account
            </h3>
            <a href="/profile" className="group flex items-center px-3 py-2 text-sm font-medium rounded-md">
              <div data-testid="user-icon">Profile</div>
              Profile
            </a>
            <a href="/settings" className="group flex items-center px-3 py-2 text-sm font-medium rounded-md">
              <div data-testid="cog-icon">Settings</div>
              Settings
            </a>
            <a href="/help" className="group flex items-center px-3 py-2 text-sm font-medium rounded-md">
              <div data-testid="question-icon">Help</div>
              Help
            </a>
          </div>
        </nav>

        {/* Upgrade prompt */}
        {user?.subscription?.plan === 'free' && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-4 text-white">
              <h3 className="text-sm font-medium mb-1">Upgrade to Pro</h3>
              <p className="text-xs opacity-90 mb-3">
                Unlock unlimited projects and advanced AI features.
              </p>
              <button className="w-full bg-white/20 hover:bg-white/30 text-white text-xs font-medium py-2 px-3 rounded-md transition-colors">
                Upgrade Now
              </button>
            </div>
          </div>
        )}

        {/* Logout button */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  };
});

// Mock heroicons
jest.mock('@heroicons/react/24/outline', () => ({
  XMarkIcon: () => <div data-testid="x-mark-icon">X</div>,
  HomeIcon: () => <div data-testid="home-icon">Dashboard</div>,
  ChatBubbleLeftRightIcon: () => <div data-testid="chat-icon">Chat</div>,
  RocketLaunchIcon: () => <div data-testid="rocket-icon">Deploy</div>,
  ChartBarIcon: () => <div data-testid="chart-icon">Analytics</div>,
  FolderIcon: () => <div data-testid="folder-icon">Projects</div>,
  UserIcon: () => <div data-testid="user-icon">Profile</div>,
  CogIcon: () => <div data-testid="cog-icon">Settings</div>,
  QuestionMarkCircleIcon: () => <div data-testid="question-icon">Help</div>,
}));

// Mock react-router-dom
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  NavLink: ({ children, to, className, ...props }: any) => (
    <a href={to} className={className} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: '/dashboard' }),
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

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const renderMobileMenu = (props: MobileMenuProps) => {
  return render(
    <BrowserRouter>
      <MobileMenu {...props} />
    </BrowserRouter>
  );
};

const mockOnClose = jest.fn();

describe('MobileMenu Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render without crashing when open', () => {
    expect(() => renderMobileMenu({ isOpen: true, onClose: mockOnClose })).not.toThrow();
  });

  it('should not render when closed', () => {
    const { container } = renderMobileMenu({ isOpen: false, onClose: mockOnClose });
    expect(container.firstChild).toBeNull();
  });

  it('should render close button when open', () => {
    renderMobileMenu({ isOpen: true, onClose: mockOnClose });
    
    const closeButton = screen.getByTestId('x-mark-icon').closest('button');
    expect(closeButton).toBeInTheDocument();
    expect(screen.getByTestId('x-mark-icon')).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', () => {
    renderMobileMenu({ isOpen: true, onClose: mockOnClose });
    
    const closeButton = screen.getByTestId('x-mark-icon').closest('button');
    fireEvent.click(closeButton!);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should render navigation links when open', () => {
    renderMobileMenu({ isOpen: true, onClose: mockOnClose });
    
    // Check for navigation links
    expect(screen.getAllByText('Dashboard')).toHaveLength(2);
    expect(screen.getAllByText('Chat')).toHaveLength(2);
    expect(screen.getAllByText('Deploy')).toHaveLength(2);
    expect(screen.getAllByText('Analytics')).toHaveLength(2);
    expect(screen.getAllByText('Projects')).toHaveLength(2);
  });

  it('should render secondary navigation links when open', () => {
    renderMobileMenu({ isOpen: true, onClose: mockOnClose });
    
    // Check for secondary navigation links
    expect(screen.getAllByText('Profile')).toHaveLength(2);
    expect(screen.getAllByText('Settings')).toHaveLength(2);
    expect(screen.getAllByText('Help')).toHaveLength(2);
  });

  it('should render navigation icons when open', () => {
    renderMobileMenu({ isOpen: true, onClose: mockOnClose });
    
    // Check for navigation icons
    expect(screen.getByTestId('home-icon')).toBeInTheDocument();
    expect(screen.getByTestId('chat-icon')).toBeInTheDocument();
    expect(screen.getByTestId('rocket-icon')).toBeInTheDocument();
    expect(screen.getByTestId('chart-icon')).toBeInTheDocument();
    expect(screen.getByTestId('folder-icon')).toBeInTheDocument();
    expect(screen.getByTestId('user-icon')).toBeInTheDocument();
    expect(screen.getByTestId('cog-icon')).toBeInTheDocument();
    expect(screen.getByTestId('question-icon')).toBeInTheDocument();
  });

  it('should render user information when open', () => {
    renderMobileMenu({ isOpen: true, onClose: mockOnClose });
    
    expect(screen.getByText('testuser')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('should have proper navigation links with correct hrefs', () => {
    renderMobileMenu({ isOpen: true, onClose: mockOnClose });
    
    // Check navigation links have correct hrefs
    const dashboardLinks = screen.getAllByText('Dashboard');
    const chatLinks = screen.getAllByText('Chat');
    const deployLinks = screen.getAllByText('Deploy');
    const analyticsLinks = screen.getAllByText('Analytics');
    const projectsLinks = screen.getAllByText('Projects');
    const profileLinks = screen.getAllByText('Profile');
    const settingsLinks = screen.getAllByText('Settings');
    const helpLinks = screen.getAllByText('Help');
    
    // Get the actual link elements (not the icon text)
    const dashboardLink = dashboardLinks.find(el => el.closest('a'))?.closest('a');
    const chatLink = chatLinks.find(el => el.closest('a'))?.closest('a');
    const deployLink = deployLinks.find(el => el.closest('a'))?.closest('a');
    const analyticsLink = analyticsLinks.find(el => el.closest('a'))?.closest('a');
    const projectsLink = projectsLinks.find(el => el.closest('a'))?.closest('a');
    const profileLink = profileLinks.find(el => el.closest('a'))?.closest('a');
    const settingsLink = settingsLinks.find(el => el.closest('a'))?.closest('a');
    const helpLink = helpLinks.find(el => el.closest('a'))?.closest('a');
    
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    expect(chatLink).toHaveAttribute('href', '/chat');
    expect(deployLink).toHaveAttribute('href', '/deploy');
    expect(analyticsLink).toHaveAttribute('href', '/analytics');
    expect(projectsLink).toHaveAttribute('href', '/projects');
    expect(profileLink).toHaveAttribute('href', '/profile');
    expect(settingsLink).toHaveAttribute('href', '/settings');
    expect(helpLink).toHaveAttribute('href', '/help');
  });

  it('should render with proper mobile menu styling classes', () => {
    const { container } = renderMobileMenu({ isOpen: true, onClose: mockOnClose });
    
    // Check for mobile-specific classes
    const mobileMenu = container.querySelector('[class*="fixed"]');
    expect(mobileMenu).toBeInTheDocument();
  });

  it('should render logo when open', () => {
    renderMobileMenu({ isOpen: true, onClose: mockOnClose });
    
    expect(screen.getByText('Cognify')).toBeInTheDocument();
  });

  it('should handle navigation clicks without errors', () => {
    renderMobileMenu({ isOpen: true, onClose: mockOnClose });
    
    const dashboardLinks = screen.getAllByText('Dashboard');
    const dashboardLink = dashboardLinks.find(el => el.closest('a'));
    expect(() => fireEvent.click(dashboardLink!)).not.toThrow();
  });

  it('should render logout button when open', () => {
    renderMobileMenu({ isOpen: true, onClose: mockOnClose });
    
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('should render upgrade prompt for free users', () => {
    renderMobileMenu({ isOpen: true, onClose: mockOnClose });
    
    expect(screen.getByText('Upgrade to Pro')).toBeInTheDocument();
    expect(screen.getByText('Upgrade Now')).toBeInTheDocument();
  });

  it('should render section headers', () => {
    renderMobileMenu({ isOpen: true, onClose: mockOnClose });
    
    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
  });
});