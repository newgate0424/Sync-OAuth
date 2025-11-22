# Next.js Google Sheets Sync Manager

เว็บไซต์จัดการซิงค์ข้อมูลจาก Google Sheets ไปยังฐานข้อมูล (MySQL/PostgreSQL) พร้อมระบบ Cron Jobs อัตโนมัติ

## 🚀 Quick Start

```bash
# 1. ติดตั้ง
npm install

# 2. Build
npm run build

# 3. รัน (Production)
npm start

# หรือ Dev mode
npm run dev
```

**Default Login:**
- URL: `http://localhost:3000`
- Username: `admin`
- Password: `admin123`

---

## ✨ ฟีเจอร์หลัก

### Core Features
- ✅ **Google Sheets Sync** - ซิงค์ข้อมูลอัตโนมัติ
- ✅ **Smart Checksum** - ประหยัด API quota 80-95%
- ✅ **Cron Scheduler** - กำหนดเวลา sync อัตโนมัติ
- ✅ **Multi-Database** - รองรับ MySQL และ PostgreSQL
- ✅ **Folder Management** - จัดกลุ่มตาราง
- ✅ **Real-time Monitoring** - ติดตามสถานะแบบเรียลไทม์
- ✅ **User Authentication** - ระบบ login/logout
- ✅ **Auto Migration** - อัปเดต schema อัตโนมัติ

### Optimization Features
- 🚀 **API Quota Saving** - ลด Google API calls 80-95%
- 🚀 **Checksum Validation** - ตรวจสอบก่อน sync
- 🚀 **Smart Skip** - ข้ามถ้าข้อมูลไม่เปลี่ยน
- 🚀 **Batch Processing** - ประมวลผล 50,000 แถว/ครั้ง
- 🚀 **Connection Pooling** - จัดการ connection อัตโนมัติ

### Production Ready
- ✅ **Plesk Passenger** - รองรับ Plesk Obsidian
- ✅ **Timeout Protection** - ป้องกัน job ค้าง (10 นาที)
- ✅ **Auto-clear Stuck Jobs** - ล้าง job ค้างอัตโนมัติ (>15 นาที)
- ✅ **Comprehensive Logging** - บันทึก log ครบถ้วน
- ✅ **Error Tracking** - ติดตาม error แบบละเอียด

---

## 📦 การติดตั้ง

### 1. Clone และ Install
```bash
git clone https://github.com/newgate0424/sheets_sync.git
cd sheets_sync
npm install
```

### 2. ตั้งค่า Environment Variables

แก้ไขไฟล์ `.env`:

```env
# MongoDB (User Management & Cron Jobs)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/sheets_sync
DATABASE_USER_URL=mongodb+srv://user:pass@cluster.mongodb.net/sheets_sync

# MySQL/PostgreSQL (Data Storage)
DATABASE_URL=mysql://user:password@host:3306/database
# หรือ
DATABASE_URL=postgresql://user:password@host:5432/database

# App URL (สำหรับ production)
APP_URL=https://your-domain.com
```

### 3. Google Sheets API Setup

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/)
2. สร้าง project และเปิด Google Sheets API
3. สร้าง Service Account
4. Download `credentials.json`
5. วางไฟล์ที่ root ของโปรเจค

### 4. Build และรัน

```bash
# Build
npm run build

# Production
npm start

# Development
npm run dev
```

---

## 🚀 Deploy to Production

### Plesk Obsidian
ดูคู่มือใน **[PLESK_DEPLOYMENT.md](PLESK_DEPLOYMENT.md)**

### Production Server  
ดูคู่มือใน **[PRODUCTION_DEPLOY.md](PRODUCTION_DEPLOY.md)**

---

## 📁 โครงสร้างโปรเจค

