import { db } from '../lib/dbAdapter';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env manually since we are running a script
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function checkSyncConfig() {
  try {
    await db.initialize();
    console.log('Checking sync_config...');
    
    // Get the first 5 rows
    const res = await db.query('SELECT id, table_name, last_sync, last_status, last_modified_time, last_checksum, last_row_count FROM sync_config LIMIT 5');
    
    console.table(res.rows);
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkSyncConfig();
