#!/bin/bash

# ============================================
# Plesk Application Startup Script
# ============================================
# This is the startup script for Plesk Node.js
# Configure in Plesk: Application Startup File
# ============================================

set -e

echo "Starting application..."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Set production environment
export NODE_ENV=production

# Use Plesk's port if available, otherwise default to 3000
export PORT=${PORT:-3000}

# Start the application
exec node app.js