```
├── app/
│   ├── layout.tsx              # Main layout
│   ├── page.tsx                # Home page (redirect to /database)
│   ├── api/                    # API Routes
│   │   ├── auth/              # Authentication (login/logout/session)
│   │   ├── sync-table/        # Google Sheets sync
│   │   ├── sync-logs/         # Sync logs
│   │   ├── cron-jobs/         # Cron management
│   │   ├── dashboard/         # Dashboard stats
│   │   ├── datasets/          # Database datasets
│   │   ├── folders/           # Folder management
│   │   ├── query/             # SQL query execution
│   │   └── users/             # User management
│   ├── database/              # Database explorer page
│   ├── cron/                  # Cron jobs page
│   ├── log/                   # Sync logs page
│   ├── dashboard/             # Dashboard page
│   ├── users/                 # User management page
│   └── settings/              # Settings page
├── lib/
│   ├── dbAdapter.ts           # Multi-DB adapter (MySQL/PostgreSQL)
│   ├── syncService.ts         # Core sync service (with checksum)
│   ├── mongoDb.ts             # MongoDB connection
│   ├── googleSheets.ts        # Google Sheets API client
│   ├── cronScheduler.ts       # Cron scheduler (direct calls)
│   ├── initCron.ts            # Initialize cron on startup
│   └── autoMigration.ts       # Auto database migration
├── components/
│   ├── Header.tsx             # Top navigation bar
│   └── Sidebar.tsx            # Side navigation menu
├── scripts/                   # Admin utility scripts
│   ├── create-admin.js        # สร้าง admin user
│   ├── create-mongodb-admin.js # สร้าง MongoDB admin
│   ├── setup-mongodb.js       # Setup MongoDB collections
│   └── create-indexes.js      # สร้าง database indexes
├── docs/                      # Documentation
│   ├── API_QUOTA_OPTIMIZATION.md
│   └── SYSTEM_TEST_REPORT.md
├── .env                       # Environment variables
├── .env.example               # Example environment config
├── credentials.json           # Google API credentials
├── app.js                     # Custom server (Passenger-compatible)
├── middleware.ts              # Next.js middleware (auth)
├── .plesk-deploy.sh           # Plesk auto-deploy script
└── passenger.js               # Passenger startup file
```

---

## 🔧 Available Scripts

```bash
# Development
npm run dev          # Start development server (localhost:3000)
npm run build        # Build for production
npm run lint         # Run ESLint

# Production
npm start            # Start production server

# Database
node scripts/create-admin.js              # สร้าง admin user ใน MongoDB
node scripts/create-mongodb-admin.js      # สร้าง MongoDB admin
node scripts/setup-mongodb.js             # Setup MongoDB collections
node scripts/create-indexes.js            # สร้าง database indexes
```

---

## ⚙️ Environment Variables

สร้างไฟล์ `.env` หรือใช้ `.env.example` เป็นแม่แบบ:

```env
# MongoDB (User Management & Cron Jobs)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/sheets_sync
DATABASE_USER_URL=mongodb+srv://user:pass@cluster.mongodb.net/sheets_sync

# MySQL/PostgreSQL (Data Storage)
DATABASE_URL=mysql://user:password@host:3306/database
# หรือ
# DATABASE_URL=postgresql://user:password@host:5432/database

# App Configuration
APP_URL=https://your-domain.com
NODE_ENV=production
PORT=3000

# Security (ปล่อยว่างไว้ได้ ระบบจะสร้างให้)
CRON_SYNC_TOKEN=
NEXT_PUBLIC_CRON_TOKEN=
ADMIN_PASSWORD=
```

**หมายเหตุ:** ไม่ต้องกรอก `CRON_SYNC_TOKEN`, `NEXT_PUBLIC_CRON_TOKEN`, และ `ADMIN_PASSWORD` ระบบจะสร้างอัตโนมัติ

---

## 📚 Documentation

### Quick Start
- **[QUICK_START.md](QUICK_START.md)** - เริ่มต้นใช้งานอย่างรวดเร็ว

### Deployment
- **[PLESK_DEPLOYMENT.md](PLESK_DEPLOYMENT.md)** - Deploy บน Plesk Obsidian
- **[PRODUCTION_DEPLOY.md](PRODUCTION_DEPLOY.md)** - Deploy บน Production Server
- **[PASSENGER_TROUBLESHOOT.md](PASSENGER_TROUBLESHOOT.md)** - แก้ปัญหา Passenger

### System Status
- **[SYSTEM_STATUS.md](SYSTEM_STATUS.md)** - สถานะระบบและ optimization

### Technical Docs
- **[docs/API_QUOTA_OPTIMIZATION.md](docs/API_QUOTA_OPTIMIZATION.md)** - การประหยัด API Quota
- **[docs/SYSTEM_TEST_REPORT.md](docs/SYSTEM_TEST_REPORT.md)** - รายงานการทดสอบ

---

## ⚠️ Troubleshooting

### แอพไม่รัน

