import { db } from '../lib/dbAdapter';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env manually since we are running a script
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function testConnection() {
  console.log('Testing DB Connection...');
  console.log('Process.env.DATABASE_URL:', process.env.DATABASE_URL);
  
  try {
    await db.initialize();
    console.log('DB Initialized.');
    
    const type = db.getDatabaseType();
    console.log('Database Type:', type);
    
    if (type === 'mysql') {
        const res = await db.query('SELECT DATABASE() as db');
        console.log('Connected to Database:', res.rows[0].db);
        
        const tables = await db.query('SHOW TABLES');
        console.log('Tables:', tables.rows.map((r: any) => Object.values(r)[0]));

        const config = await db.query('SELECT * FROM sync_config');
        console.log('Sync Config Rows:', config.rows.length);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

testConnection();
