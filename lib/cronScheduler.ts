import cron from 'node-cron';
import { getMongoDb } from './mongoDb';
import { performSync, cleanupStuckSyncLogs } from './syncService';
import { performQueryJob } from './queryService';

interface CronJob {
  _id: any;
  name: string;
  folder: string;
  table: string;
  schedule: string;
  customSchedule?: string;
  startTime?: string;
  endTime?: string;
  enabled: boolean;
  type?: 'sync' | 'query';
  queryId?: string;
  sql?: string;
}

// Use global to persist across HMR (Hot Module Reload)
const globalForCron = global as typeof globalThis & {
  cronScheduler?: {
    activeCronJobs: Map<string, ReturnType<typeof cron.schedule>>;
    schedulerInitialized: boolean;
    runningJobs: Set<string>;
  };
};

if (!globalForCron.cronScheduler) {
  globalForCron.cronScheduler = {
    activeCronJobs: new Map(),
    schedulerInitialized: false,
    runningJobs: new Set(),
  };
}

const activeCronJobs = globalForCron.cronScheduler.activeCronJobs;
const runningJobs = globalForCron.cronScheduler.runningJobs;

// ตรวจสอบว่า scheduler เริ่มแล้วหรือยัง
export function isSchedulerRunning(): boolean {
  return globalForCron.cronScheduler!.schedulerInitialized;
}

// ฟังก์ชันเรียก sync API (รับประกันว่า unlock เสมอ) พร้อม timeout
async function executeSyncJob(job: CronJob) {
  const db = await getMongoDb();
  const jobId = job._id.toString();
  const startTime = new Date();
  let logId: any = null;
  
  // Timeout 10 นาที
  const TIMEOUT_MS = 10 * 60 * 1000;
  
  try {
    console.log(`[Cron] 🚀 Starting job: ${job.name} (${job.table})`);
    
    // บันทึก log เริ่มต้น
    const logResult = await db.collection('cron_logs').insertOne({
      job_id: job._id,
      job_name: job.name,
      folder: job.folder,
      table: job.table,
      schedule: job.customSchedule || job.schedule,
      status: 'running',
      started_at: startTime,
      message: `Started cron job: ${job.name}`,
      created_at: startTime
    });
    logId = logResult.insertedId;
    
    // สร้าง timeout promise
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Job timeout after 10 minutes')), TIMEOUT_MS)
    );
    
    let result: any;

    if (job.type === 'query' && job.sql) {
       console.log(`[Cron] 🔍 Executing query job: ${job.name}`);
       const queryPromise = performQueryJob({
         sql: job.sql,
         destinationTable: job.table !== 'query_result' ? job.table : undefined
       });
       result = await Promise.race([queryPromise, timeoutPromise]);
    } else {
        // เรียก sync service โดยตรง (ไม่ใช้ HTTP fetch)
        console.log(`[Cron] 🔧 Calling sync service directly for table: ${job.table}`);
        
        const syncPromise = performSync({
          dataset: process.env.DATABASE_NAME || 'sheets_sync',
          tableName: job.table,
          forceSync: false
        });
        
        // Race between sync and timeout
        result = await Promise.race([syncPromise, timeoutPromise]);
    }
    
    console.log(`[Cron] Sync result for ${job.name}:`, result);
    
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    
    if (result.success) {
      console.log(`[Cron] ✓ Job completed successfully: ${job.name} (${duration}ms)`);
      
      // อัพเดท log เป็น success
      await db.collection('cron_logs').updateOne(
        { _id: logId },
        { 
          $set: { 
            status: 'success',
            completed_at: endTime,
            duration_ms: duration,
            message: result.message || 'Job completed successfully',
            result: result.stats || result,
            updated_at: endTime
          }
        }
      );
      
      await db.collection('cron_jobs').updateOne(
        { _id: job._id },
        { 
          $set: { 
            status: 'success',
            lastRun: endTime,
            nextRun: getNextRunTime(job),
            updated_at: endTime
          }
        }
      );
    } else {
      throw new Error(result.error || 'Sync failed');
    }
  } catch (error: any) {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    
    console.error(`[Cron] ✗ Job failed: ${job.name}`, error.message);
    
    // อัพเดท log เป็น failed
    await db.collection('cron_logs').updateOne(
      { job_id: job._id, started_at: startTime },
      { 
        $set: { 
          status: 'failed',
          completed_at: endTime,
          duration_ms: duration,
          error: error.message,
          error_stack: error.stack,
          message: `Job failed: ${error.message}`,
          updated_at: endTime
        }
      }
    );
    
    await db.collection('cron_jobs').updateOne(
      { _id: job._id },
      { 
        $set: { 
          status: 'failed',
          lastRun: endTime,
          nextRun: getNextRunTime(job),
          updated_at: endTime
        }
      }
    );
  } finally {
    // ปลดล็อค job เสมอ (แม้เกิด error)
    try {
      const now = new Date();
      const currentStatus = await db.collection('cron_jobs').findOne({ _id: job._id });
      
      // ถ้า status ยังเป็น running (ไม่ได้ update เป็น success/failed) ให้ set เป็น null (idle)
      if (currentStatus?.status === 'running') {
        console.log(`[Cron] ⚠️ Unlocking stuck job: ${job.name}`);
        await db.collection('cron_jobs').updateOne(
          { _id: job._id },
          { 
            $set: { 
              status: null,
              updated_at: now,
              nextRun: getNextRunTime(job)
            }
          }
        );
        
        // อัพเดท log ถ้ามี
        if (logId) {
          await db.collection('cron_logs').updateOne(
            { _id: logId },
            {
              $set: {
                status: 'failed',
                completed_at: now,
                duration_ms: now.getTime() - startTime.getTime(),
                error: 'Job execution interrupted or timed out',
                message: 'Job execution interrupted or timed out',
                updated_at: now
              }
            }
          );
        }
      }
      
      // Remove from runningJobs set
      runningJobs.delete(jobId);
    } catch (unlockError) {
      console.error(`[Cron] Error unlocking job ${job.name}:`, unlockError);
    }
  }
}

