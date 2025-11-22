import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getMongoDb } from '@/lib/mongoDb';
import { resetDbConnection } from '@/lib/dbAdapter';

// GET - ดึง connection string ปัจจุบันจาก MongoDB
export async function GET(request: NextRequest) {
  try {
    const db = await getMongoDb();
    const settings = await db.collection('settings').findOne({ key: 'database_connection' });
    
    let connectionString = settings?.value || process.env.DATABASE_URL || '';
    let dbType = settings?.dbType || (connectionString.startsWith('mysql://') ? 'mysql' : 'postgresql');
    
    // ซ่อนรหัสผ่าน
    const maskedConnection = connectionString.replace(/:([^:@]+)@/, ':****@');
    
    return NextResponse.json({ 
      connectionString: maskedConnection,
      original: connectionString,
      dbType: dbType
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - อัพเดท connection string (บันทึกลง MongoDB)
export async function PUT(request: NextRequest) {
  try {
    const { connectionString, dbType: providedDbType } = await request.json();
    
    if (!connectionString) {
      return NextResponse.json({ error: 'Connection string is required' }, { status: 400 });
    }

    // ตรวจจับ dbType จาก connection string ถ้าไม่ได้ส่งมา
    const dbType = providedDbType || (connectionString.startsWith('mysql://') ? 'mysql' : 'postgresql');

    // ตรวจสอบว่า connection string ถูกต้อง
    const isValid = dbType === 'mysql' 
      ? connectionString.startsWith('mysql://')
      : connectionString.startsWith('postgresql://') || connectionString.startsWith('postgres://');
    
    if (!isValid) {
      return NextResponse.json({ 
        error: `Invalid ${dbType === 'mysql' ? 'MySQL' : 'PostgreSQL'} connection string` 
      }, { status: 400 });
    }

    // บันทึกลง MongoDB
    const db = await getMongoDb();
    await db.collection('settings').updateOne(
      { key: 'database_connection' },
      { 
        $set: { 
          value: connectionString,
          dbType: dbType,
          updated_at: new Date()
        } 
      },
      { upsert: true }
    );

    // Reset database connection to use new connection string
    try {
      await resetDbConnection();
      console.log('Database connection reset successfully');
    } catch (resetError) {
      console.error('Error resetting database connection:', resetError);
    }

    // เรียก auto-migrate เพื่อสร้างตารางที่จำเป็น
    try {
      const migrateResponse = await fetch(`${request.nextUrl.origin}/api/settings/database/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString, dbType })
      });

      const migrateData = await migrateResponse.json();
      
      return NextResponse.json({ 
        success: true, 
        message: 'Database connection updated successfully',
        migration: migrateData,
        needsReload: true
      });
    } catch (migrateError) {
      // ถ้า migrate ล้มเหลว ยังคงบันทึก connection string
      console.error('Migration error:', migrateError);
      return NextResponse.json({ 
        success: true, 
        message: 'Database connection updated but migration failed. Please run migration manually.',
        warning: 'Migration incomplete',
        needsReload: true
      });
    }
  } catch (error: any) {
    console.error('Error updating database settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
