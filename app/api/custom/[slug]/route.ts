import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { ensureDbInitialized } from '@/lib/dbAdapter';

export const dynamic = 'force-dynamic';

const CONFIG_FILE = path.join(process.cwd(), 'api-builder-config.json');

async function getConfigs() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const limit = limitParam ? parseInt(limitParam) : null;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    const slug = params.slug;
    const configs = await getConfigs();
    const config = configs.find((c: any) => c.slug === slug);

    if (!config) {
      return NextResponse.json({ error: 'API not found' }, { status: 404 });
    }

    const pool = await ensureDbInitialized();
    const dbType = pool.getDatabaseType();

    const results: any = {};
    const combinedRows: any[] = [];

    for (const table of config.tables) {
      const tableName = table.table;
      // Sanitize table name to prevent SQL injection (basic check)
      if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        console.warn(`Skipping invalid table name: ${tableName}`);
        continue;
      }

      const quotedTableName = dbType === 'mysql' ? `\`${tableName}\`` : `"${tableName}"`;
      
      try {
        let query = `SELECT * FROM ${quotedTableName}`;
        
        if (config.type === 'combine') {
          // For combine mode, we apply limit intelligently
          if (limit !== null) {
            const currentLength = combinedRows.length;
            if (currentLength >= limit) break; // Stop if we already have enough rows
            
            const remaining = limit - currentLength;
            query += ` LIMIT ${remaining}`;
          }
          // Note: Offset in combine mode is complex across tables, so we ignore it for now or apply it to the first table only?
          // For simplicity, we'll ignore offset for combine mode in this version to ensure data consistency
        } else {
          // For separate mode, apply limit/offset to each table
          if (limit !== null) query += ` LIMIT ${limit}`;
          if (offset > 0) query += ` OFFSET ${offset}`;
        }

        const queryResult = await pool.query(query);
        
        if (config.type === 'combine') {
          combinedRows.push(...queryResult.rows);
        } else {
          results[tableName] = queryResult.rows;
        }
      } catch (err: any) {
        console.error(`Error querying table ${tableName}:`, err);
        if (config.type === 'separate') {
          results[tableName] = { error: err.message };
        }
      }
    }

    if (config.type === 'combine') {
      return NextResponse.json(combinedRows);
    } else {
      return NextResponse.json(results);
    }

  } catch (error) {
    console.error('Error executing custom API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
