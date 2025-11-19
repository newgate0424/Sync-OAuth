import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongoDb';
import { ObjectId } from 'mongodb';
import { ensureDbInitialized } from '@/lib/dbAdapter';

export const dynamic = 'force-dynamic';

// GET - ดึงโฟลเดอร์ทั้งหมด
export async function GET() {
  try {
    const db = await getMongoDb();
    const folders = await db.collection('folders').find({}).sort({ name: 1 }).toArray();
    const folderTables = await db.collection('folder_tables').find({}).sort({ folder_id: 1, table_name: 1 }).toArray();
    
    return NextResponse.json({ 
      folders: folders.map(f => ({ ...f, id: f._id.toString() })), 
      folderTables: folderTables.map(ft => ({ ...ft, id: ft._id.toString() }))
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('Database error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - สร้างโฟลเดอร์ใหม่
export async function POST(request: NextRequest) {
  try {
    const db = await getMongoDb();
    const { folderName, description } = await request.json();
    
    if (!folderName) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }
    
    await db.collection('folders').insertOne({
      name: folderName,
      description: description || null,
      created_at: new Date()
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Database error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - เปลี่ยนชื่อโฟลเดอร์
export async function PUT(request: NextRequest) {
  try {
    const db = await getMongoDb();
    const { folderId, newName } = await request.json();
    
    if (!folderId || !newName) {
      return NextResponse.json({ error: 'Folder ID and new name are required' }, { status: 400 });
    }
    
    await db.collection('folders').updateOne(
      { _id: new ObjectId(folderId) },
      { $set: { name: newName, updated_at: new Date() } }
    );
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Database error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - ลบโฟลเดอร์
export async function DELETE(request: NextRequest) {
  try {
    const db = await getMongoDb();
    const { folderId } = await request.json();
    
    console.log(`🗑️  Request to delete folder ID: ${folderId}`);

    if (!folderId) {
      return NextResponse.json({ error: 'Folder ID is required' }, { status: 400 });
    }

    const folderObjectId = new ObjectId(folderId);
    
    // ตรวจสอบว่ามีโฟลเดอร์อยู่จริงไหม
    let existingFolder = await db.collection('folders').findOne({ _id: folderObjectId });
    let targetFolderId: any = folderObjectId;

    if (!existingFolder) {
        console.log(`❌ Folder not found with ObjectId: ${folderId}`);
        // ลองหาด้วย string id เผื่อเก็บผิด format
        existingFolder = await db.collection('folders').findOne({ _id: folderId });
        if (existingFolder) {
             console.log(`⚠️ Found folder with String ID`);
             targetFolderId = folderId;
        } else {
             return NextResponse.json({ success: true, deletedTables: 0, deletedFolder: 0, message: "Folder not found" });
        }
    }
    console.log(`✓ Found folder: ${existingFolder.name} (ID: ${targetFolderId})`);

    // ดึงรายการตารางในโฟลเดอร์ก่อนลบ (หาทั้งแบบ ObjectId และ String เพื่อความชัวร์)
    const tables = await db.collection('folder_tables').find({ 
      $or: [
        { folder_id: folderObjectId },
        { folder_id: folderId }
      ]
    }).toArray();
    
    console.log(`📋 Found ${tables.length} tables in folder`);

    // ลบตารางจริงจากฐานข้อมูล (MySQL/PostgreSQL)
    if (tables.length > 0) {
      const pool = await ensureDbInitialized();
      
      // ดึง dbType ก่อน
      const mongoSettings = await db.collection('settings').findOne({ key: 'database_connection' });
      const dbType = mongoSettings?.dbType || 'mysql';
      
      console.log(`🗑️  Deleting ${tables.length} tables from folder... (DB Type: ${dbType})`);
      
      for (const table of tables) {
        try {
          // ลบตารางจริง
          const dropQuery = dbType === 'mysql' 
            ? `DROP TABLE IF EXISTS \`${table.table_name}\``
            : `DROP TABLE IF EXISTS "${table.table_name}"`;
            
          await pool.query(dropQuery);
          console.log(`✅ Deleted table: ${table.table_name}`);
          
          // ลบ sync_config ของตารางนี้ด้วย
          if (dbType === 'mysql') {
            await pool.query('DELETE FROM sync_config WHERE table_name = ?', [table.table_name]);
          } else {
            await pool.query('DELETE FROM sync_config WHERE table_name = $1', [table.table_name]);
          }
          console.log(`✅ Deleted sync_config for: ${table.table_name}`);
        } catch (error: any) {
          console.error(`❌ Error deleting table ${table.table_name}:`, error.message);
          // ถ้าลบไม่ได้ ให้ return error
          throw new Error(`Failed to delete table ${table.table_name}: ${error.message}`);
        }
      }
    }
    
    // ลบ records ใน folder_tables
    const result = await db.collection('folder_tables').deleteMany({ 
      $or: [
        { folder_id: folderObjectId },
        { folder_id: folderId }
      ]
    });
    console.log(`🗑️  Deleted ${result.deletedCount} records from folder_tables`);
    
    // ลบโฟลเดอร์
    const folderResult = await db.collection('folders').deleteOne({ _id: targetFolderId });
    console.log(`🗑️  Deleted folder document: ${folderResult.deletedCount}`);
    
    return NextResponse.json({ 
      success: true,
      deletedTables: result.deletedCount,
      deletedFolder: folderResult.deletedCount
    });
  } catch (error: any) {
    console.error('Database error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
