const mysql = require('mysql2/promise');

async function checkSyncConfig() {
  try {
    // Use the connection string we found earlier
    const connection = await mysql.createConnection('mysql://sacom_nong:ads169thsa@103.80.48.25:3306/ADS_DB');
    console.log('Connected to MySQL');
    
    const [rows] = await connection.query('SELECT id, table_name, last_sync, last_status, last_modified_time, last_checksum, last_row_count FROM sync_config LIMIT 5');
    
    console.log('Sync Config Data:');
    console.table(rows);
    
    await connection.end();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkSyncConfig();
