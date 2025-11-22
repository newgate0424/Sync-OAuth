# 🚀 Production Deployment Guide

## 🔴 สาเหตุปัญหาที่เกิด

### 1. MongoDB Connection Error
```
MongoServerSelectionError: tlsv1 alert internal error
```
**ปัญหา**: MongoDB Atlas ใช้ TLS 1.2+ แต่ production server อาจใช้ Node.js เวอร์ชันเก่า หรือ OpenSSL ไม่รองรับ

### 2. PostgreSQL Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
DATABASE_URL not set, defaulting to postgresql
```
**ปัญหา**: ไม่มีไฟล์ `.env` บน production server

---

## ✅ วิธีแก้ไข (ทำตามลำดับ)

### Step 1: ตรวจสอบ Node.js Version บน Production Server

```bash
# SSH เข้า production server
ssh user@ads169th.com

# Check Node.js version (ต้องเป็น 18.x ขึ้นไป)
node --version

# ถ้าต่ำกว่า 18.x ให้ update
# Ubuntu/Debian:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL:
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

---

### Step 2: สร้างไฟล์ `.env` บน Production Server

```bash
# ไปยัง project directory
cd /var/www/vhosts/ads169th.com/httpdocs

# สร้างไฟล์ .env
nano .env
```

**วางข้อมูลนี้** (แก้ไขค่าให้ถูกต้อง):

```bash
# MongoDB Configuration
MONGODB_URI="mongodb+srv://sanewgate:newgate0424@cluster.jxyonoc.mongodb.net/sheets_sync?retryWrites=true&w=majority&tlsAllowInvalidCertificates=true"
DATABASE_USER_URL="mongodb+srv://sanewgate:newgate0424@cluster.jxyonoc.mongodb.net/sheets_sync?retryWrites=true&w=majority&tlsAllowInvalidCertificates=true"

# Database Configuration (MySQL)
DATABASE_URL="mysql://root:Z5N6CwbC*PYKJc9@localhost:3306/your_database_name"

# MySQL Specific
DB_HOST="localhost"
DB_PORT=3306
DB_USER="root"
DB_PASSWORD="Z5N6CwbC*PYKJc9"
DB_NAME="your_database_name"

# Cron Tokens
CRON_SYNC_TOKEN="sheets_sync_production_token_2024_secure_key_v1"
NEXT_PUBLIC_CRON_TOKEN="public_cron_token_2024"

# Admin Password
ADMIN_PASSWORD="admin123"
```

**บันทึกไฟล์**: `Ctrl+X` → `Y` → `Enter`

---

### Step 3: ตั้งค่า Permissions

```bash
# ตั้งค่าสิทธิ์ .env
chmod 600 .env
chown www-data:www-data .env

# ตรวจสอบว่ามีไฟล์
ls -la .env
```

---

### Step 4: Rebuild Application

```bash
# ลบ build เก่า
rm -rf .next

# Install dependencies
npm install --production

# Build ใหม่
npm run build
```

---

### Step 5: Restart Application

**ถ้าใช้ PM2:**
```bash
pm2 restart all
pm2 logs
```

**ถ้าใช้ systemd:**
```bash
sudo systemctl restart your-app-name
sudo systemctl status your-app-name
```

**ถ้าใช้ Apache/Nginx:**
```bash
sudo systemctl restart apache2  # หรือ nginx
```

---

## 🔍 ตรวจสอบว่าใช้งานได้

### 1. Test MongoDB Connection

```bash
node -e "
const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI || 'your-mongodb-uri';
MongoClient.connect(uri)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err.message));
"
```

### 2. Test MySQL Connection

```bash
mysql -u root -p -e "SELECT 1;"
```

### 3. Test Application

```bash
curl http://localhost:3000/api/health
```

---

## 🛠️ แก้ปัญหาเพิ่มเติม

### ถ้า MongoDB ยังเชื่อมต่อไม่ได้

#### วิธีที่ 1: ปรับ MongoDB URI
```bash
# เพิ่ม SSL options
MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/db?retryWrites=true&w=majority&tlsAllowInvalidCertificates=true&tlsInsecure=true"
```

#### วิธีที่ 2: เปลี่ยนเป็น MongoDB Standard Connection (ไม่ใช่ srv)
ไปที่ MongoDB Atlas → Connect → Choose "Connect your application" → เลือก "Standard connection string"

```bash
MONGODB_URI="mongodb://user:pass@shard-00-00.mongodb.net:27017,shard-00-01.mongodb.net:27017,shard-00-02.mongodb.net:27017/db?ssl=true&replicaSet=atlas-hjjwxd-shard-0&authSource=admin&retryWrites=true&w=majority"
```

#### วิธีที่ 3: Whitelist IP Address
1. ไปที่ MongoDB Atlas Dashboard
2. Network Access → Add IP Address
3. เพิ่ม IP ของ production server หรือใช้ `0.0.0.0/0` (อนุญาตทุก IP - ไม่แนะนำสำหรับ production)

---

### ถ้า Build ช้า หรือใช้ Memory เยอะ

```bash
# เพิ่ม memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

---

## 📋 Production Checklist

- [ ] Node.js >= 18.x
- [ ] ไฟล์ `.env` ถูกสร้างและมีค่าครบ
- [ ] MongoDB connection ใช้งานได้
- [ ] MySQL/PostgreSQL ทำงานปกติ
- [ ] `npm run build` สำเร็จ
- [ ] Application restart แล้ว
- [ ] Test endpoints: `/api/health`, `/api/dashboard/stats`
- [ ] MongoDB IP whitelist ถูกตั้งค่า
- [ ] SSL certificates ใช้งานได้ (ถ้ามี HTTPS)

---

## 📞 ติดปัญหา?

### ดู Logs

```bash
# PM2 logs
pm2 logs --lines 100

# systemd logs
journalctl -u your-app-name -f

# Next.js logs
tail -f /var/www/vhosts/ads169th.com/httpdocs/.next/server/logs/*.log
```

### ส่ง Error ให้ผม

```bash
# Export error logs
pm2 logs --lines 500 --nostream > error-logs.txt
```

---

## 🎯 คำแนะนำเพิ่มเติม

1. **ใช้ Environment Variables แทน Hardcode**
   - ✅ ดี: `process.env.MONGODB_URI`
   - ❌ ไม่ดี: `"mongodb+srv://user:pass@..."`

2. **Monitor Application**
   ```bash
   # ติดตั้ง PM2 monitor
   pm2 install pm2-logrotate
   pm2 set pm2-logrotate:max_size 10M
   ```

3. **Backup Database**
   ```bash
   # MySQL backup
   mysqldump -u root -p database_name > backup_$(date +%Y%m%d).sql
   
   # MongoDB backup
   mongodump --uri="mongodb+srv://..." --out=./backup
   ```

4. **Security**
   - ใช้ HTTPS (Let's Encrypt)
   - ตั้ง firewall (ufw, iptables)
   - อัพเดท packages: `npm audit fix`

---

## 📚 Related Files

- `.env.example` - ตัวอย่างการตั้งค่า environment variables
- `DEPLOY.md` - คู่มือ deployment ทั่วไป
- `README.md` - คู่มือใช้งานระบบ
