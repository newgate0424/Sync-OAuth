import { NextResponse } from 'next/server';
import { ensureDbInitialized } from '@/lib/dbAdapter';

export async function GET() {
  try {
    const pool = await ensureDbInitialized();
    const dbType = pool.getDatabaseType();
    
    return NextResponse.json({ type: dbType });
  } catch (error: any) {
    console.error('Error getting database type:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
