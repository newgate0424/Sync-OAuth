import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongoDb';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

// GET - List saved queries
export async function GET() {
  try {
    const db = await getMongoDb();
    const queries = await db.collection('saved_queries')
      .find({})
      .sort({ updated_at: -1 })
      .toArray();

    return NextResponse.json({
      queries: queries.map(q => ({
        ...q,
        id: q._id.toString(),
        _id: undefined
      }))
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Save new query
export async function POST(request: NextRequest) {
  try {
    const db = await getMongoDb();
    const body = await request.json();
    const { name, sql, description, schedule, destination_table } = body;

    if (!name || !sql) {
      return NextResponse.json({ error: 'Name and SQL are required' }, { status: 400 });
    }

    const newQuery = {
      name,
      sql,
      description: description || '',
      schedule: schedule || null,
      destination_table: destination_table || null,
      created_at: new Date(),
      updated_at: new Date()
    };

    const result = await db.collection('saved_queries').insertOne(newQuery);

    return NextResponse.json({
      success: true,
      query: { ...newQuery, id: result.insertedId.toString() }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Update query
export async function PUT(request: NextRequest) {
  try {
    const db = await getMongoDb();
    const body = await request.json();
    const { id, name, sql, description, schedule, destination_table } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const updateData: any = {
      updated_at: new Date()
    };

    if (name) updateData.name = name;
    if (sql) updateData.sql = sql;
    if (description !== undefined) updateData.description = description;
    if (schedule !== undefined) updateData.schedule = schedule;
    if (destination_table !== undefined) updateData.destination_table = destination_table;

    await db.collection('saved_queries').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Delete query
export async function DELETE(request: NextRequest) {
  try {
    const db = await getMongoDb();
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    await db.collection('saved_queries').deleteOne({ _id: new ObjectId(id) });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
