import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongoDb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getMongoDb();
    
    // ดึง google tokens ทั้งหมด
    const tokens = await db.collection('google_tokens')
      .find({})
      .project({
        email: 1,
        name: 1,
        picture: 1,
        created_at: 1,
        updated_at: 1,
        expiry_date: 1,
      })
      .toArray();

    return NextResponse.json({ 
      connected: tokens.length > 0,
      accounts: tokens.map(t => ({
        email: t.email,
        name: t.name,
        picture: t.picture,
        connected_at: t.created_at,
        expires_at: t.expiry_date ? new Date(t.expiry_date) : null,
      }))
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('Error fetching Google connection status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - ยกเลิกการเชื่อมต่อ Google account
export async function DELETE() {
  try {
    const db = await getMongoDb();
    
    await db.collection('google_tokens').deleteMany({});
    
    console.log('🔌 Disconnected all Google accounts');
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error disconnecting Google account:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
