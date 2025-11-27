#!/bin/bash

# MediScan - Health Check
echo "🔍 Checking MediScan Services Health..."

# Function to check service health
check_service() {
    local service_name=$1
    local url=$2
    local expected_text=$3
    
    echo -n "Checking $service_name... "
    
    if curl -s --max-time 5 "$url" | grep -q "$expected_text"; then
        echo "✅ Healthy"
        return 0
    else
        echo "❌ Unhealthy"
        return 1
    fi
}

# Check MongoDB (if accessible)
echo -n "Checking MongoDB... "
if mongosh --eval "db.runCommand('ping')" --quiet >/dev/null 2>&1; then
    echo "✅ Connected"
else
    echo "⚠️  Not accessible (may be remote/cloud)"
fi

# Check services
check_service "Backend API" "http://localhost:3000/health" "success"
check_service "AI Service" "http://localhost:5001/health" "healthy"

echo ""
echo "📊 Service Endpoints:"
echo "   Backend: http://localhost:3000"
echo "   Backend Health: http://localhost:3000/health"
echo "   Backend API Docs: http://localhost:3000/api/v1"
echo "   AI Service: http://localhost:5001"
echo "   AI Service Health: http://localhost:5001/health"
echo ""

# Check if Expo is running
if curl -s --max-time 5 "http://localhost:8081" >/dev/null 2>&1; then
    echo "📱 Expo Development Server: ✅ Running on http://localhost:8081"
else
    echo "📱 Expo Development Server: ❌ Not running"
fi

echo ""
echo "🔧 Troubleshooting:"
echo "   If services are not healthy:"
echo "   1. Check if they're running: ps aux | grep -E '(node|python)'"
echo "   2. Check port usage: lsof -i :3000,:5001,:8081"
echo "   3. Check logs: tail -f Backend/logs/mediscan.log"
echo "   4. Restart services: ./stop-all.sh && ./start-all.sh"