'use client';

import { useState, useEffect } from 'react';
import { FileText, Search, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle, Terminal } from 'lucide-react';

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

interface CronLog {
  id: string;
  job_name: string;
  folder: string;
  table: string;
  status: 'running' | 'success' | 'error';
  started_at: string;
  completed_at: string | null;
  duration_ms: number;
  message: string;
  error?: string;
}

const statusStyles = {
  running: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Clock },
  success: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
  error: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
  failed: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
  skipped: { bg: 'bg-gray-100', text: 'text-gray-700', icon: CheckCircle },
};

function LogPageContent() {
  const [activeTab, setActiveTab] = useState<'sync' | 'cron'>('sync');
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [cronLogs, setCronLogs] = useState<CronLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    fetchLogs();
    
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const fetchLogs = async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      
      if (activeTab === 'sync') {
        const response = await fetch('/api/sync-logs', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (response.ok) {
          const data = await response.json();
          setSyncLogs(data.slice(0, 50));
        }
      } else {
        const response = await fetch('/api/cron-logs?limit=50', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (response.ok) {
          const data = await response.json();
          setCronLogs(data.logs || []);
        }
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

  const filteredCronLogs = cronLogs.filter(log => {
    const matchesSearch = log.job_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (log.table && log.table.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = filterStatus === 'all' || log.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    if (seconds < 1) return '< 1s';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs.toFixed(0)}s`;
  };

  const formatMsDuration = (ms: number) => {
    if (!ms) return '-';
    return formatDuration(ms / 1000);
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('th-TH');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="w-7 h-7 text-blue-500" />
            System Logs
          </h1>
          <button
            onClick={() => fetchLogs(true)}
            disabled={refreshing}
            className={`p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors ${
              refreshing ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            title="Refresh logs"
          >
            <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('sync')}
            className={`flex items-center gap-2 px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'sync'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            Sync Logs
          </button>
          <button
            onClick={() => setActiveTab('cron')}
            className={`flex items-center gap-2 px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'cron'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Clock className="w-4 h-4" />
            Cron Logs
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={activeTab === 'sync' ? "Search table or folder..." : "Search job name..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'success', 'error', 'running'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
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

      {/* Content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-48">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">
                  Status
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {activeTab === 'sync' ? 'Table / Folder' : 'Job Name'}
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">
                  Duration
                </th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Loading logs...
                    </div>
                  </td>
                </tr>
              ) : (activeTab === 'sync' ? filteredSyncLogs : filteredCronLogs).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No logs found matching your criteria
                  </td>
                </tr>
              ) : (
                (activeTab === 'sync' ? filteredSyncLogs : filteredCronLogs).map((log: any) => {
                  const status = log.status as keyof typeof statusStyles;
                  const style = statusStyles[status] || statusStyles.running;
                  const StatusIcon = style.icon;

                  return (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">
                            {formatDateTime(log.started_at).split(' ')[0]}
                          </span>
                          <span className="text-xs">
                            {formatDateTime(log.started_at).split(' ')[1]}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          <span className="capitalize">{status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900">
                            {activeTab === 'sync' ? log.table_name : log.job_name}
                          </span>
                          {activeTab === 'sync' && log.folder_name && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {log.folder_name}
                            </span>
                          )}
                          {activeTab === 'cron' && log.table && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Terminal className="w-3 h-3" />
                              {log.table}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {activeTab === 'sync' 
                          ? formatDuration(log.sync_duration)
                          : formatMsDuration(log.duration_ms)
                        }
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {activeTab === 'sync' ? (
                          log.error_message ? (
                            <span className="text-red-600 flex items-center gap-1">
                              <AlertCircle className="w-4 h-4 flex-shrink-0" />
                              {log.error_message}
                            </span>
                          ) : (
                            <div className="flex gap-3 text-xs">
                              <span className="text-green-600">+{log.rows_inserted} inserted</span>
                              <span className="text-blue-600">~{log.rows_updated} updated</span>
                              <span className="text-red-600">-{log.rows_deleted} deleted</span>
                            </div>
                          )
                        ) : (
                          log.error ? (
                            <span className="text-red-600 flex items-center gap-1">
                              <AlertCircle className="w-4 h-4 flex-shrink-0" />
                              {log.error}
                            </span>
                          ) : (
                            <span className="text-gray-600">{log.message}</span>
                          )
                        )}
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

export default function LogPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return <LogPageContent />;
}
