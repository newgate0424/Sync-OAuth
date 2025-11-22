import { NextResponse } from 'next/server';
import { ensureDbInitialized } from '@/lib/dbAdapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pool = await ensureDbInitialized();
    
    // ทดสอบ query ง่ายๆ
    const result: any = await pool.query('SELECT 1 as status');
    
    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      result: result.rows || result
    });
  } catch (error: any) {
    console.error('Health check failed:', error);
    
    let errorMessage = error.message;
    let suggestion = '';
    
    if (error.code === 'ECONNREFUSED') {
      suggestion = 'PostgreSQL server is not accepting connections. Check if PostgreSQL is running and firewall allows connections.';
    } else if (error.code === 'ETIMEDOUT') {
      suggestion = 'Connection timeout. The database server may be unreachable or behind a firewall.';
    } else if (error.code === '28P01') {
      suggestion = 'Authentication failed. Check database credentials in DATABASE_URL environment variable.';
    } else if (error.code === '3D000') {
      suggestion = 'Database does not exist. Create the database or check DATABASE_URL.';
    } else if (error.code === 'ENOTFOUND') {
      suggestion = 'Database host not found. Check DATABASE_URL environment variable.';
    }
    
    return NextResponse.json({
      status: 'unhealthy',
      database: 'disconnected',
      error: errorMessage,
      code: error.code,
      suggestion,
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}
