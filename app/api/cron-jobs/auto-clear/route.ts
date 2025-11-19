import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongoDb';

// GET - ตรวจสอบและเคลียร์ jobs ที่ค้างอัตโนมัติ
export async function GET() {
  try {
    const db = await getMongoDb();
    
    // หา jobs ที่ running นานเกิน 10 นาที (ลดจาก 15 นาที)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    // ตรวจสอบ jobs ที่มี updated_at
    const stuckJobs = await db.collection('cron_jobs')
      .find({ 
        status: 'running',
        updated_at: { $lt: tenMinutesAgo }
      })
      .toArray();
    
    // ตรวจสอบ jobs ที่ไม่มี updated_at (ดูจาก created_at)
    const stuckJobsNoUpdate = await db.collection('cron_jobs')
      .find({ 
        status: 'running',
        updated_at: { $exists: false },
        created_at: { $lt: tenMinutesAgo }
      })
      .toArray();
    
    const allStuckJobs = [...stuckJobs, ...stuckJobsNoUpdate];
    
    if (allStuckJobs.length > 0) {
      console.log(`[Auto-Clear] Found ${allStuckJobs.length} stuck jobs, clearing...`);
      
      const jobIds = allStuckJobs.map(j => j._id);
      await db.collection('cron_jobs').updateMany(
        { _id: { $in: jobIds } },
        { 
          $set: { 
            status: null,
            updated_at: new Date()
          }
        }
      );
      
      return NextResponse.json({ 
        cleared: true,
        count: allStuckJobs.length,
        jobs: allStuckJobs.map(j => j.name)
      });
    }
    
    return NextResponse.json({ 
      cleared: false,
      count: 0,
      message: 'No stuck jobs found'
    });
  } catch (error: any) {
    console.error('[Auto-Clear] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
