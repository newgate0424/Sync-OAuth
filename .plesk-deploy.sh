#!/bin/bash
set -e

echo "================================"
echo "  Plesk Git Deployment Started  "
echo "================================"

# Get the project directory
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# Load .env if exists
if [ -f .env ]; then
    echo "📝 Loading environment variables..."
    export $(cat .env | grep -v '^#' | xargs)
fi

echo ""
echo "📦 Installing dependencies..."
npm ci --production=false || npm install

echo ""
echo "🔨 Building application..."
NODE_ENV=production npm run build

echo ""
echo "🗑️  Cleaning dev dependencies..."
npm prune --production

echo ""
echo "✅ Setting permissions..."
chmod 755 .
chmod 644 *.js *.json *.md 2>/dev/null || true
chmod 600 .env credentials.json 2>/dev/null || true

echo ""
echo "🔄 Restarting application..."
# Create restart trigger for Passenger
mkdir -p tmp
touch tmp/restart.txt

if command -v pm2 &> /dev/null; then
    pm2 restart bigquery-app 2>/dev/null || pm2 start ecosystem.config.json
    pm2 save
    echo "✅ PM2 restart completed"
else
    echo "✅ Passenger will restart automatically"
fi

echo ""
echo "================================"
echo "  ✅ Deployment Completed!      "
echo "================================"
echo ""
echo "📊 Next Steps:"
echo "1. Check logs: tail -f logs/*.log"
echo "2. Visit your website"
echo "3. Login with admin credentials"
echo ""

exit 0