// คำนวณเวลา next run
function getNextRunTime(job: CronJob): Date {
  const schedule = job.customSchedule || job.schedule;
  const now = new Date();
  
  // Parse cron expression แบบง่ายๆ สำหรับ 6 parts (seconds minute hour day month dayOfWeek)
  if (schedule.startsWith('*/') && schedule.endsWith('* * * * *')) {
    // Pattern: */X * * * * * (Every X seconds)
    const seconds = parseInt(schedule.split(' ')[0].replace('*/', '')) || 30;
    now.setSeconds(now.getSeconds() + seconds);
  } else if (schedule.startsWith('0 */') && schedule.endsWith('* * * *')) {
    // Pattern: 0 */X * * * * (Every X minutes)
    const minutes = parseInt(schedule.split(' ')[1].replace('*/', '')) || 5;
    now.setSeconds(0);
    now.setMinutes(now.getMinutes() + minutes);
  } else if (schedule === '0 * * * * *') {
    // ทุก 1 นาที
    now.setSeconds(0);
    now.setMinutes(now.getMinutes() + 1);
  } else if (schedule === '0 0 * * * *') {
    // ทุก 1 ชั่วโมง
    now.setSeconds(0);
    now.setMinutes(0);
    now.setHours(now.getHours() + 1);
  } else {
    // Default fallback
    try {
      // Try to use cron-parser if available, or just add 5 minutes
      now.setMinutes(now.getMinutes() + 5);
    } catch (e) {
      now.setMinutes(now.getMinutes() + 5);
    }
  }
  
  return now;
}

// ตรวจสอบว่าอยู่ในช่วงเวลาที่กำหนดหรือไม่
function isWithinTimeRange(job: CronJob): boolean {
  if (!job.startTime || !job.endTime) return true;
  
  // Convert current time to Bangkok time (GMT+7)
  const now = new Date();
  const bangkokDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const currentTime = `${String(bangkokDate.getHours()).padStart(2, '0')}:${String(bangkokDate.getMinutes()).padStart(2, '0')}`;
  
  const start = job.startTime;
  const end = job.endTime;
  
  // ถ้า end < start แปลว่าข้ามวัน (เช่น 22:00 - 02:00)
  if (end < start) {
    return currentTime >= start || currentTime <= end;
  } else {
    return currentTime >= start && currentTime <= end;
  }
}

