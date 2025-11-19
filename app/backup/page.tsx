'use client';

import { useEffect, useState } from 'react';
import { HardDrive, RefreshCw, AlertCircle, Check, X, Database, Clock, Trash2 } from 'lucide-react';

interface Backup {
  id: string;
  created_at: string;
  database_type: string;
  tables_count: number;
  total_rows: number;
  size_mb: number;
  status: string;
}

export default function BackupPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    fetchBackups();
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchBackups = async () => {
    setLoadingBackups(true);
    try {
      const response = await fetch('/api/backup');
      if (response.ok) {
        const data = await response.json();
        setBackups(data.backups || []);
      }
    } catch (error) {
      console.error('Error fetching backups:', error);
      showToast('ไม่สามารถโหลดรายการ Backup ได้', 'error');
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
      showToast('เกิดข้อผิดพลาดในการสร้าง Backup', 'error');
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
      showToast('เกิดข้อผิดพลาดในการ Restore', 'error');
    } finally {
      setRestoringBackup(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-white animate-fade-in-down ${
          toast.type === 'success' ? 'bg-green-600' : 
          toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
        }`}>
          {toast.type === 'success' ? <Check className="w-5 h-5" /> : 
           toast.type === 'error' ? <X className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.message}
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Database Backup</h1>
          <p className="text-gray-600">จัดการการสำรองและกู้คืนข้อมูลฐานข้อมูล (เก็บย้อนหลัง 30 วัน)</p>
        </div>
        <button
          onClick={handleCreateBackup}
          disabled={creatingBackup}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {creatingBackup ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              Creating Backup...
            </>
          ) : (
            <>
              <HardDrive className="w-5 h-5" />
              Create New Backup
            </>
          )}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" />
            Backup History
          </h2>
          <button 
            onClick={fetchBackups} 
            disabled={loadingBackups}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
            title="Refresh list"
          >
            <RefreshCw className={`w-5 h-5 ${loadingBackups ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loadingBackups ? (
          <div className="p-12 text-center text-gray-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
            Loading backups...
          </div>
        ) : backups.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Database className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No backups found</p>
            <p className="text-sm mt-1">Create your first backup to secure your data</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-6 py-3 text-left">Date & Time</th>
                  <th className="px-6 py-3 text-left">Type</th>
                  <th className="px-6 py-3 text-right">Tables</th>
                  <th className="px-6 py-3 text-right">Rows</th>
                  <th className="px-6 py-3 text-right">Size</th>
                  <th className="px-6 py-3 text-center">Status</th>
                  <th className="px-6 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {backups.map((backup) => (
                  <tr key={backup.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {new Date(backup.created_at).toLocaleString('th-TH', {
                        timeZone: 'Asia/Bangkok',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">
                        {backup.database_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                      {backup.tables_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                      {backup.total_rows.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                      {backup.size_mb.toFixed(2)} MB
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {backup.status === 'completed' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Completed
                        </span>
                      ) : backup.status === 'in_progress' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          In Progress
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => handleRestoreBackup(backup.id)}
                        disabled={restoringBackup === backup.id || backup.status !== 'completed'}
                        className="text-blue-600 hover:text-blue-900 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1 mx-auto"
                      >
                        {restoringBackup === backup.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
