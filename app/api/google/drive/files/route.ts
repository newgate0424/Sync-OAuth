import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getMongoDb } from '@/lib/mongoDb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getMongoDb();
    const tokenDoc = await db.collection('google_tokens').findOne({});
    
    if (!tokenDoc || !tokenDoc.access_token) {
      return NextResponse.json({ 
        error: 'Google account not connected. Please connect in Settings first.' 
      }, { status: 401 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: tokenDoc.access_token,
      refresh_token: tokenDoc.refresh_token,
      expiry_date: tokenDoc.expiry_date,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // ดึง Google Sheets files ทั้งหมดจาก Drive
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: 'files(id, name, modifiedTime, webViewLink, iconLink, owners)',
      orderBy: 'modifiedTime desc',
      pageSize: 100,
    });

    const files = response.data.files || [];

    return NextResponse.json({ 
      files: files.map(file => ({
        id: file.id,
        name: file.name,
        url: file.webViewLink,
        modifiedTime: file.modifiedTime,
        iconLink: file.iconLink,
        owner: file.owners?.[0]?.displayName || 'Unknown',
      }))
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('Error fetching Drive files:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to fetch files from Google Drive' 
    }, { status: 500 });
  }
}
