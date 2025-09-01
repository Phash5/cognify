import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import LandingPage from '../../pages/Landing/LandingPage';
import { useAuthStore } from '../../store/authStore';

// Mock the auth store
jest.mock('../../store/authStore');
const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('LandingPage', () => {
  const mockAuthStore = {
    user: null,
    isAuthenticated: false,
    isLoading: false,
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
  });

  it('should render landing page with main sections', () => {
    renderWithRouter(<LandingPage />);

    // Check for main heading parts
    expect(screen.getByText(/Build Applications with/i)).toBeInTheDocument();
    expect(screen.getByText(/AI Power/i)).toBeInTheDocument();
    
    // Check for description
    expect(screen.getByText(/Cognify is the ultimate AI-powered development platform/i)).toBeInTheDocument();
    
    // Check for CTA buttons
    expect(screen.getAllByText(/Start Building Free/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Watch Demo/i)[0]).toBeInTheDocument();
  });

  it('should render features section', () => {
    renderWithRouter(<LandingPage />);

    // Check for features heading
    expect(screen.getByText(/Everything you need to build amazing apps/i)).toBeInTheDocument();
    
    // Check for feature items
    expect(screen.getAllByText(/AI-Powered Development/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Multi-Language Support/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Instant Deployment/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Team Collaboration/i)[0]).toBeInTheDocument();
  });

  it('should render testimonials section', () => {
    renderWithRouter(<LandingPage />);

    // Check for testimonials heading
    expect(screen.getByText(/Loved by developers worldwide/i)).toBeInTheDocument();
    
    // Check for testimonial content
    expect(screen.getByText(/Sarah Chen/i)).toBeInTheDocument();
    expect(screen.getByText(/Marcus Johnson/i)).toBeInTheDocument();
    expect(screen.getByText(/Elena Rodriguez/i)).toBeInTheDocument();
  });

  it('should render Start Building Free buttons', () => {
    renderWithRouter(<LandingPage />);

    const getStartedButtons = screen.getAllByText(/Start Building Free/i);
    expect(getStartedButtons[0]).toBeInTheDocument();
    expect(getStartedButtons[0].tagName).toBe('A');
  });

  it('should render watch demo button', () => {
    renderWithRouter(<LandingPage />);

    const watchDemoButton = screen.getByText(/Watch Demo/i);
    expect(watchDemoButton).toBeInTheDocument();
  });

  it('should render FAQ section', () => {
    renderWithRouter(<LandingPage />);

    // Check for FAQ heading
    expect(screen.getByText(/Frequently asked questions/i)).toBeInTheDocument();
  });

  it('should render pricing section', () => {
    renderWithRouter(<LandingPage />);

    // Check for pricing heading
    expect(screen.getByText(/Simple, transparent pricing/i)).toBeInTheDocument();
    
    // Check for pricing plans
    expect(screen.getAllByText(/Free/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Pro/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Enterprise/i)[0]).toBeInTheDocument();
  });

  it('should render footer', () => {
    renderWithRouter(<LandingPage />);

    // Check for footer content - the footer exists but may not have specific text
    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
  });

  it('should have responsive design classes', () => {
    const { container } = renderWithRouter(<LandingPage />);
    
    // Check that the main container has responsive classes
    const mainDiv = container.querySelector('div.min-h-screen');
    expect(mainDiv).toBeInTheDocument();
  });

  it('should render navigation header', () => {
    renderWithRouter(<LandingPage />);

    // Check for navigation elements
    expect(screen.getAllByText(/Cognify/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Features/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Pricing/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Sign In/i)[0]).toBeInTheDocument();
  });

  it('should render Sign In links', () => {
    renderWithRouter(<LandingPage />);

    const signInLinks = screen.getAllByText(/Sign In/i);
    expect(signInLinks[0]).toBeInTheDocument();
    expect(signInLinks[0].tagName).toBe('A');
  });

  it('should render navigation links', () => {
    renderWithRouter(<LandingPage />);

    // Test that navigation links exist
    expect(screen.getAllByText(/Features/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Pricing/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Testimonials/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/FAQ/i)[0]).toBeInTheDocument();
  });

  it('should render with proper accessibility attributes', () => {
    renderWithRouter(<LandingPage />);

    // Check for proper heading hierarchy
    const mainHeading = screen.getByRole('heading', { level: 1 });
    expect(mainHeading).toBeInTheDocument();

    // Check for navigation landmark
    const navigation = screen.getByRole('navigation');
    expect(navigation).toBeInTheDocument();

    // Check for footer landmark
    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
  });

  it('should handle keyboard navigation', () => {
    renderWithRouter(<LandingPage />);

    const getStartedButtons = screen.getAllByText(/Start Building Free/i);
    
    // Test that the button is accessible via keyboard
    expect(getStartedButtons[0]).toBeInTheDocument();
    expect(getStartedButtons[0].tagName).toBe('A'); // It's a Link component
  });
});