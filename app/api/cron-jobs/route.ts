import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongoDb';
import { ObjectId } from 'mongodb';
import { initializeCronJobs, isSchedulerRunning } from '@/lib/cronScheduler';

// GET - ดึง cron jobs ทั้งหมด
export async function GET() {
  try {
    // Auto-start scheduler ถ้ายังไม่ได้เริ่ม
    if (!isSchedulerRunning()) {
      console.log('[Cron API] Auto-starting scheduler...');
      // เริ่มใน background ไม่รอ
      initializeCronJobs().catch(err => 
        console.error('[Cron API] Failed to auto-start scheduler:', err)
      );
    }
    
    const db = await getMongoDb();
    const jobs = await db.collection('cron_jobs')
      .find({})
      .sort({ created_at: -1 })
      .toArray();
    
    return NextResponse.json({ 
      jobs: jobs.map(j => ({ 
        ...j, 
        id: j._id.toString(),
        _id: undefined 
      }))
    }, {
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

// POST - สร้าง cron job ใหม่
export async function POST(request: NextRequest) {
  try {
    const db = await getMongoDb();
    const { name, folder, table, schedule, customSchedule, startTime, endTime, type, queryId, sql } = await request.json();
    
    if (!name || !schedule) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // If queryId is provided, check if a job already exists
    if (queryId) {
      const existingJob = await db.collection('cron_jobs').findOne({ queryId });
      if (existingJob) {
        // Update existing job
        await db.collection('cron_jobs').updateOne(
          { _id: existingJob._id },
          { 
            $set: {
              name,
              folder: folder || 'system',
              table: table || 'query_result',
              schedule,
              customSchedule: customSchedule || null,
              startTime: startTime || null,
              endTime: endTime || null,
              type: type || 'sync',
              sql: sql || null,
              updated_at: new Date()
            }
          }
        );
        
        // Reload cron scheduler
        try {
          const { reloadCronJobs } = await import('@/lib/cronScheduler');
          await reloadCronJobs();
        } catch (error) {
          console.log('Cron scheduler not available in development mode');
        }

        return NextResponse.json({ 
          success: true, 
          job: { ...existingJob, id: existingJob._id.toString(), updated: true }
        });
      }
    }

    const newJob = {
      name,
      folder: folder || 'system',
      table: table || 'query_result',
      schedule,
      customSchedule: customSchedule || null,
      startTime: startTime || null,
      endTime: endTime || null,
      type: type || 'sync',
      queryId: queryId || null,
      sql: sql || null,
      enabled: true,
      status: 'pending',
      lastRun: null,
      nextRun: null,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    const result = await db.collection('cron_jobs').insertOne(newJob);
    
    // Reload cron scheduler
    try {
      const { reloadCronJobs } = await import('@/lib/cronScheduler');
      await reloadCronJobs();
    } catch (error) {
      console.log('Cron scheduler not available in development mode');
    }
    
    return NextResponse.json({ 
      success: true, 
      job: { ...newJob, id: result.insertedId.toString() }
    });
  } catch (error: any) {
    console.error('Database error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - อัพเดท cron job
export async function PUT(request: NextRequest) {
  try {
    const db = await getMongoDb();
    const { jobId, name, folder, table, schedule, customSchedule, startTime, endTime, enabled, type, queryId, sql } = await request.json();
    
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }
    
    const updateData: any = {
      updated_at: new Date()
    };
    
    if (name) updateData.name = name;
    if (folder) updateData.folder = folder;
    if (table) updateData.table = table;
    if (schedule) updateData.schedule = schedule;
    if (customSchedule !== undefined) updateData.customSchedule = customSchedule;
    if (startTime !== undefined) updateData.startTime = startTime;
    if (endTime !== undefined) updateData.endTime = endTime;
    if (enabled !== undefined) updateData.enabled = enabled;
    if (type) updateData.type = type;
    if (queryId) updateData.queryId = queryId;
    if (sql) updateData.sql = sql;
    
    const result = await db.collection('cron_jobs').updateOne(
      { _id: new ObjectId(jobId) },
      { $set: updateData }
    );
    
    // Reload cron scheduler
    try {
      const { reloadCronJobs } = await import('@/lib/cronScheduler');
      await reloadCronJobs();
    } catch (error) {
      console.log('Cron scheduler not available in development mode');
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Database error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - ลบ cron job
export async function DELETE(request: NextRequest) {
  try {
    const db = await getMongoDb();
    const { jobId, queryId } = await request.json();
    
    if (!jobId && !queryId) {
      return NextResponse.json({ error: 'Job ID or Query ID is required' }, { status: 400 });
    }
    
    let filter = {};
    if (jobId) {
        filter = { _id: new ObjectId(jobId) };
    } else if (queryId) {
        filter = { queryId: queryId };
    }

    // Find job first to get ID for stopping
    const job = await db.collection('cron_jobs').findOne(filter);
    
    if (job) {
        await db.collection('cron_jobs').deleteOne({ _id: job._id });
        
        // Stop and reload cron scheduler
        try {
          const { stopCronJob, reloadCronJobs } = await import('@/lib/cronScheduler');
          stopCronJob(job._id.toString());
          await reloadCronJobs();
        } catch (error) {
          console.log('Cron scheduler not available in development mode');
        }
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Database error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
