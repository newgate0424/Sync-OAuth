import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongoDb';

export async function GET() {
  try {
    const db = await getMongoDb();
    const collections = await db.listCollections().toArray();
    
    const collectionNames = collections
      .map(col => col.name)
      .filter(name => !['users', 'settings', 'sessions'].includes(name));
    
    return NextResponse.json({ collections: collectionNames });
  } catch (error: any) {
    console.error('Error listing collections:', error);
    return NextResponse.json(
      { error: 'Failed to list collections', message: error.message },
      { status: 500 }
    );
  }
}
