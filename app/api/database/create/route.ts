import { NextRequest, NextResponse } from 'next/server';
import { ensureDbInitialized } from '@/lib/dbAdapter';
import { getMongoDb } from '@/lib/mongoDb';

export async function POST(request: NextRequest) {
  try {
    const { databaseName } = await request.json();
    
    if (!databaseName) {
      return NextResponse.json({ error: 'Database name is required' }, { status: 400 });
    }

    // ตรวจสอบชื่อให้ถูกต้องตามกฎของ database
    const validName = /^[a-zA-Z0-9_]+$/;
    if (!validName.test(databaseName)) {
      return NextResponse.json({ 
        error: 'Database name can only contain letters, numbers, and underscores' 
      }, { status: 400 });
    }

    const db = await ensureDbInitialized();
    
    // อ่านค่า dbType จาก MongoDB settings
    const mongoDb = await getMongoDb();
    const settings = await mongoDb.collection('settings').findOne({ key: 'database_connection' });
    const dbType = settings?.dbType || 'mysql'; // default เป็น mysql ถ้าไม่มีค่า

    if (dbType === 'postgresql') {
      // PostgreSQL
      // ตรวจสอบว่า database มีอยู่แล้วหรือไม่
      const checkQuery = `SELECT datname FROM pg_database WHERE datname = $1`;
      const checkResult = await db.query(checkQuery, [databaseName]);
      
      if (checkResult.rows && checkResult.rows.length > 0) {
        return NextResponse.json({ 
          error: 'Database already exists' 
        }, { status: 400 });
      }

      // สร้าง database ใหม่ (CREATE DATABASE ไม่สามารถใช้ parameterized query ได้)
      const createQuery = `CREATE DATABASE "${databaseName}"`;
      await db.query(createQuery, []);
    } else {
      // MySQL
      // ตรวจสอบว่า database มีอยู่แล้วหรือไม่
      const checkQuery = `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`;
      const checkResult = await db.query(checkQuery, [databaseName]);
      
      if (checkResult.rows && checkResult.rows.length > 0) {
        return NextResponse.json({ 
          error: 'Database already exists' 
        }, { status: 400 });
      }

      // สร้าง database ใหม่
      const createQuery = `CREATE DATABASE \`${databaseName}\``;
      await db.query(createQuery, []);
    }

    return NextResponse.json({ 
      success: true, 
      message: `Database ${databaseName} created successfully`,
      databaseName 
    });
  } catch (error: any) {
    console.error('Error creating database:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to create database' 
    }, { status: 500 });
  }
}
