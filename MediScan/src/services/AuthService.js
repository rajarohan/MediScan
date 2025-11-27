import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// API Configuration
// Auto-detect environment and use appropriate base URL
const getApiBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }
  
  // Default fallbacks
  if (__DEV__) {
    // iOS Simulator uses localhost, Android emulator uses 10.0.2.2
    if (Platform.OS === 'ios') {
      return 'http://localhost:3000/api/v1';
    } else {
      return 'http://10.0.2.2:3000/api/v1';
    }
  }
  
  return 'https://your-production-api.com/api/v1';
};

const API_BASE_URL = getApiBaseUrl();
const API_TIMEOUT = parseInt(process.env.EXPO_PUBLIC_API_TIMEOUT) || 60000; // 60 seconds for development

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  async (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    
    // Add auth token to requests
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.warn('Failed to get auth token:', error);
    }
    
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
apiClient.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Enhanced error logging
    if (error.code === 'ECONNABORTED') {
      console.error('API Request Timeout:', error.message);
    } else if (error.code === 'NETWORK_ERROR' || !error.response) {
      console.error('Network Error - Check if backend server is running:', error.message);
    } else {
      console.error('API Response Error:', error.response?.status, error.response?.data);
    }

    // Handle 401 errors (token expired)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        
        if (refreshToken) {
          const response = await AuthService.refreshToken(refreshToken);
          
          if (response.success && response.data && response.data.tokens) {
            const { accessToken: newToken, refreshToken: newRefreshToken } = response.data.tokens;
            
            // Store new tokens
            await SecureStore.setItemAsync('accessToken', newToken);
            await SecureStore.setItemAsync('refreshToken', newRefreshToken);
            
            // Update the auth header and retry the request
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            AuthService.setAuthToken(newToken);
            
            return apiClient(originalRequest);
          }
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        // Clear tokens and redirect to login
        await SecureStore.deleteItemAsync('accessToken');
        await SecureStore.deleteItemAsync('refreshToken');
        await SecureStore.deleteItemAsync('user');
      }
    }

    return Promise.reject(error);
  }
);

class AuthService {
  // Set auth token for API requests
  static setAuthToken(token) {
    if (token) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete apiClient.defaults.headers.common['Authorization'];
    }
  }

  // Clear auth token
  static clearAuthToken() {
    delete apiClient.defaults.headers.common['Authorization'];
  }

  // Validate token
  static async validateToken(token) {
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: parseInt(process.env.EXPO_PUBLIC_HEALTH_CHECK_TIMEOUT) || 5000,
      });
      return response.data.success;
    } catch (error) {
      console.error('Token validation failed:', error.message);
      return false;
    }
  }

  // Register user
  static async register(userData) {
    try {
      const response = await apiClient.post('/auth/register', {
        name: userData.name,
        email: userData.email,
        password: userData.password,
      });

      // Store tokens if registration is successful and tokens are provided
      if (response.data.success && response.data.data?.tokens) {
        const { tokens } = response.data.data;
        const { accessToken, refreshToken } = tokens;
        
        this.setAuthToken(accessToken);
        
        if (refreshToken) {
          await SecureStore.setItemAsync('refreshToken', refreshToken);
        }
        if (accessToken) {
          await SecureStore.setItemAsync('accessToken', accessToken);
        }
        if (response.data.data.user) {
          await SecureStore.setItemAsync('user', JSON.stringify(response.data.data.user));
        }
      }

      return {
        success: true,
        message: response.data.message,
        data: response.data.data,
      };
    } catch (error) {
      console.error('Registration error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Registration failed';
      
      return {
        success: false,
        message: errorMessage,
        errors: error.response?.data?.errors,
      };
    }
  }

  // Login user
  static async login(email, password) {
    try {
      const response = await apiClient.post('/auth/login', {
        email,
        password,
      });

      if (response.data.success) {
        const { tokens } = response.data.data;
        const { accessToken, refreshToken } = tokens;
        this.setAuthToken(accessToken);
        
        // Store refresh token
        if (refreshToken) {
          await SecureStore.setItemAsync('refreshToken', refreshToken);
        }
        
        // Store user data
        if (response.data.data.user) {
          await SecureStore.setItemAsync('user', JSON.stringify(response.data.data.user));
        }
      }

      return {
        success: true,
        message: response.data.message,
        data: response.data.data,
      };
    } catch (error) {
      console.error('Login error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Login failed';
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // Refresh token
  static async refreshToken(refreshToken) {
    try {
      // Use a direct axios call to avoid infinite loops with the interceptor
      const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        refreshToken,
      }, {
        timeout: parseInt(process.env.EXPO_PUBLIC_HEALTH_CHECK_TIMEOUT) || 5000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return {
        success: true,
        message: response.data.message,
        data: response.data.data,
      };
    } catch (error) {
      console.error('Token refresh error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Token refresh failed';
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // Logout user
  static async logout(refreshToken) {
    try {
      const response = await apiClient.post('/auth/logout', {
        refreshToken,
      });

      this.clearAuthToken();

      return {
        success: true,
        message: response.data.message,
      };
    } catch (error) {
      console.error('Logout error:', error);
      
      // Clear token anyway
      this.clearAuthToken();
      
      return {
        success: false,
        message: 'Logout failed',
      };
    }
  }

  // Get user profile
  static async getProfile() {
    try {
      const response = await apiClient.get('/auth/profile');

      return {
        success: true,
        data: response.data.data,
      };
    } catch (error) {
      console.error('Get profile error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Failed to fetch profile';
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // Update user profile
  static async updateProfile(profileData) {
    try {
      const response = await apiClient.put('/auth/profile', profileData);

      return {
        success: true,
        message: response.data.message,
        data: response.data.data,
      };
    } catch (error) {
      console.error('Update profile error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Profile update failed';
      
      return {
        success: false,
        message: errorMessage,
        errors: error.response?.data?.errors,
      };
    }
  }

  // Change password
  static async changePassword(currentPassword, newPassword) {
    try {
      const response = await apiClient.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      return {
        success: true,
        message: response.data.message,
      };
    } catch (error) {
      console.error('Change password error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Password change failed';
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // Request password reset
  static async requestPasswordReset(email) {
    try {
      const response = await apiClient.post('/auth/forgot-password', {
        email,
      });

      return {
        success: true,
        message: response.data.message,
      };
    } catch (error) {
      console.error('Password reset request error:', error);
      
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          'Password reset request failed';
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  // Get API client for other services
  static getApiClient() {
    return apiClient;
  }
}

export default AuthService;