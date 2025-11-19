'use client';

import { useState, useEffect } from 'react';
import { Clock, Play, Pause, Trash2, Plus, Settings, RefreshCw, Database, Table2, Calendar, AlertCircle } from 'lucide-react';

interface CronJob {
  id: number | string;
  name: string;
  folder: string;
  table: string;
  schedule: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  status?: 'success' | 'failed' | 'running';
}



export default function CronPage() {
  const [mounted, setMounted] = useState(false);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showDialog, setShowDialog] = useState(false);

  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    folder: '',
    table: '',
    schedule: '0 * * * *',
  });
  const [folders, setFolders] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [isCustomSchedule, setIsCustomSchedule] = useState(false);
  const [customSchedule, setCustomSchedule] = useState('');
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('00:00');

  useEffect(() => {
    setMounted(true);
    
    // โหลดข้อมูลเริ่มต้น
    const initializeData = async () => {
      try {
        // Auto-clear stuck jobs ก่อน
        await fetch('/api/cron-jobs/auto-clear');
        
        await loadCronJobs();
        await loadFolders();
        await loadDatasets();
      } catch (error) {
        console.error('Error initializing data:', error);
      }
    };
    
    initializeData();
    
    // Auto-refresh logs และ clear stuck jobs ทุก 5 วินาที
    const interval = setInterval(async () => {
      await fetch('/api/cron-jobs/auto-clear');
      loadCronJobs();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const loadCronJobs = async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      const response = await fetch('/api/cron-jobs', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (response.ok) {
        const data = await response.json();
        setCronJobs(data.jobs || []);
      } else {
        console.error('Failed to load cron jobs');
      }
      if (loading) setLoading(false);
    } catch (error) {
      console.error('Error loading cron jobs:', error);
      if (loading) setLoading(false);
    } finally {
      if (showRefresh) {
        setTimeout(() => setRefreshing(false), 500);
      }
    }
  };



  const loadFolders = async () => {
    try {
      const response = await fetch('/api/folders', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (response.ok) {
        const data = await response.json();
        setFolders(data.folders || []);
      }
    } catch (error) {
      console.error('Error loading folders:', error);
    }
  };

  const loadDatasets = async () => {
    try {
      const response = await fetch('/api/datasets', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (response.ok) {
        const data = await response.json();
        setDatasets(data.datasets || []);
      }
    } catch (error) {
      console.error('Error loading datasets:', error);
    }
  };  const loadTables = async (folder: string) => {
    if (!folder) return;
    try {
      const response = await fetch(`/api/folder-tables?folder=${encodeURIComponent(folder)}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (response.ok) {
        const data = await response.json();
        setTables(data.tables || []);
      }
    } catch (error) {
      console.error('Error loading tables:', error);
      setTables([]);
    }
  };

  const handleCreateJob = () => {
    setEditingJob(null);
    setFormData({
      name: '',
      folder: '',
      table: '',
      schedule: '0 * * * *',
    });
    setShowDialog(true);
  };

  const handleEditJob = (job: CronJob) => {
    setEditingJob(job);
    setFormData({
      name: job.name,
      folder: job.folder,
      table: job.table,
      schedule: job.schedule,
    });
    loadTables(job.folder);
    setShowDialog(true);
  };

  const handleSaveJob = async () => {
    try {
      const jobData = {
        name: formData.name,
        folder: formData.folder,
        table: formData.table,
        schedule: isCustomSchedule ? customSchedule : formData.schedule,
        customSchedule: isCustomSchedule ? customSchedule : null,
        startTime: isCustomSchedule ? startTime : null,
        endTime: isCustomSchedule ? endTime : null
      };

      if (editingJob) {
        const response = await fetch('/api/cron-jobs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: editingJob.id, ...jobData })
        });
        
        if (!response.ok) throw new Error('Failed to update job');
      } else {
        const response = await fetch('/api/cron-jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jobData)
        });
        
        if (!response.ok) throw new Error('Failed to create job');
      }
      
      setShowDialog(false);
      loadCronJobs();
    } catch (error) {
      console.error('Error saving cron job:', error);
      alert('Failed to save cron job');
    }
  };

  const handleToggleJob = async (id: number | string) => {
    try {
      const job = cronJobs.find(j => j.id === id);
      if (!job) return;

      const response = await fetch('/api/cron-jobs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: id, enabled: !job.enabled })
      });
      
      if (!response.ok) throw new Error('Failed to toggle job');
      loadCronJobs();
    } catch (error) {
      console.error('Error toggling cron job:', error);
      alert('Failed to toggle cron job');
    }
  };

  const handleDeleteJob = async (id: number | string) => {
    if (!confirm('Are you sure you want to delete this cron job?')) return;
    
    try {
      const response = await fetch('/api/cron-jobs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: id })
      });
      
      if (!response.ok) throw new Error('Failed to delete job');
      loadCronJobs();
    } catch (error) {
      console.error('Error deleting cron job:', error);
      alert('Failed to delete cron job');
    }
  };

  const handleRunNow = async (id: number | string) => {
    try {
      const job = cronJobs.find(j => j.id === id);
      if (!job) return;

      // อัพเดทสถานะเป็น running ทันที
      setCronJobs(cronJobs.map(j => 
        j.id === id ? { ...j, status: 'running' } : j
      ));

      const response = await fetch('/api/cron-jobs/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: id })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        alert(`✅ Job "${job.name}" executed successfully!`);
      } else {
        // แสดง error message ที่ละเอียด
        const errorMsg = data.details 
          ? `Error: ${data.error}\nDetails: ${JSON.stringify(data.details, null, 2)}`
          : `Error: ${data.error || 'Unknown error'}`;
        alert(`❌ Failed to run job "${job.name}":\n\n${errorMsg}`);
        console.error('Job execution error:', data);
      }
      
      // โหลดข้อมูลใหม่
      loadCronJobs();
    } catch (error: any) {
      console.error('Error running job:', error);
      alert(`❌ Network error: ${error.message}\n\nCannot connect to API. Check if the application is running.`);
      loadCronJobs();
    }
  };

  const formatSchedule = (schedule: string) => {
    const scheduleMap: { [key: string]: string } = {
      '*/10 * * * * *': 'ทุก 10 วินาที',
      '*/30 * * * * *': 'ทุก 30 วินาที',
      '0 * * * * *': 'ทุก 1 นาที',
      '0 */5 * * * *': 'ทุก 5 นาที',
      '0 */10 * * * *': 'ทุก 10 นาที',
      '0 */30 * * * *': 'ทุก 30 นาที',
      '0 0 * * * *': 'ทุก 1 ชั่วโมง',
    };
    
    if (scheduleMap[schedule]) return scheduleMap[schedule];
    
    // Parse custom seconds
    if (schedule.startsWith('*/') && schedule.endsWith('* * * * *')) {
      const seconds = schedule.split(' ')[0].replace('*/', '');
      return `ทุก ${seconds} วินาที`;
    }
    
    return schedule;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (!mounted) return null;

  return (
    <>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Cron Jobs</h1>
            <p className="text-gray-600">Schedule automatic data synchronization • Scheduler runs automatically</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => loadCronJobs(true)}
              disabled={refreshing}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
              title="Refresh cron jobs"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={async () => {
                if (confirm('Clear all stuck running jobs?')) {
                  try {
                    const res = await fetch('/api/cron-jobs/clear-stuck', { method: 'POST' });
                    const data = await res.json();
                    alert(data.message || 'Jobs cleared');
                    loadCronJobs();
                  } catch (error) {
                    alert('Failed to clear stuck jobs');
                  }
                }
              }}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
              title="Clear stuck running jobs"
            >
              <AlertCircle className="w-5 h-5" />
              Clear Stuck
            </button>
            <button
              onClick={handleCreateJob}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Job
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : cronJobs.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No cron jobs yet</h3>
          <p className="text-gray-600 mb-6">Create your first cron job to automate data synchronization</p>
          <button
            onClick={handleCreateJob}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create First Job
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {cronJobs.map((job) => (
            <div key={job.id} className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{job.name}</h3>
                    {job.enabled ? (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Active</span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">Paused</span>
                    )}
                    {job.status === 'running' && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Running
                      </span>
                    )}
                    {job.status === 'success' && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">Success</span>
                    )}
                    {job.status === 'failed' && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                        <AlertCircle className="w-3 h-3" />
                        Failed
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Database className="w-4 h-4" />
                      <span>{job.folder}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Table2 className="w-4 h-4" />
                      <span>{job.table}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="w-4 h-4" />
                      <span>{formatSchedule(job.schedule)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>Next: {formatDate(job.nextRun)}</span>
                    </div>
                  </div>
                  
                  {job.lastRun && (
                    <p className="text-xs text-gray-500 mt-2">
                      Last run: {formatDate(job.lastRun)}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleRunNow(job.id)}
                    disabled={job.status === 'running'}
                    className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Run now"
                  >
                    <Play className="w-4 h-4 text-gray-600" />
                  </button>
                  <button
                    onClick={() => handleToggleJob(job.id)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                    title={job.enabled ? 'Pause' : 'Resume'}
                  >
                    {job.enabled ? (
                      <Pause className="w-4 h-4 text-gray-600" />
                    ) : (
                      <Play className="w-4 h-4 text-gray-600" />
                    )}
                  </button>

                  <button
                    onClick={() => handleEditJob(job)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                    title="Edit"
                  >
                    <Settings className="w-4 h-4 text-gray-600" />
                  </button>
                  <button
                    onClick={() => handleDeleteJob(job.id)}
                    className="p-2 hover:bg-red-50 rounded-lg"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingJob ? 'Edit Cron Job' : 'Create Cron Job'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Daily Sales Sync"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Folder</label>
                <select
                  value={formData.folder}
                  onChange={(e) => {
                    setFormData({ ...formData, folder: e.target.value, table: '' });
                    loadTables(e.target.value);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select folder</option>
                  {folders.map((folder) => (
                    <option key={folder.name} value={folder.name}>{folder.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Table</label>
                <select
                  value={formData.table}
                  onChange={(e) => setFormData({ ...formData, table: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!formData.folder}
                >
                  <option value="">Select table</option>
                  {tables.map((table) => (
                    <option key={table.table_name} value={table.table_name}>{table.table_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Schedule</label>
                <select
                  value={isCustomSchedule ? 'custom' : formData.schedule}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setIsCustomSchedule(true);
                      // Default to 30 seconds if switching to custom
                      const defaultCustom = '*/30 * * * * *';
                      setCustomSchedule(defaultCustom);
                      setFormData({ ...formData, schedule: defaultCustom });
                    } else {
                      setIsCustomSchedule(false);
                      setFormData({ ...formData, schedule: e.target.value });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="*/10 * * * * *">ทุก 10 วินาที</option>
                  <option value="*/30 * * * * *">ทุก 30 วินาที</option>
                  <option value="0 * * * * *">ทุก 1 นาที</option>
                  <option value="0 */5 * * * *">ทุก 5 นาที</option>
                  <option value="0 */10 * * * *">ทุก 10 นาที</option>
                  <option value="0 */30 * * * *">ทุก 30 นาที</option>
                  <option value="0 0 * * * *">ทุก 1 ชั่วโมง</option>
                  <option value="custom">กำหนดเอง (Custom)</option>
                </select>
                {isCustomSchedule && (
                  <div className="mt-3 space-y-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">ทำงานทุกๆ (วินาที)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="10"
                          max="3600"
                          value={customSchedule.startsWith('*/') ? customSchedule.split(' ')[0].replace('*/', '') : '30'}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 30;
                            // Ensure minimum 10 seconds to prevent spam
                            const seconds = Math.max(10, val); 
                            const cron = `*/${seconds} * * * * *`;
                            setCustomSchedule(cron);
                            setFormData({ ...formData, schedule: cron });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-500">วินาที</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Cron Expression: {customSchedule}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">เวลาเริ่ม (Start Time)</label>
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">เวลาสิ้นสุด (End Time)</label>
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-blue-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      ระบบจะทำงานเฉพาะในช่วงเวลาที่กำหนดเท่านั้น
                    </p>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">{formatSchedule(formData.schedule)}</p>
                {isCustomSchedule && startTime && endTime && (
                  <p className="text-xs text-gray-500">
                    ช่วงเวลา: {startTime} - {endTime}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDialog(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveJob}
                disabled={!formData.name || !formData.folder || !formData.table}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingJob ? 'Save Changes' : 'Create Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

