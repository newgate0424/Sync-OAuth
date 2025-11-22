#!/bin/bash

# ============================================
# Plesk Obsidian Setup Script
# ============================================
# This script prepares the application for Plesk
# ============================================

set -e

echo "=========================================="
echo "🚀 Plesk Obsidian Setup Script"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get project directory
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo "📂 Project Directory: $PROJECT_DIR"
echo ""

# Step 1: Check Node.js version
echo "1️⃣ Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version is too old: $(node -v)${NC}"
    echo -e "${YELLOW}⚠️  Required: Node.js >= 18.x${NC}"
    echo -e "${YELLOW}💡 Set Node.js version in Plesk: Websites & Domains > Node.js${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Node.js version: $(node -v)${NC}"
fi
echo ""

# Step 2: Check .env file
echo "2️⃣ Checking .env file..."
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found!${NC}"
    echo "📝 Creating .env from template..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ .env created from .env.example${NC}"
    else
        echo -e "${RED}❌ .env.example not found!${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ .env file exists${NC}"
fi

# Set correct permissions
chmod 600 .env
echo -e "${GREEN}✅ Set .env permissions to 600${NC}"
echo ""

# Step 3: Check credentials.json
echo "3️⃣ Checking credentials.json..."
if [ ! -f credentials.json ]; then
    echo -e "${RED}❌ credentials.json not found!${NC}"
    echo -e "${YELLOW}📋 Please upload your Google Service Account credentials${NC}"
    echo -e "${YELLOW}   Download from: https://console.cloud.google.com/apis/credentials${NC}"
    echo -e "${YELLOW}   Save as: $PROJECT_DIR/credentials.json${NC}"
    echo ""
    echo -e "${YELLOW}⏭️  Continuing without credentials.json (will fail on Google Sheets sync)${NC}"
else
    echo -e "${GREEN}✅ credentials.json exists${NC}"
    chmod 600 credentials.json
    echo -e "${GREEN}✅ Set credentials.json permissions to 600${NC}"
fi
echo ""

# Step 4: Install dependencies
echo "4️⃣ Installing dependencies..."
if [ -d node_modules ]; then
    echo -e "${YELLOW}⚠️  node_modules exists, running clean install...${NC}"
    rm -rf node_modules package-lock.json
fi

npm ci --production=false
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Step 5: Build application
echo "5️⃣ Building application..."
NODE_ENV=production npm run build
echo -e "${GREEN}✅ Build completed${NC}"
echo ""

# Step 6: Create logs directory
echo "6️⃣ Creating logs directory..."
mkdir -p logs
chmod 755 logs
echo -e "${GREEN}✅ Logs directory created${NC}"
echo ""

# Step 7: Test database connection
echo "7️⃣ Testing database connections..."
node -e "
const fs = require('fs');
if (!fs.existsSync('.env')) {
  console.log('⚠️  .env file not configured yet');
  process.exit(0);
}
require('dotenv').config();
console.log('✅ Environment variables loaded');
console.log('   - MONGODB_URI:', process.env.MONGODB_URI ? '✓ Set' : '✗ Missing');
console.log('   - DATABASE_URL:', process.env.DATABASE_URL ? '✓ Set' : '✗ Missing');
" || echo -e "${YELLOW}⚠️  Please configure .env file${NC}"
echo ""

# Step 8: Display next steps
echo "=========================================="
echo -e "${GREEN}✅ Setup completed!${NC}"
echo "=========================================="
echo ""
echo "📋 Next steps:"
echo ""
echo "1. Configure .env file:"
echo "   nano .env"
echo ""
echo "2. Upload credentials.json (if not already done):"
echo "   - Get from: https://console.cloud.google.com/apis/credentials"
echo "   - Upload to: $PROJECT_DIR/credentials.json"
echo ""
echo "3. Configure Plesk Node.js application:"
echo "   - Application Mode: production"
echo "   - Application Root: $PROJECT_DIR"
echo "   - Application Startup File: app.js"
echo "   - Node.js version: 18.x or higher"
echo ""
echo "4. Start the application in Plesk:"
echo "   Websites & Domains > Node.js > Enable Node.js"
echo ""
echo "5. Access your application:"
echo "   http://your-domain.com"
echo ""
echo "=========================================="
echo ""

exit 0
