import { NextRequest, NextResponse } from 'next/server';
import { ensureDbInitialized } from '@/lib/dbAdapter';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const pool = await ensureDbInitialized();
    const { query, params } = await request.json();
    
    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }
    
    console.log('Executing query:', query, params ? `with params: ${JSON.stringify(params)}` : '');
    
    try {
      const result = params 
        ? await pool.query(query, params)
        : await pool.query(query);
      return NextResponse.json({ rows: result.rows });
    } catch (queryError: any) {
      console.error('Query error:', queryError.message, 'Query:', query);
      return NextResponse.json({ error: queryError.message }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Query execution error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
