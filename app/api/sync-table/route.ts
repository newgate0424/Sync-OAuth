import { NextRequest, NextResponse } from 'next/server';
import { ensureDbInitialized } from '@/lib/dbAdapter';
import { getGoogleSheetsClient } from '@/lib/googleSheets';
import { getMongoDb } from '@/lib/mongoDb';
import crypto from 'crypto';
import { performSync } from '@/lib/syncService';

// ฟังก์ชันคำนวณ checksum จาก Google Sheets data
function calculateChecksum(rows: any[][]): string {
  if (rows.length === 0) return '';
  
  const dataToHash = JSON.stringify({
    rowCount: rows.length,
    firstRow: rows[0],
    lastRow: rows[rows.length - 1],
    // เพิ่ม sample จาก row กลางๆ เพื่อความแม่นยำ
    middleRow: rows[Math.floor(rows.length / 2)]
  });
  
  return crypto.createHash('md5').update(dataToHash).digest('hex');
}

// POST - สร้างตารางและ sync ข้อมูล
export async function POST(request: NextRequest) {
  try {
    const pool = await ensureDbInitialized();
    const body = await request.json();
    const { dataset, folderName, tableName, spreadsheetId, sheetName, schema, mode, originalTableName } = body;
    const startRow = parseInt(body.startRow) || 1;
    const endColumn = body.endColumn || null;
    const hasHeader = body.hasHeader !== undefined ? body.hasHeader : true;
    
    if (!dataset || !tableName || !spreadsheetId || !sheetName || !schema) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Handle Edit Mode
    if (mode === 'edit') {
        if (originalTableName && originalTableName !== tableName) {
            // Renaming: Drop old table and config
            await pool.query(`DROP TABLE IF EXISTS "${originalTableName}"`);
            await pool.query(`DELETE FROM sync_config WHERE table_name = $1`, [originalTableName]);
            
            // Also remove from folder_tables if it was there (MongoDB)
            const mongoDb = await getMongoDb();
            const folder = await mongoDb.collection('folders').findOne({ name: folderName });
            if (folder) {
                await mongoDb.collection('folder_tables').deleteOne({ folder_id: folder._id, table_name: originalTableName });
            }

        } else {
            // Same name: Drop to recreate
            await pool.query(`DROP TABLE IF EXISTS "${tableName}"`);
        }
    }

    // สร้างตารางตาม schema
    const columns = schema.map((col: any) => 
      `"${col.name}" ${col.type} ${col.nullable ? 'NULL' : 'NOT NULL'}`
    ).join(', ');
    
    const createTableSQL = `CREATE TABLE IF NOT EXISTS "${tableName}" (
      id SERIAL PRIMARY KEY,
      ${columns},
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;
    
    await pool.query(createTableSQL);

    // อ่าน dbType
    const mongoDb = await getMongoDb();
    const settings = await mongoDb.collection('settings').findOne({ key: 'database_connection' });
    const dbType = settings?.dbType || 'mysql';

    // Ensure end_column exists in sync_config
    try {
      const alterSql = "ALTER TABLE sync_config ADD COLUMN end_column VARCHAR(10) NULL";
      await pool.query(alterSql);
    } catch (e: any) {
      // Ignore if column already exists
      // MySQL: 1060 (ER_DUP_FIELDNAME), Postgres: 42701 (duplicate_column)
      if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== '42701') {
         console.warn('Warning: Could not add end_column to sync_config:', e.message);
      }
    }

    // บันทึก sync config พร้อม startRow และ hasHeader
    if (dbType === 'mysql') {
      await pool.query(
        `INSERT INTO sync_config (table_name, spreadsheet_id, sheet_name, folder_name, dataset_name, start_row, end_column, has_header) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE spreadsheet_id = VALUES(spreadsheet_id), sheet_name = VALUES(sheet_name), start_row = VALUES(start_row), end_column = VALUES(end_column), has_header = VALUES(has_header)`,
        [tableName, spreadsheetId, sheetName, folderName || '', dataset, startRow, endColumn, hasHeader ? 1 : 0]
      );
    } else {
      await pool.query(
        `INSERT INTO sync_config (table_name, spreadsheet_id, sheet_name, folder_name, dataset_name, start_row, end_column, has_header) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (table_name) 
         DO UPDATE SET spreadsheet_id = $2, sheet_name = $3, start_row = $6, end_column = $7, has_header = $8`,
        [tableName, spreadsheetId, sheetName, folderName || '', dataset, startRow, endColumn, hasHeader]
      );
    }

    // บันทึกใน folder_tables ถ้ามี folderName (ใช้ MongoDB)
    if (folderName) {
      try {
        // หา folder document จากชื่อ
        const folder = await mongoDb.collection('folders').findOne({ name: folderName });
        
        if (folder) {
          // บันทึกลง MongoDB folder_tables (ใช้ ObjectId แทน string)
          await mongoDb.collection('folder_tables').updateOne(
            { folder_id: folder._id, table_name: tableName },
            { 
              $set: { 
                folder_id: folder._id, 
                table_name: tableName,
                updated_at: new Date()
              },
              $setOnInsert: { created_at: new Date() }
            },
            { upsert: true }
          );
        }
      } catch (mongoError) {
        console.error('Error saving to MongoDB folder_tables:', mongoError);
        // ไม่ throw error เพื่อให้การสร้างตารางดำเนินต่อไป
      }
    }

    return NextResponse.json({ success: true, message: 'Table created successfully' });
  } catch (error: any) {
    console.error('Database error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Sync ข้อมูลจาก Google Sheets
export async function PUT(request: NextRequest) {
  try {
    const { dataset, tableName, forceSync = false } = await request.json();
    
    if (!dataset || !tableName) {
      return NextResponse.json({ error: 'Dataset and table name are required' }, { status: 400 });
    }

    console.log(`[API] Starting sync for table: ${tableName} (Force: ${forceSync})`);

    // เรียกใช้ performSync จาก lib/syncService.ts
    // ซึ่งรองรับ Smart Sync (Checksum, Modified Time) และ CSV Stream (Large Data)
    const result = await performSync({
      dataset,
      tableName,
      forceSync
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Sync failed' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: result.message,
      stats: result.stats
    });

  } catch (error: any) {
    console.error('[API] Sync error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
