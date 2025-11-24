import { NextResponse } from 'next/server';
import { ensureDbInitialized } from '@/lib/dbAdapter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    const pool = await ensureDbInitialized();
    const dbType = pool.getDatabaseType();

    // 1. Cleanup logs older than 24 hours
    try {
      const cleanupQuery = dbType === 'mysql'
        ? `DELETE FROM sync_logs WHERE started_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
        : `DELETE FROM sync_logs WHERE started_at < NOW() - INTERVAL '24 hours'`;
      await pool.query(cleanupQuery);
    } catch (cleanupError) {
      console.error('Error cleaning up old logs:', cleanupError);
      // Continue even if cleanup fails
    }

    // 2. Get total count
    const countResult = await pool.query('SELECT COUNT(*) as total FROM sync_logs');
    const totalLogs = parseInt(countResult.rows[0].total || '0');
    const totalPages = Math.ceil(totalLogs / limit);

    // 3. Get paginated logs
    const query = dbType === 'mysql'
      ? `
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
        LIMIT ? OFFSET ?
      `
      : `
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
        LIMIT $1 OFFSET $2
      `;

    const params = dbType === 'mysql' ? [limit, offset] : [limit, offset];
    const result = await pool.query(query, params);
    
    return NextResponse.json({
      logs: result.rows,
      pagination: {
        page,
        limit,
        totalLogs,
        totalPages
      }
    }, {
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
