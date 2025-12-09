import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from '../pages/Login';
import { AuthProvider } from '../contexts/AuthContext';

// Mock the AuthContext
jest.mock('../contexts/AuthContext', () => ({
  ...jest.requireActual('../contexts/AuthContext'),
  useAuth: () => ({
    login: jest.fn(),
    loading: false,
    isAuthenticated: false,
  }),
}));

describe('Login Component', () => {
  const renderLogin = () => {
    return render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );
  };

  test('renders login form', () => {
    renderLogin();
    
    expect(screen.getByText(/Welcome Back/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
  });

  test('renders signup link', () => {
    renderLogin();
    
    expect(screen.getByText(/Don't have an account?/i)).toBeInTheDocument();
  });

  test('email input accepts text', () => {
    renderLogin();
    
    const emailInput = screen.getByLabelText(/Email/i);
    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute('type', 'email');
  });

  test('password input is of type password', () => {
    renderLogin();
    
    const passwordInput = screen.getByLabelText(/Password/i);
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
