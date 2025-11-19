import { NextRequest, NextResponse } from 'next/server';
import { ensureDbInitialized } from '@/lib/dbAdapter';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { sql } = await request.json();

    if (!sql || !sql.trim()) {
      return NextResponse.json({ error: 'SQL query is required' }, { status: 400 });
    }

    // Basic security check: Prevent multiple statements if possible to reduce injection risk, 
    // though this is an admin tool so we allow raw SQL.
    
    const pool = await ensureDbInitialized();
    const startTime = Date.now();

    try {
      const result = await pool.query(sql);
      const duration = Date.now() - startTime;

      // Format result for frontend
      // dbAdapter returns { rows: any[], rowCount: number }
      // We might want column names too if possible, but rows usually have keys.
      
      return NextResponse.json({
        success: true,
        rows: result.rows,
        rowCount: result.rowCount,
        duration,
        fields: result.rows.length > 0 ? Object.keys(result.rows[0]) : []
      });

    } catch (dbError: any) {
      return NextResponse.json({
        success: false,
        error: dbError.message,
        duration: Date.now() - startTime
      }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Query execution error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