```bash
# ตรวจสอบ Node.js version (ต้อง >= 18.x)
node --version

# ลบและติดตั้งใหม่
rm -rf node_modules .next
npm install
npm run build
```

### credentials.json not found

แอพจะรันได้ แต่ Google Sheets sync ใช้ไม่ได้  
Download จาก Google Cloud Console แล้ววางที่ root

### Database connection error

แอพจะรันในโหมด in-memory (ข้อมูลไม่ persist)  
ตั้งค่า DATABASE_URL ใน `.env`

---

## 🔒 Security Best Practices

- ✅ เปลี่ยน `ADMIN_PASSWORD` ใน production
- ✅ ใช้ strong tokens สำหรับ `CRON_SYNC_TOKEN`
- ✅ ตั้งค่า file permissions: `chmod 600 .env credentials.json`
- ✅ Enable HTTPS สำหรับ production
- ✅ อัปเดต dependencies เป็นประจำ: `npm update`
- ✅ Backup database เป็นประจำ

---

## 🎯 System Performance

### API Quota Optimization
- **Smart Checksum**: ประหยัด Google Sheets API calls **80-95%**
- **Sample-based Detection**: ตรวจสอบ 3 แถว แทนการดึงทั้งหมด
- **Smart Skip**: ข้าม sync ถ้าข้อมูลไม่เปลี่ยนแปลง

### Sync Performance
- **Batch Processing**: ประมวลผล 50,000 แถว/ครั้ง
- **Connection Pooling**: จัดการ connections อย่างมีประสิทธิภาพ
- **Transaction Safety**: COMMIT/ROLLBACK อัตโนมัติ
- **Timeout Protection**: ป้องกัน job ค้าง (10 นาที)

### Monitoring
- **Real-time Logs**: Auto-refresh ทุก 2 วินาที
- **Dashboard Stats**: Auto-refresh ทุก 5 วินาที
- **Database View**: Auto-refresh ทุก 10 วินาที

---

## 📊 Tech Stack

- **Framework**: Next.js 14.2.33
- **UI**: TailwindCSS + Lucide Icons
- **Database**: MySQL/PostgreSQL (data), MongoDB (users/cron)
- **Authentication**: Custom JWT-based
- **Cron**: Node-cron
- **Google API**: googleapis
- **Server**: Phusion Passenger (production)

---

## 📞 Support & Contributing

- **Issues**: [GitHub Issues](https://github.com/newgate0424/sheets_sync/issues)
- **Pull Requests**: Welcome!
- **Documentation**: อ่านไฟล์ `.md` ในโปรเจค

---

## 📝 License

MIT License - ใช้งานได้อย่างอิสระ

---

**Made with ❤️ for efficient Google Sheets synchronization**

## 📄 License

Private Project

---

**Version**: 2.0  
**Last Updated**: 2025-11-18  
**Status**: Production Ready ✅

**Quick Start**: `npm install && npm run build && npm start` 🚀
│   │   └── page.tsx        # Logs page
│   └── api/
│       ├── datasets/       # API to fetch databases
│       ├── query/          # API to execute SQL queries
│       └── logs/           # API to fetch logs
├── components/
│   ├── Header.tsx          # Header component
│   └── Sidebar.tsx         # Sidebar component
└── lib/
    └── db.ts               # PostgreSQL connection
```

## Stack

- **Next.js 14** - React Framework
- **TypeScript** - Type Safety
- **Tailwind CSS** - Styling
- **pg** - PostgreSQL Client
- **Lucide React** - Icons

## หน้าต่างๆ

### 1. หน้าแรก (/)
- แสดงภาพรวมของระบบ
- ลิงก์ไปหน้า Database และ Logs

### 2. Database Explorer (/database)
- แสดง datasets และ tables ในรูปแบบ tree
- Query Editor สำหรับรัน SQL
- แสดงผลลัพธ์ในรูปแบบตาราง

### 3. Logs (/log)
- แสดงประวัติกิจกรรมของระบบ
- กรองตาม level (info, warning, error, success)
- ค้นหา logs

## หมายเหตุ

- ตรวจสอบให้แน่ใจว่า PostgreSQL server กำลังทำงาน
- แก้ไข DATABASE_URL ใน `.env.local` ให้ถูกต้อง
- Layout ปรับขนาดอัตโนมัติตามขนาดหน้าจอ (responsive)
