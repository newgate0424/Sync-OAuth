import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

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

async function saveConfigs(configs: any[]) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(configs, null, 2));
}

export async function GET() {
  const configs = await getConfigs();
  return NextResponse.json(configs);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, slug, tables, type } = body;

    if (!name || !slug || !tables || tables.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const configs = await getConfigs();
    
    // Check if slug exists
    const existingIndex = configs.findIndex((c: any) => c.slug === slug);
    const newConfig = { name, slug, tables, type, createdAt: new Date().toISOString() };

    if (existingIndex >= 0) {
      configs[existingIndex] = newConfig;
    } else {
      configs.push(newConfig);
    }

    await saveConfigs(configs);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving config:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');

    if (!slug) {
      return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
    }

    const configs = await getConfigs();
    const newConfigs = configs.filter((c: any) => c.slug !== slug);
    await saveConfigs(newConfigs);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting config:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
