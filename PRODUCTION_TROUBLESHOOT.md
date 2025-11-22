# 🔥 Production Deployment Troubleshooting Guide

## ⚠️ ปัญหาที่พบบ่อย

### 1. ❌ "Cannot GET /" หรือเข้าหน้าเว็บไม่ได้

#### วิธีเช็ค:
```bash
# SSH เข้า production server
ssh user@ads169th.com
cd /var/www/vhosts/ads169th.com/httpdocs

# รัน health check script
bash check-production.sh
```

#### สาเหตุที่เป็นไปได้:

---

### 🔴 สาเหตุที่ 1: Process ไม่ได้รัน

**เช็ค:**
```bash
pm2 list
# หรือ
ps aux | grep node
```

**แก้:**
```bash
# ถ้าใช้ PM2
pm2 start ecosystem.config.js
pm2 restart all
pm2 logs

# ถ้าไม่มี PM2 ให้รันด้วย npm
npm run start
# หรือ
node .next/standalone/server.js
```

---

### 🔴 สาเหตุที่ 2: ไฟล์ .env หายหรือไม่ครบ

**เช็ค:**
```bash
ls -la .env
cat .env
```

**แก้:**
```bash
# สร้างไฟล์ .env ใหม่
nano .env
```

**วาง config นี้ (แก้รหัสผ่าน):**
```bash
MONGODB_URI="mongodb+srv://sanewgate:newgate0424@data-ads.jxyonoc.mongodb.net/sheets_sync?retryWrites=true&w=majority&authSource=admin&tlsAllowInvalidCertificates=true"
DATABASE_USER_URL="mongodb+srv://sanewgate:newgate0424@data-ads.jxyonoc.mongodb.net/sheets_sync?retryWrites=true&w=majority&authSource=admin&tlsAllowInvalidCertificates=true"

# แก้ YOUR_PASSWORD และ YOUR_DATABASE ตามจริง
DATABASE_URL="mysql://root:YOUR_PASSWORD@localhost:3306/YOUR_DATABASE"
DB_HOST="localhost"
DB_PORT=3306
DB_USER="root"
DB_PASSWORD="YOUR_PASSWORD"
DB_NAME="YOUR_DATABASE"

CRON_SYNC_TOKEN="pPBT2p3Jfq6BKpDXVIp0phfxtVLX9dfq"
NEXT_PUBLIC_CRON_TOKEN="5rQJ0YCtgljsyUaIidTOvX6kOZMbAogd"
ADMIN_PASSWORD="admin123"
```

**บันทึก:** `Ctrl+X` → `Y` → `Enter`

---

### 🔴 สาเหตุที่ 3: Build ไม่สำเร็จหรือไม่มี .next folder

**เช็ค:**
```bash
ls -la .next
```

**แก้:**
```bash
# ลบ build เก่าและ build ใหม่
rm -rf .next
npm install
npm run build
```

**ถ้า build fail ให้ดู error:**
```bash
npm run build 2>&1 | tee build.log
cat build.log
```

---

### 🔴 สาเหตุที่ 4: Port 3000 ถูกใช้งานอยู่

**เช็ค:**
```bash
netstat -tuln | grep :3000
# หรือ
lsof -i :3000
```

**แก้:**
```bash
# Kill process ที่ใช้ port 3000
lsof -ti:3000 | xargs kill -9

# หรือใช้ PM2 restart
pm2 restart all
```

---

### 🔴 สาเหตุที่ 5: Nginx/Apache ไม่ได้ forward request

**เช็ค:**
```bash
# ถ้าใช้ Nginx
sudo nginx -t
sudo systemctl status nginx

# ถ้าใช้ Apache
sudo apachectl configtest
sudo systemctl status apache2
```

**แก้ (Nginx):**
```bash
# แก้ไข nginx config
sudo nano /etc/nginx/sites-available/ads169th.com

# ต้องมี proxy_pass ไปที่ localhost:3000
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}

# Restart nginx
sudo systemctl restart nginx
```

---

### 🔴 สาเหตุที่ 6: Firewall บล็อก port

**เช็ค:**
```bash
sudo ufw status
sudo iptables -L
```

**แก้:**
```bash
# เปิด port 3000 (ถ้าจำเป็น)
sudo ufw allow 3000

# หรือเปิด port 80, 443
sudo ufw allow 80
sudo ufw allow 443
```

---

### 🔴 สาเหตุที่ 7: Database connection ล้มเหลว

**เช็ค MongoDB:**
```bash
node -e "
const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI;
MongoClient.connect(uri)
  .then(() => console.log('✅ MongoDB OK'))
  .catch(e => console.log('❌ MongoDB Error:', e.message));
"
```

**เช็ค MySQL:**
```bash
mysql -u root -p -e "SELECT 1;"
```

---

## 🎯 Quick Fix Checklist

```bash
# 1. ตรวจสอบทุกอย่าง
bash check-production.sh

# 2. Pull code ล่าสุด
git pull origin master

# 3. Install dependencies
npm install

# 4. สร้าง/ตรวจสอบ .env
cat .env

# 5. Build ใหม่
rm -rf .next
npm run build

# 6. Restart process
pm2 restart all
pm2 logs

# 7. ทดสอบ
curl http://localhost:3000/api/health
```

---

## 📊 ดู Logs

```bash
# PM2 logs
pm2 logs --lines 100

# System logs
journalctl -u your-app-name -f

# Next.js logs (ถ้ามี)
tail -f /var/www/vhosts/ads169th.com/httpdocs/.next/server.log
```

---

## 🆘 ถ้ายังไม่ได้

ส่ง output ของคำสั่งเหล่านี้มาให้ดู:

```bash
# 1. Environment check
cat .env | sed 's/:.*/:*****/'

# 2. Process check
pm2 list
ps aux | grep node

# 3. Port check
netstat -tuln | grep :3000

# 4. Build check
ls -la .next

# 5. Log check
pm2 logs --lines 50 --nostream

# 6. Test connection
curl -v http://localhost:3000/api/health

# 7. Server info
node --version
npm --version
uname -a
```

---

## 🔧 Alternative: Manual Start

ถ้า PM2 ไม่ทำงาน ลองรันแบบ manual:

```bash
# Stop PM2
pm2 stop all

# Start manually
NODE_ENV=production npm run start

# หรือใช้ standalone
NODE_ENV=production node .next/standalone/server.js
```

---

## 📞 Contact Info

ส่ง error logs มาได้ที่:
- Build log: `npm run build 2>&1 | tee build.log`
- Runtime log: `pm2 logs --lines 100 --nostream`
- System log: `journalctl -u your-app -n 100`
