// Script สำหรับสร้าง indexes ใน MongoDB เพื่อเพิ่มประสิทธิภาพ
// รันด้วย: node scripts/create-indexes.js

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://data-ads.jxyonoc.mongodb.net:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'sheets_sync';

async function createIndexes() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(MONGODB_DB);
    
    // Create indexes for folders collection
    console.log('Creating indexes for folders...');
    await db.collection('folders').createIndex({ name: 1 }, { unique: true });
    
    // Create indexes for folder_tables collection
    console.log('Creating indexes for folder_tables...');
    await db.collection('folder_tables').createIndex({ folder_id: 1 });
    await db.collection('folder_tables').createIndex({ table_name: 1 });
    
    console.log('✓ All indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
  } finally {
    await client.close();
  }
}

createIndexes();
