import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongoDb';

// POST - เคลียร์ jobs ที่ค้าง running (มากกว่า 15 นาที)
export async function POST() {
  try {
    const db = await getMongoDb();
    
    // หา jobs ที่ running นานเกิน 10 นาที (ลดจาก 15 นาที)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const stuckJobs = await db.collection('cron_jobs')
      .find({ 
        status: 'running',
        updated_at: { $lt: tenMinutesAgo }
      })
      .toArray();
    
    // ถ้าไม่มี updated_at ให้ดูจาก created_at
    const stuckJobsNoUpdate = await db.collection('cron_jobs')
      .find({ 
        status: 'running',
        updated_at: { $exists: false },
        created_at: { $lt: tenMinutesAgo }
      })
      .toArray();
    
    const allStuckJobs = [...stuckJobs, ...stuckJobsNoUpdate];
    
    if (allStuckJobs.length === 0) {
      return NextResponse.json({ 
        message: 'No stuck jobs found',
        count: 0
      });
    }
    
    // Reset status เป็น null (idle)
    const jobIds = allStuckJobs.map(j => j._id);
    const result = await db.collection('cron_jobs').updateMany(
      { _id: { $in: jobIds } },
      { 
        $set: { 
          status: null,
          updated_at: new Date()
        }
      }
    );
    
    console.log(`[Cron] Cleared ${result.modifiedCount} stuck jobs`);
    
    return NextResponse.json({ 
      success: true,
      message: `Cleared ${result.modifiedCount} stuck jobs`,
      count: result.modifiedCount,
      jobs: allStuckJobs.map(j => ({ name: j.name, id: j._id }))
    });
  } catch (error: any) {
    console.error('Error clearing stuck jobs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
