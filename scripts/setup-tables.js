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

const sqlDefinitions = {
  users: `
    CREATE TABLE IF NOT EXISTS \`users\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`username\` VARCHAR(255) NOT NULL UNIQUE,
      \`password\` VARCHAR(255) NOT NULL,
      \`role\` ENUM('admin', 'user') DEFAULT 'user',
      \`full_name\` VARCHAR(255),
      \`is_active\` BOOLEAN DEFAULT TRUE,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `,
  folders: `
    CREATE TABLE IF NOT EXISTS \`folders\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`name\` VARCHAR(255) NOT NULL,
      \`description\` TEXT,
      \`created_by\` INT,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
    )
  `,
  folder_tables: `
    CREATE TABLE IF NOT EXISTS \`folder_tables\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`folder_id\` INT NOT NULL,
      \`table_name\` VARCHAR(255) NOT NULL,
      \`description\` TEXT,
      \`spreadsheet_url\` TEXT,
      \`sync_enabled\` BOOLEAN DEFAULT FALSE,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (\`folder_id\`) REFERENCES \`folders\`(\`id\`) ON DELETE CASCADE,
      UNIQUE KEY \`unique_folder_table\` (\`folder_id\`, \`table_name\`)
    )
  `,
  sync_config: `
    CREATE TABLE IF NOT EXISTS \`sync_config\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`table_name\` VARCHAR(255) NOT NULL UNIQUE,
      \`spreadsheet_id\` VARCHAR(255) NOT NULL,
      \`sheet_name\` VARCHAR(255) NOT NULL,
      \`folder_name\` VARCHAR(255),
      \`dataset_name\` VARCHAR(255) NOT NULL,
      \`primary_key\` VARCHAR(255),
      \`sync_type\` ENUM('full', 'incremental') DEFAULT 'full',
      \`sync_enabled\` BOOLEAN DEFAULT TRUE,
      \`last_sync\` TIMESTAMP NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `,
  sync_logs: `
    CREATE TABLE IF NOT EXISTS \`sync_logs\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`table_name\` VARCHAR(255) NOT NULL,
      \`folder_name\` VARCHAR(255),
      \`spreadsheet_id\` VARCHAR(255),
      \`sheet_name\` VARCHAR(255),
      \`status\` ENUM('running', 'success', 'error', 'skipped', 'failed') DEFAULT 'running',
      \`rows_synced\` INT DEFAULT 0,
      \`rows_inserted\` INT DEFAULT 0,
      \`rows_updated\` INT DEFAULT 0,
      \`rows_deleted\` INT DEFAULT 0,
      \`error_message\` TEXT,
      \`sync_duration\` INT,
      \`started_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`completed_at\` TIMESTAMP NULL
    )
  `
};

async function setupTables() {
  const url = process.env.DATABASE_URL;
  console.log(`Setting up tables in: ${url}`);
  
  let connection;
  try {
    const dbUrl = new URL(url);
    connection = await mysql.createConnection({
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port) || 3306,
      user: dbUrl.username,
      password: decodeURIComponent(dbUrl.password),
      database: dbUrl.pathname.slice(1)
    });

    const tableOrder = ['users', 'folders', 'folder_tables', 'sync_config', 'sync_logs'];
    
    for (const tableName of tableOrder) {
      console.log(`Creating table: ${tableName}...`);
      await connection.execute(sqlDefinitions[tableName]);
      console.log(`✅ Table ${tableName} created or already exists.`);
    }

    console.log('All tables setup successfully.');

  } catch (error) {
    console.error('Error setting up tables:', error);
  } finally {
    if (connection) await connection.end();
  }
}

setupTables();
