import React, { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if user is logged in on app start
  useEffect(() => {
    const checkAuth = async () => {
      // Check if token exists
      const token = authService.getToken();
      if (token) {
        // Try to fetch user details
        const result = await authService.fetchCurrentUser();
        if (result.success) {
          setUser(result.user);
        } else {
          // Token invalid or expired, clear it
          authService.logout();
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email, password) => {
    const result = await authService.login(email, password);
    if (result.success) {
      setUser(result.user);
    }
    return result;
  };

  const signup = async (email, username, password) => {
    const result = await authService.signup(email, username, password);
    if (result.success) {
      setUser(result.user);
    }
    return result;
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    signup,
    logout,
    isAuthenticated: !!user,
    token: authService.getToken()
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
