import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Platform, Alert, Text } from 'react-native';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import Toast from 'react-native-toast-message';
import * as SecureStore from 'expo-secure-store';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

// Initialize i18n
import './src/i18n/i18n';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import UploadScreen from './src/screens/UploadScreen';
import FilesScreen from './src/screens/FilesScreen';
import FileDetailsScreen from './src/screens/FileDetailsScreen';
import ResultsScreen from './src/screens/ResultsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import LoadingScreen from './src/screens/LoadingScreen';

// Services
import AuthService from './src/services/AuthService';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';

// Components
import TabNavigator from './src/components/TabNavigator';

// Theme
const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#4B0082',
    accent: '#00CC66',
    background: '#FAFAFA',
    surface: '#E6E6FA',
    text: '#1A1A1A',
    placeholder: '#1A1A1A',
  },
  fonts: {
    ...DefaultTheme.fonts,
    regular: {
      fontFamily: 'System',
      fontWeight: 'normal',
    },
    medium: {
      fontFamily: 'System',
      fontWeight: '500',
    },
    light: {
      fontFamily: 'System',
      fontWeight: '300',
    },
    thin: {
      fontFamily: 'System',
      fontWeight: '100',
    },
  },
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Auth Stack Navigator
function AuthStackNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.primary,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen 
        name="Login" 
        component={LoginScreen} 
        options={{ title: 'MediScan Login' }}
      />
      <Stack.Screen 
        name="Register" 
        component={RegisterScreen}
        options={{ title: 'Create Account' }}
      />
    </Stack.Navigator>
  );
}

// Main Tab Navigator  
function MainTabNavigator() {
  return <TabNavigator theme={theme} />;
}

// Main App Stack Navigator
function AppStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.primary,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen 
        name="MainTabs" 
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="FileDetails" 
        component={FileDetailsScreen}
        options={{ title: 'File Details' }}
      />
      <Stack.Screen 
        name="Results" 
        component={ResultsScreen}
        options={{ title: 'Analysis Results' }}
      />
      <Stack.Screen 
        name="Loading" 
        component={LoadingScreen}
        options={{ 
          title: 'Processing...',
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
    </Stack.Navigator>
  );
}

// App Content with Authentication Check
function AppContent() {
  const { user, loading, checkAuthState } = useAuth();

  useEffect(() => {
    checkAuthState();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <AppStackNavigator /> : <AuthStackNavigator />}
    </NavigationContainer>
  );
}

// Toast configuration
const toastConfig = {
  warning: ({ text1, text2, ...rest }) => (
    <View style={{
      height: 60,
      width: '90%',
      backgroundColor: '#ff9500',
      borderRadius: 8,
      paddingHorizontal: 15,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>{text1}</Text>
        {text2 && <Text style={{ color: 'white', fontSize: 14 }}>{text2}</Text>}
      </View>
    </View>
  ),
};

// Main App Component
export default function App() {
  return (
    <PaperProvider theme={theme}>
      <LanguageProvider>
        <AuthProvider>
          <View style={styles.container}>
            <StatusBar style="light" backgroundColor={theme.colors.primary} />
            <AppContent />
            <Toast config={toastConfig} />
          </View>
        </AuthProvider>
      </LanguageProvider>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
});
