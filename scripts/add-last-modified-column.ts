
const { ensureDbInitialized } = require('../lib/dbAdapter');

async function migrate() {
  try {
    console.log('Starting migration to add last_modified_time to sync_config...');
    console.log('Initializing DB...');
    const db = await ensureDbInitialized();
    console.log('DB Initialized.');
    
    // Check if column exists
    try {
      await db.query('SELECT last_modified_time FROM sync_config LIMIT 1');
      console.log('Column last_modified_time already exists.');
    } catch (error) {
      console.log('Column does not exist, adding it...');
      
      // Determine DB type (hacky way or just try generic SQL)
      // MySQL and Postgres both support ALTER TABLE ADD COLUMN
      // But Postgres uses TIMESTAMP WITH TIME ZONE usually, MySQL uses TIMESTAMP or DATETIME
      // Let's use VARCHAR for simplicity to store the string from Drive API (ISO string)
      
      await db.query('ALTER TABLE sync_config ADD COLUMN last_modified_time VARCHAR(255) NULL');
      console.log('Column last_modified_time added successfully.');
    }

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    process.exit(0);
  }
}

migrate();
