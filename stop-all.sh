#!/bin/bash

# MediScan - Stop All Services
echo "🛑 Stopping MediScan Services..."

# Function to stop process by PID file
stop_service() {
    local service_name=$1
    local pid_file=$2
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "Stopping $service_name (PID: $pid)..."
            kill "$pid"
            sleep 2
            if kill -0 "$pid" 2>/dev/null; then
                echo "Force killing $service_name..."
                kill -9 "$pid"
            fi
        else
            echo "$service_name process not found"
        fi
        rm -f "$pid_file"
    else
        echo "No PID file found for $service_name"
    fi
}

# Stop services
stop_service "Backend" ".backend.pid"
stop_service "AI Service" ".ai.pid"
stop_service "Expo" ".expo.pid"

# Kill any remaining processes on the ports
echo "🧹 Cleaning up remaining processes..."
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 5001/tcp 2>/dev/null || true
fuser -k 8081/tcp 2>/dev/null || true

echo "✅ All services stopped"
