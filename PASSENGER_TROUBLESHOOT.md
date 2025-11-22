# Plesk/Passenger Configuration Guide

## 🔧 Plesk Node.js Settings

### Application Settings
```
Document Root: /httpdocs
Application Root: /httpdocs
Application Startup File: app.js
Application Mode: Production
Node.js Version: 18.x or 20.x
```

### Environment Variables (ใน Plesk UI)
```
NODE_ENV=production
PORT=3000
```

**หมายเหตุ**: ไฟล์ `.env` จะถูกอ่านอัตโนมัติ ไม่ต้องเพิ่มใน Plesk UI

---

## 🚀 Deployment Steps for Plesk

### 1. Upload Files
```bash
# Via Git (Recommended)
cd /var/www/vhosts/yourdomain.com/httpdocs
git pull origin master

# หรือ upload ผ่าน File Manager
```

### 2. Install Dependencies
```bash
cd /var/www/vhosts/yourdomain.com/httpdocs
npm install --production
```

### 3. Build Application
```bash
npm run build
```

### 4. Check Files
```bash
# รัน diagnostic script
bash diagnose-passenger.sh
```

### 5. Configure Plesk
1. ไปที่ **Websites & Domains** > domain ของคุณ
2. คลิก **Node.js**
3. ตั้งค่าตามด้านบน
4. คลิก **Enable Node.js**

### 6. Restart Application
```bash
# วิธีที่ 1: Touch restart file
touch tmp/restart.txt

# วิธีที่ 2: ใน Plesk UI
# คลิก "Restart App" ใน Node.js section
```

---

## 🔍 Troubleshooting Passenger Errors

### Error: "Something went wrong"

**สาเหตุที่เป็นไปได้:**

#### 1. ไม่ได้ Build
```bash
# แก้ไข:
npm run build
touch tmp/restart.txt
```

#### 2. ไม่มี node_modules
```bash
# แก้ไข:
npm install
touch tmp/restart.txt
```

#### 3. Node.js Version ต่ำเกินไป
- ใน Plesk: เปลี่ยน Node.js version เป็น 18.x หขือ 20.x

#### 4. .env หรือ Environment Variables ผิด
```bash
# เช็คไฟล์ .env
cat .env

# ตรวจสอบว่ามีค่าที่จำเป็น:
# - MONGODB_URI
# - DATABASE_URL (ถ้าใช้)
# - NODE_ENV=production
```

#### 5. Permissions ไม่ถูกต้อง
```bash
# แก้ไข permissions
chown -R username:psacln /var/www/vhosts/yourdomain.com/httpdocs
chmod -R 755 /var/www/vhosts/yourdomain.com/httpdocs
chmod 600 .env credentials.json
```

#### 6. Port Conflict
```bash
# ตรวจสอบว่า port 3000 ไม่ถูกใช้
lsof -i :3000

# หรือเปลี่ยน port ใน .env
PORT=3001
```

---

## 📋 Diagnostic Commands

### ตรวจสอบสถานะ
```bash
# รัน diagnostic script
bash diagnose-passenger.sh

# ดู Passenger status
sudo passenger-status

# ดู Passenger memory stats  
sudo passenger-memory-stats
```

### ดู Logs
```bash
# Application logs (ถ้ามี)
tail -f logs/*.log

# Plesk error logs
tail -f /var/www/vhosts/yourdomain.com/logs/error_log
tail -f /var/www/vhosts/yourdomain.com/logs/proxy_error_log

# Passenger logs
tail -f /var/log/passenger/*.log
```

### ทดสอบ app.js
```bash
# Test syntax
node -c app.js

# Test manual start (อย่าลืม stop ก่อน)
node app.js
# ควรเห็น: "Server Started Successfully!"
# กด Ctrl+C เพื่อหยุด
```

---

## 🔄 Restart Methods

### 1. Passenger Restart (แนะนำ)
```bash
touch tmp/restart.txt
```

### 2. ผ่าน Plesk UI
- ไปที่ Node.js section
- คลิก "Restart App"

### 3. Restart Passenger Instance
```bash
sudo passenger-config restart-app /var/www/vhosts/yourdomain.com/httpdocs
```

---

## ✅ Checklist สำหรับ Passenger

- [ ] Node.js version >= 18.x
- [ ] `npm install` เสร็จแล้ว
- [ ] `npm run build` เสร็จแล้ว
- [ ] ไฟล์ `.env` มีและถูกต้อง
- [ ] ไฟล์ `credentials.json` มี (ถ้าใช้ Google Sheets)
- [ ] Directory `.next` มีอยู่
- [ ] Plesk Node.js enabled
- [ ] Application Startup File = `app.js`
- [ ] Permissions ถูกต้อง (755 for directories, 644 for files)
- [ ] `.env` และ `credentials.json` มี permission 600

---

## 🆘 Quick Fix Commands

```bash
# หยุดทุกอย่าง
sudo passenger-config restart-app /var/www/vhosts/yourdomain.com/httpdocs

# ติดตั้งและ build ใหม่ทั้งหมด
cd /var/www/vhosts/yourdomain.com/httpdocs
rm -rf node_modules .next
npm install
npm run build

# ตั้งค่า permissions
chown -R username:psacln .
chmod -R 755 .
chmod 600 .env credentials.json

# Restart
touch tmp/restart.txt

# ดู logs
tail -f /var/www/vhosts/yourdomain.com/logs/error_log
```

---

## 📞 Still Having Issues?

1. รัน `bash diagnose-passenger.sh` และดู output
2. ดู error logs ใน `/var/www/vhosts/domain/logs/error_log`
3. ทดสอบรันด้วยตนเอง: `node app.js`
4. ตรวจสอบว่า `.next` directory มีไฟล์ครบ
5. ตรวจสอบว่า `package.json` มี `"main": "app.js"`

---

**Updated**: 2025-11-18  
**Passenger Compatible**: ✅ YES
