import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongoDb';
import { performSync } from '@/lib/syncService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const folderName = searchParams.get('folder');
    const dataset = searchParams.get('dataset') || 'default';

    if (!folderName) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    const db = await getMongoDb();
    
    // 1. Get Folder ID
    const folderDoc = await db.collection('folders').findOne({ name: folderName });
    if (!folderDoc) {
      return NextResponse.json({ error: `Folder "${folderName}" not found` }, { status: 404 });
    }

    // 2. Get Tables in Folder
    const folderTables = await db.collection('folder_tables')
      .find({ folder_id: folderDoc._id })
      .toArray();

    if (folderTables.length === 0) {
      return NextResponse.json({ message: 'No tables found in this folder', results: [] });
    }

    // 3. Sync All Tables
    const results = [];
    // Process sequentially to avoid overwhelming the server/db
    for (const table of folderTables) {
      try {
        const result = await performSync({
          dataset: dataset,
          tableName: table.table_name,
          forceSync: false // Smart sync
        });
        results.push({ 
            table: table.table_name, 
            status: result.success ? 'success' : 'error', 
            message: result.message || result.error,
            stats: result.stats
        });
      } catch (e: any) {
        results.push({ table: table.table_name, status: 'error', message: e.message });
      }
    }

    return NextResponse.json({ 
      message: `Sync completed for folder "${folderName}"`,
      total: folderTables.length,
      success: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'error').length,
      results 
    });

  } catch (error: any) {
    console.error('Sync folder error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
