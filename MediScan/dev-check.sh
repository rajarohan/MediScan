#!/bin/bash

# MediScan Development Startup Script
# This script helps diagnose and fix common development issues

echo "🏥 MediScan Development Environment Checker"
echo "============================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in the MediScan React Native directory"
    echo "   Please run this script from: /Users/rajarohanvaidyula/Documents/MediScan/MediScan"
    exit 1
fi

echo "✅ In correct directory"

# Check if backend is running
echo ""
echo "🔍 Checking backend server status..."
if curl -f -s http://localhost:3000/health > /dev/null; then
    echo "✅ Backend server is running on localhost:3000"
else
    echo "❌ Backend server not reachable on localhost:3000"
    echo "   Please start the backend server:"
    echo "   cd /Users/rajarohanvaidyula/Documents/MediScan/Backend && npm start"
fi

# Check network IP backend
echo ""
echo "🔍 Checking network IP backend..."
if curl -f -s http://192.168.1.12:3000/health > /dev/null; then
    echo "✅ Backend server is reachable on network IP (192.168.1.12:3000)"
else
    echo "⚠️  Backend server not reachable on network IP"
    echo "   This is only needed for physical device testing"
fi

# Check AI service
echo ""
echo "🔍 Checking AI service status..."
if curl -f -s http://localhost:5001/health > /dev/null; then
    echo "✅ AI service is running on localhost:5001"
else
    echo "❌ AI service not reachable on localhost:5001"
    echo "   Please start the AI service:"
    echo "   cd /Users/rajarohanvaidyula/Documents/MediScan/flask-ai-service && python3 app.py"
fi

# Check iOS Simulator
echo ""
echo "🔍 Checking iOS Simulator..."
if command -v xcrun >/dev/null 2>&1; then
    if xcrun simctl list devices | grep "Booted" > /dev/null; then
        echo "✅ iOS Simulator is running"
    else
        echo "⚠️  No iOS Simulator is currently booted"
        echo "   Starting iOS Simulator..."
        open -a Simulator
    fi
else
    echo "❌ Xcode command line tools not installed"
    echo "   Please install Xcode and command line tools"
fi

# Check dependencies
echo ""
echo "🔍 Checking dependencies..."
if [ -d "node_modules" ]; then
    echo "✅ Node modules installed"
else
    echo "❌ Node modules not installed"
    echo "   Installing dependencies..."
    npm install
fi

# Environment configuration
echo ""
echo "🔍 Checking environment configuration..."
if [ -f ".env" ]; then
    echo "✅ Environment file exists"
    echo "   Current API URL: $(grep EXPO_PUBLIC_API_BASE_URL .env | cut -d '=' -f2)"
else
    echo "❌ Environment file missing"
    echo "   Please create .env file with proper configuration"
fi

# Platform-specific recommendations
echo ""
echo "📱 Platform Recommendations:"
echo "   iOS Simulator: Use http://localhost:3000/api/v1"
echo "   Physical Device: Use http://192.168.1.12:3000/api/v1"
echo "   Android Emulator: Use http://10.0.2.2:3000/api/v1"

echo ""
echo "🚀 Ready to start development!"
echo "   Run: npx expo start"
echo ""
echo "🛠  Troubleshooting:"
echo "   • If login timeouts occur, check backend server is running"
echo "   • For iOS Simulator issues, try: npx expo start --clear"
echo "   • For network errors, verify API URL in .env matches your platform"
echo "   • Check logs in terminal for detailed error information"