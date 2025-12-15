import axios from 'axios';

// Base API configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false, // Set to true if using httpOnly cookies
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // If sending FormData, remove Content-Type to let browser set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    // Log request in development
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.data);
    }
    
    return config;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    // Log response in development
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}`, response.data);
    }
    return response;
  },
  (error) => {
    // Handle different error types
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      
      // Log error in development
      if (process.env.NODE_ENV === 'development') {
        console.error(`[API Error ${status}]`, error.config.url, data);
      }
      
      // Handle 401 Unauthorized - token expired or invalid
      if (status === 401) {
        // Clear token and redirect to login
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
        
        // Only redirect if not already on login/signup page
        if (!window.location.pathname.match(/\/(login|signup)/)) {
          window.location.href = '/login?session=expired';
        }
        
        return Promise.reject({
          message: 'Session expired. Please login again.',
          status: 401,
          data: data?.detail || 'Unauthorized'
        });
      }
      
      // Handle 404 Not Found
      if (status === 404) {
        return Promise.reject({
          message: data?.detail || 'Resource not found',
          status: 404,
          data
        });
      }
      
      // Handle 500 Server Error
      if (status >= 500) {
        return Promise.reject({
          message: 'Server error. Please try again later.',
          status,
          data
        });
      }
      
      // Other errors
      return Promise.reject({
        message: data?.detail || data?.message || 'Request failed',
        status,
        data
      });
    } else if (error.request) {
      // Request was made but no response received (network error)
      console.error('[API Network Error]', error.message);
      return Promise.reject({
        message: 'Network error. Please check your connection and try again.',
        status: 0,
        networkError: true
      });
    } else {
      // Something else happened
      console.error('[API Error]', error.message);
      return Promise.reject({
        message: error.message || 'An unexpected error occurred',
        status: -1
      });
    }
  }
);

// API helper methods
export const apiHelpers = {
  // GET request with error handling
  get: async (url, config = {}) => {
    try {
      const response = await api.get(url, config);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || 'Request failed', details: error };
    }
  },
  
  // POST request with error handling
  post: async (url, data, config = {}) => {
    try {
      const response = await api.post(url, data, config);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || 'Request failed', details: error };
    }
  },
  
  // PUT request with error handling
  put: async (url, data, config = {}) => {
    try {
      const response = await api.put(url, data, config);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || 'Request failed', details: error };
    }
  },
  
  // DELETE request with error handling
  delete: async (url, config = {}) => {
    try {
      const response = await api.delete(url, config);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || 'Request failed', details: error };
    }
  },
};

export default api;
