const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// Simple env parser
function parseEnv(content) {
  const config = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      let key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      config[key] = value;
    }
  }
  return config;
}

// Load env vars
const envLocalPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envConfig = parseEnv(fs.readFileSync(envLocalPath, 'utf8'));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

async function checkMetadataTables() {
  const url = process.env.DATABASE_URL;
  console.log(`Checking metadata tables in: ${url}`);
  
  try {
    const dbUrl = new URL(url);
    const connection = await mysql.createConnection({
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port) || 3306,
      user: dbUrl.username,
      password: decodeURIComponent(dbUrl.password),
      database: dbUrl.pathname.slice(1)
    });

    const tablesToCheck = ['sync_config', 'folder_tables', 'folders', 'users'];
    
    for (const table of tablesToCheck) {
      try {
        const [rows] = await connection.execute(`SELECT COUNT(*) as count FROM \`${table}\``);
        console.log(`✅ Table '${table}' exists. Row count: ${rows[0].count}`);
        
        if (rows[0].count > 0) {
            const [sample] = await connection.execute(`SELECT * FROM \`${table}\` LIMIT 1`);
            console.log(`   Sample data:`, sample[0]);
        }
      } catch (err) {
        console.log(`❌ Table '${table}' does NOT exist or error: ${err.message}`);
      }
    }
    
    await connection.end();
  } catch (err) {
    console.error('Connection failed:', err);
  }
}

checkMetadataTables();
