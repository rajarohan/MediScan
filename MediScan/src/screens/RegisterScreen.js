// RegisterScreen.js - User registration
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  TextInput,
  Button,
  Card,
  Title,
  Paragraph,
  HelperText,
  Checkbox,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as Animatable from 'react-native-animatable';
import { useAuth } from '../context/AuthContext';
import Toast from 'react-native-toast-message';

const RegisterScreen = ({ navigation }) => {
  const { register, loading } = useAuth();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',
    dateOfBirth: '',
    consentToProcess: false,
    consentToStore: false,
  });
  
  const [formErrors, setFormErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validateForm = () => {
    const errors = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }
    
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    if (!formData.consentToProcess) {
      errors.consentToProcess = 'You must consent to data processing';
    }
    
    if (!formData.consentToStore) {
      errors.consentToStore = 'You must consent to data storage';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    
    if (formErrors[field]) {
      setFormErrors(prev => ({
        ...prev,
        [field]: undefined,
      }));
    }
  };

  const handleRegister = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      const result = await register(formData);
      
      if (result.success) {
        Toast.show({
          type: 'success',
          text1: 'Registration Successful',
          text2: 'Please login with your credentials',
        });
        navigation.navigate('Login');
      } else {
        Toast.show({
          type: 'error',
          text1: 'Registration Failed',
          text2: result.message,
        });
      }
    } catch (error) {
      console.error('Registration error:', error);
      Toast.show({
        type: 'error',
        text1: 'Registration Error',
        text2: 'Something went wrong. Please try again.',
      });
    }
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
          >
            <Card style={styles.registerCard}>
              <Card.Content>
                <Title style={styles.cardTitle}>Create Account</Title>
                <Paragraph style={styles.cardSubtitle}>
                  Join MediScan for secure document processing
                </Paragraph>

                <TextInput
                  label="Full Name"
                  value={formData.name}
                  onChangeText={(value) => handleInputChange('name', value)}
                  mode="outlined"
                  error={!!formErrors.name}
                  disabled={loading}
                  left={<TextInput.Icon icon="account" />}
                  style={styles.input}
                />
                <HelperText type="error" visible={!!formErrors.name}>
                  {formErrors.name}
                </HelperText>

                <TextInput
                  label="Email Address"
                  value={formData.email}
                  onChangeText={(value) => handleInputChange('email', value)}
                  mode="outlined"
                  keyboardType="email-address"
                  autoCapitalize="none"
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

                <TextInput
                  label="Confirm Password"
                  value={formData.confirmPassword}
                  onChangeText={(value) => handleInputChange('confirmPassword', value)}
                  mode="outlined"
                  secureTextEntry={!showConfirmPassword}
                  error={!!formErrors.confirmPassword}
                  disabled={loading}
                  left={<TextInput.Icon icon="lock-check" />}
                  right={
                    <TextInput.Icon
                      icon={showConfirmPassword ? 'eye-off' : 'eye'}
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    />
                  }
                  style={styles.input}
                />
                <HelperText type="error" visible={!!formErrors.confirmPassword}>
                  {formErrors.confirmPassword}
                </HelperText>

                <View style={styles.consentContainer}>
                  <View style={styles.checkboxRow}>
                    <Checkbox
                      status={formData.consentToProcess ? 'checked' : 'unchecked'}
                      onPress={() => handleInputChange('consentToProcess', !formData.consentToProcess)}
                      color="#00CC66"
                    />
                    <Paragraph style={styles.consentText}>
                      I consent to processing of my medical data
                    </Paragraph>
                  </View>
                  <HelperText type="error" visible={!!formErrors.consentToProcess}>
                    {formErrors.consentToProcess}
                  </HelperText>

                  <View style={styles.checkboxRow}>
                    <Checkbox
                      status={formData.consentToStore ? 'checked' : 'unchecked'}
                      onPress={() => handleInputChange('consentToStore', !formData.consentToStore)}
                      color="#00CC66"
                    />
                    <Paragraph style={styles.consentText}>
                      I consent to secure storage of my data
                    </Paragraph>
                  </View>
                  <HelperText type="error" visible={!!formErrors.consentToStore}>
                    {formErrors.consentToStore}
                  </HelperText>
                </View>

                <Button
                  mode="contained"
                  onPress={handleRegister}
                  loading={loading}
                  disabled={loading}
                  style={styles.registerButton}
                  contentStyle={styles.buttonContent}
                >
                  {loading ? 'Creating Account...' : 'Create Account'}
                </Button>

                <Button
                  mode="text"
                  onPress={() => navigation.navigate('Login')}
                  disabled={loading}
                  style={styles.loginButton}
                >
                  Already have an account? Sign In
                </Button>
              </Card.Content>
            </Card>
          </Animatable.View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  registerCard: {
    elevation: 8,
    borderRadius: 16,
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
  input: {
    marginBottom: 8,
    backgroundColor: 'white',
  },
  consentContainer: {
    marginVertical: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  consentText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
  },
  registerButton: {
    marginTop: 20,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: '#00CC66',
  },
  buttonContent: {
    paddingVertical: 8,
  },
  loginButton: {
    alignSelf: 'center',
  },
});

export default RegisterScreen;