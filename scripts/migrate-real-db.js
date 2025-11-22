const { MongoClient } = require('mongodb');
const mysql = require('mysql2/promise');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load env
const envLocalPath = path.join(__dirname, '..', '.env.local');
console.log('Loading env from:', envLocalPath);
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  content.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      let key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
} else {
    console.log('Env file not found!');
}

console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('DATABASE_USER_URL:', process.env.DATABASE_USER_URL);

async function getConnectionString() {
  let connectionString = process.env.DATABASE_URL;
  
  // Try Mongo
  if (process.env.DATABASE_USER_URL) {
    try {
      console.log('Connecting to MongoDB to check for overrides...');
      const client = new MongoClient(process.env.DATABASE_USER_URL);
      await client.connect();
      const db = client.db('sheets_sync'); // Hardcoded db name from .env.local analysis
      const settings = await db.collection('settings').findOne({ key: 'database_connection' });
      if (settings && settings.value) {
        console.log('Found database connection override in MongoDB.');
        connectionString = settings.value;
      } else {
        console.log('No override found in MongoDB.');
      }
      await client.close();
    } catch (e) {
      console.error('Error checking MongoDB:', e);
    }
  }
  
  return connectionString;
}

async function migrate() {
  const connectionString = await getConnectionString();
  console.log('Target Database URL:', connectionString.replace(/:[^:@]+@/, ':****@')); // Mask password

  if (connectionString.startsWith('mysql://')) {
    console.log('Using MySQL...');
    const connection = await mysql.createConnection(connectionString);
    
    try {
      const [rows] = await connection.query("SHOW COLUMNS FROM sync_config LIKE 'last_modified_time'");
      if (rows.length > 0) {
        console.log('Column last_modified_time already exists.');
      } else {
        console.log('Adding column last_modified_time...');
        await connection.query('ALTER TABLE sync_config ADD COLUMN last_modified_time VARCHAR(255) NULL');
        console.log('Column added.');
      }
    } catch (e) {
      console.error('MySQL Error:', e);
    } finally {
      await connection.end();
    }
  } else if (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://')) {
    console.log('Using PostgreSQL...');
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    
    try {
      const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='sync_config' AND column_name='last_modified_time'");
      if (res.rows.length > 0) {
        console.log('Column last_modified_time already exists.');
      } else {
        console.log('Adding column last_modified_time...');
        await pool.query('ALTER TABLE sync_config ADD COLUMN last_modified_time VARCHAR(255) NULL');
        console.log('Column added.');
      }
    } catch (e) {
      console.error('PostgreSQL Error:', e);
    } finally {
      await pool.end();
    }
  } else {
    console.error('Unknown database type:', connectionString);
  }
}

migrate();
