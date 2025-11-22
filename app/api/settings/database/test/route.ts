import { NextRequest, NextResponse } from 'next/server';
import { Pool as PgPool } from 'pg';
import mysql from 'mysql2/promise';

// POST - ทดสอบการเชื่อมต่อฐานข้อมูล
export async function POST(request: NextRequest) {
  try {
    const { connectionString, dbType } = await request.json();
    
    if (!connectionString) {
      return NextResponse.json({ error: 'Connection string is required' }, { status: 400 });
    }

    if (dbType === 'postgresql') {
      return await testPostgreSQL(connectionString);
    } else if (dbType === 'mysql') {
      return await testMySQL(connectionString);
    } else {
      return NextResponse.json({ error: 'Invalid database type' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function testPostgreSQL(connectionString: string) {
  const testPool = new PgPool({
    connectionString,
    ssl: false,
    connectionTimeoutMillis: 5000
  });

  try {
    const result = await testPool.query('SELECT version()');
    const version = result.rows[0].version;
    
    await testPool.end();
    
    return NextResponse.json({ 
      success: true, 
      message: `เชื่อมต่อสำเร็จ: ${version.split(',')[0]}` 
    });
  } catch (dbError: any) {
    await testPool.end();
    
    let errorMessage = 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้';
    
    if (dbError.code === 'ECONNREFUSED') {
      errorMessage = 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ PostgreSQL ได้';
    } else if (dbError.code === '28P01') {
      errorMessage = 'Username หรือ Password ไม่ถูกต้อง';
    } else if (dbError.code === '3D000') {
      errorMessage = 'ไม่พบฐานข้อมูลที่ระบุ';
    } else if (dbError.message) {
      errorMessage = dbError.message;
    }
    
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}

async function testMySQL(connectionString: string) {
  try {
    // Parse MySQL connection string
    const url = new URL(connectionString);
    const connection = await mysql.createConnection({
      host: url.hostname,
      port: parseInt(url.port) || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      connectTimeout: 5000
    });

    const [rows] = await connection.query('SELECT VERSION() as version');
    const version = (rows as any)[0].version;
    
    await connection.end();
    
    return NextResponse.json({ 
      success: true, 
      message: `เชื่อมต่อสำเร็จ: MySQL ${version}` 
    });
  } catch (dbError: any) {
    let errorMessage = 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้';
    
    if (dbError.code === 'ECONNREFUSED') {
      errorMessage = 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ MySQL ได้';
    } else if (dbError.code === 'ER_ACCESS_DENIED_ERROR') {
      errorMessage = 'Username หรือ Password ไม่ถูกต้อง';
    } else if (dbError.code === 'ER_BAD_DB_ERROR') {
      errorMessage = 'ไม่พบฐานข้อมูลที่ระบุ';
    } else if (dbError.message) {
      errorMessage = dbError.message;
    }
    
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}
