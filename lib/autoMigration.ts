import { ensureDbInitialized } from './dbAdapter';
import { getMongoDb } from './mongoDb';

/**
 * ฟังก์ชันตรวจสอบและเพิ่มคอลัมน์ start_row และ has_header ใน sync_config อัตโนมัติ
 * รันทุกครั้งที่ app เริ่มทำงาน
 */
export async function ensureSyncConfigColumns() {
  try {
    const pool = await ensureDbInitialized();
    const mongoDb = await getMongoDb();
    const settings = await mongoDb.collection('settings').findOne({ key: 'database_connection' });
    const dbType = settings?.dbType || 'mysql';

    console.log('[Migration] Checking sync_config columns...');

    if (dbType === 'mysql') {
      // Check if columns exist
      const result: any = await pool.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'sync_config'
        AND COLUMN_NAME IN ('start_row', 'has_header')
      `);
      
      // MySQL returns [rows, fields] - safely extract rows
      const rows = Array.isArray(result[0]) ? result[0] : (Array.isArray(result) ? result : []);
      const existingColumns = rows.map((c: any) => c.COLUMN_NAME);
      
      // Add start_row if missing
      if (!existingColumns.includes('start_row')) {
        console.log('[Migration] Adding start_row column to sync_config...');
        try {
          await pool.query(`
            ALTER TABLE sync_config 
            ADD COLUMN start_row INT DEFAULT 1 COMMENT 'แถวแรกที่เริ่มอ่านข้อมูล (1-indexed)'
          `);
          console.log('[Migration] ✅ Added start_row column');
        } catch (err: any) {
          if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('[Migration] ⚠️  start_row column already exists');
          } else {
            throw err;
          }
        }
      }
      
      // Add has_header if missing
      if (!existingColumns.includes('has_header')) {
        console.log('[Migration] Adding has_header column to sync_config...');
        try {
          await pool.query(`
            ALTER TABLE sync_config 
            ADD COLUMN has_header TINYINT(1) DEFAULT 1 COMMENT 'แถวแรกเป็น header หรือไม่'
          `);
          console.log('[Migration] ✅ Added has_header column');
        } catch (err: any) {
          if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('[Migration] ⚠️  has_header column already exists');
          } else {
            throw err;
          }
        }
      }
      
    } else if (dbType === 'postgresql') {
      // Check if columns exist
      const result = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'sync_config'
        AND column_name IN ('start_row', 'has_header')
      `);
      
      const existingColumns = result.rows.map((r: any) => r.column_name);
      
      // Add start_row if missing
      if (!existingColumns.includes('start_row')) {
        console.log('[Migration] Adding start_row column to sync_config...');
        await pool.query(`
          ALTER TABLE sync_config 
          ADD COLUMN IF NOT EXISTS start_row INTEGER DEFAULT 1
        `);
        console.log('[Migration] ✅ Added start_row column');
      }
      
      // Add has_header if missing
      if (!existingColumns.includes('has_header')) {
        console.log('[Migration] Adding has_header column to sync_config...');
        await pool.query(`
          ALTER TABLE sync_config 
          ADD COLUMN IF NOT EXISTS has_header BOOLEAN DEFAULT TRUE
        `);
        console.log('[Migration] ✅ Added has_header column');
      }
    }

    console.log('[Migration] sync_config columns check completed');
    return true;
    
  } catch (error: any) {
    console.error('[Migration] Error checking sync_config columns:', error.message);
    // Don't throw - allow app to continue even if migration fails
    return false;
  }
}
