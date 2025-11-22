// Shared sync service - เรียกได้ทั้งจาก API route และ cron โดยตรง
import { ensureDbInitialized } from './dbAdapter';
import { getGoogleSheetsClient, getGoogleDriveClient } from './googleSheets';
import crypto from 'crypto';
import { parse } from 'csv-parse';
import { Readable } from 'stream';

// Helper for exponential backoff
async function fetchWithRetry<T>(
  fn: () => Promise<T>, 
  retries = 5, 
  baseDelay = 2000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (
      error.code === 429 || 
      error.code === 403 || 
      (error.message && error.message.includes('Quota exceeded')) ||
      (error.message && error.message.includes('Rate limit exceeded'))
    )) {
      const delay = baseDelay * Math.pow(2, 5 - retries);
      console.warn(`[Sync Service] ⚠️ Quota/Rate limit hit. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fn, retries - 1, baseDelay);
    }
    throw error;
  }
}

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

function columnToNumber(col: string): number {
  if (!col) return 0;
  const cleanCol = col.replace(/[^A-Z]/g, '').toUpperCase();
  let num = 0;
  for (let i = 0; i < cleanCol.length; i++) {
    num = num * 26 + (cleanCol.charCodeAt(i) - 64);
  }
  return num;
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

    // Check if sync is already running for this table
    let runningSync;
    if (pool.getDatabaseType() === 'postgresql') {
      runningSync = await pool.query(
        `SELECT id, started_at FROM sync_logs 
         WHERE table_name = $1 AND status = 'running' 
         AND started_at > NOW() - INTERVAL '10 minutes'`,
        [tableName]
      );
    } else {
      runningSync = await pool.query(
        `SELECT id, started_at FROM sync_logs 
         WHERE table_name = ? AND status = 'running' 
         AND started_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
        [tableName]
      );
    }

    if (runningSync.rows.length > 0) {
      console.log(`[Sync Service] ⚠️ Sync already running for ${tableName} (Job ID: ${runningSync.rows[0].id}), skipping.`);
      return {
        success: false,
        message: 'Sync already in progress',
        error: 'Sync already in progress'
      };
    }

    // ดึง sync config
    const configResult = await pool.query(
      `SELECT * FROM sync_config WHERE table_name = $1`,
      [tableName]
    );
    const config = configResult.rows[0];
    
    if (!config) {
      throw new Error(`Configuration not found for table: ${tableName}`);
    }

    console.log(`[Sync Service] Config loaded for ${tableName}: start_row=${config.start_row}, has_header=${config.has_header}`);

    // สร้าง log entry with complete info
    const logResult = await pool.query(
      `INSERT INTO sync_logs (status, table_name, folder_name, spreadsheet_id, sheet_name, started_at) 
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
      ['running', tableName, config.folder_name, config.spreadsheet_id, config.sheet_name]
    );
    logId = logResult.rows[0].id;
    
    const sheets = await getGoogleSheetsClient();

    // ใช้ค่า start_row และ has_header จาก config
    // Fix: Ensure types are correct and handle potential casing issues
    const rawStartRow = config.start_row !== undefined ? config.start_row : config.startRow;
    const configStartRow = parseInt(String(rawStartRow || 1));
    
    const rawHasHeader = config.has_header !== undefined ? config.has_header : config.hasHeader;
    // Handle MySQL 1/0 for boolean and string 'true'/'false'
    const configHasHeader = rawHasHeader === 1 || rawHasHeader === true || rawHasHeader === '1' || rawHasHeader === 'true';
    
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
        
        // นับจำนวนแถวโดยดึงคอลัมน์แรกเท่านั้น
        const allRowsRange = `${config.sheet_name}!A:A`;

        // Optimize: Combine Header and Row Count check into one batchGet call
        const batchCheckResponse = await fetchWithRetry(() => sheets.spreadsheets.values.batchGet({
          spreadsheetId: config.spreadsheet_id,
          ranges: [headerRange, allRowsRange],
        }));

        const headerRows = batchCheckResponse.data.valueRanges?.[0]?.values || [];
        const allRows = batchCheckResponse.data.valueRanges?.[1]?.values || [];
        
        const totalSheetRows = allRows.length;
        const currentRowCount = configHasHeader 
          ? Math.max(0, totalSheetRows - configStartRow)
          : Math.max(0, totalSheetRows - configStartRow + 1);
        const lastChecksum = config.last_checksum;
        const lastRowCount = config.last_row_count || 0;
        
        // ถ้าจำนวนแถวเท่าเดิม ให้เช็ค sample rows
        if (currentRowCount === lastRowCount && lastChecksum && currentRowCount > 0) {
          console.log(`[Sync Service] Row count unchanged (${currentRowCount}), checking sample...`);
          
          // ดึง sample: แถวแรก, กลาง, สุดท้าย
          // Fix: Calculate middle row to match calculateChecksum logic (rows[Math.floor(length/2)])
          // rows[0] is at dataStartRow.
          // rows[k] is at dataStartRow + k.
          // We want rows[Math.floor(currentRowCount / 2)].
          // So row number is dataStartRow + Math.floor(currentRowCount / 2).
          const firstRowNum = dataStartRow;
          const middleRowNum = dataStartRow + Math.floor(currentRowCount / 2);
          const lastRowNum = dataStartRow + currentRowCount - 1;
          
          // Ensure middleRowNum doesn't exceed lastRowNum (for very small datasets)
          const safeMiddleRowNum = Math.min(middleRowNum, lastRowNum);

          console.log(`[Sync Service] Sampling Rows: First=${firstRowNum}, Middle=${safeMiddleRowNum}, Last=${lastRowNum}`);
          
          const sampleRanges = [
            `${config.sheet_name}!A${firstRowNum}:ZZ${firstRowNum}`,
            `${config.sheet_name}!A${safeMiddleRowNum}:ZZ${safeMiddleRowNum}`,
            `${config.sheet_name}!A${lastRowNum}:ZZ${lastRowNum}`
          ];
          
          const sampleResponse = await fetchWithRetry(() => sheets.spreadsheets.values.batchGet({
            spreadsheetId: config.spreadsheet_id,
            ranges: sampleRanges,
          }));
          
          const sampleRows = sampleResponse.data.valueRanges?.flatMap(vr => vr.values || []) || [];
          const newChecksum = calculateChecksum([headerRows[0] || [], ...sampleRows]);
          
          console.log(`[Sync Service] Checksum Comparison: Old=${lastChecksum}, New=${newChecksum}`);

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

    // 🚀 SCALABILITY: เลือกวิธีการซิงค์
    // ถ้าแถว > 10,000 ให้ใช้ CSV Export (เร็วกว่า, ประหยัด API quota)
    // ถ้าไม่เกิน ให้ใช้ Chunked Fetching (แบบมาตรฐาน)
    
    let totalSheetRows = 0;
    try {
      const countResponse = await fetchWithRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheet_id,
        range: `${config.sheet_name}!A:A`,
      }));
      totalSheetRows = (countResponse.data.values || []).length;
    } catch (e) {
      console.warn('[Sync Service] ไม่สามารถนับจำนวนแถวได้ สันนิษฐานว่าต้องซิงค์เต็มรูปแบบ');
      totalSheetRows = 0; 
    }

    const USE_CSV_THRESHOLD = 10000;
    let processedRows = 0;
    let firstRowData: any[] = [];
    let middleRowData: any[] = [];
    let lastRowData: any[] = [];
    let oldRowCount = 0;

    // ดึงจำนวนแถวเก่าเพื่อเก็บสถิติ
    try {
      const quotedTableName = pool.quoteIdentifier(tableName);
      const countRes = await pool.query(`SELECT COUNT(*) as count FROM ${quotedTableName}`);
      oldRowCount = parseInt(countRes.rows[0].count);
    } catch (e) {
      // Table might not exist
    }

    if (totalSheetRows > USE_CSV_THRESHOLD) {
      // ---------------------------------------------------------
      // กลยุทธ์ A: ซิงค์ด้วย CSV STREAM (สำหรับข้อมูลขนาดใหญ่)
      // ---------------------------------------------------------
      const result = await syncLargeTableWithCsv(pool, config, logId!, tableName, sheets);
      processedRows = result.processedRows;
      firstRowData = result.firstRow;
      middleRowData = result.middleRow;
      lastRowData = result.lastRow;

    } else {
      // ---------------------------------------------------------
      // กลยุทธ์ B: ซิงค์แบบแบ่งส่วนมาตรฐาน (สำหรับข้อมูลขนาดเล็ก/กลาง)
      // ---------------------------------------------------------
      
      // 1. Prepare Temp Table
      const tempTableName = `temp_${tableName}_${Date.now()}`;
      const quotedTempTableName = pool.quoteIdentifier(tempTableName);
      const quotedTableName = pool.quoteIdentifier(tableName);
      
      console.log(`[Sync Service] Creating temporary table: ${tempTableName}`);
      
      try {
        if (pool.getDatabaseType() === 'postgresql') {
            await pool.query(`CREATE TABLE ${quotedTempTableName} (LIKE ${quotedTableName} INCLUDING ALL)`);
        } else {
            await pool.query(`CREATE TABLE ${quotedTempTableName} LIKE ${quotedTableName}`);
        }
      } catch (createError) {
        console.error(`[Sync Service] Failed to create temp table, falling back to direct truncate (unsafe):`, createError);
        await pool.query(`TRUNCATE TABLE ${quotedTableName}`);
      }

      // 2. Get Table Columns
      const tableColumns = await pool.getTableColumns(tableName);

      // 3. Fetch Headers
      let headers: string[] = [];
      // Fix: currentFetchRow should start exactly at configStartRow if no header, 
      // or configStartRow + 1 if there is a header.
      let currentFetchRow = configHasHeader ? configStartRow + 1 : configStartRow;

      if (configHasHeader) {
        console.log(`[Sync Service] Fetching header from row ${configStartRow}...`);
        const headerResponse = await fetchWithRetry(() => sheets.spreadsheets.values.get({
          spreadsheetId: config.spreadsheet_id,
          range: `${config.sheet_name}!A${configStartRow}:${config.end_column || 'ZZ'}${configStartRow}`,
        }));
        const headerRows = headerResponse.data.values || [];
        
        if (headerRows.length > 0) {
          headers = headerRows[0];
          // currentFetchRow is already set to configStartRow + 1 above
        } else {
          throw new Error('Header row not found');
        }
      }

      // Calculate dynamic CHUNK_SIZE for standard sync
      const PARAM_LIMIT_STD = 60000;
      const colCountStd = tableColumns.length > 0 ? tableColumns.length : 1;
      const CHUNK_SIZE = Math.floor(PARAM_LIMIT_STD / colCountStd);
      console.log(`[Sync Service] Standard Sync Batch Size: ${CHUNK_SIZE} (Columns: ${colCountStd})`);
      
      while (true) {
        const endRow = currentFetchRow + CHUNK_SIZE - 1;
        const range = `${config.sheet_name}!A${currentFetchRow}:${config.end_column || 'ZZ'}${endRow}`;
        
        console.log(`[Sync Service] Fetching chunk: ${range}`);
        
        try {
          const response = await fetchWithRetry(() => sheets.spreadsheets.values.get({
            spreadsheetId: config.spreadsheet_id,
            range: range,
            valueRenderOption: 'UNFORMATTED_VALUE',
            dateTimeRenderOption: 'FORMATTED_STRING',
          }));

          const rows = response.data.values || [];
          
          if (rows.length === 0) break;

          // Capture for checksum
          if (processedRows === 0) firstRowData = rows[0];
          lastRowData = rows[rows.length - 1];
          
          // Middle row approx
          const currentTotal = processedRows + rows.length;
          const targetMiddle = Math.floor(totalSheetRows / 2);
          if (processedRows < targetMiddle && currentTotal >= targetMiddle) {
             const midIdx = targetMiddle - processedRows;
             if (midIdx >= 0 && midIdx < rows.length) middleRowData = rows[midIdx];
          }

          // Insert Logic
          const batchHeaders = headers.length > 0 ? headers : rows[0];
          
          // Sanitize and Map Headers
          const sanitizeHeader = (h: any) => (h === null || h === undefined ? '' : String(h)).trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\u0E00-\u0E7F]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
          
          const validHeaderIndices: number[] = [];
          const validHeaders: string[] = [];
          const usedDbColumns = new Set<string>();

          // Filter out system columns to get data columns in order
          // Note: tableColumns is now guaranteed to be ordered by ordinal_position from dbAdapter
          const dataColumns = tableColumns.filter(c => c !== 'id' && c !== 'synced_at');
          
          // Determine iteration limit
          let loopLimit = batchHeaders.length;
          if (config.end_column) {
            loopLimit = columnToNumber(config.end_column);
          }

          for (let i = 0; i < loopLimit; i++) {
             const h = batchHeaders[i];
             const sanitized = sanitizeHeader(h);
             let targetCol = '';
             
             // 1. Try to match by name first (if header exists)
             if (h !== undefined && tableColumns.includes(sanitized)) {
                 targetCol = sanitized;
             } 
             // 2. Fallback to positional mapping (column_1, column_2, ...)
             else if (tableColumns.includes(`column_${i+1}`)) {
                 targetCol = `column_${i+1}`;
             }
             // 3. Fallback to positional mapping by index (for renamed columns)
             else if (i < dataColumns.length) {
                 targetCol = dataColumns[i];
             }

             if (targetCol && !usedDbColumns.has(targetCol)) {
                 validHeaderIndices.push(i);
                 validHeaders.push(targetCol);
                 usedDbColumns.add(targetCol);
             }
          }

          if (validHeaders.length === 0 && !configHasHeader) {
             // If no headers found yet and no config header, try purely positional up to limit
             for (let i = 0; i < loopLimit; i++) {
                 const generic = `column_${i+1}`;
                 if (tableColumns.includes(generic)) {
                     validHeaderIndices.push(i);
                     validHeaders.push(generic);
                 }
             }
          }

          if (validHeaders.length > 0) {
              const targetInsertTable = tempTableName || tableName;
              const validRows = rows.filter((r: any[]) => r.some((c: any) => c !== null && c !== ''));
              
              if (validRows.length > 0) {
                  const { sql } = pool.createInsertSQL(targetInsertTable, validHeaders, validRows.length);
                  const values: any[] = [];
                  validRows.forEach((row: any[]) => {
                      validHeaderIndices.forEach(idx => {
                          values.push(row[idx] === undefined ? null : row[idx]);
                      });
                  });
                  await pool.query(sql, values);
                  processedRows += validRows.length;
              }
          }

          currentFetchRow += rows.length;
          if (rows.length < CHUNK_SIZE) break;
          
          await new Promise(r => setTimeout(r, 500));

        } catch (e) {
           console.error(`[Sync Service] Error processing chunk ${range}:`, e);
           throw e;
        }
      }

      // 5. Atomic Swap
      if (tempTableName) {
          console.log(`[Sync Service] Swapping tables...`);
          await pool.transaction(async (tx: any) => {
              if (pool.getDatabaseType() === 'postgresql') {
                  await tx.query(`DROP TABLE IF EXISTS ${quotedTableName}`);
                  await tx.query(`ALTER TABLE ${quotedTempTableName} RENAME TO ${quotedTableName}`);
              } else {
                  const backupName = `backup_${tableName}_${Date.now()}`;
                  const quotedBackup = pool.quoteIdentifier(backupName);
                  await tx.query(`RENAME TABLE ${quotedTableName} TO ${quotedBackup}, ${quotedTempTableName} TO ${quotedTableName}`);
                  await tx.query(`DROP TABLE ${quotedBackup}`);
              }
          });
      }
    }

    // ---------------------------------------------------------
    // POST-SYNC LOGIC (Common)
    // ---------------------------------------------------------

    // Calculate stats
    let finalInserted = 0;
    let finalUpdated = 0;
    let finalDeleted = 0;
    
    if (processedRows > oldRowCount) {
      finalUpdated = oldRowCount;
      finalInserted = processedRows - oldRowCount;
    } else if (processedRows < oldRowCount) {
      finalUpdated = processedRows;
      finalDeleted = oldRowCount - processedRows;
    } else {
      finalUpdated = processedRows;
    }

    // Update Log
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

    // Update Checksum & Last Modified
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
       SET last_sync = NOW(), 
           last_status = 'success', 
           error_message = NULL,
           last_checksum = $1,
           last_row_count = $2,
           last_modified_time = $3
       WHERE id = $4`,
      [newChecksum, processedRows, driveModifiedTime, config.id]
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
 * Sync large table using CSV export (Optimized for > 50k rows)
 */
async function syncLargeTableWithCsv(
  pool: any,
  config: any,
  logId: number,
  tableName: string,
  sheets: any
): Promise<{ processedRows: number, firstRow: any[], middleRow: any[], lastRow: any[] }> {
  console.log(`[Sync Service] 🚀 เริ่มการซิงค์ CSV แบบเพิ่มประสิทธิภาพสำหรับ ${tableName}`);
  
  // 1. Get Sheet ID (gid)
  const spreadsheet: any = await fetchWithRetry(() => sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheet_id,
    fields: 'sheets(properties(sheetId,title))'
  }));
  
  const sheet = spreadsheet.data.sheets?.find(
    (s: any) => s.properties?.title === config.sheet_name
  );
  
  if (!sheet || !sheet.properties?.sheetId === undefined) {
    throw new Error(`Sheet "${config.sheet_name}" not found`);
  }
  
  const gid = sheet.properties.sheetId;
  
  // 2. Fetch CSV Stream
  const auth = sheets.context._options.auth;
  const exportUrl = `https://docs.google.com/spreadsheets/d/${config.spreadsheet_id}/export?format=csv&gid=${gid}`;
  
  console.log(`[Sync Service] กำลังดึงข้อมูล CSV stream จาก ${exportUrl}`);
  
  const response = await auth.request({ url: exportUrl, responseType: 'stream' });
  
  // 3. Prepare Temp Table
  const tempTableName = `temp_${tableName}_${Date.now()}`;
  const quotedTempTableName = pool.quoteIdentifier(tempTableName);
  const quotedTableName = pool.quoteIdentifier(tableName);
  
  // Create temp table like original
  if (pool.getDatabaseType() === 'postgresql') {
    await pool.query(`CREATE TABLE ${quotedTempTableName} (LIKE ${quotedTableName} INCLUDING ALL)`);
  } else {
    await pool.query(`CREATE TABLE ${quotedTempTableName} LIKE ${quotedTableName}`);
  }
  
  // 4. Stream Parse & Insert
  let processedRows = 0;
  let chunk: any[] = [];
  // const CHUNK_SIZE = 5000; // Moved to dynamic calculation below
  
  // Fix: Robust config reading
  const rawStartRow = config.start_row !== undefined ? config.start_row : config.startRow;
  const configStartRow = parseInt(String(rawStartRow || 1));
  
  const rawHasHeader = config.has_header !== undefined ? config.has_header : config.hasHeader;
  const hasHeader = rawHasHeader === 1 || rawHasHeader === true || rawHasHeader === '1' || rawHasHeader === 'true';
  
  // For checksum
  let firstRow: any[] = [];
  let middleRow: any[] = [];
  let lastRow: any[] = [];
  let allRowsForMiddle: any[] = []; // Only keep if needed, but for 1M rows this is bad. 
  // Optimization: We won't keep all rows for middle checksum. We'll just take a row around the middle estimate or skip middle checksum for CSV sync.
  // Let's just grab the first few, and update lastRow as we go.
  
  const parser = response.data.pipe(parse({
    from: hasHeader ? configStartRow + 1 : configStartRow,
    relax_quotes: true
  }));

  // Get column names from DB to map CSV columns (assuming order matches or we just insert blindly)
  // Usually CSV export follows the sheet order. We assume the DB table columns match the sheet columns order.
  // We need to handle column mapping if possible, but for now let's assume direct mapping.
  
  // Get table columns to construct INSERT statement
  let columns: string[] = [];
  if (pool.getDatabaseType() === 'postgresql') {
    const res = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = $1 ORDER BY ordinal_position
    `, [tableName]);
    columns = res.rows.map((r: any) => r.column_name).filter((c: string) => c !== 'id' && c !== 'synced_at');
  } else {
    const res = await pool.query(`SHOW COLUMNS FROM ${quotedTableName}`);
    columns = res.rows.map((r: any) => r.Field).filter((c: string) => c !== 'id' && c !== 'synced_at');
  }

  // Calculate dynamic CHUNK_SIZE based on column count to avoid Postgres parameter limit (65535)
  const PARAM_LIMIT = 60000; // Safe margin below 65535
  const colCount = columns.length > 0 ? columns.length : 1;
  const CHUNK_SIZE = Math.floor(PARAM_LIMIT / colCount);
  console.log(`[Sync] Dynamic Batch Size: ${CHUNK_SIZE} (Columns: ${colCount})`);

  const insertSql = `INSERT INTO ${quotedTempTableName} (${columns.map(c => pool.quoteIdentifier(c)).join(',')}) VALUES `;

  for await (const record of parser) {
    // Skip empty rows (which might be returned now that skip_empty_lines is false)
    if (!record || record.length === 0 || record.every((cell: any) => !cell || String(cell).trim() === '')) {
      continue;
    }

    // record is an array of strings
    chunk.push(record);
    
    // Capture rows for checksum
    if (processedRows === 0) firstRow = record;
    lastRow = record;
    
    // Simple middle row approximation (just take the 5000th row or something)
    if (processedRows === 5000) middleRow = record; 

    if (chunk.length >= CHUNK_SIZE) {
      // Insert chunk
      const placeholders = chunk.map((_, i) => 
        `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(',')})`
      ).join(',');
      
      const flatValues = chunk.flat();
      // Ensure values match column count (truncate or pad)
      // This is tricky with CSV. We assume CSV has same column count as DB (minus id/synced_at).
      
      // Fix: Map chunk values to match column count
      const normalizedChunk = chunk.map(row => {
        const newRow = [...row];
        // Pad with null if missing
        while (newRow.length < columns.length) newRow.push(null);
        // Truncate if too many
        if (newRow.length > columns.length) newRow.length = columns.length;
        return newRow;
      });
      
      const flatNormalized = normalizedChunk.flat();
      const batchPlaceholders = normalizedChunk.map((_, i) => 
        `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(',')})`
      ).join(',');

      await pool.query(`${insertSql} ${batchPlaceholders}`, flatNormalized);
      
      processedRows += chunk.length;
      chunk = [];
      
      // Update log progress
      if (logId && processedRows % 20000 === 0) {
        await pool.query(`UPDATE sync_logs SET rows_synced = $1 WHERE id = $2`, [processedRows, logId]);
        console.log(`[Sync Service] CSV Sync: ประมวลผลแล้ว ${processedRows} แถว...`);
      }
    }
  }

  // Insert remaining
  if (chunk.length > 0) {
    const normalizedChunk = chunk.map(row => {
      const newRow = [...row];
      while (newRow.length < columns.length) newRow.push(null);
      if (newRow.length > columns.length) newRow.length = columns.length;
      return newRow;
    });
    const flatNormalized = normalizedChunk.flat();
    const batchPlaceholders = normalizedChunk.map((_, i) => 
      `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(',')})`
    ).join(',');
    
    await pool.query(`${insertSql} ${batchPlaceholders}`, flatNormalized);
    processedRows += chunk.length;
  }

  // Atomic Swap
  console.log(`[Sync Service] กำลังสลับตาราง...`);
  await pool.transaction(async (tx: any) => {
    if (pool.getDatabaseType() === 'postgresql') {
      await tx.query(`DROP TABLE IF EXISTS ${quotedTableName}`);
      await tx.query(`ALTER TABLE ${quotedTempTableName} RENAME TO ${quotedTableName}`);
    } else {
      const backupTableName = `backup_${tableName}_${Date.now()}`;
      const quotedBackupTableName = pool.quoteIdentifier(backupTableName);
      await tx.query(`RENAME TABLE ${quotedTableName} TO ${quotedBackupTableName}, ${quotedTempTableName} TO ${quotedTableName}`);
      await tx.query(`DROP TABLE ${quotedBackupTableName}`);
    }
  });

  return { processedRows, firstRow, middleRow, lastRow };
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
