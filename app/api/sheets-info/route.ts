import { NextRequest, NextResponse } from 'next/server';
import { getGoogleSheetsClient, extractSpreadsheetId } from '@/lib/googleSheets';

// GET - ดึงรายชื่อ sheets ทั้งหมดจาก Google Sheets
export async function POST(request: NextRequest) {
  try {
    const { spreadsheetUrl } = await request.json();
    
    if (!spreadsheetUrl) {
      return NextResponse.json({ error: 'Spreadsheet URL is required' }, { status: 400 });
    }

    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'Invalid Google Sheets URL' }, { status: 400 });
    }

    const sheets = await getGoogleSheetsClient();
    
    // ดึงข้อมูล spreadsheet
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const sheetsList = spreadsheet.data.sheets?.map(sheet => ({
      title: sheet.properties?.title,
      sheetId: sheet.properties?.sheetId,
      index: sheet.properties?.index,
    })) || [];

    return NextResponse.json({
      spreadsheetId,
      title: spreadsheet.data.properties?.title,
      sheets: sheetsList
    });
  } catch (error: any) {
    console.error('Google Sheets error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
