import { NextRequest, NextResponse } from 'next/server';
import { ensureSyncConfigColumns } from '@/lib/autoMigration';

/**
 * API สำหรับรัน auto migration
 * จะถูกเรียกอัตโนมัติตอน app เริ่มทำงาน
 */
export async function GET(request: NextRequest) {
  try {
    await ensureSyncConfigColumns();
    
    return NextResponse.json({ 
      success: true,
      message: 'Auto migration completed'
    });
  } catch (error: any) {
    console.error('[Auto Migration] Failed:', error);
    return NextResponse.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
}
