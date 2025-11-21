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
const envLocalPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envConfig = parseEnv(fs.readFileSync(envLocalPath, 'utf8'));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

async function checkColumns() {
  try {
    const url = process.env.DATABASE_URL || 'mysql://sacom_nong:ads169thsa@103.80.48.25:3306/backup-ads169th';
    const dbUrl = new URL(url);
    const connection = await mysql.createConnection({
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port) || 3306,
      user: dbUrl.username,
      password: decodeURIComponent(dbUrl.password),
      database: dbUrl.pathname.slice(1)
    });

    console.log('Connected to MySQL');
    const [rows] = await connection.query("SHOW DATABASES");
    console.log('Databases:');
    rows.forEach(row => console.log(`- ${row.Database}`));
    await connection.end();
  } catch (err) {
    console.error('Error:', err);
  }
}

checkColumns();
