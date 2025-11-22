import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongoDb';

export async function GET() {
  try {
    const db = await getMongoDb();
    
    // ดึงรายชื่อ datasets ที่เก็บไว้ (จาก BigQuery sync)
    // หรือถ้ายังไม่มี ให้สร้างตัวอย่าง
    const datasetsCollection = db.collection('datasets');
    let datasets = await datasetsCollection.find({}).toArray();
    
    // ถ้ายังไม่มี datasets ให้สร้างตัวอย่าง
    if (datasets.length === 0) {
      const sampleDatasets = [
        { name: 'sales_data', description: 'Sales information', created_at: new Date() },
        { name: 'marketing_data', description: 'Marketing campaigns', created_at: new Date() },
        { name: 'analytics_data', description: 'Analytics data', created_at: new Date() }
      ];
      
      const result = await datasetsCollection.insertMany(sampleDatasets);
      datasets = await datasetsCollection.find({}).toArray();
    }
    
    return NextResponse.json({ 
      datasets: datasets.map(d => ({ 
        name: d.name, 
        description: d.description 
      })) 
    });
  } catch (error: any) {
    console.error('Error fetching datasets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch datasets', message: error.message },
      { status: 500 }
    );
  }
}
