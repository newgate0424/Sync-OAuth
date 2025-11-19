// Shared sync service - เรียกได้ทั้งจาก API route และ cron โดยตรง
import { ensureDbInitialized } from './dbAdapter';
import { getGoogleSheetsClient, getGoogleDriveClient } from './googleSheets';
import crypto from 'crypto';

function calculateChecksum(rows: any[][]): string {
  if (rows.length === 0) return '';
  const dataToHash = JSON.stringify({
    rowCount: rows.length,
    firstRow: rows[0],
    lastRow: rows[rows.length - 1],
    middleRow: rows[Math.floor(rows.length / 2)]
  });
  return crypto.createHash('md5').update(dataToHash).digest('hex');
}

// Helper to calculate checksum from components
function calculateChecksumFromComponents(rowCount: number, firstRow: any[], middleRow: any[], lastRow: any[]): string {
  const dataToHash = JSON.stringify({
    rowCount,
    firstRow,
    lastRow,
    middleRow
  });
  return crypto.createHash('md5').update(dataToHash).digest('hex');
}

export interface SyncParams {
  dataset: string;
  tableName: string;
  forceSync?: boolean;
}

export interface SyncResult {
  success: boolean;
  message?: string;
  error?: string;
  stats?: {
    inserted: number;
    updated: number;
    deleted: number;
    total: number;
  };
}

/**
 * Core sync logic - ใช้ได้โดยตรงไม่ต้องผ่าน HTTP
 */
