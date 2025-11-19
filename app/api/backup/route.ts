import { NextRequest, NextResponse } from 'next/server';
import { ensureDbInitialized } from '@/lib/dbAdapter';
import { getMongoDb } from '@/lib/mongoDb';
import mysql from 'mysql2/promise';

export const dynamic = 'force-dynamic';

// สร้าง connection pool สำหรับ backup database
let backupPool: mysql.Pool | null = null;

function getBackupPool() {
  if (!backupPool) {
    const backupUrl = process.env.BACKUP_DATABASE_URL;
    if (!backupUrl) {
      throw new Error('BACKUP_DATABASE_URL is not configured in .env');
    }
    
    // Parse connection string manually
    const url = new URL(backupUrl);
    
    backupPool = mysql.createPool({
      host: url.hostname,
      port: parseInt(url.port) || 3306,
      user: url.username,
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: 30000,
      maxIdle: 5,
      idleTimeout: 30000,
      charset: 'utf8mb4',
    });
  }
  return backupPool;
}

// สร้างตาราง backups ถ้ายังไม่มี
async function ensureBackupTable() {
  const pool = getBackupPool();
  
  try {
    // ลองสร้างตารางหลายครั้งถ้า fail
    let retries = 3;
    let lastError;
    
    while (retries > 0) {
      try {
        // สร้างตารางหลัก
        await pool.execute(`
          CREATE TABLE IF NOT EXISTS database_backups (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            database_type VARCHAR(50) NOT NULL,
            tables_count INT NOT NULL,
            total_rows INT NOT NULL,
            size_mb DECIMAL(10,2) NOT NULL,
            status VARCHAR(50) NOT NULL,
            INDEX idx_created_at (created_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // สร้างตารางสำหรับเก็บข้อมูลแต่ละตาราง (แยกเก็บเพื่อไม่เกิน max_allowed_packet)
        await pool.execute(`
          CREATE TABLE IF NOT EXISTS backup_tables (
            id INT AUTO_INCREMENT PRIMARY KEY,
            backup_id INT NOT NULL,
            table_name VARCHAR(255) NOT NULL,
            row_count INT NOT NULL,
            schema_data TEXT,
            table_data LONGTEXT,
            INDEX idx_backup_id (backup_id),
            FOREIGN KEY (backup_id) REFERENCES database_backups(id) ON DELETE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        console.log('✓ Backup tables ensured');
        return;
      } catch (err) {
        lastError = err;
        retries--;
        if (retries > 0) {
          console.log(`Retry creating table... (${retries} left)`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    throw lastError;
  } catch (error: any) {
    console.error('Error creating backup table:', error);
    throw new Error(`Failed to create backup table: ${error.message}`);
  }
}

// GET - ดึงรายการ backups
export async function GET() {
  try {
    await ensureBackupTable();
    const pool = getBackupPool();
    
    // ดึงรายการ backups พร้อมนับจำนวนตารางจาก backup_tables
    const [rows] = await pool.execute(`
      SELECT 
        b.id, 
        b.created_at, 
        b.database_type, 
        b.total_rows, 
        b.size_mb, 
        b.status,
        COUNT(bt.id) as tables_count
      FROM database_backups b
      LEFT JOIN backup_tables bt ON b.id = bt.backup_id
      GROUP BY b.id, b.created_at, b.database_type, b.total_rows, b.size_mb, b.status
      ORDER BY b.created_at DESC 
      LIMIT 50
    `);

    const backups = (rows as any[]).map(b => ({
      id: b.id.toString(),
      created_at: b.created_at,
      database_type: b.database_type,
      tables_count: b.tables_count,
      total_rows: b.total_rows,
      size_mb: parseFloat(b.size_mb),
      status: b.status,
    }));

    return NextResponse.json({ backups }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('Error fetching backups:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - สร้าง backup ใหม่
export async function POST(request: NextRequest) {
  try {
    await ensureBackupTable();
    const backupPoolConn = getBackupPool();
    const pool = await ensureDbInitialized();
    const dbType = pool.getDatabaseType();

    console.log('🔄 Starting database backup (Hybrid: Mongo + SQL)...');

    // 1. Fetch MongoDB Data (Folders & Structure)
    let mongoData: any[] = [];
    try {
      const mongoDb = await getMongoDb();
      const folders = await mongoDb.collection('folders').find({}).toArray();
      const folderTables = await mongoDb.collection('folder_tables').find({}).toArray();
      
      console.log(`📁 Found ${folders.length} folders in MongoDB`);
      console.log(`📋 Found ${folderTables.length} table definitions in MongoDB`);

      if (folders.length > 0) {
        mongoData.push({
          tableName: 'folders',
          rows: folders,
          schema: { type: 'mongodb_collection' }
        });
      }

      if (folderTables.length > 0) {
        mongoData.push({
          tableName: 'folder_tables',
          rows: folderTables,
          schema: { type: 'mongodb_collection' }
        });
      }
    } catch (error: any) {
      console.error('❌ Error fetching from MongoDB:', error);
      // Don't fail completely, try to continue with SQL
    }

    // 2. Fetch SQL Data (User Tables)
    let tablesQuery: string;
    if (dbType === 'mysql') {
      tablesQuery = `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`;
    } else {
      tablesQuery = `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    }

    const tablesResult = await pool.query(tablesQuery);
    const allSqlTables = tablesResult.rows.map((r: any) => r.table_name);
    
    // Filter out system tables that might be in SQL
    const sqlTablesToBackup = allSqlTables.filter((t: string) => !['folders', 'folder_tables', 'database_backups', 'backup_tables'].includes(t));

    console.log(`📊 Found ${sqlTablesToBackup.length} user tables in SQL: ${sqlTablesToBackup.join(', ')}`);

    const totalTablesCount = mongoData.length + sqlTablesToBackup.length;

    if (totalTablesCount === 0) {
      return NextResponse.json({ 
        error: 'No tables found to backup (checked both MongoDB and SQL)' 
      }, { status: 404 });
    }

    // สร้าง backup record หลักก่อน
    const [mainResult] = await backupPoolConn.execute(
      'INSERT INTO database_backups (created_at, database_type, total_rows, size_mb, status) VALUES (NOW(), ?, 0, 0, ?)',
      [dbType, 'in_progress']
    );
    
    const backupId = (mainResult as any).insertId;
    console.log(`✓ Created backup record ID: ${backupId}`);

    let totalRows = 0;
    let estimatedSize = 0;

    // 3. Process MongoDB Collections
    for (const item of mongoData) {
        console.log(`\n📋 Processing MongoDB collection: ${item.tableName}`);
        const rows = item.rows;
        const schemaJson = JSON.stringify(item.schema);
        const dataJson = JSON.stringify(rows);
        
        const sizeBytes = Buffer.byteLength(dataJson) + Buffer.byteLength(schemaJson);
        estimatedSize += sizeBytes;
        totalRows += rows.length;

        await backupPoolConn.execute(
          'INSERT INTO backup_tables (backup_id, table_name, row_count, schema_data, table_data) VALUES (?, ?, ?, ?, ?)',
          [backupId, item.tableName, rows.length, schemaJson, dataJson]
        );
        console.log(`   ✓ Saved ${item.tableName} (${rows.length} docs)`);
    }

    // 4. Process SQL Tables
    for (const tableName of sqlTablesToBackup) {
      try {
        console.log(`\n📋 Processing SQL table: ${tableName}`);
        
        // ดึงข้อมูลทั้งหมดจากตาราง
        const dataResult = await pool.query(`SELECT * FROM ${dbType === 'mysql' ? `\`${tableName}\`` : `"${tableName}"`}`);
        const rows = dataResult.rows;

        console.log(`   ✓ Retrieved ${rows.length} rows from ${tableName}`);

        // ดึง schema
        let schemaResult;
        if (dbType === 'mysql') {
          schemaResult = await pool.query(`SHOW CREATE TABLE \`${tableName}\``);
        } else {
          schemaResult = await pool.query(`
            SELECT column_name, data_type, character_maximum_length, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = $1 
            ORDER BY ordinal_position
          `, [tableName]);
        }

        const schemaJson = JSON.stringify(schemaResult.rows);
        const dataJson = JSON.stringify(rows);
        
        const sizeBytes = Buffer.byteLength(dataJson) + Buffer.byteLength(schemaJson);
        estimatedSize += sizeBytes;
        totalRows += rows.length;

        await backupPoolConn.execute(
          'INSERT INTO backup_tables (backup_id, table_name, row_count, schema_data, table_data) VALUES (?, ?, ?, ?, ?)',
          [backupId, tableName, rows.length, schemaJson, dataJson]
        );
        console.log(`   ✓ Saved ${tableName}`);

      } catch (error: any) {
        console.error(`   ❌ Error backing up table ${tableName}:`, error.message);
        // Continue with other tables
      }
    }

    // Update main record
    const sizeMb = parseFloat((estimatedSize / (1024 * 1024)).toFixed(2));
    await backupPoolConn.execute(
      'UPDATE database_backups SET total_rows = ?, size_mb = ?, status = ? WHERE id = ?',
      [totalRows, sizeMb, 'completed', backupId]
    );

    console.log(`\n✅ Backup completed successfully! ID: ${backupId}, Total Rows: ${totalRows}, Size: ${sizeMb}MB`);

    // ลบ backups เก่าที่เกิน 30 วัน
    await cleanOldBackups(backupPoolConn);

    return NextResponse.json({ 
      success: true, 
      backup_id: backupId.toString(),
      tables_count: totalTablesCount,
      total_rows: totalRows,
      size_mb: sizeMb 
    });

  } catch (error: any) {
    console.error('❌ Backup failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ฟังก์ชันลบ backups เก่า
async function cleanOldBackups(pool: mysql.Pool) {
  const [result] = await pool.execute(
    'DELETE FROM database_backups WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)'
  );

  const deletedCount = (result as any).affectedRows;
  if (deletedCount > 0) {
    console.log(`🗑️  Deleted ${deletedCount} old backups (>30 days)`);
  }
}
