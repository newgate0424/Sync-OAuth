import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongoDb';
import bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';

// Helper function สำหรับตรวจสอบ admin
function getSession(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie) return null;
    return JSON.parse(sessionCookie.value);
  } catch {
    return null;
  }
}

// GET - ดึงรายชื่อ users (เฉพาะ admin)
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const db = await getMongoDb();
    const users = await db.collection('users')
      .find({}, { 
        projection: { 
          password: 0 // ไม่ส่ง password กลับไป
        } 
      })
      .sort({ created_at: -1 })
      .toArray();

    // แปลง _id เป็น id เพื่อให้ตรงกับ structure เดิม
    const formattedUsers = users.map(user => ({
      id: user._id.toString(),
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active !== false, // default true
      created_at: user.created_at,
      last_login: user.last_login
    }));

    return NextResponse.json({ users: formattedUsers });
  } catch (error: any) {
    console.error('Get users error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - สร้าง user ใหม่ (เฉพาะ admin)
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const { username, password, full_name, role } = await request.json();

    if (!username || !password || !full_name) {
      return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' }, { status: 400 });
    }

    // Validate username (alphanumeric only)
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json({ error: 'Username ต้องเป็นตัวอักษรภาษาอังกฤษและตัวเลขเท่านั้น' }, { status: 400 });
    }

    const db = await getMongoDb();
    
    // ตรวจสอบ username ซ้ำ
    const existingUser = await db.collection('users').findOne({ username });
    if (existingUser) {
      return NextResponse.json({ error: 'Username นี้มีในระบบแล้ว' }, { status: 400 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // สร้าง user ใหม่
    await db.collection('users').insertOne({
      username,
      password: hashedPassword,
      full_name,
      role: role || 'user',
      is_active: true,
      created_at: new Date(),
      last_login: null
    });
    
    return NextResponse.json({ success: true, message: 'สร้างผู้ใช้สำเร็จ' });
  } catch (error: any) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - แก้ไข user (เฉพาะ admin)
export async function PUT(request: NextRequest) {
  try {
    const session = getSession(request);
    
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const { id, full_name, role, is_active, password } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ไม่พบ user id' }, { status: 400 });
    }

    const db = await getMongoDb();
    const updateData: any = {
      full_name,
      role,
      is_active,
      updated_at: new Date()
    };

    // ถ้ามีการเปลี่ยน password
    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }

    await db.collection('users').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    return NextResponse.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
  } catch (error: any) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - ลบ user (เฉพาะ admin)
export async function DELETE(request: NextRequest) {
  try {
    const session = getSession(request);
    
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ไม่พบ user id' }, { status: 400 });
    }

    // ห้ามลบตัวเอง (session.userId คือ string ObjectId ใน MongoDB)
    if (id === session.userId) {
      return NextResponse.json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' }, { status: 400 });
    }

    const db = await getMongoDb();
    await db.collection('users').deleteOne({ _id: new ObjectId(id) });

    return NextResponse.json({ success: true, message: 'ลบผู้ใช้สำเร็จ' });
  } catch (error: any) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
