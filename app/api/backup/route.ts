import { NextRequest, NextResponse } from 'next/server';
import { performBackup, listBackups } from '@/lib/backupService';

export const dynamic = 'force-dynamic';

// GET - ดึงรายการ backups
export async function GET() {
  try {
    const backups = await listBackups();

    return NextResponse.json({ backups }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('Error fetching backups:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - สร้าง backup ใหม่
export async function POST(request: NextRequest) {
  try {
    const result = await performBackup();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('❌ Backup failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
