import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // สร้าง authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // จะได้ refresh token
      scope: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      prompt: 'consent', // บังคับให้เห็นหน้า consent เพื่อได้ refresh token
    });

    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error('Error generating auth URL:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
