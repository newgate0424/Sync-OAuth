# ads169th System - PostgreSQL Data Management

ระบบจัดการฐานข้อมูล PostgreSQL พร้อมการ sync ข้อมูลจาก Google Sheets

## 🌟 ฟีเจอร์หลัก

- 🔄 **Sync ข้อมูลอัตโนมัติ** จาก Google Sheets
- 📊 **จัดการตาราง** และโฟลเดอร์
- 🔍 **ค้นหาและแสดงข้อมูล** แบบ realtime
- 👥 **จัดการผู้ใช้** และสิทธิ์การเข้าถึง
- 🔐 **ระบบ Authentication** และ Authorization
- ⚙️ **เปลี่ยน/ย้ายฐานข้อมูล** PostgreSQL ได้ง่าย (ผ่านหน้าเว็บ)
- 📈 **สถิติ realtime** - แถวและขนาดไฟล์
- 🔔 **Cron API** สำหรับ sync อัตโนมัติ

## 📋 ความต้องการระบบ

- Node.js 18+ 
- PostgreSQL 15+
- Google Cloud Project (สำหรับ Sheets API)

## 🚀 การติดตั้ง

### 1. Clone และติดตั้ง Dependencies

```bash
git clone <repository-url>
cd Bigquery_v2
npm install
```

### 2. ตั้งค่า PostgreSQL

สร้างฐานข้อมูล PostgreSQL:

```sql
CREATE DATABASE ads_data;
```

### 3. ตั้งค่า Environment Variables

สร้างไฟล์ `.env`:

```env
# Database Configuration
DATABASE_URL="postgresql://postgres:YourPassword@localhost:5432/ads_data"

# Cron Job Token (สำหรับ automation)
CRON_SYNC_TOKEN=your-secret-token-here
NEXT_PUBLIC_CRON_TOKEN=your-secret-token-here
```

### 4. ตั้งค่า Google Sheets API

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/)
2. สร้าง Project ใหม่
3. เปิดใช้งาน Google Sheets API
4. สร้าง Service Account และดาวน์โหลด credentials
5. บันทึกไฟล์ credentials เป็น `credentials.json` ในโฟลเดอร์โปรเจค

### 5. Migrate ฐานข้อมูล

```bash
node scripts/migrate.js
```

### 6. สร้าง Admin User

```bash
node scripts/create-admin.js
```

Admin user ที่สร้าง:
- Username: `admin`
- Password: `admin123`

### 7. รันโปรแกรม

```bash
npm run dev
```

เปิดเบราว์เซอร์ที่ http://localhost:3000

## 📖 การใช้งาน

### เข้าสู่ระบบ

1. ไปที่ http://localhost:3000/login
2. ใช้ admin/admin123 เพื่อเข้าสู่ระบบ

### สร้างตารางจาก Google Sheets

1. คลิก "Add Sheet"
2. ใส่ URL ของ Google Sheets
3. เลือก Sheet ที่ต้องการ
4. กำหนดชื่อตาราง
5. กำหนด Schema (ชนิดข้อมูล)
6. คลิก "Create Table & Sync"

### Sync ข้อมูล

- **Manual Sync**: คลิกปุ่ม 🔄 ที่ตาราง
- **Auto Sync (Cron)**: ใช้ API endpoint

```bash
curl "http://localhost:3000/api/sync-cron?token=your-secret-token&dataset=ads_data&table=TABLE_NAME"
```

### จัดการผู้ใช้

1. คลิกไอคอน 👥 มุมขวาบน (admin เท่านั้น)
2. เพิ่ม/แก้ไข/ลบผู้ใช้

### เปลี่ยนฐานข้อมูล PostgreSQL

1. คลิกไอคอน ⚙️ ที่ Sidebar (admin เท่านั้น)
2. ใส่ Connection String ใหม่:
   ```
   postgresql://username:password@host:5432/database
   ```
3. คลิก "ทดสอบการเชื่อมต่อ"
4. ถ้าสำเร็จ คลิก "บันทึกการตั้งค่า"

**หมายเหตุ**: ฐานข้อมูลใหม่ต้องมีตารางระบบ (users, folders, sync_config, sync_logs) อยู่แล้ว

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/login` - เข้าสู่ระบบ
- `POST /api/auth/logout` - ออกจากระบบ
- `GET /api/auth/session` - ตรวจสอบ session

### Data Management
- `GET /api/datasets` - ดึงรายการตาราง
- `GET /api/folders` - ดึงรายการ folder
- `POST /api/sync-table` - สร้างตารางและ sync
- `PUT /api/sync-table` - Sync ข้อมูล
- `GET /api/sync-cron` - Sync ผ่าน cron

### Settings (Admin only)
- `GET /api/settings/database` - ดึง connection string
- `PUT /api/settings/database` - อัพเดท connection string
- `POST /api/settings/database/test` - ทดสอบการเชื่อมต่อ

## 📁 โครงสร้างโปรเจค

```
├── app/
│   ├── api/           # API Routes
│   ├── database/      # หน้าจัดการฐานข้อมูล
│   ├── login/         # หน้า Login
│   ├── users/         # หน้าจัดการผู้ใช้
│   └── settings/      # หน้าตั้งค่าฐานข้อมูล
├── components/
│   ├── Header.tsx     # Header พร้อมเมนู user
│   └── Sidebar.tsx    # Sidebar navigation
├── lib/
│   ├── db.ts          # PostgreSQL connection pool
│   └── googleSheets.ts # Google Sheets API client
└── scripts/
    ├── migrate.js     # สร้างตารางระบบ
    ├── create-admin.js # สร้าง admin user
    └── fix-schema.js  # แก้ไข schema
```

## 🔒 การรักษาความปลอดภัย

- ✅ Parameterized queries (ป้องกัน SQL injection)
- ✅ Cookie-based session management
- ✅ Role-based access control (Admin/User)
- ✅ Password hashing ด้วย bcrypt
- ✅ Middleware authentication

## 🐛 การแก้ไขปัญหา

### ไม่สามารถเชื่อมต่อฐานข้อมูล

```bash
# ตรวจสอบว่า PostgreSQL ทำงานอยู่
pg_isready

# ตรวจสอบ connection string ใน .env
cat .env
```

### ตารางไม่แสดง

```bash
# รัน migrate ใหม่
node scripts/migrate.js

# ตรวจสอบตารางใน PostgreSQL
psql -U postgres -d ads_data -c "\dt"
```

### Login ไม่ได้

```bash
# สร้าง admin user ใหม่
node scripts/create-admin.js
```

## 📝 License

MIT License

## 👨‍💻 สนับสนุน

หากมีปัญหาหรือต้องการความช่วยเหลือ กรุณาสร้าง Issue ใน GitHub
