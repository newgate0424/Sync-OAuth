import { NextRequest, NextResponse } from 'next/server';
import { ensureDbInitialized } from '@/lib/dbAdapter';
import { getMongoDb } from '@/lib/mongoDb';
import mysql from 'mysql2/promise';

export const dynamic = 'force-dynamic';

// สร้าง connection pool สำหรับ backup database
function getBackupPool() {
  const backupUrl = process.env.BACKUP_DATABASE_URL;
  if (!backupUrl) {
    throw new Error('BACKUP_DATABASE_URL is not configured in .env');
  }
  
  const url = new URL(backupUrl);
  
  return mysql.createPool({
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    waitForConnections: true,
    connectionLimit: 5,
    charset: 'utf8mb4',
  });
}

// POST - Restore backup
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { backup_id } = body;

    if (!backup_id) {
      return NextResponse.json({ error: 'backup_id is required' }, { status: 400 });
    }

    const backupPool = getBackupPool();
    const targetPool = await ensureDbInitialized();
    const dbType = targetPool.getDatabaseType();

    console.log(`🔄 Starting restore from backup ID: ${backup_id}`);

    // ดึงข้อมูล backup
    const [backupInfo] = await backupPool.execute(
      'SELECT * FROM database_backups WHERE id = ?',
      [backup_id]
    );

    if (!Array.isArray(backupInfo) || backupInfo.length === 0) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    const backup = (backupInfo as any[])[0];
    
    // ดึงข้อมูลตารางทั้งหมดจาก backup
    const [tables] = await backupPool.execute(
      'SELECT table_name, row_count, schema_data, table_data FROM backup_tables WHERE backup_id = ?',
      [backup_id]
    );

    if (!Array.isArray(tables) || tables.length === 0) {
      return NextResponse.json({ error: 'No tables found in backup' }, { status: 404 });
    }

    console.log(`📊 Found ${tables.length} tables to restore`);
    console.log(`📋 Tables in backup: ${(tables as any[]).map(t => t.table_name).join(', ')}`);

    // เช็คว่ามีตาราง folders ไหม
    const hasFolders = (tables as any[]).some(t => t.table_name.toLowerCase() === 'folders');
    const hasTables = (tables as any[]).some(t => t.table_name.toLowerCase() === 'tables');
    
    console.log(`📁 Has 'folders' table: ${hasFolders}`);
    console.log(`📊 Has 'tables' table: ${hasTables}`);

    if (!hasFolders) {
      console.warn('⚠️  WARNING: Backup does not contain folders table!');
    }

    let restoredTables = 0;
    let restoredRows = 0;
    const errors: string[] = [];

    // เรียงลำดับตาราง - restore folders ก่อนสุด แล้วค่อย tables
    const sortedTables = (tables as any[]).sort((a, b) => {
      const tableA = a.table_name.toLowerCase();
      const tableB = b.table_name.toLowerCase();
      
      // folders ต้องมาก่อนสุด
      if (tableA === 'folders') return -1;
      if (tableB === 'folders') return 1;
      
      // tables มาเป็นอันดับ 2
      if (tableA === 'tables' && tableB !== 'folders') return -1;
      if (tableB === 'tables' && tableA !== 'folders') return 1;
      
      // table_sync_logs และ sync_logs มาทีหลัง
      if ((tableA === 'table_sync_logs' || tableA === 'sync_logs') && 
          tableB !== 'folders' && tableB !== 'tables') return 1;
      if ((tableB === 'table_sync_logs' || tableB === 'sync_logs') && 
          tableA !== 'folders' && tableA !== 'tables') return -1;
      
      return 0;
    });

    console.log(`📋 Restore order: ${sortedTables.map(t => t.table_name).join(' -> ')}`);

    // Restore แต่ละตาราง
    for (const table of sortedTables) {
      try {
        const tableName = table.table_name;
        const schema = JSON.parse(table.schema_data);
        const data = JSON.parse(table.table_data);

        console.log(`\n🔄 Restoring table: ${tableName} (${data.length} rows)`);
        
        // Check if this is a MongoDB collection
        const isMongoCollection = (schema && schema.type === 'mongodb_collection') || 
                                  ['folders', 'folder_tables'].includes(tableName);

        if (isMongoCollection) {
            console.log(`   📦 Target: MongoDB Collection`);
            try {
                const mongoDb = await getMongoDb();
                const collection = mongoDb.collection(tableName);
                
                // Clear existing data
                await collection.deleteMany({});
                console.log(`   ✓ Cleared existing documents in ${tableName}`);

                if (data.length > 0) {
                    const batchSize = 100;
                    for (let i = 0; i < data.length; i += batchSize) {
                        const batch = data.slice(i, i + batchSize);
                        await collection.insertMany(batch);
                    }
                    console.log(`   ✓ Restored ${data.length} documents to MongoDB`);
                }
                restoredRows += data.length;
                restoredTables++;
                continue;
            } catch (mongoError: any) {
                console.error(`   ❌ MongoDB Restore Error: ${mongoError.message}`);
                throw mongoError;
            }
        }

        console.log(`   📦 Target: SQL Table (${dbType})`);
        
        // แสดง sample data ของ folders และ tables
        if ((tableName === 'folders' || tableName === 'tables') && data.length > 0) {
          console.log(`   Sample row:`, JSON.stringify(data[0]).substring(0, 200));
        }

        // สร้างตารางใหม่ถ้ายังไม่มี (สำหรับ MySQL)
        if (dbType === 'mysql' && schema.length > 0 && schema[0]['Create Table']) {
          try {
            // ลบตารางเดิมถ้ามี
            await targetPool.query(`DROP TABLE IF EXISTS \`${tableName}\``);
            console.log(`  ✓ Dropped existing table ${tableName}`);
            
            // สร้างตารางใหม่จาก CREATE TABLE statement
            const createTableSQL = schema[0]['Create Table'];
            await targetPool.query(createTableSQL);
            console.log(`  ✓ Created table ${tableName}`);
          } catch (error: any) {
            console.error(`  ✗ Error creating table ${tableName}:`, error.message);
            // ถ้าสร้างไม่ได้ ลองเคลียร์ข้อมูลแทน
            try {
              await targetPool.query(`DELETE FROM \`${tableName}\``);
              console.log(`  ✓ Cleared existing data in ${tableName}`);
            } catch (e) {
              console.error(`  ✗ Table ${tableName} does not exist and cannot be created`);
              continue;
            }
          }
        } else if (dbType === 'postgresql') {
          // สำหรับ PostgreSQL - สร้างตารางจาก schema columns
          try {
            await targetPool.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
            console.log(`  ✓ Dropped existing table ${tableName}`);
            
            // สร้าง CREATE TABLE จาก column definitions
            const columns = schema.map((col: any) => {
              let colDef = `"${col.column_name}" ${col.data_type}`;
              if (col.character_maximum_length) {
                colDef += `(${col.character_maximum_length})`;
              }
              if (col.is_nullable === 'NO') {
                colDef += ' NOT NULL';
              }
              return colDef;
            }).join(', ');
            
            await targetPool.query(`CREATE TABLE "${tableName}" (${columns})`);
            console.log(`  ✓ Created table ${tableName}`);
          } catch (error: any) {
            console.error(`  ✗ Error creating table ${tableName}:`, error.message);
            continue;
          }
        }

        // Insert ข้อมูลทีละ batch (100 rows ต่อครั้ง)
        if (data.length > 0) {
          const batchSize = 100;
          const columns = Object.keys(data[0]);
          
          for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            
            // สร้าง placeholders สำหรับ batch insert
            const placeholders = batch.map(() => 
              `(${columns.map(() => '?').join(', ')})`
            ).join(', ');
            
            const values: any[] = [];
            batch.forEach((row: any) => {
              columns.forEach(col => {
                values.push(row[col]);
              });
            });

            const columnNames = dbType === 'mysql' 
              ? columns.map(c => `\`${c}\``).join(', ')
              : columns.map(c => `"${c}"`).join(', ');

            const insertQuery = dbType === 'mysql'
              ? `INSERT INTO \`${tableName}\` (${columnNames}) VALUES ${placeholders}`
              : `INSERT INTO "${tableName}" (${columnNames}) VALUES ${placeholders}`;

            await targetPool.query(insertQuery, values);
          }

          restoredRows += data.length;
          console.log(`  ✓ Restored ${data.length} rows to ${tableName}`);
        }

        restoredTables++;
      } catch (error: any) {
        const errorMsg = `${table.table_name}: ${error.message}`;
        console.error(`  ✗ Error restoring table ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    await backupPool.end();

    console.log(`\n✅ Restore completed: ${restoredTables}/${tables.length} tables, ${restoredRows} rows`);
    if (errors.length > 0) {
      console.log(`⚠️  Errors (${errors.length}): ${errors.join('; ')}`);
    }

    return NextResponse.json({
      success: true,
      restored_tables: restoredTables,
      restored_rows: restoredRows,
      total_tables: tables.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Error restoring backup:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
