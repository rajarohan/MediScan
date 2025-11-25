import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import {
  TextInput,
  Button,
  Card,
  Title,
  Paragraph,
  HelperText,
  ActivityIndicator,
  Snackbar,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as Animatable from 'react-native-animatable';
import { useAuth } from '../context/AuthContext';
import Toast from 'react-native-toast-message';

const LoginScreen = ({ navigation }) => {
  const { login, loading, error, clearError } = useAuth();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  
  const [formErrors, setFormErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  useEffect(() => {
    if (error) {
      setSnackbarVisible(true);
    }
  }, [error]);

  const validateForm = () => {
    const errors = {};
    
    // Email validation
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    // Password validation
    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    
    // Clear error when user starts typing
    if (formErrors[field]) {
      setFormErrors(prev => ({
        ...prev,
        [field]: undefined,
      }));
    }
  };

  const handleLogin = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      const result = await login(formData.email, formData.password);
      
      if (result.success) {
        Toast.show({
          type: 'success',
          text1: 'Login Successful',
          text2: 'Welcome to MediScan!',
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Login Failed',
          text2: result.message || 'Please check your credentials',
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      Toast.show({
        type: 'error',
        text1: 'Login Error',
        text2: 'Something went wrong. Please try again.',
      });
    }
  };

  const handleForgotPassword = () => {
    Alert.alert(
      'Forgot Password',
      'Please contact support to reset your password.',
      [
        { text: 'OK', style: 'default' }
      ]
    );
  };

  return (
    <LinearGradient
      colors={['#00CC66', '#4B0082']}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <Animatable.View
            animation="fadeInUp"
            duration={1000}
            style={styles.logoContainer}
          >
            <Text style={styles.logoText}>MediScan</Text>
            <Text style={styles.taglineText}>
              Secure Medical Document Processing
            </Text>
          </Animatable.View>

          <Animatable.View
            animation="fadeInUp"
            duration={1000}
            delay={200}
          >
            <Card style={styles.loginCard}>
              <Card.Content>
                <Title style={styles.cardTitle}>Welcome Back</Title>
                <Paragraph style={styles.cardSubtitle}>
                  Sign in to access your medical documents
                </Paragraph>

                <View style={styles.formContainer}>
                  <TextInput
                    label="Email Address"
                    value={formData.email}
                    onChangeText={(value) => handleInputChange('email', value)}
                    mode="outlined"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                    error={!!formErrors.email}
                    disabled={loading}
                    left={<TextInput.Icon icon="email" />}
                    style={styles.input}
                  />
                  <HelperText type="error" visible={!!formErrors.email}>
                    {formErrors.email}
                  </HelperText>

                  <TextInput
                    label="Password"
                    value={formData.password}
                    onChangeText={(value) => handleInputChange('password', value)}
                    mode="outlined"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="password"
                    textContentType="password"
                    error={!!formErrors.password}
                    disabled={loading}
                    left={<TextInput.Icon icon="lock" />}
                    right={
                      <TextInput.Icon
                        icon={showPassword ? 'eye-off' : 'eye'}
                        onPress={() => setShowPassword(!showPassword)}
                      />
                    }
                    style={styles.input}
                  />
                  <HelperText type="error" visible={!!formErrors.password}>
                    {formErrors.password}
                  </HelperText>

                  <Button
                    mode="contained"
                    onPress={handleLogin}
                    loading={loading}
                    disabled={loading}
                    style={styles.loginButton}
                    contentStyle={styles.buttonContent}
                  >
                    {loading ? 'Signing In...' : 'Sign In'}
                  </Button>

                  <Button
                    mode="text"
                    onPress={handleForgotPassword}
                    disabled={loading}
                    style={styles.forgotButton}
                  >
                    Forgot Password?
                  </Button>
                </View>
              </Card.Content>
            </Card>
          </Animatable.View>

          <Animatable.View
            animation="fadeInUp"
            duration={1000}
            delay={400}
            style={styles.registerContainer}
          >
            <Text style={styles.registerText}>Don't have an account?</Text>
            <Button
              mode="outlined"
              onPress={() => navigation.navigate('Register')}
              disabled={loading}
              style={styles.registerButton}
              labelStyle={styles.registerButtonLabel}
            >
              Create Account
            </Button>
          </Animatable.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => {
          setSnackbarVisible(false);
          clearError();
        }}
        duration={4000}
        style={styles.snackbar}
      >
        {error}
      </Snackbar>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  taglineText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '300',
  },
  loginCard: {
    elevation: 8,
    borderRadius: 16,
    marginBottom: 20,
  },
  cardTitle: {
    textAlign: 'center',
    color: '#4B0082',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  cardSubtitle: {
    textAlign: 'center',
    color: '#1A1A1A',
    fontSize: 16,
    marginBottom: 20,
  },
  formContainer: {
    marginTop: 20,
  },
  input: {
    marginBottom: 8,
    backgroundColor: 'white',
  },
  loginButton: {
    marginTop: 20,
    marginBottom: 16,
    borderRadius: 8,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  forgotButton: {
    alignSelf: 'center',
  },
  registerContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  registerText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 16,
    marginBottom: 12,
  },
  registerButton: {
    borderColor: 'rgba(255, 255, 255, 0.8)',
    borderWidth: 2,
    borderRadius: 8,
  },
  registerButtonLabel: {
    color: 'white',
    fontWeight: 'bold',
  },
  snackbar: {
    backgroundColor: '#4B0082',
  },
});

export default LoginScreen;