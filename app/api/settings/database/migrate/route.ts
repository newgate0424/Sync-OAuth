import { NextRequest, NextResponse } from 'next/server';
import DatabaseAdapter from '@/lib/dbAdapter';

// ฟังก์ชันสร้าง SQL สำหรับแต่ละตาราง
function getCreateTableSQL(tableName: string, dbType: 'mysql' | 'postgresql'): string {
  const isPostgres = dbType === 'postgresql';
  
  const tables: Record<string, { postgres: string; mysql: string }> = {
    users: {
      postgres: `
        CREATE TABLE IF NOT EXISTS "users" (
          "id" SERIAL PRIMARY KEY,
          "username" VARCHAR(255) NOT NULL UNIQUE,
          "password" VARCHAR(255) NOT NULL,
          "role" VARCHAR(20) DEFAULT 'user',
          "full_name" VARCHAR(255),
          "is_active" BOOLEAN DEFAULT TRUE,
          "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      mysql: `
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
      `
    },
    folders: {
      postgres: `
        CREATE TABLE IF NOT EXISTS "folders" (
          "id" SERIAL PRIMARY KEY,
          "name" VARCHAR(255) NOT NULL,
          "description" TEXT,
          "created_by" INT,
          "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
        )
      `,
      mysql: `
        CREATE TABLE IF NOT EXISTS \`folders\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`name\` VARCHAR(255) NOT NULL,
          \`description\` TEXT,
          \`created_by\` INT,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
        )
      `
    },
    folder_tables: {
      postgres: `
        CREATE TABLE IF NOT EXISTS "folder_tables" (
          "id" SERIAL PRIMARY KEY,
          "folder_id" INT NOT NULL,
          "table_name" VARCHAR(255) NOT NULL,
          "description" TEXT,
          "spreadsheet_url" TEXT,
          "sync_enabled" BOOLEAN DEFAULT FALSE,
          "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE,
          UNIQUE ("folder_id", "table_name")
        )
      `,
      mysql: `
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
      `
    },
    sync_config: {
      postgres: `
        CREATE TABLE IF NOT EXISTS "sync_config" (
          "id" SERIAL PRIMARY KEY,
          "table_name" VARCHAR(255) NOT NULL UNIQUE,
          "spreadsheet_id" VARCHAR(255) NOT NULL,
          "sheet_name" VARCHAR(255) NOT NULL,
          "folder_name" VARCHAR(255),
          "dataset_name" VARCHAR(255) NOT NULL,
          "primary_key" VARCHAR(255),
          "sync_type" VARCHAR(20) DEFAULT 'full',
          "sync_enabled" BOOLEAN DEFAULT TRUE,
          "last_sync" TIMESTAMP NULL,
          "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
      mysql: `
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
      `
    },
    sync_logs: {
      postgres: `
        CREATE TABLE IF NOT EXISTS "sync_logs" (
          "id" SERIAL PRIMARY KEY,
          "table_name" VARCHAR(255) NOT NULL,
          "folder_name" VARCHAR(255),
          "spreadsheet_id" VARCHAR(255),
          "sheet_name" VARCHAR(255),
          "status" VARCHAR(20) DEFAULT 'running',
          "rows_synced" INT DEFAULT 0,
          "rows_inserted" INT DEFAULT 0,
          "rows_updated" INT DEFAULT 0,
          "rows_deleted" INT DEFAULT 0,
          "error_message" TEXT,
          "sync_duration" INT,
          "started_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "completed_at" TIMESTAMP NULL
        )
      `,
      mysql: `
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
    }
  };

  const table = tables[tableName];
  if (!table) {
    throw new Error(`Unknown table: ${tableName}`);
  }

  return isPostgres ? table.postgres : table.mysql;
}

export async function POST(request: NextRequest) {
  let tempAdapter: DatabaseAdapter | null = null;
  
  try {
    const { connectionString, dbType } = await request.json();
    
    if (!connectionString || !dbType) {
      return NextResponse.json({ 
        error: 'Connection string and database type are required' 
      }, { status: 400 });
    }

    // สร้าง temporary adapter สำหรับการ migrate
    tempAdapter = new DatabaseAdapter(connectionString);
    await tempAdapter.initialize();

    const results: any = {
      created: [],
      existed: [],
      errors: []
    };

    // ลำดับการสร้างตาราง (ต้องสร้าง users ก่อน เพราะมี foreign key)
    const tableOrder = ['users', 'folders', 'folder_tables', 'sync_config', 'sync_logs'];

    // ตรวจสอบและสร้างตารางทีละตาราง
    for (const tableName of tableOrder) {
      try {
        // ตรวจสอบว่าตารางมีอยู่แล้วหรือไม่
        let tableExists = false;
        
        if (dbType === 'postgresql') {
          const checkQuery = `
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = $1
            )
          `;
          const checkResult = await tempAdapter.query(checkQuery, [tableName]);
          tableExists = checkResult.rows[0].exists;
        } else {
          // MySQL
          const checkQuery = `
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = ?
          `;
          const checkResult = await tempAdapter.query(checkQuery, [tableName]);
          tableExists = checkResult.rows[0].count > 0;
        }

        if (tableExists) {
          results.existed.push(tableName);
          console.log(`Table ${tableName} already exists`);
          continue;
        }

        // สร้างตาราง
        const createSQL = getCreateTableSQL(tableName, dbType);
        await tempAdapter.query(createSQL, []);
        
        results.created.push(tableName);
        console.log(`Table ${tableName} created successfully`);
      } catch (error: any) {
        console.error(`Error creating table ${tableName}:`, error);
        results.errors.push({
          table: tableName,
          error: error.message
        });
      }
    }

    // ปิด connection ของ temp adapter
    if (tempAdapter) {
      await tempAdapter.close();
    }

    return NextResponse.json({
      success: true,
      message: 'Database migration completed',
      results
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    
    // ปิด connection ถ้ามี error
    if (tempAdapter) {
      try {
        await tempAdapter.close();
      } catch (closeError) {
        console.error('Error closing temp adapter:', closeError);
      }
    }
    
    return NextResponse.json({ 
      error: error.message,
      details: 'Failed to initialize database connection or run migration'
    }, { status: 500 });
  }
}
