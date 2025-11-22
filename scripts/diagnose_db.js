
const { MongoClient } = require('mongodb');
const { Pool } = require('pg');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.local' }); // Try .env.local first
require('dotenv').config(); // Then .env

async function testConnections() {
  console.log('--- Diagnostic Start ---');
  
  // 1. Check Environment Variables
  console.log('Checking Environment Variables...');
  const mongoUrl = process.env.DATABASE_USER_URL;
  const dbUrl = process.env.DATABASE_URL;
  
  console.log(`DATABASE_USER_URL: ${mongoUrl ? 'Set' : 'Not Set'}`);
  console.log(`DATABASE_URL: ${dbUrl ? 'Set' : 'Not Set'}`);

  // 2. Test MongoDB Connection
  console.log('\nTesting MongoDB Connection...');
  let mongoClient;
  let sqlConnectionString = dbUrl;
  
  if (mongoUrl) {
    try {
      mongoClient = new MongoClient(mongoUrl);
      await mongoClient.connect();
      console.log('✅ MongoDB Connected Successfully');
      
      const dbName = mongoUrl.split('/')[3]?.split('?')[0] || 'user';
      const db = mongoClient.db(dbName);
      
      const settings = await db.collection('settings').findOne({ key: 'database_connection' });
      if (settings && settings.value) {
        console.log('✅ Found database_connection in MongoDB settings');
        sqlConnectionString = settings.value;
      } else {
        console.log('⚠️ database_connection NOT found in MongoDB settings');
      }
    } catch (err) {
      console.error('❌ MongoDB Connection Failed:', err.message);
    } finally {
      if (mongoClient) await mongoClient.close();
    }
  } else {
    console.log('⚠️ Skipping MongoDB test (DATABASE_USER_URL not set)');
  }

  // 3. Test SQL Database Connection
  console.log('\nTesting SQL Database Connection...');
  if (sqlConnectionString) {
    console.log(`Target SQL Connection String: ${sqlConnectionString.replace(/:[^:@]+@/, ':****@')}`); // Mask password
    
    if (sqlConnectionString.startsWith('postgres')) {
      const pool = new Pool({
        connectionString: sqlConnectionString,
        ssl: sqlConnectionString.includes('127.0.0.1') || sqlConnectionString.includes('localhost')
          ? false
          : { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });
      
      try {
        const client = await pool.connect();
        const res = await client.query('SELECT 1 as status');
        console.log('✅ PostgreSQL Connected Successfully');
        console.log('Query Result:', res.rows[0]);
        client.release();
      } catch (err) {
        console.error('❌ PostgreSQL Connection Failed:', err.message);
        console.error('Error Code:', err.code);
      } finally {
        await pool.end();
      }
    } else if (sqlConnectionString.startsWith('mysql')) {
      try {
        const connection = await mysql.createConnection(sqlConnectionString);
        const [rows] = await connection.execute('SELECT 1 as status');
        console.log('✅ MySQL Connected Successfully');
        console.log('Query Result:', rows[0]);
        await connection.end();
      } catch (err) {
        console.error('❌ MySQL Connection Failed:', err.message);
        console.error('Error Code:', err.code);
      }
    } else {
      console.error('❌ Unknown database protocol');
    }
  } else {
    console.error('❌ No SQL Connection String available (neither in env nor MongoDB)');
  }
  
  console.log('\n--- Diagnostic End ---');
}

testConnections();
