#!/bin/bash

# CV Parser & AI Matching Pipeline - Setup Script

echo "================================================"
echo "CV Parser & AI Matching Pipeline Setup"
echo "================================================"
echo ""

# Check if Redis is installed
if ! command -v redis-server &> /dev/null
then
    echo "❌ Redis is not installed!"
    echo ""
    echo "Please install Redis:"
    echo "  macOS: brew install redis"
    echo "  Ubuntu: sudo apt-get install redis-server"
    echo "  Windows: Download from https://redis.io/download"
    echo ""
    exit 1
fi

echo "✅ Redis is installed"
echo ""

# Check if Redis is running
if redis-cli ping &> /dev/null
then
    echo "✅ Redis is already running"
else
    echo "⚠️  Redis is not running. Starting Redis..."
    redis-server --daemonize yes
    sleep 2
    
    if redis-cli ping &> /dev/null
    then
        echo "✅ Redis started successfully"
    else
        echo "❌ Failed to start Redis"
        exit 1
    fi
fi

echo ""
echo "================================================"
echo "Testing Redis Connection"
echo "================================================"
redis-cli ping
echo ""

# Display Redis info
echo "================================================"
echo "Redis Configuration"
echo "================================================"
redis-cli INFO server | grep -E "redis_version|os|tcp_port"
echo ""

echo "================================================"
echo "Environment Check"
echo "================================================"

# Check .env file
if [ -f ".env" ]; then
    echo "✅ .env file exists"
    
    # Check for required variables
    if grep -q "GEMINI_API_KEY" .env; then
        echo "✅ GEMINI_API_KEY is configured"
    else
        echo "⚠️  GEMINI_API_KEY not found in .env"
    fi
    
    if grep -q "REDIS_HOST" .env; then
        echo "✅ Redis configuration found"
    else
        echo "⚠️  Redis configuration not found in .env"
    fi
else
    echo "❌ .env file not found!"
fi

echo ""
echo "================================================"
echo "Setup Complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Ensure MongoDB is running"
echo "2. Start the application: npm run dev"
echo "3. Check logs for any errors"
echo ""
echo "Queue monitoring:"
echo "  - Active jobs: redis-cli KEYS 'bull:resume-processing:*'"
echo "  - Clear all jobs: redis-cli FLUSHDB"
echo ""
