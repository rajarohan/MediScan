import { Platform, Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

/**
 * Network debugging utilities for MediScan
 */
export class NetworkDebugger {
  static async checkNetworkStatus() {
    try {
      const netInfoState = await NetInfo.fetch();
      console.log('Network Status:', {
        isConnected: netInfoState.isConnected,
        type: netInfoState.type,
        isInternetReachable: netInfoState.isInternetReachable,
      });
      return netInfoState;
    } catch (error) {
      console.error('Error checking network status:', error);
      return null;
    }
  }

  static async testApiConnection(baseUrl) {
    console.log(`Testing API connection to: ${baseUrl}`);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${baseUrl.replace('/api/v1', '')}/health`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log('✅ API connection successful');
        return true;
      } else {
        console.log('❌ API responded with error:', response.status);
        return false;
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('❌ API connection timeout');
      } else {
        console.log('❌ API connection failed:', error.message);
      }
      return false;
    }
  }

  static getRecommendedApiUrl() {
    if (Platform.OS === 'ios') {
      return {
        simulator: 'http://localhost:3000/api/v1',
        device: 'http://192.168.1.12:3000/api/v1', // Your network IP
      };
    } else {
      return {
        emulator: 'http://10.0.2.2:3000/api/v1',
        device: 'http://192.168.1.12:3000/api/v1', // Your network IP
      };
    }
  }

  static showNetworkTroubleshootingAlert() {
    const urls = this.getRecommendedApiUrl();
    const platform = Platform.OS;
    
    Alert.alert(
      'Network Connection Error',
      `Cannot reach the backend server. Please check:\n\n` +
      `1. Backend server is running on port 3000\n` +
      `2. Use correct URL for your environment:\n` +
      `   • ${platform === 'ios' ? 'iOS Simulator' : 'Android Emulator'}: ${Object.values(urls)[0]}\n` +
      `   • Physical Device: ${Object.values(urls)[1]}\n\n` +
      `3. Check your network connection\n` +
      `4. Disable any VPN or firewall blocking localhost`,
      [
        { text: 'OK', style: 'default' }
      ]
    );
  }

  static async performFullNetworkDiagnostic(apiBaseUrl) {
    console.log('🔍 Starting network diagnostic...');
    
    // 1. Check general network connectivity
    const networkStatus = await this.checkNetworkStatus();
    
    // 2. Test API connection
    const apiConnected = await this.testApiConnection(apiBaseUrl);
    
    // 3. Show recommendations
    const recommendations = this.getRecommendedApiUrl();
    
    const diagnostic = {
      networkConnected: networkStatus?.isConnected,
      internetReachable: networkStatus?.isInternetReachable,
      apiConnected,
      currentUrl: apiBaseUrl,
      recommendations,
      platform: Platform.OS,
    };
    
    console.log('📊 Network Diagnostic Results:', diagnostic);
    
    if (!apiConnected) {
      this.showNetworkTroubleshootingAlert();
    }
    
    return diagnostic;
  }
}

export default NetworkDebugger;