import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongoDb';
import bcrypt from 'bcrypt';

// POST - Login
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'กรุณากรอก username และ password' }, { status: 400 });
    }

    const db = await getMongoDb();
    
    // ค้นหา user
    const user = await db.collection('users').findOne({ 
      username, 
      is_active: { $ne: false } // ไม่รวม user ที่ is_active = false
    });

    if (!user) {
      return NextResponse.json({ error: 'Username หรือ Password ไม่ถูกต้อง' }, { status: 401 });
    }

    // ตรวจสอบ password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Username หรือ Password ไม่ถูกต้อง' }, { status: 401 });
    }

    // อัปเดต last_login
    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { last_login: new Date() } }
    );

    // สร้าง session (ใช้ cookie)
    const response = NextResponse.json({
      success: true,
      user: {
        id: user._id.toString(),
        username: user.username,
        full_name: user.full_name,
        role: user.role
      }
    });

    // ตั้งค่า cookie สำหรับ session
    response.cookies.set('session', JSON.stringify({
      userId: user._id.toString(),
      username: user.username,
      full_name: user.full_name,
      role: user.role
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 วัน
    });

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
