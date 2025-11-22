import { NextRequest, NextResponse } from 'next/server';
import { ensureDbInitialized } from '@/lib/dbAdapter';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tableName = searchParams.get('tableName');

    if (!tableName) {
      return NextResponse.json({ error: 'Table name is required' }, { status: 400 });
    }

    const pool = await ensureDbInitialized();
    
    const result = await pool.query(
      `SELECT * FROM sync_config WHERE table_name = $1`,
      [tableName]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching sync config:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
