// Shared sync service - เรียกได้ทั้งจาก API route และ cron โดยตรง
import { ensureDbInitialized } from './dbAdapter';
import { getGoogleSheetsClient } from './googleSheets';
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

    // 🚀 OPTIMIZATION: ตรวจสอบ checksum ก่อนเพื่อประหยัด API quota
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
    const oldCountResult = await pool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
    const oldRowCount = parseInt(oldCountResult.rows[0]?.count || 0);

    // Truncate table once
    await pool.query(`TRUNCATE TABLE "${tableName}"`);

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
    
    // If has header, fetch it first to establish schema
    if (configHasHeader) {
      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheet_id,
        range: `${config.sheet_name}!A${configStartRow}:ZZ${configStartRow}`,
      });
      const headerRows = headerResponse.data.values || [];
      if (headerRows.length > 0) {
        headers = headerRows[0];
        currentFetchRow++; // Move past header
      } else {
        throw new Error('Header row not found');
      }
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
        const values: any[] = [];
        const placeholders: string[] = [];
        
        const batchHeaders = headers.map((h: string) => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
        const columns = batchHeaders.map((k: string) => `"${k}"`).join(', ');

        rows.forEach((row) => {
          if (row.every((cell: any) => !cell)) return; // Skip empty rows

          const rowPlaceholders: string[] = [];
          batchHeaders.forEach((_, colIndex) => {
            const val = row[colIndex] || null;
            values.push(val);
            rowPlaceholders.push(`$${values.length}`);
          });
          placeholders.push(`(${rowPlaceholders.join(', ')})`);
        });

        if (placeholders.length > 0) {
          const query = `INSERT INTO "${tableName}" (${columns}) VALUES ${placeholders.join(', ')}`;
          await pool.query(query, values);
          processedRows += rows.length;
          console.log(`[Sync Service] Inserted chunk: ${rows.length} rows (Total: ${processedRows})`);
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
        throw err;
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

    await pool.query(
      `UPDATE sync_config 
       SET last_sync = NOW(), last_checksum = $1, last_row_count = $2 
       WHERE table_name = $3`,
      [newChecksum, processedRows, tableName]
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
  } catch (error) {
    console.error('[Sync Service] Failed to cleanup stuck logs:', error);
  }
}
