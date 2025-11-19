import { NextResponse } from 'next/server';
import { ensureDbInitialized } from '@/lib/dbAdapter';
import { getMongoDb } from '@/lib/mongoDb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pool = await ensureDbInitialized();
    
    // Get dbType from MongoDB settings
    const mongoDb = await getMongoDb();
    const settings = await mongoDb.collection('settings').findOne({ key: 'database_connection' });
    const dbType = settings?.dbType || 'mysql';
    
    // Get current database name
    let databaseName = 'database';
    try {
      if (dbType === 'mysql') {
        const dbNameResult = await pool.query('SELECT DATABASE() as db_name');
        databaseName = dbNameResult.rows[0]?.db_name || 'database';
      } else {
        const dbNameResult = await pool.query('SELECT current_database() as db_name');
        databaseName = dbNameResult.rows[0]?.db_name || 'database';
      }
    } catch (err) {
      console.error('Error getting database name:', err);
    }
    
    // Get all tables from current database
    let tablesQuery: string;
    if (dbType === 'mysql') {
      tablesQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
      `;
    } else {
      tablesQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `;
    }
    
    const result = await pool.query(tablesQuery);
    const tables = result.rows;
    
    // กรองตารางระบบออก (folders, folder_tables, sync_config, sync_logs, users)
    const filteredTables = tables.filter((table: any) => 
      !['folders', 'folder_tables', 'sync_config', 'sync_logs', 'users'].includes(table.table_name)
    );
    
    // Fetch row counts and sizes - ใช้ข้อมูลจาก sync_logs ล่าสุดแทน COUNT(*) เพื่อความเร็ว
    const tableInfoPromises = filteredTables.map(async (table: any) => {
      try {
        const tableName = table.table_name;
        
        // ดึงจาก sync_logs ล่าสุด (เร็วกว่า COUNT(*) มาก)
        const syncLogQuery = `
          SELECT rows_synced 
          FROM sync_logs 
          WHERE table_name = ${dbType === 'mysql' ? '?' : '$1'}
          AND status = 'success'
          ORDER BY started_at DESC 
          LIMIT 1
        `;
        const syncLogResult = await pool.query(syncLogQuery, [tableName]);
        let rowCount = syncLogResult.rows.length > 0 
          ? parseInt(syncLogResult.rows[0].rows_synced || 0)
          : 0;
        
        // Get table size and fallback row count
        let tableSize = 0;
        if (dbType === 'mysql') {
          const sizeResult = await pool.query(`
            SELECT 
              table_rows,
              data_length + index_length as size
            FROM information_schema.TABLES
            WHERE table_schema = DATABASE()
            AND table_name = ?
          `, [tableName]);
          
          tableSize = parseInt(sizeResult.rows[0]?.size || 0);
          
          // ถ้าไม่มีข้อมูลใน sync_logs ให้ใช้ค่าจาก information_schema (ค่าประมาณ)
          if (rowCount === 0) {
            rowCount = parseInt(sizeResult.rows[0]?.table_rows || 0);
          }
        } else {
          const sizeResult = await pool.query(`
            SELECT pg_total_relation_size($1) as size
          `, [tableName]);
          tableSize = parseInt(sizeResult.rows[0].size);
          
          // Fallback for Postgres
          if (rowCount === 0) {
             const countResult = await pool.query(`
               SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = $1
             `, [tableName]);
             rowCount = parseInt(countResult.rows[0]?.estimate || 0);
          }
        }
        
        return {
          name: tableName,
          rows: rowCount,
          size: formatBytes(tableSize),
        };
      } catch (err) {
        console.error(`Error fetching info for table ${table.table_name}:`, err);
        return {
          name: table.table_name,
          rows: 0,
          size: '0 B',
        };
      }
    });
    
    const tablesWithInfo = await Promise.all(tableInfoPromises);
    
    const datasets = [{
      name: databaseName,
      tables: tablesWithInfo,
      expanded: false,
    }];
    
    return NextResponse.json(datasets, {
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