// โหลดและเริ่ม cron jobs
export async function initializeCronJobs() {
  // ป้องกัน duplicate initialization
  if (globalForCron.cronScheduler!.schedulerInitialized) {
    console.log('[Cron] Scheduler already initialized, skipping...');
    return;
  }
  
  try {
    globalForCron.cronScheduler!.schedulerInitialized = true;
    const db = await getMongoDb();

    // 🧹 CLEANUP: Reset jobs that are marked as 'running' on startup
    // This fixes the issue where jobs remain 'running' after a server restart/crash
    console.log('[Cron] 🧹 Cleaning up stale running jobs on startup...');
    
    // 1. Cleanup MongoDB Cron Jobs
    const cleanupResult = await db.collection('cron_jobs').updateMany(
      { status: 'running' },
      { 
        $set: { 
          status: null, 
          updated_at: new Date(),
          message: 'Reset by system startup' 
        } 
      }
    );
    if (cleanupResult.modifiedCount > 0) {
      console.log(`[Cron] ✅ Reset ${cleanupResult.modifiedCount} stuck cron jobs to idle`);
    }

    // 2. Cleanup MySQL Sync Logs
    await cleanupStuckSyncLogs();

    // 🔄 SELF-HEALING: Add a background task to clear stuck jobs every minute
    // This ensures we don't rely on the frontend to clear stuck jobs
    if (!activeCronJobs.has('system-cleanup')) {
      console.log('[Cron] 🛡️ Starting system self-healing task...');
      const cleanupTask = cron.schedule('* * * * *', async () => {
        try {
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
          const stuckResult = await db.collection('cron_jobs').updateMany(
            { 
              status: 'running',
              updated_at: { $lt: tenMinutesAgo }
            },
            { 
              $set: { 
                status: null, 
                updated_at: new Date(),
                message: 'Reset by system self-healing'
              } 
            }
          );
          if (stuckResult.modifiedCount > 0) {
            console.log(`[Cron] 🛡️ Self-healing: Cleared ${stuckResult.modifiedCount} stuck jobs`);
          }
          
          // Also cleanup MySQL logs periodically
          await cleanupStuckSyncLogs();
        } catch (err) {
          console.error('[Cron] Self-healing error:', err);
        }
      });
      activeCronJobs.set('system-cleanup', cleanupTask);
    }

    // 💾 SYSTEM BACKUP: Daily backup at 2:00 AM
    if (!activeCronJobs.has('system-backup')) {
      console.log('[Cron] 💾 Starting system backup task (Daily at 2:00 AM)...');
      const backupTask = cron.schedule('0 2 * * *', async () => {
        try {
          const { performBackup } = await import('./backupService');
          console.log('[Cron] 💾 Starting scheduled backup...');
          await performBackup();
        } catch (err) {
          console.error('[Cron] Backup error:', err);
        }
      });
      activeCronJobs.set('system-backup', backupTask);
    }

    const jobs = await db.collection('cron_jobs').find({ enabled: true }).toArray() as CronJob[];
    
    console.log(`[Cron] Initializing ${jobs.length} cron jobs...`);
    
    for (const job of jobs) {
      const jobId = job._id.toString();
      const schedule = job.customSchedule || job.schedule;
      
      // ถ้ามี job อยู่แล้ว ให้หยุดก่อน
      if (activeCronJobs.has(jobId)) {
        activeCronJobs.get(jobId)?.stop();
      }
      
      // สร้าง cron task ใหม่
      console.log(`[Cron] Creating task for ${job.name} with schedule: ${schedule}`);
      
      const task = cron.schedule(schedule, async () => {
        const lockKey = jobId;
        
        try {
          // ตรวจสอบว่า job กำลังรันอยู่หรือไม่
          if (runningJobs.has(lockKey)) {
            console.log(`[Cron] ⏭️ Skipping ${job.name} - already running`);
            return;
          }
          
          console.log(`[Cron] ⏰ Executing scheduled job: ${job.name} at ${new Date().toISOString()}`);
          
          // ดึงข้อมูล job ล่าสุดจาก database
          const db = await getMongoDb();
          
          // ใช้ findOneAndUpdate เพื่อ atomic lock (ถ้า status ไม่ใช่ running ถึงจะอัพเดทได้)
          const lockResult = await db.collection('cron_jobs').findOneAndUpdate(
            { 
              _id: job._id,
              enabled: true,
              status: { $ne: 'running' } // อัพเดทได้ก็ต่อเมื่อ status ไม่ใช่ running
            },
            {
              $set: {
                status: 'running',
                lastRun: new Date(),
                updated_at: new Date()
              }
            },
            { returnDocument: 'after' }
          );
          
          // ถ้า lock ไม่ได้ (job กำลังรันอยู่แล้ว) ให้ skip
          if (!lockResult) {
            console.log(`[Cron] ⏭️ Skipping ${job.name} - already running or disabled`);
            return;
          }
          
          const latestJob = lockResult as unknown as CronJob;
          
          // Lock job in memory
          runningJobs.add(lockKey);
          
          try {
            // ตรวจสอบว่าอยู่ในช่วงเวลาที่กำหนดหรือไม่
            if (isWithinTimeRange(latestJob)) {
              await executeSyncJob(latestJob);
            } else {
              console.log(`[Cron] Job ${latestJob.name} is outside time range, skipping...`);
              // ถ้าไม่ได้รัน ต้อง unlock database ด้วย
              const db = await getMongoDb();
              await db.collection('cron_jobs').updateOne(
                { _id: latestJob._id },
                { 
                  $set: { 
                    status: 'skipped',
                    nextRun: getNextRunTime(latestJob),
                    updated_at: new Date()
                  }
                }
              );
            }
          } finally {
            // Unlock job in memory
            runningJobs.delete(lockKey);
          }
        } catch (error: any) {
          console.error(`[Cron] ✗✗✗ Fatal error in cron callback for ${job.name}:`, error);
          
          // Ensure unlock on error and update status to failed
          try {
            const db = await getMongoDb();
            await db.collection('cron_jobs').updateOne(
              { _id: job._id },
              { 
                $set: { 
                  status: 'failed',
                  updated_at: new Date()
                }
              }
            );
          } catch (dbError) {
            console.error(`[Cron] Failed to update status for failed job ${job.name}:`, dbError);
          }
          
          runningJobs.delete(lockKey);
        }
      });
      
      activeCronJobs.set(jobId, task);
      console.log(`[Cron] ✓ Scheduled: ${job.name} - ${schedule}`);
      
      // อัพเดท nextRun
      await db.collection('cron_jobs').updateOne(
        { _id: job._id },
        { 
          $set: { 
            nextRun: getNextRunTime(job),
            updated_at: new Date()
          }
        }
      );
    }
    
    console.log(`[Cron] All jobs initialized successfully`);
  } catch (error) {
    console.error('[Cron] Error initializing cron jobs:', error);
  }
}

// หยุด cron job
export function stopCronJob(jobId: string) {
  const task = activeCronJobs.get(jobId);
  if (task) {
    task.stop();
    activeCronJobs.delete(jobId);
    console.log(`[Cron] Stopped job: ${jobId}`);
  }
}

// รีโหลด cron jobs (เรียกเมื่อมีการเปลี่ยนแปลง)
export async function reloadCronJobs() {
  console.log('[Cron] Reloading cron jobs...');
  
  // หยุด jobs ทั้งหมด
  activeCronJobs.forEach(task => task.stop());
  activeCronJobs.clear();
  
  // Reset flag เพื่ออนุญาตให้ reload
  globalForCron.cronScheduler!.schedulerInitialized = false;
  
  // โหลดใหม่
  await initializeCronJobs();
}
