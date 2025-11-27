#!/bin/bash

# MediScan - Initial Setup
echo "🏥 Setting up MediScan..."

# Check if we're in the right directory
if [ ! -f "setup.sh" ]; then
    echo "❌ Please run this script from the MediScan root directory"
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3 first."
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p Backend/logs
mkdir -p Backend/uploads
mkdir -p flask-ai-service/models
mkdir -p flask-ai-service/logs

# Setup Backend
echo "🔧 Setting up Backend..."
cd Backend
if [ ! -f ".env" ]; then
    echo "⚠️  Backend .env file missing. Please create it based on .env.example"
fi
npm install
cd ..

# Setup AI Service
echo "🤖 Setting up AI Service..."
cd flask-ai-service
if [ ! -f ".env" ]; then
    echo "⚠️  AI Service .env file missing. Please create it based on .env.example"
fi
# Install Python dependencies
if command -v pip3 &> /dev/null; then
    pip3 install -r requirements.txt
elif command -v pip &> /dev/null; then
    pip install -r requirements.txt
else
    echo "❌ pip is not installed. Please install pip first."
    exit 1
fi
cd ..

# Setup Mobile App
echo "📱 Setting up Mobile App..."
cd MediScan
if [ ! -f ".env" ]; then
    echo "⚠️  Mobile App .env file missing. Please create it based on .env.example"
fi
npm install
cd ..

# Make scripts executable
echo "🔐 Making scripts executable..."
chmod +x start-all.sh
chmod +x stop-all.sh
chmod +x setup.sh

echo ""
echo "🎉 Setup completed!"
echo ""
echo "📋 Next steps:"
echo "   1. Ensure all .env files are properly configured"
echo "   2. Start MongoDB (if using local instance)"
echo "   3. Start Redis (optional, if using)"
echo "   4. Run './start-all.sh' to start all services"
echo ""
echo "📝 Environment files to configure:"
echo "   - Backend/.env (database, secrets)"
echo "   - flask-ai-service/.env (AI service settings)"
echo "   - MediScan/.env (API endpoints)"
echo ""
