import { createContext, useState, useEffect } from 'react';
import { auth as authApi } from '../services/api';

export const AuthContext = createContext({
  isAuthenticated: false,
  user: null,
  loading: false,
  error: null,
  initialLoadComplete: false,
  login: () => {},
  register: () => {},
  logout: () => {},
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState(null);

  // Initial check for existing authentication
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const response = await authApi.me();
          setUser(response.data);
        }
      } catch (err) {
        // Clear token if verification fails
        localStorage.removeItem('token');
        console.error('Auth check failed:', err);
      } finally {
        setLoading(false);
        setInitialLoadComplete(true);
      }
    };

    checkAuth();
  }, []);

  const login = async (credentials) => {
    setLoading(true);
    setError(null);

    try {
      const response = await authApi.login(credentials);
      const { token } = response.data;

      localStorage.setItem('token', token);

      // Fetch user details after login
      const userResponse = await authApi.me();
      setUser(userResponse.data);
      return true;
    } catch (err) {
      setError(err.response?.data?.non_field_errors?.[0] || 'Login failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await authApi.register(userData);
      const { token, user } = response.data;

      localStorage.setItem('token', token);
      setUser(user);
      return true;
    } catch (err) {
      const errorMessage =
        err.response?.data?.username?.[0] ||
        err.response?.data?.email?.[0] ||
        err.response?.data?.password?.[0] ||
        'Registration failed';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    // Clear token from storage
    localStorage.removeItem('token');
    setUser(null);

    // Close any open WebSocket connections
    const closeAllWebSockets = () => {
      // This will find and close any open WebSocket connections
      const openSockets = window.performance
        .getEntriesByType("resource")
        .filter(resource => resource.initiatorType === "other" &&
                resource.name.includes("ws"));

      openSockets.forEach(socket => {
        try {
          // Try to find and close the socket
          const wsUrl = new URL(socket.name);
          const allSockets = Array.from(document.querySelectorAll('*'))
            .filter(el => el._socket &&
                   el._socket.url &&
                   el._socket.url.includes(wsUrl.pathname));

          allSockets.forEach(el => {
            if (el._socket && el._socket.close) {
              el._socket.close();
            }
          });
        } catch (e) {
          console.error("Error closing socket", e);
        }
      });
    };

    closeAllWebSockets();
  };

  const value = {
    isAuthenticated: !!user,
    user,
    loading,
    error,
    initialLoadComplete,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};