import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import AuthService from '../services/AuthService';

// Auth Context
const AuthContext = createContext();

// Auth Reducer
const authReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload,
      };
    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        loading: false,
        error: null,
      };
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        loading: false,
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        refreshToken: null,
        loading: false,
        error: null,
      };
    case 'SET_TOKENS':
      return {
        ...state,
        token: action.payload.token,
        refreshToken: action.payload.refreshToken,
      };
    default:
      return state;
  }
};

// Initial state
const initialState = {
  user: null,
  token: null,
  refreshToken: null,
  loading: true,
  error: null,
};

// Auth Provider Component
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check authentication state on app start
  const checkAuthState = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      const token = await SecureStore.getItemAsync('accessToken');
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      const userStr = await SecureStore.getItemAsync('user');

      if (token && userStr) {
        const user = JSON.parse(userStr);
        
        // Verify token is still valid
        const isValid = await AuthService.validateToken(token);
        
        if (isValid) {
          dispatch({ type: 'SET_USER', payload: user });
          dispatch({ type: 'SET_TOKENS', payload: { token, refreshToken } });
          
          // Set auth header for future requests
          AuthService.setAuthToken(token);
        } else {
          // Try to refresh token
          if (refreshToken) {
            try {
              const refreshResponse = await AuthService.refreshToken(refreshToken);
              
              if (refreshResponse.success && refreshResponse.data && refreshResponse.data.tokens) {
                const { accessToken, refreshToken: newRefreshToken } = refreshResponse.data.tokens;
                
                await SecureStore.setItemAsync('accessToken', accessToken);
                await SecureStore.setItemAsync('refreshToken', newRefreshToken);
                
                dispatch({ type: 'SET_USER', payload: user });
                dispatch({ 
                  type: 'SET_TOKENS', 
                  payload: { 
                    token: accessToken, 
                    refreshToken: newRefreshToken 
                  } 
                });
                
                AuthService.setAuthToken(accessToken);
              } else {
                throw new Error('Token refresh failed');
              }
            } catch (refreshError) {
              console.log('Token refresh failed:', refreshError.message);
              await logout();
            }
          } else {
            await logout();
          }
        }
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    } catch (error) {
      console.error('Auth state check failed:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Authentication check failed' });
    }
  }, []);

  // Login function
  const login = useCallback(async (email, password) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'CLEAR_ERROR' });

      const response = await AuthService.login(email, password);

      if (response.success) {
        const { user, tokens } = response.data;
        const { accessToken, refreshToken } = tokens;

        // Store tokens securely
        await SecureStore.setItemAsync('accessToken', accessToken);
        await SecureStore.setItemAsync('refreshToken', refreshToken);
        await SecureStore.setItemAsync('user', JSON.stringify(user));

        // Set auth header for future requests
        AuthService.setAuthToken(accessToken);

        // Update state
        dispatch({ type: 'SET_USER', payload: user });
        dispatch({ type: 'SET_TOKENS', payload: { token: accessToken, refreshToken } });

        return { success: true };
      } else {
        dispatch({ type: 'SET_ERROR', payload: response.message || 'Login failed' });
        return { success: false, message: response.message };
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Login failed';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      return { success: false, message: errorMessage };
    }
  }, []);

  // Register function
  const register = useCallback(async (userData) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'CLEAR_ERROR' });

      const response = await AuthService.register(userData);

      if (response.success) {
        return { success: true, message: response.message };
      } else {
        dispatch({ type: 'SET_ERROR', payload: response.message || 'Registration failed' });
        return { success: false, message: response.message };
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Registration failed';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      return { success: false, message: errorMessage };
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    try {
      // Call logout API if token exists
      if (state.token) {
        await AuthService.logout(state.refreshToken);
      }
    } catch (error) {
      console.log('Logout API call failed:', error.message);
      // Continue with local logout even if API call fails
    }

    // Clear stored data
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('user');

    // Clear auth header
    AuthService.clearAuthToken();

    // Update state
    dispatch({ type: 'LOGOUT' });
  }, [state.token]);

  // Update profile function
  const updateProfile = useCallback(async (profileData) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'CLEAR_ERROR' });

      const response = await AuthService.updateProfile(profileData);

      if (response.success) {
        const updatedUser = response.data.user;
        
        // Update stored user data
        await SecureStore.setItemAsync('user', JSON.stringify(updatedUser));
        
        // Update state
        dispatch({ type: 'SET_USER', payload: updatedUser });

        return { success: true, message: 'Profile updated successfully' };
      } else {
        dispatch({ type: 'SET_ERROR', payload: response.message || 'Profile update failed' });
        return { success: false, message: response.message };
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Profile update failed';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      return { success: false, message: errorMessage };
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // Clear error function
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  // Check auth state when the app starts
  useEffect(() => {
    checkAuthState();
  }, [checkAuthState]);

  // Context value
  const value = {
    user: state.user,
    token: state.token,
    refreshToken: state.refreshToken,
    loading: state.loading,
    error: state.error,
    checkAuthState,
    login,
    register,
    logout,
    updateProfile,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}

export default AuthContext;