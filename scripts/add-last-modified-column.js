const mysql = require('mysql2/promise');

async function migrate() {
  try {
    const connection = await mysql.createConnection('mysql://sacom_nong:ads169thsa@103.80.48.25:3306/backup-ads169th');
    console.log('Connected to MySQL');
    
    // Check if column exists
    const [rows] = await connection.query("SHOW COLUMNS FROM sync_config LIKE 'last_modified_time'");
    
    if (rows.length > 0) {
      console.log('Column last_modified_time already exists.');
    } else {
      console.log('Adding column last_modified_time...');
      await connection.query('ALTER TABLE sync_config ADD COLUMN last_modified_time VARCHAR(255) NULL');
      console.log('Column added.');
    }
    await connection.end();
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

migrate();
