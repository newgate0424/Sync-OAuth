const mysql = require('mysql2/promise');

const servers = [
  {
    name: 'Original DB (Main)',
    host: '147.50.228.21',
    user: 'sacom_nong',
    password: 'ads169thsa(0)', // Assuming this from previous context or similar pattern, but I'll use the one from .env if possible or just test reachability
    port: 3306
  },
  {
    name: 'Backup DB',
    host: '103.80.48.25',
    user: 'sacom_nong',
    password: 'ads169thsa',
    database: 'backup-ads169th',
    port: 3306
  }
];

async function testConnection(server) {
  console.log(`Testing connection to ${server.name} (${server.host})...`);
  try {
    const connection = await mysql.createConnection({
      host: server.host,
      port: server.port,
      user: server.user,
      password: server.password,
      database: server.database,
      connectTimeout: 5000 // 5 seconds timeout
    });
    console.log(`✅ Connected to ${server.name} successfully!`);
    await connection.end();
    return true;
  } catch (error) {
    console.log(`❌ Failed to connect to ${server.name}: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('Starting connectivity tests...');
  
  // Test Backup DB (We know credentials for this one)
  await testConnection(servers[1]);

  // Test Main DB (We might not have correct password in this script, but we can test if it's reachable at all)
  // Even with wrong password, we should get 'ER_ACCESS_DENIED_ERROR' instead of 'ETIMEDOUT' if server is up.
  // If we get ETIMEDOUT, the server is down/unreachable.
  await testConnection(servers[0]);
}

runTests();
