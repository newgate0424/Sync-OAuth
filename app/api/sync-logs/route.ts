import { NextResponse } from 'next/server';
import { ensureDbInitialized } from '@/lib/dbAdapter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const pool = await ensureDbInitialized();
    const result = await pool.query(`
      SELECT 
        id,
        status,
        table_name,
        folder_name,
        spreadsheet_id,
        sheet_name,
        started_at,
        completed_at,
        sync_duration,
        rows_synced,
        rows_inserted,
        rows_updated,
        rows_deleted,
        error_message
      FROM sync_logs
      ORDER BY started_at DESC
      LIMIT 100
    `);
    
    return NextResponse.json(result.rows, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('Error fetching sync logs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
