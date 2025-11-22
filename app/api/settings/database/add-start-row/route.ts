import { NextRequest, NextResponse } from 'next/server';
import { ensureDbInitialized } from '@/lib/dbAdapter';
import { getMongoDb } from '@/lib/mongoDb';

/**
 * API endpoint สำหรับ migrate เพิ่ม columns start_row และ has_header
 * เรียกผ่าน: GET /api/settings/database/add-start-row
 */
export async function GET(request: NextRequest) {
  try {
    const pool = await ensureDbInitialized();
    
    // อ่าน dbType
    const mongoDb = await getMongoDb();
    const settings = await mongoDb.collection('settings').findOne({ key: 'database_connection' });
    const dbType = settings?.dbType || 'mysql';

    console.log(`📊 Database type: ${dbType}`);
    const messages: string[] = [];

    if (dbType === 'mysql') {
      console.log('➕ Adding start_row and has_header columns to sync_config (MySQL)...');
      messages.push('Adding columns to sync_config (MySQL)...');
      
      // Check if columns already exist
      const result: any = await pool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'sync_config'
        AND COLUMN_NAME IN ('start_row', 'has_header')
      `);
      
      // MySQL returns array of arrays: [[rows], [fields]]
      const columns = Array.isArray(result[0]) ? result[0] : (Array.isArray(result) ? result : []);
      const existingColumns = columns.map((c: any) => c.COLUMN_NAME);
      
      if (!existingColumns.includes('start_row')) {
        try {
          await pool.query(`
            ALTER TABLE sync_config 
            ADD COLUMN start_row INT DEFAULT 1 COMMENT 'แถวแรกที่เริ่มอ่านข้อมูล (1-indexed)'
          `);
          messages.push('✅ Added start_row column');
          console.log('✅ Added start_row column');
        } catch (err: any) {
          if (err.code === 'ER_DUP_FIELDNAME') {
            messages.push('⚠️  start_row column already exists');
            console.log('⚠️  start_row column already exists');
          } else {
            throw err;
          }
        }
      } else {
        messages.push('⚠️  start_row column already exists');
        console.log('⚠️  start_row column already exists');
      }
      
      if (!existingColumns.includes('has_header')) {
        try {
          await pool.query(`
            ALTER TABLE sync_config 
            ADD COLUMN has_header TINYINT(1) DEFAULT 1 COMMENT 'แถวแรกเป็น header หรือไม่ (1=ใช่, 0=ไม่)'
          `);
          messages.push('✅ Added has_header column');
          console.log('✅ Added has_header column');
        } catch (err: any) {
          if (err.code === 'ER_DUP_FIELDNAME') {
            messages.push('⚠️  has_header column already exists');
            console.log('⚠️  has_header column already exists');
          } else {
            throw err;
          }
        }
      } else {
        messages.push('⚠️  has_header column already exists');
        console.log('⚠️  has_header column already exists');
      }
      
    } else if (dbType === 'postgresql') {
      console.log('➕ Adding start_row and has_header columns to sync_config (PostgreSQL)...');
      messages.push('Adding columns to sync_config (PostgreSQL)...');
      
      // Check if columns already exist
      const result = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'sync_config'
        AND column_name IN ('start_row', 'has_header')
      `);
      
      const existingColumns = result.rows.map((r: any) => r.column_name);
      
      if (!existingColumns.includes('start_row')) {
        await pool.query(`
          ALTER TABLE sync_config 
          ADD COLUMN IF NOT EXISTS start_row INTEGER DEFAULT 1
        `);
        await pool.query(`
          COMMENT ON COLUMN sync_config.start_row IS 'แถวแรกที่เริ่มอ่านข้อมูล (1-indexed)'
        `);
        messages.push('✅ Added start_row column');
        console.log('✅ Added start_row column');
      } else {
        messages.push('⚠️  start_row column already exists');
        console.log('⚠️  start_row column already exists');
      }
      
      if (!existingColumns.includes('has_header')) {
        await pool.query(`
          ALTER TABLE sync_config 
          ADD COLUMN IF NOT EXISTS has_header BOOLEAN DEFAULT TRUE
        `);
        await pool.query(`
          COMMENT ON COLUMN sync_config.has_header IS 'แถวแรกเป็น header หรือไม่'
        `);
        messages.push('✅ Added has_header column');
        console.log('✅ Added has_header column');
      } else {
        messages.push('⚠️  has_header column already exists');
        console.log('⚠️  has_header column already exists');
      }
    }

    messages.push('✅ Migration completed successfully!');
    console.log('✅ Migration completed successfully!');

    return NextResponse.json({ 
      success: true, 
      messages,
      dbType 
    });
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    return NextResponse.json({ 
      error: 'Migration failed', 
      details: error.message 
    }, { status: 500 });
  }
}
