import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getMongoDb } from '@/lib/mongoDb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/settings?error=${encodeURIComponent('Google authorization failed')}`, request.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/settings?error=No authorization code', request.url)
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // แลก code เป็น tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // ดึงข้อมูล user จาก Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    // เก็บ tokens ใน MongoDB
    const db = await getMongoDb();
    
    // Update หรือ insert google_tokens สำหรับ user นี้
    await db.collection('google_tokens').updateOne(
      { email: userInfo.data.email },
      {
        $set: {
          email: userInfo.data.email,
          name: userInfo.data.name,
          picture: userInfo.data.picture,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date,
          scope: tokens.scope,
          token_type: tokens.token_type,
          updated_at: new Date(),
        },
        $setOnInsert: {
          created_at: new Date(),
        },
      },
      { upsert: true }
    );

    console.log(`✅ Google account connected for ${userInfo.data.email}`);

    return NextResponse.redirect(
      new URL('/settings?success=Google account connected successfully', request.url)
    );
  } catch (error: any) {
    console.error('Error in Google OAuth callback:', error);
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }
}
