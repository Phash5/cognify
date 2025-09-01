import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import LoginPage from '../../pages/Auth/LoginPage';
import { useAuthStore } from '../../store/authStore';

// Mock the auth store
jest.mock('../../store/authStore');
const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('LoginPage', () => {
  const mockLogin = jest.fn();
  const mockAuthStore = {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login: mockLogin,
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

  it('should render login form with all fields', () => {
    renderWithRouter(<LoginPage />);

    expect(screen.getByText(/Sign in to your Cognify account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/don't have an account/i)).toBeInTheDocument();
    expect(screen.getByText(/sign up/i)).toBeInTheDocument();
  });

  it('should handle form input changes', async () => {
    const user = userEvent.setup();
    renderWithRouter(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');

    expect(emailInput).toHaveValue('test@example.com');
    expect(passwordInput).toHaveValue('password123');
  });

  it('should have email input with proper type and validation', () => {
    renderWithRouter(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('required');
  });

  it('should prevent submission with empty fields', async () => {
    const user = userEvent.setup();
    renderWithRouter(<LoginPage />);

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);

    // Should not call login with empty fields
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('should submit form with valid data', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);
    
    renderWithRouter(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('should navigate to dashboard after successful login', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);
    
    renderWithRouter(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  it('should handle login error', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Invalid credentials';
    mockLogin.mockRejectedValue(new Error(errorMessage));
    
    renderWithRouter(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'wrongpassword');
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'wrongpassword',
      });
    });
  });

  it('should show loading state during submission', async () => {
    const user = userEvent.setup();
    mockUseAuthStore.mockReturnValue({
      ...mockAuthStore,
      isLoading: true,
    });
    
    renderWithRouter(<LoginPage />);

    const submitButton = screen.getByRole('button', { name: /signing in/i });
    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/signing in/i)).toBeInTheDocument();
  });

  it('should toggle password visibility', async () => {
    const user = userEvent.setup();
    renderWithRouter(<LoginPage />);

    const passwordInput = screen.getByLabelText(/password/i);
    const toggleButton = passwordInput.parentElement?.querySelector('button[type="button"]');

    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(toggleButton).toBeInTheDocument();

    if (toggleButton) {
      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'text');

      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'password');
    }
  });

  it('should handle forgot password link', () => {
    renderWithRouter(<LoginPage />);

    const forgotPasswordLink = screen.getByText(/forgot your password/i);
    expect(forgotPasswordLink).toHaveAttribute('href', '/forgot-password');
  });

  it('should handle sign up link', () => {
    renderWithRouter(<LoginPage />);

    const signUpLink = screen.getByText(/sign up/i);
    expect(signUpLink).toHaveAttribute('href', '/register');
  });

  it('should handle remember me checkbox', async () => {
    const user = userEvent.setup();
    renderWithRouter(<LoginPage />);

    const rememberMeCheckbox = screen.getByLabelText(/remember me/i);
    expect(rememberMeCheckbox).not.toBeChecked();

    await user.click(rememberMeCheckbox);
    expect(rememberMeCheckbox).toBeChecked();
  });

  it('should handle Enter key submission', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);
    
    renderWithRouter(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('should have required attributes on form fields', () => {
    renderWithRouter(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    expect(emailInput).toHaveAttribute('required');
    expect(passwordInput).toHaveAttribute('required');
  });

  it('should have proper accessibility attributes', () => {
    renderWithRouter(<LoginPage />);

    // Check that the form elements are present and accessible

    const emailInput = screen.getByLabelText(/email/i);
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(emailInput).toHaveAttribute('autocomplete', 'email');

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toHaveAttribute('autocomplete', 'current-password');
  });

  it('should redirect authenticated users', () => {
    mockUseAuthStore.mockReturnValue({
      ...mockAuthStore,
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com' },
    });

    renderWithRouter(<LoginPage />);

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});