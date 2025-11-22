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
    
    // Get all tables from current database with size and row estimates in ONE query
    let tablesInfo: any[] = [];
    
    // System tables to exclude
    const systemTables = ['folders', 'folder_tables', 'sync_config', 'sync_logs', 'users', '_prisma_migrations'];
    const systemTablesSql = systemTables.map(t => `'${t}'`).join(', ');

    if (dbType === 'mysql') {
      const tablesQuery = `
        SELECT 
          table_name, 
          table_rows, 
          data_length + index_length as size
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'temp_%'
        AND table_name NOT IN (${systemTablesSql})
      `;
      const result = await pool.query(tablesQuery);
      tablesInfo = result.rows.map((row: any) => ({
        name: row.table_name,
        estimated_rows: parseInt(row.table_rows || 0),
        size: parseInt(row.size || 0)
      }));
    } else {
      try {
        // Try optimized Postgres query
        // Filter temp tables and system tables at DB level
        // Use current_schema() instead of hardcoded 'public'
        const tablesQuery = `
          SELECT 
            relname as table_name, 
            CASE WHEN reltuples < 0 THEN 0 ELSE reltuples::bigint END as table_rows,
            pg_total_relation_size(oid) as size
          FROM pg_class 
          WHERE relkind = 'r' 
          AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
          AND relname NOT LIKE 'temp_%'
          AND relname NOT IN (${systemTablesSql})
        `;
        const result = await pool.query(tablesQuery);
        tablesInfo = result.rows.map((row: any) => ({
          name: row.table_name,
          estimated_rows: parseInt(row.table_rows || 0),
          size: parseInt(row.size || 0)
        }));

        // If optimized query returns no tables, try fallback just in case (e.g. permission issues on pg_class)
        if (tablesInfo.length === 0) {
           throw new Error('No tables found via pg_class, trying information_schema');
        }
      } catch (pgError) {
        // console.error('Optimized Postgres query failed, falling back to information_schema:', pgError);
        // Fallback to standard information_schema
        const tablesQuery = `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = current_schema()
          AND table_type = 'BASE TABLE'
          AND table_name NOT LIKE 'temp_%'
          AND table_name NOT IN (${systemTablesSql})
        `;
        const result = await pool.query(tablesQuery);
        tablesInfo = result.rows.map((row: any) => ({
          name: row.table_name,
          estimated_rows: 0,
          size: 0
        }));
      }
    }
    
    // No need to filter again in JS since we did it in SQL
    const filteredTables = tablesInfo;

    // Fetch sync config for accurate row counts in ONE query
    let syncConfigs: any[] = [];
    try {
      const syncConfigResult = await pool.query('SELECT table_name, last_row_count FROM sync_config');
      syncConfigs = syncConfigResult.rows;
    } catch (e) {
      console.warn('Could not fetch sync_config, using estimates only');
    }

    // Create a map for fast lookup
    const syncConfigMap = new Map(syncConfigs.map((c: any) => [c.table_name, c.last_row_count]));

    // Merge data
    const tablesWithInfo = filteredTables.map((table: any) => {
      // Use last_row_count from sync_config if available (more accurate for synced tables)
      // Otherwise use estimated_rows from system
      const rowCount = syncConfigMap.has(table.name) 
        ? parseInt(syncConfigMap.get(table.name)) 
        : table.estimated_rows;

      return {
        name: table.name,
        rows: rowCount,
        size: formatBytes(table.size),
      };
    });
    
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
    
    // Check for connection errors
    const isConnectionError = 
      error.code === 'ETIMEDOUT' || 
      error.code === 'ECONNREFUSED' || 
      error.code === 'ENOTFOUND' || 
      error.code === '28P01' || // Auth failed (Postgres)
      error.code === 'ER_ACCESS_DENIED_ERROR'; // Auth failed (MySQL)

    if (isConnectionError) {
      return NextResponse.json({ 
        error: 'Database connection failed', 
        details: error.message,
        code: error.code,
        isConnectionError: true
      }, { status: 503 });
    }

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
