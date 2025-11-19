'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Database, Check, X, AlertCircle, Link as LinkIcon, Unlink, HardDrive, RefreshCw } from 'lucide-react';

interface GoogleAccount {
  email: string;
  name: string;
  picture: string;
  connected_at: string;
}

interface Backup {
  id: string;
  created_at: string;
  database_type: string;
  tables_count: number;
  total_rows: number;
  size_mb: number;
  status: string;
}

function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connectionString, setConnectionString] = useState('');
  const [currentConnection, setCurrentConnection] = useState('');
  const [dbType, setDbType] = useState<'mysql' | 'postgresql'>('postgresql');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccount[]>([]);
  const [loadingGoogle, setLoadingGoogle] = useState(true);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
    fetchCurrentConnection();
    fetchGoogleStatus();
    fetchBackups();
    
    // เช็ค URL parameters สำหรับ success/error messages
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (success) {
      showToast(success, 'success');
      window.history.replaceState({}, '', '/settings');
    }
    if (error) {
      showToast(error, 'error');
      window.history.replaceState({}, '', '/settings');
    }
  }, []);

  const fetchGoogleStatus = async () => {
    try {
      const response = await fetch('/api/auth/google/status');
      if (response.ok) {
        const data = await response.json();
        setGoogleConnected(data.connected);
        setGoogleAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Error fetching Google status:', error);
    } finally {
      setLoadingGoogle(false);
    }
  };

  const fetchBackups = async () => {
    try {
      const response = await fetch('/api/backup');
      if (response.ok) {
        const data = await response.json();
        setBackups(data.backups || []);
      }
    } catch (error) {
      console.error('Error fetching backups:', error);
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const response = await fetch('/api/backup', {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        showToast(`Backup สำเร็จ: ${data.tables_count} ตาราง, ${data.total_rows} แถว, ${data.size_mb.toFixed(2)} MB`, 'success');
        fetchBackups();
      } else {
        const error = await response.json();
        showToast(error.error || 'ไม่สามารถสร้าง backup ได้', 'error');
      }
    } catch (error) {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (backupId: string) => {
    if (!confirm('⚠️ คำเตือน: การ Restore จะลบข้อมูลปัจจุบันและแทนที่ด้วยข้อมูลจาก Backup\n\nต้องการดำเนินการต่อหรือไม่?')) {
      return;
    }

    setRestoringBackup(backupId);
    try {
      const response = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup_id: backupId }),
      });

      if (response.ok) {
        const data = await response.json();
        showToast(`Restore สำเร็จ: ${data.restored_tables} ตาราง, ${data.restored_rows} แถว`, 'success');
      } else {
        const error = await response.json();
        showToast(error.error || 'ไม่สามารถ restore ได้', 'error');
      }
    } catch (error) {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setRestoringBackup(null);
    }
  };

  const handleConnectGoogle = () => {
    window.location.href = '/api/auth/google/authorize';
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm('ต้องการยกเลิกการเชื่อมต่อ Google Account หรือไม่?')) {
      return;
    }

    try {
      const response = await fetch('/api/auth/google/status', {
        method: 'DELETE',
      });

      if (response.ok) {
        showToast('ยกเลิกการเชื่อมต่อสำเร็จ', 'success');
        setGoogleConnected(false);
        setGoogleAccounts([]);
      } else {
        showToast('ไม่สามารถยกเลิกการเชื่อมต่อได้', 'error');
      }
    } catch (error) {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
  };

  useEffect(() => {
    checkAuth();
    fetchCurrentConnection();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/session');
      if (!response.ok) {
        router.push('/login');
        return;
      }
      const data = await response.json();
      if (data.user?.role !== 'admin') {
        router.push('/database');
      }
    } catch {
      router.push('/login');
    }
  };

  const fetchCurrentConnection = async () => {
    try {
      const response = await fetch('/api/settings/database');
      if (response.ok) {
        const data = await response.json();
        setCurrentConnection(data.connectionString);
        setConnectionString(data.connectionString);
        
        // Auto-detect database type from connection string
        if (data.original) {
          if (data.original.startsWith('mysql://')) {
            setDbType('mysql');
          } else {
            setDbType('postgresql');
          }
        }
      }
    } catch (error) {
      console.error('Error fetching connection:', error);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleTestConnection = async () => {
    if (!connectionString.trim()) {
      showToast('กรุณากรอก Connection String', 'error');
      return;
    }

    // ตรวจสอบว่า connection string ตรงกับ database type
    if (dbType === 'postgresql' && !connectionString.startsWith('postgresql://') && !connectionString.startsWith('postgres://')) {
      showToast('PostgreSQL Connection String ต้องเริ่มต้นด้วย postgresql:// หรือ postgres://', 'error');
      return;
    }
    
    if (dbType === 'mysql' && !connectionString.startsWith('mysql://')) {
      showToast('MySQL Connection String ต้องเริ่มต้นด้วย mysql://', 'error');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/settings/database/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString, dbType })
      });

      const data = await response.json();
      setTestResult({
        success: response.ok,
        message: data.message || data.error
      });
    } catch (error: any) {
      setTestResult({
        success: false,
        message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!testResult?.success) {
      showToast('กรุณาทดสอบการเชื่อมต่อก่อนบันทึก', 'error');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/settings/database', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString, dbType })
      });

      if (response.ok) {
        const data = await response.json();
        
        // แสดงผลการ migrate
        if (data.migration) {
          const { created, existed, errors } = data.migration.results;
          let message = 'บันทึกการตั้งค่าสำเร็จ';
          
          if (created.length > 0) {
            message += `\n✓ สร้างตาราง: ${created.join(', ')}`;
          }
          if (existed.length > 0) {
            message += `\n✓ ตารางที่มีอยู่แล้ว: ${existed.join(', ')}`;
          }
          if (errors.length > 0) {
            message += `\n⚠ ตารางที่มีปัญหา: ${errors.map((e: any) => e.table).join(', ')}`;
          }
          
          showToast(message, errors.length > 0 ? 'info' : 'success');
        } else {
          showToast('บันทึกการตั้งค่าสำเร็จ', 'success');
        }
        
        setCurrentConnection(connectionString);
        setTestResult(null);
        
        // Reload page after 2 seconds if server needs restart
        if (data.needsReload) {
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
      } else {
        const data = await response.json();
        showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch (error) {
      showToast('ไม่สามารถบันทึกการตั้งค่าได้', 'error');
    } finally {
      setSaving(false);
    }
  };

  const parseConnectionString = (connStr: string) => {
    try {
      const url = new URL(connStr);
      return {
        host: url.hostname,
        port: url.port || '5432',
        database: url.pathname.slice(1),
        username: url.username
      };
    } catch {
      return null;
    }
  };

  const currentInfo = parseConnectionString(currentConnection);
  const newInfo = parseConnectionString(connectionString);

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Google Account Section */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <LinkIcon className="w-6 h-6 text-green-600" />
            <h1 className="text-2xl font-bold text-gray-900">Google Account</h1>
          </div>

          {loadingGoogle ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : googleConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600 mb-4">
                <Check className="w-5 h-5" />
                <span className="font-medium">เชื่อมต่อแล้ว</span>
              </div>
              
              {googleAccounts.map((account, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {account.picture && (
                      <img 
                        src={account.picture} 
                        alt={account.name}
                        className="w-10 h-10 rounded-full"
                      />
                    )}
                    <div>
                      <div className="font-medium text-gray-900">{account.name}</div>
                      <div className="text-sm text-gray-600">{account.email}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        เชื่อมต่อเมื่อ: {new Date(account.connected_at).toLocaleString('th-TH')}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnectGoogle}
                    className="flex items-center gap-2 px-4 py-2 text-red-600 border border-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Unlink className="w-4 h-4" />
                    ยกเลิกการเชื่อมต่อ
                  </button>
                </div>
              ))}
              
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">✅ ระบบสามารถเข้าถึงไฟล์ Google Sheets ของคุณได้</p>
                    <p>ไม่ต้องแชร์ไฟล์ให้ Service Account อีกต่อไป</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-600">
                เชื่อมต่อ Google Account เพื่อให้ระบบสามารถเข้าถึง Google Sheets ของคุณได้โดยอัตโนมัติ
              </p>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium mb-2">ข้อดีของการใช้ OAuth:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>ไม่ต้องแชร์ไฟล์ให้ Service Account</li>
                      <li>เข้าถึงไฟล์ทั้งหมดใน Google Drive ของคุณ</li>
                      <li>ปลอดภัยกว่า - ควบคุมสิทธิ์เองได้</li>
                      <li>ยกเลิกได้ตลอดเวลา</li>
                    </ul>
                  </div>
                </div>
              </div>

              <button
                onClick={handleConnectGoogle}
                className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Connect with Google
              </button>
            </div>
          )}
        </div>

        {/* Database Backup Section */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <HardDrive className="w-6 h-6 text-purple-600" />
              <h1 className="text-2xl font-bold text-gray-900">Database Backup</h1>
            </div>
            <button
              onClick={handleCreateBackup}
              disabled={creatingBackup}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {creatingBackup ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  กำลัง Backup...
                </>
              ) : (
                <>
                  <HardDrive className="w-4 h-4" />
                  Backup ทันที
                </>
              )}
            </button>
          </div>

          <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-purple-800">
                <p className="font-medium mb-1">ระบบ Backup อัตโนมัติ</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Backup ข้อมูลทุกวันเวลา 02:00 น.</li>
                  <li>เก็บ backup ไว้ 30 วัน</li>
                  <li>ลบ backup เก่ากว่า 30 วันอัตโนมัติ</li>
                  <li>สามารถสร้าง backup เองได้ทุกเมื่อ</li>
                </ul>
              </div>
            </div>
          </div>

          {loadingBackups ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <HardDrive className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>ยังไม่มี backup</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Backup ล่าสุด ({backups.length} รายการ)
              </h3>
              {backups.slice(0, 10).map((backup) => (
                <div 
                  key={backup.id} 
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {new Date(backup.created_at).toLocaleString('th-TH', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        backup.status === 'completed' 
                          ? 'bg-green-100 text-green-800' 
                          : backup.status === 'in_progress'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {backup.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {backup.tables_count} ตาราง • {backup.total_rows.toLocaleString()} แถว • {backup.size_mb.toFixed(2)} MB
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 mr-2">
                      {backup.database_type}
                    </span>
                    {backup.status === 'completed' && (
                      <button
                        onClick={() => handleRestoreBackup(backup.id)}
                        disabled={restoringBackup !== null}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                      >
                        {restoringBackup === backup.id ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Restoring...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3 h-3" />
                            Restore
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Database Settings Section */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <Database className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">การตั้งค่าฐานข้อมูล PostgreSQL</h1>
          </div>

          {/* Current Connection Info */}
          {currentInfo && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-2">การเชื่อมต่อปัจจุบัน:</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-600">Host:</span> <span className="font-mono">{currentInfo.host}</span></div>
                <div><span className="text-gray-600">Port:</span> <span className="font-mono">{currentInfo.port}</span></div>
                <div><span className="text-gray-600">Database:</span> <span className="font-mono">{currentInfo.database}</span></div>
                <div><span className="text-gray-600">User:</span> <span className="font-mono">{currentInfo.username}</span></div>
              </div>
            </div>
          )}

          {/* Database Type Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ประเภทฐานข้อมูล
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="postgresql"
                  checked={dbType === 'postgresql'}
                  onChange={(e) => {
                    setDbType(e.target.value as 'postgresql');
                    setConnectionString('');
                    setTestResult(null);
                  }}
                  className="mr-2"
                />
                <span>PostgreSQL</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="mysql"
                  checked={dbType === 'mysql'}
                  onChange={(e) => {
                    setDbType(e.target.value as 'mysql');
                    setConnectionString('');
                    setTestResult(null);
                  }}
                  className="mr-2"
                />
                <span>MySQL</span>
              </label>
            </div>
          </div>

          {/* Connection String Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {dbType === 'postgresql' ? 'PostgreSQL' : 'MySQL'} Connection String
            </label>
            <input
              type="text"
              value={connectionString}
              onChange={(e) => {
                setConnectionString(e.target.value);
                setTestResult(null);
              }}
              placeholder={
                dbType === 'postgresql' 
                  ? "postgresql://username:password@host:5432/database"
                  : "mysql://username:password@host:3306/database"
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
            <p className="mt-2 text-xs text-gray-500">
              รูปแบบ: {dbType}://[username]:[password]@[host]:{dbType === 'postgresql' ? '5432' : '3306'}/[database]
            </p>
          </div>

          {/* New Connection Info Preview */}
          {newInfo && connectionString !== currentConnection && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-sm font-medium text-blue-900 mb-2">ตัวอย่างการเชื่อมต่อใหม่:</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-blue-700">Host:</span> <span className="font-mono text-blue-900">{newInfo.host}</span></div>
                <div><span className="text-blue-700">Port:</span> <span className="font-mono text-blue-900">{newInfo.port}</span></div>
                <div><span className="text-blue-700">Database:</span> <span className="font-mono text-blue-900">{newInfo.database}</span></div>
                <div><span className="text-blue-700">User:</span> <span className="font-mono text-blue-900">{newInfo.username}</span></div>
              </div>
            </div>
          )}

          {/* Test Result */}
          {testResult && (
            <div className={`mb-4 p-4 rounded-lg flex items-start gap-3 ${
              testResult.success 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              {testResult.success ? (
                <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`font-medium ${testResult.success ? 'text-green-900' : 'text-red-900'}`}>
                  {testResult.success ? 'เชื่อมต่อสำเร็จ!' : 'เชื่อมต่อไม่สำเร็จ'}
                </p>
                <p className={`text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {testResult.message}
                </p>
              </div>
            </div>
          )}

          {/* Warning */}
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-1">คำเตือน:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>การเปลี่ยนฐานข้อมูลจะมีผลทันทีหลังจากบันทึก</li>
                <li>กรุณาแน่ใจว่าฐานข้อมูลใหม่มีตารางและข้อมูลที่จำเป็น</li>
                <li>ควรสำรองข้อมูลก่อนเปลี่ยนฐานข้อมูล</li>
              </ul>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleTestConnection}
              disabled={testing || !connectionString.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !testResult?.success || connectionString === currentConnection}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </button>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md">
          <div className={`px-6 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-green-600' :
            toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
          } text-white whitespace-pre-line`}>
            {toast.message}
          </div>
        </div>
      )}
    </>
  );
}

export default function SettingsPage() {
  return <SettingsPageContent />;
}
