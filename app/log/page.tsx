'use client';

import { useState, useEffect } from 'react';
import { FileText, Search, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

interface SyncLog {
  id: number;
  status: 'running' | 'success' | 'error' | 'skipped' | 'failed';
  table_name: string;
  folder_name?: string;
  spreadsheet_id?: string;
  sheet_name?: string;
  started_at: string;
  completed_at: string | null;
  sync_duration: number | null;
  rows_synced: number;
  rows_inserted: number;
  rows_updated: number;
  rows_deleted: number;
  error_message: string | null;
}

const statusStyles = {
  running: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Clock },
  success: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
  error: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
  failed: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
  skipped: { bg: 'bg-gray-100', text: 'text-gray-700', icon: CheckCircle },
};

function LogPageContent() {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    fetchLogs();
    
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchLogs = async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      
      const response = await fetch('/api/sync-logs', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (response.ok) {
        const data = await response.json();
        setSyncLogs(data.slice(0, 50));
      }
      
      if (loading) setLoading(false);
    } catch (error) {
      console.error('Error fetching logs:', error);
      if (loading) setLoading(false);
    } finally {
      if (showRefresh) {
        setTimeout(() => setRefreshing(false), 500);
      }
    }
  };

  const filteredSyncLogs = syncLogs.filter(log => {
    const matchesSearch = log.table_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (log.folder_name && log.folder_name.toLowerCase().includes(searchTerm.toLowerCase()));
    const displayStatus = log.status === 'skipped' ? 'success' : log.status;
    const matchesStatus = filterStatus === 'all' || displayStatus === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-600" />
            System Logs
          </h1>
          <p className="text-gray-600 mt-1">
            ประวัติการทำงานของระบบ Sync
          </p>
        </div>
        
        <button
          onClick={() => fetchLogs(true)}
          disabled={refreshing}
          className={`flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors ${
            refreshing ? 'opacity-70 cursor-not-allowed' : ''
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by table name or folder..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
            {['all', 'success', 'running', 'error'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium capitalize whitespace-nowrap transition-colors ${
                  filterStatus === status
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Table / Folder</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stats</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-2" />
                      <p>Loading logs...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredSyncLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <FileText className="w-12 h-12 text-gray-300 mb-2" />
                      <p>No logs found matching your criteria</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSyncLogs.map((log) => {
                  const StatusIcon = statusStyles[log.status]?.icon || AlertCircle;
                  const statusStyle = statusStyles[log.status] || statusStyles.error;
                  
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {log.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900">{log.table_name}</span>
                          {log.folder_name && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              📁 {log.folder_name}
                            </span>
                          )}
                          {log.error_message && (
                            <span className="text-xs text-red-600 mt-1 max-w-xs truncate" title={log.error_message}>
                              Error: {log.error_message}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-xs text-gray-600 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="w-16">Synced:</span>
                            <span className="font-medium">{log.rows_synced?.toLocaleString() || 0}</span>
                          </div>
                          {log.status !== 'skipped' && (
                            <>
                              <div className="flex items-center gap-2 text-green-600">
                                <span className="w-16">Inserted:</span>
                                <span>+{log.rows_inserted?.toLocaleString() || 0}</span>
                              </div>
                              <div className="flex items-center gap-2 text-blue-600">
                                <span className="w-16">Updated:</span>
                                <span>~{log.rows_updated?.toLocaleString() || 0}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.sync_duration ? `${log.sync_duration}s` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex flex-col">
                          <span>{new Date(log.started_at).toLocaleDateString('th-TH')}</span>
                          <span className="text-xs">{new Date(log.started_at).toLocaleTimeString('th-TH')}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default LogPageContent;
