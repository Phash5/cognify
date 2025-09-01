import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Layout from '../../../components/Layout/Layout';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef<HTMLDivElement, any>(({ children, ...props }, ref) => (
      <div ref={ref} {...props}>{children}</div>
    )),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock child components
jest.mock('../../../components/Layout/Sidebar', () => {
  return function MockSidebar({ isCollapsed, onToggle }: any) {
    return (
      <div data-testid="sidebar">
        <button onClick={onToggle} data-testid="sidebar-toggle">
          {isCollapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>
    );
  };
});

jest.mock('../../../components/Layout/Header', () => {
  return function MockHeader({ onMenuClick, onSidebarToggle, sidebarCollapsed }: any) {
    return (
      <div data-testid="header">
        <button onClick={onMenuClick} data-testid="menu-button">
          Menu
        </button>
        <button onClick={onSidebarToggle} data-testid="header-sidebar-toggle">
          {sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        </button>
      </div>
    );
  };
});

jest.mock('../../../components/Layout/MobileMenu', () => {
  return function MockMobileMenu({ isOpen, onClose }: any) {
    return isOpen ? (
      <div data-testid="mobile-menu">
        <button onClick={onClose} data-testid="mobile-menu-close">
          Close
        </button>
      </div>
    ) : null;
  };
});

// Mock react-router-dom
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Outlet: () => <div data-testid="outlet">Page Content</div>,
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

const renderLayout = (children?: React.ReactNode) => {
  return render(
    <BrowserRouter>
      <Layout>{children}</Layout>
    </BrowserRouter>
  );
};

describe('Layout Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render without crashing', () => {
    expect(() => renderLayout()).not.toThrow();
  });

  it('should render all main layout components', () => {
    renderLayout();
    
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();
  });

  it('should render children when provided', () => {
    renderLayout(<div data-testid="custom-content">Custom Content</div>);
    
    expect(screen.getByTestId('custom-content')).toBeInTheDocument();
    expect(screen.getByText('Custom Content')).toBeInTheDocument();
  });

  it('should render footer with user information', () => {
    renderLayout();
    
    expect(screen.getByText('© 2024 Cognify. All rights reserved.')).toBeInTheDocument();
    expect(screen.getByText('Welcome, testuser')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('should toggle mobile menu when menu button is clicked', () => {
    renderLayout();
    
    // Initially mobile menu should not be visible
    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument();
    
    // Click menu button to open mobile menu
    const menuButton = screen.getByTestId('menu-button');
    fireEvent.click(menuButton);
    
    // Mobile menu should now be visible
    expect(screen.getByTestId('mobile-menu')).toBeInTheDocument();
  });

  it('should close mobile menu when close button is clicked', () => {
    renderLayout();
    
    // Open mobile menu
    const menuButton = screen.getByTestId('menu-button');
    fireEvent.click(menuButton);
    expect(screen.getByTestId('mobile-menu')).toBeInTheDocument();
    
    // Close mobile menu
    const closeButton = screen.getByTestId('mobile-menu-close');
    fireEvent.click(closeButton);
    
    // Mobile menu should be closed
    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument();
  });

  it('should toggle sidebar when sidebar toggle is clicked', () => {
    renderLayout();
    
    // Initially sidebar should be collapsed (sidebarOpen = false)
    expect(screen.getByText('Expand')).toBeInTheDocument();
    
    // Click sidebar toggle
    const sidebarToggle = screen.getByTestId('sidebar-toggle');
    fireEvent.click(sidebarToggle);
    
    // Sidebar should now be expanded
    expect(screen.getByText('Collapse')).toBeInTheDocument();
  });

  it('should toggle sidebar when header sidebar toggle is clicked', () => {
    renderLayout();
    
    // Initially sidebar should be collapsed
    expect(screen.getByText('Expand Sidebar')).toBeInTheDocument();
    
    // Click header sidebar toggle
    const headerSidebarToggle = screen.getByTestId('header-sidebar-toggle');
    fireEvent.click(headerSidebarToggle);
    
    // Sidebar state should change
    expect(screen.getByText('Collapse Sidebar')).toBeInTheDocument();
  });

  it('should render main content area', () => {
    renderLayout();
    
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveClass('flex-1');
  });

  it('should render footer', () => {
    renderLayout();
    
    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
  });

  it('should have proper responsive classes', () => {
    const { container } = renderLayout();
    
    // Check for responsive layout classes
    const layoutContainer = container.firstChild;
    expect(layoutContainer).toHaveClass('min-h-screen');
  });
});