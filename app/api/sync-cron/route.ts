import { NextRequest, NextResponse } from 'next/server';
import { performSync } from '@/lib/syncService';

export const dynamic = 'force-dynamic';

// GET - API สำหรับ Cron Job เรียกใช้ sync อัตนมัติ
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');
    const tableName = searchParams.get('table');
    const force = searchParams.get('force') === 'true';

    // ตรวจสอบ token (ใช้ environment variable)
    const validToken = process.env.CRON_SYNC_TOKEN || 'your-secret-token-here-change-this';
    
    if (token !== validToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!tableName) {
      return NextResponse.json({ error: 'Table name is required' }, { status: 400 });
    }

    console.log(`[Cron API] Starting sync for table: ${tableName}`);

    // เรียกใช้ performSync จาก lib/syncService ึ่งมี logic การตรวจสอบ checksum อย่แล้ว
    const result = await performSync({
      dataset: 'default', // ค่า default หรืออาจจะต้องดึงจาก config ถ้าจำเปน แต่ใน syncService ไม่ได้ใช้ dataset ในการ query config
      tableName: tableName,
      forceSync: force
    });

    if (!result.success) {
      return NextResponse.json({ 
        error: result.error || result.message 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      stats: result.stats
    });

  } catch (error: any) {
    console.error('[Cron API] Error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}
