import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongoDb';
import { ObjectId } from 'mongodb';
import { performSync } from '@/lib/syncService';

// POST - รัน cron job ทันที
export async function POST(request: NextRequest) {
  try {
    console.log('[Run Job] Starting manual job execution...');
    
    const db = await getMongoDb();
    const { jobId } = await request.json();
    
    console.log('[Run Job] Job ID:', jobId);
    
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }
    
    // ดึงข้อมูล job
    const job = await db.collection('cron_jobs').findOne({ _id: new ObjectId(jobId) });
    
    if (!job) {
      console.error('[Run Job] Job not found:', jobId);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    console.log('[Run Job] Found job:', job.name, 'table:', job.table);
    
    // อัพเดทสถานะเป็น running
    await db.collection('cron_jobs').updateOne(
      { _id: new ObjectId(jobId) },
      { 
        $set: { 
          status: 'running',
          lastRun: new Date(),
          updated_at: new Date()
        }
      }
    );
    
    try {
      let result;

      if (job.table === '*') {
        // 📂 Folder Sync Logic
        console.log(`[Run Job] 📂 Executing folder sync job: ${job.name} (Folder: ${job.folder})`);
        
        // 1. Get tables in folder
        const folderDoc = await db.collection('folders').findOne({ name: job.folder });
        if (!folderDoc) {
            throw new Error(`Folder not found: ${job.folder}`);
        }
        
        // Fix: folder_id might be stored as ObjectId OR String in folder_tables
        const folderId = folderDoc._id;
        const folderIdStr = folderId.toString();
        let folderIdObj = null;
        try {
            if (ObjectId.isValid(folderIdStr)) {
                folderIdObj = new ObjectId(folderIdStr);
            }
        } catch (e) {}

        const queryIds: any[] = [folderIdStr];
        if (folderIdObj) queryIds.push(folderIdObj);
        
        const folderTables = await db.collection('folder_tables')
            .find({ folder_id: { $in: queryIds } })
            .toArray();
            
        if (folderTables.length === 0) {
            result = { success: true, message: 'No tables in folder', stats: { total: 0 } };
        } else {
            // 2. Sync with concurrency limit (Optimized)
            let successCount = 0;
            let failCount = 0;
            const totalTables = folderTables.length;
            const CONCURRENCY = 3; // Process 3 tables at a time

            for (let i = 0; i < totalTables; i += CONCURRENCY) {
                const batch = folderTables.slice(i, i + CONCURRENCY);
                console.log(`[Run Job] Processing batch ${Math.floor(i / CONCURRENCY) + 1} (${batch.length} tables)...`);
                
                const results = await Promise.all(batch.map(async (ft) => {
                    try {
                        console.log(`[Run Job] 🔄 Syncing table ${ft.table_name} in folder ${job.folder}...`);
                        const syncResult = await performSync({
                            dataset: process.env.DATABASE_NAME || 'sheets_sync',
                            tableName: ft.table_name,
                            forceSync: false // Use Smart Sync (Skip if unchanged)
                        });
                        return { success: syncResult.success, error: syncResult.error, tableName: ft.table_name };
                    } catch (err: any) {
                        return { success: false, error: err.message, tableName: ft.table_name };
                    }
                }));

                for (const res of results) {
                    if (res.success) {
                        successCount++;
                    } else {
                        failCount++;
                        console.error(`[Run Job] ✗ Failed to sync table ${res.tableName}:`, res.error);
                    }
                }
            }
            
            result = {
                success: failCount === 0,
                message: `Folder sync completed: ${successCount}/${totalTables} tables synced successfully.`,
                stats: {
                    total: totalTables,
                    success: successCount,
                    failed: failCount
                }
            };
            
            if (failCount > 0 && successCount === 0) {
                 throw new Error(`All ${totalTables} tables failed to sync.`);
            }
        }
      } else {
        // เรียก sync service โดยตรง (ไม่ใช้ HTTP fetch)
        console.log(`[Run Job] Calling sync service directly for table: ${job.table}`);
        
        result = await performSync({
          dataset: process.env.DATABASE_NAME || 'sheets_sync',
          tableName: job.table,
          forceSync: true // Force sync to match "Sync All Tables" button behavior
        });
      }
      
      if (result.success) {
        // อัพเดทสถานะเป็น success
        await db.collection('cron_jobs').updateOne(
          { _id: new ObjectId(jobId) },
          { 
            $set: { 
              status: 'success',
              lastRun: new Date(),
              updated_at: new Date()
            }
          }
        );
        
        return NextResponse.json({ 
          success: true, 
          message: 'Job executed successfully',
          data: result.stats
        });
      } else {
        throw new Error(result.error || 'Sync failed');
      }
    } catch (syncError: any) {
      console.error('[Run Job] Sync error:', syncError);
      console.error('[Run Job] Error details:', {
        message: syncError.message,
        cause: syncError.cause,
        code: syncError.code
      });
      
      // อัพเดทสถานะเป็น failed
      await db.collection('cron_jobs').updateOne(
        { _id: new ObjectId(jobId) },
        { 
          $set: { 
            status: 'failed',
            lastRun: new Date(),
            updated_at: new Date()
          }
        }
      );
      
      return NextResponse.json({ 
        success: false, 
        error: `Sync failed: ${syncError.message}` 
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[Run Job] Fatal error:', error);
    console.error('[Run Job] Error stack:', error.stack);
    
    return NextResponse.json({ 
      success: false,
      error: error.message || 'Unknown error',
      details: {
        name: error.name,
        code: error.code,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    }, { status: 500 });
  }
}
