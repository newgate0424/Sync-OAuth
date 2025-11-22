# 🚀 Plesk Obsidian Deployment Guide

## 📋 สารบัญ

1. [ข้อกำหนดระบบ](#ข้อกำหนดระบบ)
2. [การติดตั้งบน Plesk](#การติดตั้งบน-plesk)
3. [การตั้งค่า Environment Variables](#การตั้งค่า-environment-variables)
4. [การ Deploy](#การ-deploy)
5. [การตรวจสอบและแก้ไขปัญหา](#การตรวจสอบและแก้ไขปัญหา)

---

## ข้อกำหนดระบบ

### เซิร์ฟเวอร์ต้องมี:
- ✅ Plesk Obsidian (18.x ขึ้นไป)
- ✅ Node.js 18.x หรือสูงกว่า
- ✅ MySQL 5.7+ หรือ PostgreSQL 12+ หรือ MongoDB
- ✅ Git (สำหรับ auto-deployment)
- ✅ SSL Certificate (แนะนำ Let's Encrypt)

### ข้อมูลที่ต้องเตรียม:
- 🔑 MongoDB Atlas connection string
- 🔑 MySQL/PostgreSQL database credentials
- 🔑 Google Cloud Service Account credentials (credentials.json)
- 🔑 Domain name

---

## การติดตั้งบน Plesk

### Step 1: สร้าง Subscription/Domain

1. ใน Plesk, ไปที่ **Websites & Domains**
2. คลิก **Add Domain** หรือใช้ domain ที่มีอยู่
3. ตั้งค่า domain ของคุณ (เช่น `yourdomain.com`)

### Step 2: เปิดใช้งาน Node.js

1. ไปที่ **Websites & Domains** > เลือก domain
2. คลิก **Node.js**
3. เปิดใช้งาน Node.js
4. ตั้งค่า:
   - **Node.js version**: 18.x หรือสูงกว่า
   - **Application mode**: Production
   - **Application root**: `/` (หรือ subdirectory ที่ต้องการ)
   - **Application startup file**: `app.js`
   - **Custom environment variables**: (เพิ่มตามขั้นตอนถัดไป)

### Step 3: Upload โปรเจค

#### วิธีที่ 1: ใช้ Git (แนะนำ)

1. ใน Plesk, ไปที่ **Git**
2. คลิก **Add Repository**
3. กรอกข้อมูล:
   - **Repository URL**: `https://github.com/newgate0424/sheets_sync.git`
   - **Repository path**: `/httpdocs` (หรือตามที่ต้องการ)
   - **Branch**: `master`
4. เปิดใช้งาน **Enable automatic deployment**
5. ตั้งค่า **Deployment script**: `.plesk-deploy.sh`

#### วิธีที่ 2: Upload ไฟล์ด้วย File Manager

1. ไปที่ **Files** > **File Manager**
2. อัพโหลดไฟล์ทั้งหมดจากโปรเจค
3. ตรวจสอบว่าโครงสร้างไฟล์ถูกต้อง

### Step 4: ตั้งค่าฐานข้อมูล MySQL

1. ใน Plesk, ไปที่ **Databases**
2. คลิก **Add Database**
3. สร้างฐานข้อมูล:
   - **Database name**: `sheets_sync`
   - **User**: สร้าง user ใหม่หรือใช้ของเดิม
   - **Password**: ตั้ง password ที่แข็งแรง
4. บันทึก **hostname**, **username**, **password**, **database name**

---

## การตั้งค่า Environment Variables

### วิธีที่ 1: ใช้ Plesk UI (แนะนำ)

1. ไปที่ **Node.js** settings
2. ในส่วน **Custom environment variables** เพิ่ม:

```
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/sheets_sync?retryWrites=true&w=majority&tlsAllowInvalidCertificates=true
DATABASE_USER_URL=mongodb+srv://username:password@cluster.mongodb.net/sheets_sync?retryWrites=true&w=majority&tlsAllowInvalidCertificates=true
DATABASE_URL=mysql://dbuser:dbpassword@localhost:3306/sheets_sync
DB_HOST=localhost
DB_PORT=3306
DB_USER=dbuser
DB_PASSWORD=dbpassword
DB_NAME=sheets_sync
CRON_SYNC_TOKEN=your_random_secure_token_min_32_characters
NEXT_PUBLIC_CRON_TOKEN=your_public_token_min_16_characters
ADMIN_PASSWORD=your_strong_admin_password
```

### วิธีที่ 2: ใช้ไฟล์ .env

1. เชื่อมต่อผ่าน SSH หรือ File Manager
2. ไปที่ directory โปรเจค
3. แก้ไขไฟล์ `.env`:

```bash
cd /var/www/vhosts/yourdomain.com/httpdocs
nano .env
```

4. กรอกข้อมูลตามไฟล์ `.env` ที่สร้างไว้
5. ตั้งค่า permissions:

```bash
chmod 600 .env
chown username:psacln .env
```

### Upload credentials.json

1. Download Service Account key จาก [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Upload ไฟล์ `credentials.json` ไปที่ root directory ของโปรเจค
3. ตั้งค่า permissions:

```bash
chmod 600 credentials.json
chown username:psacln credentials.json
```

---

## การ Deploy

### Auto Deployment (Git)

ถ้าใช้ Git deployment, ทุกครั้งที่ push code ใหม่:

```bash
git push origin master
```

Plesk จะรัน `.plesk-deploy.sh` อัตโนมัติ:
- ✅ ติดตั้ง dependencies
- ✅ Build application
- ✅ Restart Node.js

### Manual Deployment

ถ้า deploy manually, เชื่อมต่อผ่าน SSH:

```bash
# SSH to server
ssh user@yourdomain.com

# Go to project directory
cd /var/www/vhosts/yourdomain.com/httpdocs

# Run setup script
bash plesk-setup.sh

# หรือทำทีละขั้นตอน:
npm ci --production=false
npm run build
```

จากนั้นใน Plesk:
1. ไปที่ **Node.js**
2. คลิก **Restart App**

---

## การตรวจสอบและแก้ไขปัญหา

### ตรวจสอบสถานะ

1. ใน Plesk, ไปที่ **Node.js**
2. ดู **Application Status** ควรเป็น **Running**
3. คลิก **Open Application** เพื่อเปิดเว็บไซต์

### ดู Logs

#### ผ่าน Plesk UI:
1. ไปที่ **Node.js**
2. คลิก **Show Log**

#### ผ่าน SSH:
```bash
# Application logs
cd /var/www/vhosts/yourdomain.com/httpdocs
tail -f logs/*.log

# Plesk Node.js logs
tail -f /var/www/vhosts/yourdomain.com/logs/proxy_error_log
tail -f /var/www/vhosts/yourdomain.com/logs/error_log
```

### ปัญหาที่พบบ่อย

#### 1. Application ไม่ Start

**อาการ**: Status แสดง "Stopped" หรือ "Failed"

**แก้ไข**:
```bash
# ตรวจสอบ syntax error
cd /var/www/vhosts/yourdomain.com/httpdocs
node app.js

# ตรวจสอบ dependencies
npm install

# ตรวจสอบ .env
cat .env

# Rebuild
npm run build
```

#### 2. MongoDB Connection Error

**อาการ**: `MongoServerSelectionError`

**แก้ไข**:
- ✅ ตรวจสอบ `MONGODB_URI` ใน environment variables
- ✅ เพิ่ม server IP ใน MongoDB Atlas Network Access
- ✅ เพิ่ม `&tlsAllowInvalidCertificates=true` ใน connection string

#### 3. MySQL/PostgreSQL Connection Error

**อาการ**: `ECONNREFUSED` หรือ `Access denied`

**แก้ไข**:
```bash
# ทดสอบ MySQL connection
mysql -h localhost -u dbuser -p

# ตรวจสอบว่า MySQL รัน
systemctl status mysql

# ตรวจสอบ credentials
cat .env | grep DATABASE
```

#### 4. Port Already in Use

**อาการ**: `EADDRINUSE: address already in use :::3000`

**แก้ไข**:
```bash
# หา process ที่ใช้ port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# หรือเปลี่ยน port ใน environment variables
export PORT=3001
```

#### 5. credentials.json Not Found

**อาการ**: `ENOENT: no such file or directory, open 'credentials.json'`

**แก้ไข**:
```bash
# ตรวจสอบว่าไฟล์อยู่
ls -la credentials.json

# ถ้าไม่มี ให้ upload จาก Google Cloud Console
# แล้วตั้งค่า permissions
chmod 600 credentials.json
```

#### 6. Permission Denied

**อาการ**: `EACCES: permission denied`

**แก้ไข**:
```bash
# ตั้งค่า ownership
chown -R username:psacln /var/www/vhosts/yourdomain.com/httpdocs

# ตั้งค่า permissions
chmod -R 755 /var/www/vhosts/yourdomain.com/httpdocs
chmod 600 .env credentials.json
```

### Health Check

เข้าถึง health check endpoint:
```
https://yourdomain.com/api/health
```

ควรได้ response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-18T..."
}
```

---

## 🔒 Security Checklist

- [ ] ตั้งค่า SSL Certificate (Let's Encrypt)
- [ ] ไฟล์ `.env` มี permission 600
- [ ] ไฟล์ `credentials.json` มี permission 600
- [ ] เปลี่ยน `ADMIN_PASSWORD` เป็น password ที่แข็งแรง
- [ ] สร้าง `CRON_SYNC_TOKEN` ที่ random และยาว
- [ ] เปิด Firewall เฉพาะ port ที่จำเป็น
- [ ] เพิ่ม MongoDB Atlas Network Access whitelist
- [ ] ตั้งค่า regular backup

---

## 📞 Support

หากพบปัญหา:

1. ตรวจสอบ logs ตามขั้นตอนข้างต้น
2. รัน `bash check-production.sh` เพื่อ health check
3. ดู error messages ใน Plesk logs
4. ตรวจสอบว่า environment variables ครบถ้วน

---

## 📚 เอกสารเพิ่มเติม

- [Plesk Node.js Documentation](https://docs.plesk.com/en-US/obsidian/administrator-guide/website-management/nodejs.77980/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [MongoDB Atlas Setup](https://docs.atlas.mongodb.com/getting-started/)

---

**สร้างเมื่อ**: 2025-11-18  
**เวอร์ชัน**: 1.0  
**สถานะ**: Production Ready ✅
