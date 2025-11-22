const { MongoClient } = require('mongodb');
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

async function updateSettings() {
  // Load env vars
  const envLocalPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envLocalPath)) {
    console.error('.env.local not found');
    return;
  }

  const envConfig = parseEnv(fs.readFileSync(envLocalPath, 'utf8'));
  const mongoUri = envConfig.MONGODB_URI;
  const databaseUrl = envConfig.DATABASE_URL;

  if (!mongoUri) {
    console.error('MONGODB_URI not found in .env.local');
    return;
  }
  if (!databaseUrl) {
    console.error('DATABASE_URL not found in .env.local');
    return;
  }

  console.log('Connecting to MongoDB...');
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db(); // Uses database from URI
    const collection = db.collection('settings');

    console.log(`Updating database_connection to: ${databaseUrl}`);
    
    const result = await collection.updateOne(
      { key: 'database_connection' },
      { 
        $set: { 
          value: databaseUrl,
          dbType: 'mysql',
          updated_at: new Date()
        } 
      },
      { upsert: true }
    );

    console.log(`Update successful. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}, Upserted: ${result.upsertedId}`);

  } catch (error) {
    console.error('Error updating settings:', error);
  } finally {
    await client.close();
  }
}

updateSettings();
