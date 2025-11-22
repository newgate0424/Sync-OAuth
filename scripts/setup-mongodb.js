// สคริปต์สำหรับตั้งค่า MongoDB indexes และสร้าง sample data
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

// อ่าน .env file
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const envFile = fs.readFileSync(envPath, 'utf8');
  const lines = envFile.split('\n');
  
  const env = {};
  lines.forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  });
  
  return env;
}

async function setupMongoDB() {
  const env = loadEnv();
  
  const MONGODB_URI = env.MONGODB_URI || env.DATABASE_USER_URL;
  
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in .env file');
    process.exit(1);
  }
  
  console.log('Connecting to MongoDB...');
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✓ Connected to MongoDB');
    
    const db = client.db('sheets_sync');
    
    // สร้าง sample folders
    const foldersCollection = db.collection('folders');
    const folderTablesCollection = db.collection('folder_tables');
    
    // ลบข้อมูลเก่า
    await foldersCollection.deleteMany({});
    await folderTablesCollection.deleteMany({});
    console.log('✓ Cleared old folders data');
    
    // สร้าง folders ตัวอย่าง
    const result = await foldersCollection.insertMany([
      { name: 'Sales', description: 'Sales data', created_at: new Date() },
      { name: 'Marketing', description: 'Marketing campaigns', created_at: new Date() },
      { name: 'Reports', description: 'Monthly reports', created_at: new Date() }
    ]);
    
    console.log(`✓ Created ${result.insertedCount} folders`);
    
    // สร้าง sample folder_tables
    const folderIds = Object.values(result.insertedIds);
    await folderTablesCollection.insertMany([
      { folder_id: folderIds[0].toString(), table_name: 'daily_sales', created_at: new Date() },
      { folder_id: folderIds[1].toString(), table_name: 'campaigns', created_at: new Date() },
      { folder_id: folderIds[2].toString(), table_name: 'monthly_report', created_at: new Date() }
    ]);
    
    console.log('✓ Created sample folder_tables');
    
    // แสดงรายการ folders
    const folders = await foldersCollection.find({}).toArray();
    console.log('\n📁 Folders:');
    folders.forEach(f => console.log(`   - ${f.name}: ${f.description}`));
    
    console.log('\n✓ MongoDB setup completed successfully!');
  } catch (error) {
    console.error('Error setting up MongoDB:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

setupMongoDB();
