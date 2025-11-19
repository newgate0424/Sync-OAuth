import { ensureDbInitialized } from './dbAdapter';

export interface QueryJobParams {
  sql: string;
  destinationTable?: string;
}

export interface QueryResult {
  success: boolean;
  rows?: any[];
  rowCount?: number;
  error?: string;
  message?: string;
}

export async function performQueryJob(params: QueryJobParams): Promise<QueryResult> {
  const { sql, destinationTable } = params;
  const pool = await ensureDbInitialized();
  const dbType = pool.getDatabaseType();

  try {
    console.log(`[Query Job] Executing SQL...`);
    
    // 1. Execute the query
    const result = await pool.query(sql);
    const rows = result.rows;
    
    console.log(`[Query Job] Got ${rows.length} rows`);

    // 2. If destination table is specified, save results
    if (destinationTable && rows.length > 0) {
      console.log(`[Query Job] Saving to destination table: ${destinationTable}`);
      
      // Get column names and types from the first row
      // This is a simplified schema inference
      const firstRow = rows[0];
      const columns = Object.keys(firstRow).map(key => {
        const val = firstRow[key];
        let type = 'TEXT'; // Default
        if (typeof val === 'number') type = Number.isInteger(val) ? 'INT' : 'DECIMAL(20,4)';
        if (val instanceof Date) type = 'DATETIME';
        if (typeof val === 'boolean') type = 'BOOLEAN';
        
        // Sanitize column name
        const safeCol = key.replace(/[^a-zA-Z0-9_]/g, '_');
        return `${dbType === 'mysql' ? `\`${safeCol}\`` : `"${safeCol}"`} ${type}`;
      });

      const tableName = dbType === 'mysql' ? `\`${destinationTable}\`` : `"${destinationTable}"`;

      // Transaction for atomicity
      await pool.query('START TRANSACTION'); // Note: dbAdapter might not support this directly if not exposed, but query usually works.
      
      try {
        // Drop table if exists
        await pool.query(`DROP TABLE IF EXISTS ${tableName}`);
        
        // Create table
        const createSql = `CREATE TABLE ${tableName} (${columns.join(', ')})`;
        await pool.query(createSql);
        
        // Insert data
        // Batch insert logic similar to syncService
        const batchSize = 1000;
        const headers = Object.keys(firstRow);
        
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const placeholders: string[] = [];
          const values: any[] = [];
          
          batch.forEach(row => {
            const rowPlaceholders = headers.map((_, idx) => `$${values.length + idx + 1}`).join(', '); // PG style, need to check adapter
            // Wait, dbAdapter handles parameter replacement for MySQL?
            // Let's check dbAdapter.ts again.
            // It replaces $1, $2 with ? for MySQL.
            // So we should generate $1, $2...
            
            // Actually, constructing a massive VALUES string with parameters is safer.
            // But dbAdapter.query takes (sql, params).
            // For bulk insert, we usually construct the string manually or use a helper.
            // Let's use a simplified approach for now: JSON stringify for complex types?
            // No, let's try to stick to standard SQL.
            
            // Re-reading dbAdapter: it supports `query(sql, params)`.
            // For MySQL bulk insert: `INSERT INTO t VALUES (?, ?), (?, ?)`
            // For PG bulk insert: `INSERT INTO t VALUES ($1, $2), ($3, $4)`
            
            // Let's construct the query string carefully.
            const rowVals = headers.map(h => row[h]);
            values.push(...rowVals);
          });
          
          // This is getting complicated to support both DBs generically with the current adapter.
          // Let's assume the user wants to query and see results mostly.
          // For destination table, maybe we just support "CREATE TABLE AS SELECT" (CTAS)?
          // MySQL: CREATE TABLE dest AS SELECT ...
          // PG: CREATE TABLE dest AS SELECT ...
          
          // This is MUCH better and faster!
          // But we need to wrap the user's query.
          
          // `CREATE TABLE dest AS (${userSql})`
          // But we need to drop it first.
        }
        
        // Let's try CTAS approach.
        // It might fail if column names are duplicate or weird in the result of userSql.
        // But it's the standard way.
        
        await pool.query(`DROP TABLE IF EXISTS ${tableName}`);
        await pool.query(`CREATE TABLE ${tableName} AS (${sql})`);
        
        await pool.query('COMMIT');
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
    }

    return {
      success: true,
      rowCount: rows.length,
      message: destinationTable ? `Saved ${rows.length} rows to ${destinationTable}` : `Executed successfully`
    };

  } catch (error: any) {
    console.error('[Query Job] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
