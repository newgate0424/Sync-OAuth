import { NextRequest, NextResponse } from 'next/server';
import { getGoogleSheetsClient } from '@/lib/googleSheets';

// POST - ดึงข้อมูลจาก sheet เพื่อดู schema
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { spreadsheetId, sheetName } = body;
    const startRow = parseInt(body.startRow) || 1;
    const hasHeader = body.hasHeader !== undefined ? body.hasHeader : true;
    
    if (!spreadsheetId || !sheetName) {
      return NextResponse.json({ error: 'Spreadsheet ID and sheet name are required' }, { status: 400 });
    }

    const sheets = await getGoogleSheetsClient();
    
    // คำนวณ range ตามการตั้งค่า
    const dataStartRow = hasHeader ? startRow + 1 : startRow;
    const headerRow = hasHeader ? startRow : null;
    
    // ดึงข้อมูลจาก sheet
    // Fix: ถ้าไม่เอา header ต้องเริ่มดึงจาก startRow ตรงๆ
    // ถ้าเอา header ต้องเริ่มดึงจาก startRow (ซึ่งเป็น header) แล้วข้อมูลจะตามมา
    // ดังนั้น range ที่ดึงควรเริ่มจาก startRow เสมอ แล้วค่อยไป slice เอาใน code
    const endRow = startRow + 1000; 
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A${startRow}:ZZ${endRow}`,
    });

    const rows = response.data.values || [];
    
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No data found in sheet' }, { status: 404 });
    }

    let headers: string[];
    let dataRows: any[][];
    
    if (hasHeader) {
      // แถวแรกเป็น header
      headers = rows[0];
      dataRows = rows.slice(1);
    } else {
      // สร้าง header อัตโนมัติ
      const numColumns = rows[0]?.length || 10;
      headers = Array.from({ length: numColumns }, (_, i) => `column_${i + 1}`);
      dataRows = rows;
    }

    // สร้าง schema โดยวิเคราะห์ชนิดข้อมูล
    const schema = headers.map((header: string, index: number) => {
      const columnData = dataRows.map(row => row[index]).filter(val => val !== undefined && val !== '');
      
      let dataType = 'VARCHAR(255)';
      
      if (columnData.length > 0) {
        const allNumbers = columnData.every(val => !isNaN(Number(val)));
        const allIntegers = columnData.every(val => Number.isInteger(Number(val)));
        const allDates = columnData.every(val => !isNaN(Date.parse(val)));
        
        if (allNumbers) {
          dataType = allIntegers ? 'INT' : 'DECIMAL(10,2)';
        } else if (allDates) {
          dataType = 'DATETIME';
        } else {
          const maxLength = Math.max(...columnData.map(val => String(val).length));
          if (maxLength > 255) {
            dataType = 'TEXT';
          }
        }
      }
      
      return {
        name: header.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
        originalName: header,
        type: dataType,
        nullable: true
      };
    });

    return NextResponse.json({
      headers,
      schema,
      previewData: dataRows.slice(0, 5), // ส่งข้อมูล preview 5 แถวแรก
      startRow,
      hasHeader
    });
  } catch (error: any) {
    console.error('Google Sheets error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
