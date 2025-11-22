import { NextResponse } from 'next/server';

// Mock logs data - ในการใช้งานจริงควรเก็บใน database
const generateMockLogs = () => {
  const levels = ['info', 'warning', 'error', 'success'];
  const sources = ['Database', 'API', 'Auth', 'System', 'Query'];
  const messages = [
    'Database connection established successfully',
    'Query execution completed',
    'Failed to connect to database',
    'User authentication successful',
    'API request timeout',
    'Table created successfully',
    'Invalid SQL syntax detected',
    'Backup completed',
    'Memory usage high',
    'New user registered',
  ];

  const logs = [];
  for (let i = 0; i < 50; i++) {
    const date = new Date();
    date.setMinutes(date.getMinutes() - i * 5);
    
    logs.push({
      id: i + 1,
      timestamp: date.toLocaleString('th-TH'),
      level: levels[Math.floor(Math.random() * levels.length)] as any,
      message: messages[Math.floor(Math.random() * messages.length)],
      source: sources[Math.floor(Math.random() * sources.length)],
    });
  }
  
  return logs;
};

export async function GET() {
  try {
    const logs = generateMockLogs();
    return NextResponse.json(logs);
  } catch (error: any) {
    console.error('Error fetching logs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
