const mysql = require('mysql2/promise');

async function migrate() {
  try {
    const connection = await mysql.createConnection('mysql://sacom_nong:ads169thsa@103.80.48.25:3306/ADS_DB');
    console.log('Connected to MySQL');
    
    const columnsToAdd = [
      { name: 'last_status', type: "ENUM('success', 'error', 'skipped') DEFAULT NULL" },
      { name: 'error_message', type: "TEXT DEFAULT NULL" },
      { name: 'last_checksum', type: "VARCHAR(255) DEFAULT NULL" },
      { name: 'last_row_count', type: "INT DEFAULT 0" },
      { name: 'last_modified_time', type: "VARCHAR(255) DEFAULT NULL" }
    ];

    for (const col of columnsToAdd) {
      const [rows] = await connection.query(`SHOW COLUMNS FROM sync_config LIKE '${col.name}'`);
      if (rows.length > 0) {
        console.log(`Column ${col.name} already exists.`);
      } else {
        console.log(`Adding column ${col.name}...`);
        await connection.query(`ALTER TABLE sync_config ADD COLUMN ${col.name} ${col.type}`);
        console.log(`Column ${col.name} added.`);
      }
    }

    await connection.end();
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

migrate();
