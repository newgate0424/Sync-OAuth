import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongoDb';
import { ObjectId } from 'mongodb';
import { ensureDbInitialized } from '@/lib/dbAdapter';

// GET - ดึงตารางในโฟลเดอร์
export async function GET(request: NextRequest) {
  try {
    const db = await getMongoDb();
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get('folder');
    
    if (!folder) {
      return NextResponse.json({ error: 'Folder is required' }, { status: 400 });
    }
    
    // หา folder_id จากชื่อ folder
    const folderDoc = await db.collection('folders').findOne({ name: folder });
    if (!folderDoc) {
      return NextResponse.json({ tables: [] });
    }
    
    const tables = await db.collection('folder_tables')
      .find({ folder_id: folderDoc._id })
      .sort({ table_name: 1 })
      .toArray();
    
    return NextResponse.json({ 
      tables: tables.map(t => ({ ...t, id: t._id.toString() }))
    });
  } catch (error: any) {
    console.error('Database error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - สร้างตารางในโฟลเดอร์
export async function POST(request: NextRequest) {
  try {
    const db = await getMongoDb();
    const { folderId, tableName } = await request.json();
    
    if (!folderId || !tableName) {
      return NextResponse.json({ error: 'Folder ID and table name are required' }, { status: 400 });
    }
    
    await db.collection('folder_tables').insertOne({
      folder_id: new ObjectId(folderId),
      table_name: tableName,
      created_at: new Date()
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Database error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - ลบตารางจากโฟลเดอร์
export async function DELETE(request: NextRequest) {
  try {
    const db = await getMongoDb();
    const { searchParams } = new URL(request.url);
    const tableId = searchParams.get('tableId');
    const tableName = searchParams.get('tableName');
    
    if (!tableId && !tableName) {
      return NextResponse.json({ error: 'Table ID or table name is required' }, { status: 400 });
    }
    
    // หาข้อมูลตารางก่อนลบ
    let table;
    if (tableId) {
      table = await db.collection('folder_tables').findOne({ _id: new ObjectId(tableId) });
    } else if (tableName) {
      table = await db.collection('folder_tables').findOne({ table_name: tableName });
    }
    
    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }
    
    // ลบตารางจริงจากฐานข้อมูล
    const pool = await ensureDbInitialized();
    
    // ลบตารางจริง (ใช้ double quotes สำหรับ PostgreSQL)
    try {
      await pool.query(`DROP TABLE IF EXISTS "${table.table_name}"`);
      console.log(`✅ Deleted table: ${table.table_name}`);
    } catch (dropError: any) {
      console.error(`❌ Error dropping table ${table.table_name}:`, dropError.message);
      // ถ้าลบตารางไม่ได้ ให้ return error ทันที
      return NextResponse.json({ 
        error: `Failed to drop table: ${dropError.message}` 
      }, { status: 500 });
    }
    
    // ลบ sync_config
    try {
      const mongoSettings = await db.collection('settings').findOne({ key: 'database_connection' });
      const dbType = mongoSettings?.dbType || 'mysql';
      
      if (dbType === 'mysql') {
        await pool.query('DELETE FROM sync_config WHERE table_name = ?', [table.table_name]);
      } else {
        await pool.query('DELETE FROM sync_config WHERE table_name = $1', [table.table_name]);
      }
      
      console.log(`✅ Deleted sync_config for: ${table.table_name}`);
    } catch (syncError: any) {
      console.error(`⚠️  Error deleting sync_config for ${table.table_name}:`, syncError.message);
      // sync_config ลบไม่ได้ไม่เป็นไร ให้ดำเนินการต่อ
    }
    
    // ลบจาก MongoDB
    await db.collection('folder_tables').deleteOne({ _id: table._id });
    console.log(`✅ Deleted folder_tables entry for: ${table.table_name}`);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Database error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
