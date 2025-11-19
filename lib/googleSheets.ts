import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { getMongoDb } from './mongoDb';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
];

/**
 * ดึง Google Sheets client
 * - ถ้ามี OAuth tokens ใน MongoDB จะใช้ OAuth
 * - ถ้าไม่มี จะใช้ Service Account (backward compatible)
 */
export async function getGoogleSheetsClient() {
  // ลองใช้ OAuth ก่อน
  try {
    const db = await getMongoDb();
    const tokenDoc = await db.collection('google_tokens').findOne({});
    
    if (tokenDoc && tokenDoc.access_token) {
      console.log('🔐 Using OAuth 2.0 authentication');
      
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      oauth2Client.setCredentials({
        access_token: tokenDoc.access_token,
        refresh_token: tokenDoc.refresh_token,
        expiry_date: tokenDoc.expiry_date,
        token_type: tokenDoc.token_type,
        scope: tokenDoc.scope,
      });

      // ถ้า token หมดอายุ จะ refresh อัตโนมัติ
      oauth2Client.on('tokens', async (tokens) => {
        console.log('🔄 Refreshing OAuth tokens...');
        await db.collection('google_tokens').updateOne(
          { _id: tokenDoc._id },
          {
            $set: {
              access_token: tokens.access_token,
              expiry_date: tokens.expiry_date,
              refresh_token: tokens.refresh_token || tokenDoc.refresh_token,
              updated_at: new Date(),
            },
          }
        );
      });

      const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
      return sheets;
    }
  } catch (error) {
    console.warn('⚠️  OAuth authentication not available, falling back to Service Account');
  }

  // Fallback: ใช้ Service Account (เดิม)
  const credentialsPath = path.join(process.cwd(), 'credentials.json');
  
  if (!fs.existsSync(credentialsPath)) {
    console.error('❌ No authentication method available!');
    console.error('📋 Please either:');
    console.error('   1. Connect Google Account via Settings page, OR');
    console.error('   2. Add credentials.json for Service Account');
    throw new Error('Google Sheets authentication not configured');
  }
  
  console.log('🔑 Using Service Account authentication');
  
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: SCOPES,
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client as any });
  
  return sheets;
}

export async function getGoogleDriveClient() {
  try {
    // Try to use OAuth first
    const { getMongoDb } = await import('./mongoDb');
    const db = await getMongoDb();
    const tokenDoc = await db.collection('oauth_tokens').findOne({ provider: 'google' });

    if (tokenDoc) {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      oauth2Client.setCredentials(tokenDoc.tokens);

      // Handle token refresh if needed
      oauth2Client.on('tokens', async (tokens) => {
        await db.collection('oauth_tokens').updateOne(
          { provider: 'google' },
          { 
            $set: { 
              tokens: { ...tokenDoc.tokens, ...tokens },
              updatedAt: new Date()
            } 
          }
        );
      });

      const drive = google.drive({ version: 'v3', auth: oauth2Client });
      return drive;
    }
  } catch (error) {
    console.warn('⚠️  OAuth authentication not available for Drive, falling back to Service Account');
  }

  // Fallback: Use Service Account
  const credentialsPath = path.join(process.cwd(), 'credentials.json');
  
  if (!fs.existsSync(credentialsPath)) {
    throw new Error('Google Drive authentication not configured');
  }
  
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: SCOPES,
  });

  const client = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: client as any });
  
  return drive;
}

export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}
