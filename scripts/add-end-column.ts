
import { ensureDbInitialized } from '../lib/dbAdapter';

async function migrate() {
  try {
    const pool = await ensureDbInitialized();
    console.log('Connected to Database');
    
    const dbType = pool.getDatabaseType();
    console.log(`Database Type: ${dbType}`);
    
    if (dbType === 'mysql') {
        try {
            await pool.query("ALTER TABLE sync_config ADD COLUMN end_column VARCHAR(10) NULL");
            console.log('Added end_column to MySQL');
        } catch (e: any) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('Column end_column already exists');
            } else {
                console.error('Error adding column:', e);
            }
        }
    } else {
        try {
            await pool.query("ALTER TABLE sync_config ADD COLUMN end_column VARCHAR(10) NULL");
            console.log('Added end_column to PostgreSQL');
        } catch (e: any) {
            if (e.code === '42701') { // duplicate_column
                 console.log('Column end_column already exists');
            } else {
                console.error('Error adding column:', e);
            }
        }
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
