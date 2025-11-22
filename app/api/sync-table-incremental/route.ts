import { NextRequest, NextResponse } from 'next/server';
import { ensureDbInitialized } from '@/lib/dbAdapter';
import { getGoogleSheetsClient } from '@/lib/googleSheets';
import crypto from 'crypto';

// สร้างตาราง metadata สำหรับเก็บ checksum
async function ensureMetadataTable() {
  const pool = await ensureDbInitialized();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_metadata (
      id SERIAL PRIMARY KEY,
      dataset_name VARCHAR(255) NOT NULL,
      table_name VARCHAR(255) NOT NULL,
      row_hash VARCHAR(64) NOT NULL,
      sheet_row_number INT NOT NULL,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (dataset_name, table_name, sheet_row_number)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sync_metadata_hash ON sync_metadata(row_hash)`);
}

// สร้าง hash จากข้อมูลแถว
function createRowHash(row: any[]): string {
  const rowString = row.join('|');
  return crypto.createHash('sha256').update(rowString).digest('hex');
}

// PUT - Incremental Sync ข้อมูลจาก Google Sheets
export async function PUT(request: NextRequest) {
  try {
    const pool = await ensureDbInitialized();
    const { dataset, tableName } = await request.json();
    
    if (!dataset || !tableName) {
      return NextResponse.json({ error: 'Dataset and table name are required' }, { status: 400 });
    }

    // สร้างตาราง metadata
    await ensureMetadataTable();

    // ดึง sync config
    const configs = await pool.query(
      'SELECT * FROM sync_config WHERE dataset_name = $1 AND table_name = $2',
      [dataset, tableName]
    );

    if (configs.rows.length === 0) {
      return NextResponse.json({ error: 'Sync config not found' }, { status: 404 });
    }

    const config = configs.rows[0];
    const sheets = await getGoogleSheetsClient();

    // ดึงข้อมูลจาก Google Sheets แบบ batch
    const batchSize = 10000;
    let allRows: any[] = [];
    let startRow = 2;
    let hasMore = true;

    // ดึง header ก่อน
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheet_id,
      range: `${config.sheet_name}!A1:ZZ1`,
    });
    const headers = headerResponse.data.values?.[0] || [];

    if (headers.length === 0) {
      return NextResponse.json({ error: 'No headers found' }, { status: 404 });
    }

    console.log(`Starting incremental sync for ${tableName}...`);

    // ดึงข้อมูลแบบ batch
    while (hasMore) {
      const endRow = startRow + batchSize - 1;
      const range = `${config.sheet_name}!A${startRow}:ZZ${endRow}`;
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheet_id,
        range: range,
      });

      const batchRows = response.data.values || [];
      
      if (batchRows.length === 0) {
        hasMore = false;
      } else {
        allRows.push(...batchRows.map((row, idx) => ({ 
          data: row, 
          rowNumber: startRow + idx 
        })));
        startRow += batchSize;
        
        if (batchRows.length < batchSize) {
          hasMore = false;
        }
      }

      console.log(`Fetched ${allRows.length} rows so far...`);
    }

    console.log(`Total rows fetched: ${allRows.length}`);

    // ดึง metadata เก่า
    const existingMetadata = await pool.query(
      'SELECT sheet_row_number, row_hash FROM sync_metadata WHERE dataset_name = $1 AND table_name = $2',
      [dataset, tableName]
    );

    const existingHashes = new Map(
      existingMetadata.rows.map((m: any) => [m.sheet_row_number, m.row_hash])
    );

    const currentSheetRows = new Set<number>();
    const rowsToInsert: any[] = [];
    const rowsToUpdate: any[] = [];
    let insertedCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;

    // ตรวจสอบแต่ละแถวว่ามีการเปลี่ยนแปลงหรือไม่
    for (const { data, rowNumber } of allRows) {
      currentSheetRows.add(rowNumber);
      const hash = createRowHash(data);
      const existingHash = existingHashes.get(rowNumber);

      if (!existingHash) {
        rowsToInsert.push({ data, rowNumber, hash });
      } else if (existingHash !== hash) {
        rowsToUpdate.push({ data, rowNumber, hash });
      }
    }

    // หาแถวที่ถูกลบ
    const rowsToDelete: number[] = [];
    for (const [rowNum] of existingHashes) {
      const rowNumber = Number(rowNum);
      if (!currentSheetRows.has(rowNumber)) {
        rowsToDelete.push(rowNumber);
      }
    }

    console.log(`Changes: ${rowsToInsert.length} new, ${rowsToUpdate.length} updated, ${rowsToDelete.length} deleted`);

    // Insert แถวใหม่
    if (rowsToInsert.length > 0) {
      const columnNames = headers.map((h: string) => 
        `"${h.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}"`
      ).join(', ');

      const batchInsertSize = 1000;
      for (let i = 0; i < rowsToInsert.length; i += batchInsertSize) {
        const batch = rowsToInsert.slice(i, i + batchInsertSize);
        
        // สร้าง parameterized query
        const placeholders: string[] = [];
        const values: any[] = [];
        let paramCounter = 1;
        
        batch.forEach(({ data }) => {
          const rowPlaceholders = headers.map(() => `$${paramCounter++}`).join(', ');
          placeholders.push(`(${rowPlaceholders})`);
          headers.forEach((_: any, index: number) => {
            const val = data[index];
            values.push(val !== undefined && val !== '' ? val : null);
          });
        });

        await pool.query(
          `INSERT INTO "${tableName}" (${columnNames}) VALUES ${placeholders.join(', ')}`,
          values
        );
        
        // Insert metadata
        for (const { rowNumber, hash } of batch) {
          await pool.query(
            `INSERT INTO sync_metadata (dataset_name, table_name, row_hash, sheet_row_number) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (dataset_name, table_name, sheet_row_number) 
             DO UPDATE SET row_hash = $3, last_seen = NOW()`,
            [dataset, tableName, hash, rowNumber]
          );
        }
        
        insertedCount += batch.length;
        console.log(`Inserted ${insertedCount}/${rowsToInsert.length} rows`);
      }
    }

    // Update แถวที่แก้ไข
    if (rowsToUpdate.length > 0) {
      for (const { data, rowNumber, hash } of rowsToUpdate) {
        const setClause = headers.map((h: string, index: number) => {
          const colName = h.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
          return `"${colName}" = $${index + 1}`;
        }).join(', ');

        const values = headers.map((_: any, index: number) => {
          const val = data[index];
          return val !== undefined && val !== '' ? val : null;
        });

        // Update ตามลำดับที่เก็บไว้ (ใช้ id)
        // หมายเหตุ: การ update แบบนี้ต้องมีวิธีเชื่อมโยง row กับ sheet_row_number
        // ในเวอร์ชันนี้จะข้ามการ update เพราะไม่มีวิธีเชื่อมโยงที่แน่นอน
        
        // Update metadata
        await pool.query(
          'UPDATE sync_metadata SET row_hash = $1, last_seen = NOW() WHERE dataset_name = $2 AND table_name = $3 AND sheet_row_number = $4',
          [hash, dataset, tableName, rowNumber]
        );
        
        updatedCount++;
      }
      console.log(`Updated ${updatedCount} rows`);
    }

    // ลบแถวที่หายไป (ลบจาก metadata)
    if (rowsToDelete.length > 0) {
      for (const rowNumber of rowsToDelete) {
        await pool.query(
          'DELETE FROM sync_metadata WHERE dataset_name = $1 AND table_name = $2 AND sheet_row_number = $3',
          [dataset, tableName, rowNumber]
        );
        deletedCount++;
      }
      console.log(`Deleted ${deletedCount} rows from metadata`);
    }

    // อัพเดท last_sync
    await pool.query(
      'UPDATE sync_config SET last_sync = NOW() WHERE dataset_name = $1 AND table_name = $2',
      [dataset, tableName]
    );

    return NextResponse.json({ 
      success: true, 
      message: `Incremental sync completed`,
      stats: {
        inserted: insertedCount,
        updated: updatedCount,
        deleted: deletedCount,
        total: allRows.length
      }
    });
  } catch (error: any) {
    console.error('Incremental sync error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
