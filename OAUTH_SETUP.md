# 🔐 OAuth 2.0 Setup Guide

## Step 1: สร้าง OAuth 2.0 Credentials ใน Google Cloud Console

1. ไปที่ [Google Cloud Console](https://console.cloud.google.com/)
2. เลือก Project ของคุณ
3. ไปที่ **APIs & Services** → **Credentials**
4. คลิก **+ CREATE CREDENTIALS** → **OAuth client ID**
5. เลือก Application type: **Web application**
6. ตั้งชื่อ: `Sheets Sync OAuth Client`

### Authorized redirect URIs:
เพิ่ม URLs เหล่านี้:
```
http://localhost:3000/api/auth/google/callback
https://yourdomain.com/api/auth/google/callback
https://ads169th.com/api/auth/google/callback
```

7. คลิก **CREATE**
8. คัดลอก **Client ID** และ **Client Secret**

## Step 2: เพิ่มใน .env.local

```env
# Google OAuth 2.0
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Production
# GOOGLE_REDIRECT_URI=https://ads169th.com/api/auth/google/callback
```

## Step 3: Enable Google Sheets API

1. ไปที่ **APIs & Services** → **Library**
2. ค้นหา "Google Sheets API"
3. คลิก **ENABLE**

## Step 4: Configure OAuth consent screen

1. ไปที่ **APIs & Services** → **OAuth consent screen**
2. เลือก **External** (ถ้าต้องการให้คนทั่วไปใช้) หรือ **Internal** (ถ้าใช้แค่ใน organization)
3. กรอกข้อมูล:
   - App name: `Sheets Sync`
   - User support email: your-email@gmail.com
   - Developer contact: your-email@gmail.com
4. คลิก **SAVE AND CONTINUE**
5. ใน Scopes: เพิ่ม
   - `https://www.googleapis.com/auth/spreadsheets.readonly`
   - `https://www.googleapis.com/auth/drive.readonly`
6. คลิก **SAVE AND CONTINUE**

## ✅ เสร็จแล้ว!

หลังจากตั้งค่าเสร็จ restart Next.js server:
```bash
npm run dev
```
