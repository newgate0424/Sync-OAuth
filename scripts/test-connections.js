const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

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
      // Remove quotes if present
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
const envPath = path.join(__dirname, '..', '.env');

// Load .env first
if (fs.existsSync(envPath)) {
  console.log('Loading .env');
  const envConfig = parseEnv(fs.readFileSync(envPath, 'utf8'));
  console.log('Keys loaded from .env:', Object.keys(envConfig));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

// Override with .env.local
if (fs.existsSync(envLocalPath)) {
  console.log('Loading .env.local');
  const envConfig = parseEnv(fs.readFileSync(envLocalPath, 'utf8'));
  console.log('Keys loaded from .env.local:', Object.keys(envConfig));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

async function testMongo() {
  console.log('\n--- Testing MongoDB Connection ---');
  const uri = process.env.DATABASE_USER_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.log('❌ No MongoDB URI found (DATABASE_USER_URL or MONGODB_URI)');
    return;
  }
  
  // Mask password for logging
  const maskedUri = uri.replace(/:([^:@]+)@/, ':****@');
  console.log(`Connecting to: ${maskedUri}`);
  
  const client = new MongoClient(uri);
  try {
    const start = Date.now();
    await client.connect();
    const duration = Date.now() - start;
    console.log(`✅ MongoDB Connected successfully in ${duration}ms`);
    await client.db().command({ ping: 1 });
    console.log('✅ MongoDB Ping successful');
  } catch (err) {
    console.error('❌ MongoDB Connection Failed:', err.message);
  } finally {
    await client.close();
  }
}

async function testMySQL(url, label = 'Main Database') {
  console.log(`\n--- Testing MySQL Connection (${label}) ---`);
  if (!url) {
    console.log(`❌ No URL found for ${label}`);
    return;
  }

  try {
    const dbUrl = new URL(url);
    console.log(`Host: ${dbUrl.hostname}`);
    console.log(`Port: ${dbUrl.port}`);
    console.log(`Database: ${dbUrl.pathname.slice(1)}`);
    
    const start = Date.now();
    const connection = await mysql.createConnection({
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port) || 3306,
      user: dbUrl.username,
      password: decodeURIComponent(dbUrl.password),
      database: dbUrl.pathname.slice(1),
      connectTimeout: 5000 // 5s timeout
    });
    
    const duration = Date.now() - start;
    console.log(`✅ MySQL Connected successfully in ${duration}ms`);
    
    const [rows] = await connection.execute('SELECT 1 as val');
    console.log('✅ MySQL Query successful:', rows);
    
    await connection.end();
  } catch (err) {
    console.error(`❌ MySQL Connection Failed:`, err.message);
  }
}

async function run() {
  await testMongo();
  await testMySQL(process.env.DATABASE_URL, 'DATABASE_URL');
  await testMySQL(process.env.BACKUP_DATABASE_URL, 'BACKUP_DATABASE_URL');
}

run().catch(console.error);