export async function performSync(params: SyncParams): Promise<SyncResult> {
  const { dataset, tableName, forceSync = false } = params;
  const startTime = Date.now();
  let logId: number | null = null;
  let tempTableName: string | null = null;
  let quotedTempTableName: string | null = null;

  try {
    console.log(`[Sync Service] Starting sync for table: ${tableName}`);
    
    const pool = await ensureDbInitialized();

    // ดึง sync config
    const configs = await pool.query(
      'SELECT * FROM sync_config WHERE table_name = $1',
      [tableName]
    );

    if (configs.rows.length === 0) {
      throw new Error('Sync config not found');
    }

    const config = configs.rows[0];
    
    // สร้าง log entry with complete info
    const logResult = await pool.query(
      `INSERT INTO sync_logs (status, table_name, folder_name, spreadsheet_id, sheet_name, started_at) 
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
      ['running', tableName, config.folder_name, config.spreadsheet_id, config.sheet_name]
    );
    logId = logResult.rows[0].id;
    
    const sheets = await getGoogleSheetsClient();

    // ใช้ค่า start_row และ has_header จาก config
    const configStartRow = config.start_row || 1;
    const configHasHeader = config.has_header !== undefined ? config.has_header : true;
    const dataStartRow = configHasHeader ? configStartRow + 1 : configStartRow;

    let driveModifiedTime: string | null = null;

    // 🚀 OPTIMIZATION 1: Check Google Drive Modified Time (Zero Read Quota cost for Sheet)
    if (!forceSync) {
      try {
        const drive = await getGoogleDriveClient();
        if (drive) {
          const fileMetadata = await drive.files.get({
            fileId: config.spreadsheet_id,
            fields: 'modifiedTime'
          });
          
          driveModifiedTime = fileMetadata.data.modifiedTime || null;
          const lastModifiedTime = config.last_modified_time;
          
          if (driveModifiedTime && lastModifiedTime && driveModifiedTime === lastModifiedTime) {
             console.log(`[Sync Service] ✓ File not modified since last sync (${driveModifiedTime}), skipping.`);
             
             if (logId) {
              await pool.query(
                `UPDATE sync_logs 
                 SET status = $1, completed_at = NOW(), sync_duration = 0, rows_synced = 0
                 WHERE id = $2`,
                ['skipped', logId]
              );
            }

             return {
               success: true,
               message: 'Skipped: File not modified',
               stats: { inserted: 0, updated: 0, deleted: 0, total: 0 }
             };
          }
        }
      } catch (err) {
        console.warn('[Sync Service] Failed to check Drive metadata, falling back to checksum', err);
      }
    }

    // 🚀 OPTIMIZATION 2: ตรวจสอบ checksum ก่อนเพื่อประหยัด API quota
    if (!forceSync) {
      try {
        console.log(`[Sync Service] Checking checksum for ${tableName}...`);
        
        // ดึง header range (ถ้ามี) หรือแถวแรก
        const headerRange = configHasHeader 
          ? `${config.sheet_name}!A${configStartRow}:ZZ${configStartRow}`
          : `${config.sheet_name}!A${dataStartRow}:ZZ${dataStartRow}`;
        const headerResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: config.spreadsheet_id,
          range: headerRange,
        });
        
        // นับจำนวนแถวโดยดึงคอลัมน์แรกเท่านั้น
        const allRowsRange = `${config.sheet_name}!A:A`;
        const countResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: config.spreadsheet_id,
          range: allRowsRange,
        });
        
        const totalSheetRows = (countResponse.data.values || []).length;
        const currentRowCount = configHasHeader 
          ? Math.max(0, totalSheetRows - configStartRow)
          : Math.max(0, totalSheetRows - configStartRow + 1);
        const lastChecksum = config.last_checksum;
        const lastRowCount = config.last_row_count || 0;
        
        // ถ้าจำนวนแถวเท่าเดิม ให้เช็ค sample rows
        if (currentRowCount === lastRowCount && lastChecksum && currentRowCount > 0) {
          console.log(`[Sync Service] Row count unchanged (${currentRowCount}), checking sample...`);
          
          // ดึง sample: แถวแรก, กลาง, สุดท้าย
          const firstRowNum = dataStartRow;
          const middleRowNum = Math.max(dataStartRow, Math.floor((dataStartRow + currentRowCount - 1) / 2));
          const lastRowNum = dataStartRow + currentRowCount - 1;
          
          const sampleRanges = [
            `${config.sheet_name}!A${firstRowNum}:ZZ${firstRowNum}`,
            `${config.sheet_name}!A${middleRowNum}:ZZ${middleRowNum}`,
            `${config.sheet_name}!A${lastRowNum}:ZZ${lastRowNum}`
          ];
          
          const sampleResponse = await sheets.spreadsheets.values.batchGet({
            spreadsheetId: config.spreadsheet_id,
            ranges: sampleRanges,
          });
          
          const sampleRows = sampleResponse.data.valueRanges?.flatMap(vr => vr.values || []) || [];
          const newChecksum = calculateChecksum([headerResponse.data.values?.[0] || [], ...sampleRows]);
          
          if (newChecksum === lastChecksum) {
            console.log(`[Sync Service] ✓ No changes detected, skipping sync`);
            
            // อัพเดท log - skipped
            if (logId) {
              await pool.query(
                `UPDATE sync_logs 
                 SET status = $1, completed_at = NOW(), sync_duration = 0, rows_synced = $2
                 WHERE id = $3`,
                ['skipped', currentRowCount, logId]
              );
            }
            
            return {
              success: true,
              message: 'No changes detected, sync skipped',
              stats: {
                inserted: 0,
                updated: 0,
                deleted: 0,
                total: currentRowCount
              }
            };
          } else {
            console.log(`[Sync Service] Changes detected, proceeding with full sync`);
          }
        } else {
          console.log(`[Sync Service] Row count changed (${lastRowCount} → ${currentRowCount}), syncing`);
        }
      } catch (checksumError: any) {
        console.error(`[Sync Service] Checksum error, proceeding with full sync:`, checksumError.message);
      }
    }

    // 🚀 SCALABILITY: Chunked Fetching & Streaming Insert
    // รองรับข้อมูลขนาดใหญ่ (1M+ rows) โดยการดึงและ insert ทีละส่วน
    
    // 1. Get total row count first (if not already got)
    let totalSheetRows = 0;
    try {
      const countResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheet_id,
        range: `${config.sheet_name}!A:A`,
      });
      totalSheetRows = (countResponse.data.values || []).length;
    } catch (e) {
      console.warn('[Sync Service] Failed to get total row count, will fetch until empty');
      totalSheetRows = 10000000; // Fallback large number
    }

    console.log(`[Sync Service] Total sheet rows: ${totalSheetRows}`);

    // 2. Prepare for sync
    // นับจำนวนแถวเก่าเพื่อคำนวณ inserted/updated/deleted
    // Use quoteIdentifier for table name
    const quotedTableName = pool.quoteIdentifier(tableName);
    const oldCountResult = await pool.query(`SELECT COUNT(*) as count FROM ${quotedTableName}`);
    const oldRowCount = parseInt(oldCountResult.rows[0]?.count || 0);

    // Get existing table columns to filter out unwanted columns from Sheet
    const tableColumns = await pool.getTableColumns(tableName);
    console.log(`[Sync Service] Table ${tableName} has columns:`, tableColumns);

    // 🚀 STRATEGY CHANGE: Sync to Temp Table -> Atomic Swap
    // This prevents data loss if the sync fails mid-way.
    tempTableName = `temp_${tableName}_${Date.now()}`;
    quotedTempTableName = pool.quoteIdentifier(tempTableName);
    
    console.log(`[Sync Service] Creating temporary table: ${tempTableName}`);
    
    try {
      if (pool.getDatabaseType() === 'postgresql') {
          await pool.query(`CREATE TABLE ${quotedTempTableName} (LIKE ${quotedTableName} INCLUDING ALL)`);
      } else {
          await pool.query(`CREATE TABLE ${quotedTempTableName} LIKE ${quotedTableName}`);
      }
    } catch (createError) {
      console.error(`[Sync Service] Failed to create temp table, falling back to direct truncate (unsafe):`, createError);
      // Fallback to old method if temp table creation fails (e.g. permissions)
      await pool.query(`TRUNCATE TABLE ${quotedTableName}`);
    }

    // 3. Chunk Loop
    const CHUNK_SIZE = 2500; // Safe size for Google Sheets API
    let processedRows = 0;
    let headers: string[] = [];
    let firstRowData: any[] = [];
    let middleRowData: any[] = [];
    let lastRowData: any[] = [];
    
    // Determine start row for data fetching
    // Note: We need to fetch headers first if configHasHeader is true
    let currentFetchRow = configStartRow;

    // Helper to sanitize headers
    const sanitizeHeader = (h: string) => {
        if (!h) return '';
        // 1. Trim whitespace
        let s = h.trim().toLowerCase();
        // 2. Replace spaces with _
        s = s.replace(/\s+/g, '_');
        // 3. Remove special chars (keep Thai and English)
        // \u0E00-\u0E7F is Thai range
        s = s.replace(/[^a-z0-9_\u0E00-\u0E7F]/g, '_');
        // 4. Remove duplicate/leading/trailing underscores
        s = s.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
        return s;
    };

    // Helper to count matches
    const countMatches = (candidateHeaders: string[], dbColumns: string[]) => {
        const sanitized = candidateHeaders.map(sanitizeHeader);
        let matches = 0;
        sanitized.forEach(h => {
            if (dbColumns.includes(h)) matches++;
        });
        return matches;
    };

    // If has header, fetch it first to establish schema
    if (configHasHeader) {
      console.log(`[Sync Service] Fetching header from row ${configStartRow}...`);
      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheet_id,
        range: `${config.sheet_name}!A${configStartRow}:ZZ${configStartRow}`,
      });
      const headerRows = headerResponse.data.values || [];
      
      if (headerRows.length > 0) {
        headers = headerRows[0];
        
        // 🔍 SMART HEADER DETECTION
        // Check if current headers match any DB columns
        let matchCount = countMatches(headers, tableColumns);
        console.log(`[Sync Service] Header match count at row ${configStartRow}: ${matchCount}/${tableColumns.length}`);

        // If no matches, try to find better header row
        if (matchCount === 0) {
             console.warn(`[Sync Service] ⚠️ No columns matched at row ${configStartRow}. Attempting auto-detection...`);
             
             // Try row - 1 (Common mistake: start_row=2 but header is at 1)
             if (configStartRow > 1) {
                 try {
                    const prevRow = configStartRow - 1;
                    const prevResponse = await sheets.spreadsheets.values.get({
                        spreadsheetId: config.spreadsheet_id,
                        range: `${config.sheet_name}!A${prevRow}:ZZ${prevRow}`,
                    });
                    const prevHeaders = prevResponse.data.values?.[0] || [];
                    const prevMatchCount = countMatches(prevHeaders, tableColumns);
                    
                    if (prevMatchCount > 0) {
                        console.log(`[Sync Service] ✅ Found better headers at row ${prevRow} (Matches: ${prevMatchCount}). Using this row.`);
                        headers = prevHeaders;
                        // Adjust fetch row: if header is at prevRow, data starts at prevRow + 1 = configStartRow
                        // So currentFetchRow should be configStartRow
                        // But wait, the logic below does currentFetchRow++
                        // So we need to set currentFetchRow = prevRow
                        currentFetchRow = prevRow; 
                    }
                 } catch (e) {
                     console.warn('[Sync Service] Failed to check previous row:', e);
                 }
             }
        }

        console.log(`[Sync Service] Final headers for ${tableName}:`, headers);
        
        // Validate headers - check if they look like data (e.g. numbers)
        const numericHeaders = headers.filter(h => !isNaN(Number(h)) && h.trim() !== '');
        if (numericHeaders.length > headers.length / 2) {
            console.warn(`[Sync Service] ⚠️ WARNING: Most headers look like numbers! Check 'start_row' config. Headers: ${JSON.stringify(headers)}`);
        }

        currentFetchRow++; // Move past header
        console.log(`[Sync Service] Data fetch will start from row ${currentFetchRow}`);
      } else {
        throw new Error('Header row not found');
      }
    } else {
        console.log(`[Sync Service] No header mode. Data fetch starts from row ${configStartRow}`);
    }

    // Loop through data
    while (true) {
      // Calculate range for this chunk
      // Google Sheets API is 1-based
      const endRow = currentFetchRow + CHUNK_SIZE - 1;
      const range = `${config.sheet_name}!A${currentFetchRow}:ZZ${endRow}`;
      
      console.log(`[Sync Service] Fetching chunk: ${range}`);
      
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: config.spreadsheet_id,
          range: range,
        });
        
        const rows = response.data.values || [];
        
        if (rows.length === 0) {
          console.log('[Sync Service] No more data found, finishing sync');
          break;
        }

        // If headers not set (no header mode), use first row of first chunk
        if (headers.length === 0 && rows.length > 0) {
          headers = rows[0]; // Use first row as template/headers
          // Note: In no-header mode, first row is also data, so we don't skip it
        }

        // Capture rows for checksum
        if (processedRows === 0 && rows.length > 0) {
          firstRowData = rows[0];
        }
        
        // Update last row
        if (rows.length > 0) {
          lastRowData = rows[rows.length - 1];
        }
        
        // Capture middle row (approximate)
        const currentTotal = processedRows + rows.length;
        const targetMiddle = Math.floor(totalSheetRows / 2);
        if (processedRows < targetMiddle && currentTotal >= targetMiddle) {
           const middleIndex = targetMiddle - processedRows;
           if (middleIndex >= 0 && middleIndex < rows.length) {
             middleRowData = rows[middleIndex];
           }
        }

        // Batch Insert
        const batchHeaders = headers.map(sanitizeHeader);

        // Filter headers to only include those that exist in the table
        const validHeaderIndices: number[] = [];
        const validHeaders: string[] = [];
        
        batchHeaders.forEach((header, index) => {
            if (tableColumns.includes(header)) {
                validHeaderIndices.push(index);
                validHeaders.push(header);
            }
        });
        
        if (validHeaders.length === 0) {
            const errorMsg = `[Sync Service] ⛔ CRITICAL: No matching columns found between Sheet and Table! Aborting sync to prevent data loss. Sheet Headers: ${batchHeaders.join(', ')} | Table Columns: ${tableColumns.join(', ')}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        // Use dbAdapter to generate correct SQL for the database type
        // IMPORTANT: Insert into TEMP table
        const targetInsertTable = tempTableName || tableName;
        const { sql, paramCount } = pool.createInsertSQL(targetInsertTable, validHeaders, rows.length);
        
        // Flatten values for the query
        const flatValues: any[] = [];
        rows.forEach((row) => {
          // Note: We are not filtering empty rows here to match the batch size expected by createInsertSQL
          // If we filter, we need to adjust the batch size passed to createInsertSQL
          // But for simplicity, let's assume we insert all rows or filter before calling createInsertSQL
          
          // Actually, let's filter empty rows first
        });

        const validRows = rows.filter(row => !row.every((cell: any) => !cell));
        
        if (validRows.length > 0) {
            // Re-generate SQL for valid rows count
            const { sql: insertSql } = pool.createInsertSQL(targetInsertTable, validHeaders, validRows.length);
            const insertValues: any[] = [];
            
            validRows.forEach(row => {
                validHeaderIndices.forEach(colIndex => {
                    insertValues.push(row[colIndex] || null);
                });
            });
            
            await pool.query(insertSql, insertValues);
            processedRows += validRows.length;
            console.log(`[Sync Service] Inserted chunk: ${validRows.length} rows (Total: ${processedRows})`);
        }

        // Update progress in logs (every 10k rows)
        if (logId && processedRows % 10000 === 0) {
           await pool.query(
            `UPDATE sync_logs SET rows_synced = $1 WHERE id = $2`,
            [processedRows, logId]
          );
        }

        // Move to next chunk
        currentFetchRow += rows.length;
        
        // If we got fewer rows than requested, we reached the end
        if (rows.length < CHUNK_SIZE) {
          break;
        }

        // Rate limiting protection
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err: any) {
        console.error(`[Sync Service] Error processing chunk ${range}:`, err);
        // If using temp table, we should clean it up in the main catch block
        throw err;
      }
    }

    // 4. Atomic Swap (if using temp table)
    if (tempTableName) {
        // 🛡️ SAFETY CHECK: Prevent accidental wipe
        // If we processed 0 rows, but the sheet actually has data rows, something is wrong.
        // We assume "data rows" exist if totalSheetRows > startRow
        const expectedDataStartRow = configHasHeader ? configStartRow + 1 : configStartRow;
        const sheetHasData = totalSheetRows > expectedDataStartRow;
        
        if (processedRows === 0 && oldRowCount > 0 && sheetHasData) {
             const errorMsg = `[Sync Service] 🛡️ SAFETY ABORT: Sync processed 0 rows but Sheet appears to have data (${totalSheetRows} rows). Old table had ${oldRowCount} rows. Aborting swap to prevent data loss.`;
             console.error(errorMsg);
             
             // Clean up temp table
             await pool.query(`DROP TABLE IF EXISTS ${quotedTempTableName}`);
             
             throw new Error(errorMsg);
        }

        console.log(`[Sync Service] Swapping tables (Atomic Update)...`);
        try {
            await pool.transaction(async (tx) => {
                if (pool.getDatabaseType() === 'postgresql') {
                    // Postgres: Atomic Swap via Transaction
                    await tx.query(`DROP TABLE IF EXISTS ${quotedTableName}`);
                    await tx.query(`ALTER TABLE ${quotedTempTableName} RENAME TO ${quotedTableName}`);
                } else {
                    // MySQL: Atomic Swap via RENAME TABLE
                    const backupTableName = `backup_${tableName}_${Date.now()}`;
                    const quotedBackupTableName = pool.quoteIdentifier(backupTableName);
                    
                    // Atomic swap: Real -> Backup, Temp -> Real
                    await tx.query(`RENAME TABLE ${quotedTableName} TO ${quotedBackupTableName}, ${quotedTempTableName} TO ${quotedTableName}`);
                    
                    // Drop backup
                    await tx.query(`DROP TABLE ${quotedBackupTableName}`);
                }
            });
            console.log(`[Sync Service] Table swap completed successfully.`);
        } catch (swapError: any) {
            console.error(`[Sync Service] Failed to swap tables:`, swapError);
            throw new Error(`Failed to swap tables: ${swapError.message}`);
        }
    }

    // คำนวณ inserted/updated/deleted เหมือน /api/sync-table
    let finalInserted = 0;
    let finalUpdated = 0;
    let finalDeleted = 0;
    
    if (processedRows > oldRowCount) {
      // มีแถวเพิ่มขึ้น = updated เก่า + inserted ใหม่
      finalUpdated = oldRowCount;
      finalInserted = processedRows - oldRowCount;
    } else if (processedRows < oldRowCount) {
      // แถวลดลง = updated + deleted
      finalUpdated = processedRows;
      finalDeleted = oldRowCount - processedRows;
    } else {
      // จำนวนเท่าเดิม = updated ทั้งหมด
      finalUpdated = processedRows;
    }

    // อัพเดท log - success
    if (logId) {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      await pool.query(
        `UPDATE sync_logs 
         SET status = $1, completed_at = NOW(), sync_duration = $2, 
             rows_synced = $3, rows_inserted = $4, rows_updated = $5, rows_deleted = $6
         WHERE id = $7`,
        ['success', duration, processedRows, finalInserted, finalUpdated, finalDeleted, logId]
      );
    }

    // คำนวณและบันทึก checksum สำหรับครั้งถัดไป
    const newChecksum = calculateChecksumFromComponents(
      processedRows,
      firstRowData,
      middleRowData.length > 0 ? middleRowData : (firstRowData || []),
      lastRowData
    );

    // If we didn't get modified time yet (e.g. forceSync or check failed), try to get it now for next time
    if (!driveModifiedTime) {
      try {
        const drive = await getGoogleDriveClient();
        if (drive) {
           const fileMetadata = await drive.files.get({
            fileId: config.spreadsheet_id,
            fields: 'modifiedTime'
          });
          driveModifiedTime = fileMetadata.data.modifiedTime || null;
        }
      } catch (e) {
        // Ignore error here
      }
    }

    await pool.query(
      `UPDATE sync_config 
       SET last_sync = NOW(), last_checksum = $1, last_row_count = $2, last_modified_time = $3
       WHERE table_name = $4`,
      [newChecksum, processedRows, driveModifiedTime, tableName]
    );

    console.log(`[Sync Service] ✓ Completed: ${finalInserted} inserted, ${finalUpdated} updated, ${finalDeleted} deleted`);

    return {
      success: true,
      message: 'Sync completed successfully',
      stats: {
        inserted: finalInserted,
        updated: finalUpdated,
        deleted: finalDeleted,
        total: processedRows
      }
    };

  } catch (error: any) {
    console.error('[Sync Service] Error:', error);

    // Cleanup temp table if it exists (on error)
    if (tempTableName && quotedTempTableName) {
        try {
            const pool = await ensureDbInitialized();
            console.log(`[Sync Service] 🧹 Cleaning up temp table ${tempTableName} after error...`);
            await pool.query(`DROP TABLE IF EXISTS ${quotedTempTableName}`);
        } catch (cleanupError) {
            console.error(`[Sync Service] Failed to cleanup temp table ${tempTableName}:`, cleanupError);
        }
    }

    // อัพเดท log - error
    if (logId) {
      try {
        const pool = await ensureDbInitialized();
        const duration = Math.floor((Date.now() - startTime) / 1000);
        await pool.query(
          `UPDATE sync_logs 
           SET status = $1, completed_at = NOW(), sync_duration = $2, error_message = $3
           WHERE id = $4`,
          ['error', duration, error.message, logId]
        );
      } catch (logError) {
        console.error('[Sync Service] Error updating log:', logError);
      }
    }

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Cleanup stuck sync logs in MySQL/Postgres
 * Should be called on server startup
 */
export async function cleanupStuckSyncLogs() {
  try {
    const pool = await ensureDbInitialized();
    console.log('[Sync Service] 🧹 Cleaning up stuck sync logs...');
    
    // Update logs that are 'running' and started more than 30 minutes ago
    // (Giving generous buffer for long syncs)
    const result = await pool.query(
      `UPDATE sync_logs 
       SET status = 'error', 
           error_message = 'System cleanup: Job stuck in running state',
           completed_at = NOW()
       WHERE status = 'running' 
       AND started_at < NOW() - INTERVAL '30 minutes'`
    );
    
    if ((result.rowCount || 0) > 0) {
      console.log(`[Sync Service] ✅ Cleared ${result.rowCount} stuck sync logs`);
    }

    // Cleanup old temp tables (older than 1 hour)
    // This prevents accumulation of temp tables if syncs crash hard
    try {
        const tables = await pool.query(
            pool.getDatabaseType() === 'postgresql' 
            ? `SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'temp_%'`
            : `SELECT TABLE_NAME as table_name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'temp_%'`
        );
        
        const now = Date.now();
        const ONE_HOUR = 60 * 60 * 1000;
        
        for (const row of tables.rows) {
            const tableName = row.table_name;
            // Extract timestamp from temp_TABLE_TIMESTAMP
            const parts = tableName.split('_');
            const timestampStr = parts[parts.length - 1];
            const timestamp = parseInt(timestampStr);
            
            if (!isNaN(timestamp) && (now - timestamp > ONE_HOUR)) {
                console.log(`[Sync Service] 🗑️ Dropping old temp table: ${tableName}`);
                await pool.query(`DROP TABLE IF EXISTS ${pool.quoteIdentifier(tableName)}`);
            }
        }
    } catch (cleanupError) {
        console.warn('[Sync Service] Failed to cleanup temp tables:', cleanupError);
    }

  } catch (error) {
    console.error('[Sync Service] Failed to cleanup stuck logs:', error);
  }
}
