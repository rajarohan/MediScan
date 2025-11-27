#!/bin/bash

# MediScan - Start All Services
echo "🏥 Starting MediScan Services..."

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo "⚠️  Port $1 is already in use"
        return 1
    else
        echo "✅ Port $1 is available"
        return 0
    fi
}

# Check required ports
echo "🔍 Checking ports..."
check_port 3000 # Backend
check_port 5001 # AI Service
check_port 8081 # Metro bundler (Expo)

# Create logs directory if it doesn't exist
mkdir -p ./Backend/logs
mkdir -p ./flask-ai-service/logs

# Start Backend Service
echo "🚀 Starting Backend Service..."
cd Backend
npm install
echo "Starting backend on port 3000..."
npm start &
BACKEND_PID=$!
cd ..

# Wait a bit for backend to start
sleep 3

# Start AI Service
echo "🤖 Starting AI Service..."
cd flask-ai-service
echo "Installing Python dependencies..."
pip3 install -r requirements.txt
echo "Starting AI service on port 5001..."
python3 app.py &
AI_PID=$!
cd ..

# Wait a bit for AI service to start
sleep 3

# Start Mobile App
echo "📱 Starting Mobile App..."
cd MediScan
npm install
echo "Starting Expo development server..."
npx expo start &
EXPO_PID=$!
cd ..

echo ""
echo "🎉 All services started!"
echo ""
echo "📊 Service URLs:"
echo "   Backend API: http://localhost:3000"
echo "   AI Service: http://localhost:5001"
echo "   Mobile App: http://localhost:8081"
echo ""
echo "📝 Process IDs:"
echo "   Backend: $BACKEND_PID"
echo "   AI Service: $AI_PID"
echo "   Expo: $EXPO_PID"
echo ""
echo "🛑 To stop all services, run: ./stop-all.sh"
echo ""
echo "🔍 Check service health:"
echo "   Backend: curl http://localhost:3000/health"
echo "   AI Service: curl http://localhost:5001/health"
echo ""

# Save PIDs for cleanup
echo $BACKEND_PID > .backend.pid
echo $AI_PID > .ai.pid
echo $EXPO_PID > .expo.pid

# Keep script running
wait
