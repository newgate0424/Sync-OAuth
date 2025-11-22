# 🚀 Quick Start Guide

## วิธีใช้งานง่ายๆ (สำหรับ Development)

### ขั้นตอนที่ 1: ติดตั้ง

```bash
npm install
```

ระบบจะสร้างไฟล์ `.env` อัตโนมัติให้

### ขั้นตอนที่ 2: Build

```bash
npm run build
```

### ขั้นตอนที่ 3: รัน

```bash
# Development mode
npm run dev

# Production mode
npm start
```

### ขั้นตอนที่ 4: เข้าใช้งาน

เปิดเบราว์เซอร์: **http://localhost:3000**

**Login**: 
- Username: `admin`
- Password: `admin123`

---

## ⚙️ Configuration (Optional)

### ถ้าต้องการใช้ฐานข้อมูลจริง

แก้ไขไฟล์ `.env`:

```env
# MongoDB (สำหรับ user management)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/sheets_sync
DATABASE_USER_URL=mongodb+srv://user:pass@cluster.mongodb.net/sheets_sync

# MySQL/PostgreSQL (สำหรับเก็บข้อมูล sync)
DATABASE_URL=mysql://user:password@localhost:3306/sheets_sync
```

### ถ้าต้องการ Google Sheets Sync

1. Download `credentials.json` จาก [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. วางไฟล์ไว้ที่ root ของโปรเจค
3. Restart application

---

## 📂 โครงสร้างโปรเจค

```
├── app/              # Next.js pages และ API routes
├── lib/              # Database และ utilities
├── components/       # React components
├── .env              # Environment variables (auto-created)
├── credentials.json  # Google API credentials (optional)
└── app.js           # Production server
```

---

## 🔧 Commands

```bash
# Development
npm run dev          # รันในโหมด development
npm run build        # Build สำหรับ production
npm start            # รันในโหมด production

# PM2 (Production)
npm run pm2:start    # Start with PM2
npm run pm2:stop     # Stop PM2
npm run pm2:restart  # Restart PM2
npm run pm2:logs     # View logs

# Health Check
npm run test:health  # ตรวจสอบว่าแอพรันอยู่
```

---

## ⚠️ Troubleshooting

### Application ไม่รัน

```bash
# ตรวจสอบ port
netstat -ano | findstr :3000

# Kill process
taskkill /PID <PID> /F

# ลอง port อื่น
$env:PORT=3001; npm start
```

### ไม่มี credentials.json

แอพจะรันได้ แต่ Google Sheets sync จะใช้ไม่ได้
Upload credentials.json แล้ว restart

### Database connection error

แอพจะรันในโหมด in-memory (ข้อมูลไม่ persist)
ตั้งค่า MONGODB_URI และ DATABASE_URL ใน `.env`

---

## 🚀 Deploy to Production

ดูคู่มือโดยละเอียดใน:
- **PLESK_DEPLOYMENT.md** - สำหรับ Plesk Obsidian
- **PRODUCTION_DEPLOY.md** - สำหรับ production server ทั่วไป

---

## 📞 Support

หากพบปัญหา:
1. ตรวจสอบว่า Node.js >= 18.x
2. ลบ `node_modules` และ `.next` แล้ว install ใหม่
3. ตรวจสอบ logs ใน console
4. ดูไฟล์ `logs/*.log`

---

**Ready to use!** ✅  
ติดตั้งแล้วใช้ได้เลย ไม่ต้องตั้งค่าอะไรเพิ่ม
