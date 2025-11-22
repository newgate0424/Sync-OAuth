import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Cron endpoint สำหรับ daily backup (เรียกจาก external cron service หรือ GitHub Actions)
export async function GET() {
  try {
    console.log('⏰ Running daily database backup...');

    // เรียก backup API
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Backup failed');
    }

    const data = await response.json();

    console.log('✅ Daily backup completed:', data);

    return NextResponse.json({
      success: true,
      message: 'Daily backup completed successfully',
      ...data,
    });
  } catch (error: any) {
    console.error('❌ Daily backup failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}
