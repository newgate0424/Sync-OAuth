'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Save, Clock, Trash2, Plus, Search, Database, FileText, ChevronRight, MoreVertical, Check, X } from 'lucide-react';
import Editor, { useMonaco } from '@monaco-editor/react';

const PRESET_SCHEDULES = [
  '*/10 * * * * *',
  '*/30 * * * * *',
  '0 * * * * *',
  '0 */5 * * * *',
  '0 0 * * * *',
  '0 0 0 * * *'
];

interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  description?: string;
  schedule?: string;
  destination_table?: string;
  updated_at: string;
}

interface QueryResult {
  rows: any[];
  fields: string[];
  rowCount: number;
  duration: number;
  error?: string;
}

export default function QueryPage() {
  const [sql, setSql] = useState('');
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);
  
  // Save Dialog State
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newQueryName, setNewQueryName] = useState('');
  const [saveForm, setSaveForm] = useState({ name: '', description: '' });
  const [tables, setTables] = useState<string[]>([]);
  const tablesRef = useRef<string[]>([]);

  // Schedule Dialog State
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ 
    type: 'preset',
    schedule: '0 0 * * * *', 
    destination_table: '',
    dailyTime: '00:00',
    intervalValue: 1,
    intervalUnit: 'hours',
    customSchedule: ''
  });

  useEffect(() => {
    fetchSavedQueries();
    fetchTables();
  }, []);

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  const fetchSavedQueries = async () => {
    try {
      const res = await fetch('/api/query/saved');
      if (res.ok) {
        const data = await res.json();
        setSavedQueries(data.queries || []);
      }
    } catch (error) {
      console.error('Failed to load queries', error);
    }
  };

  const fetchTables = async () => {
    try {
      const res = await fetch('/api/datasets');
      if (res.ok) {
        const data = await res.json();
        const allTables: string[] = [];
        data.forEach((dataset: any) => {
          if (dataset.tables) {
            dataset.tables.forEach((table: any) => {
              allTables.push(table.name);
            });
          }
        });
        setTables(allTables);
      }
    } catch (error) {
      console.error('Failed to load tables', error);
    }
  };

  const handleRunQuery = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql })
      });
      
      const data = await res.json();
      
      if (data.success) {
        setResult({
          rows: data.rows,
          fields: data.fields,
          rowCount: data.rowCount,
          duration: data.duration
        });
      } else {
        setResult({
          rows: [],
          fields: [],
          rowCount: 0,
          duration: data.duration,
          error: data.error
        });
      }
    } catch (error: any) {
      setResult({
        rows: [],
        fields: [],
        rowCount: 0,
        duration: 0,
        error: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveQuery = async () => {
    if (!saveForm.name) return;
    setSaving(true);

    try {
      const method = selectedQueryId ? 'PUT' : 'POST';
      const body: any = {
        name: saveForm.name,
        description: saveForm.description,
        sql: sql
      };
      
      if (selectedQueryId) body.id = selectedQueryId;

      const res = await fetch('/api/query/saved', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        await fetchSavedQueries();
        setShowSaveDialog(false);
        if (!selectedQueryId) {
            const data = await res.json();
            setSelectedQueryId(data.query.id);
        }
      }
    } catch (error) {
      console.error('Failed to save', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuery = async (id: string) => {
    if (!confirm('Are you sure you want to delete this query?')) return;
    
    try {
      await fetch('/api/query/saved', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      
      if (selectedQueryId === id) {
        setSelectedQueryId(null);
        setSql('');
      }
      fetchSavedQueries();
    } catch (error) {
      console.error('Failed to delete', error);
    }
  };

  const handleScheduleQuery = async () => {
    // This would typically create a cron job linked to this query
    // For now, we'll just save the schedule settings to the query
    if (!selectedQueryId) {
        alert('Please save the query first before scheduling.');
        return;
    }

    try {
        if (scheduleForm.type === 'none') {
            const res = await fetch('/api/query/saved', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: selectedQueryId,
                    schedule: null,
                    destination_table: scheduleForm.destination_table
                })
            });

            if (res.ok) {
                // Delete cron job
                await fetch('/api/cron-jobs', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ queryId: selectedQueryId })
                });

                alert('Schedule removed successfully');
                setShowScheduleDialog(false);
                fetchSavedQueries();
                return;
            }
        }

        let finalSchedule = scheduleForm.schedule;
        
        if (scheduleForm.type === 'daily') {
            const [hours, minutes] = scheduleForm.dailyTime.split(':');
            finalSchedule = `0 ${parseInt(minutes)} ${parseInt(hours)} * * *`;
        } else if (scheduleForm.type === 'interval') {
            if (scheduleForm.intervalUnit === 'minutes') {
                finalSchedule = `0 */${scheduleForm.intervalValue} * * * *`;
            } else {
                finalSchedule = `0 0 */${scheduleForm.intervalValue} * * *`;
            }
        } else if (scheduleForm.type === 'cron') {
            finalSchedule = scheduleForm.customSchedule;
        }
        
        const res = await fetch('/api/query/saved', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: selectedQueryId,
                schedule: finalSchedule,
                destination_table: scheduleForm.destination_table
            })
        });

        if (res.ok) {
            // Also create/update the actual cron job
            await fetch('/api/cron-jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: `Query: ${saveForm.name}`,
                    folder: 'system', // Special folder for queries
                    table: scheduleForm.destination_table || 'query_result',
                    schedule: finalSchedule,
                    type: 'query', // New type
                    queryId: selectedQueryId,
                    sql: sql
                })
            });

            alert('Schedule updated successfully');
            setShowScheduleDialog(false);
            fetchSavedQueries();
        }
    } catch (error) {
        console.error('Failed to schedule', error);
        alert('Failed to schedule query');
    }
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        
        const suggestions = tablesRef.current.map(table => ({
          label: table,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: table,
          range: range,
        }));
        
        return { suggestions: suggestions };
      }
    });
  };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="font-semibold text-gray-700">Saved Queries</h2>
          <button 
            onClick={() => {
              setSelectedQueryId(null);
              setSql('');
              setSaveForm({ name: '', description: '' });
              setResult(null);
            }}
            className="p-1 hover:bg-gray-100 rounded-full"
            title="New Query"
          >
            <Plus className="w-5 h-5 text-blue-600" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {savedQueries.map(q => (
            <div 
              key={q.id}
              className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer text-sm ${
                selectedQueryId === q.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
              }`}
              onClick={() => {
                setSelectedQueryId(q.id);
                setSql(q.sql);
                setSaveForm({ name: q.name, description: q.description || '' });
                
                // Parse schedule
                const schedule = q.schedule;
                let type = 'preset';
                let dailyTime = '00:00';
                let intervalValue = 1;
                let intervalUnit = 'hours';
                let customSchedule = '';

                if (!schedule) {
                    type = 'none';
                } else if (PRESET_SCHEDULES.includes(schedule)) {
                    type = 'preset';
                } else if (schedule.match(/^0 \d{1,2} \d{1,2} \* \* \*$/)) {
                    // Daily: 0 mm HH * * *
                    type = 'daily';
                    const parts = schedule.split(' ');
                    dailyTime = `${parts[2].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
                } else if (schedule.match(/^0 \*\/(\d+) \* \* \* \*$/)) {
                    // Interval minutes: 0 */n * * * *
                    type = 'interval';
                    intervalUnit = 'minutes';
                    intervalValue = parseInt(schedule.match(/^0 \*\/(\d+) \* \* \* \*$/)![1]);
                } else if (schedule.match(/^0 0 \*\/(\d+) \* \* \*$/)) {
                    // Interval hours: 0 0 */n * * *
                    type = 'interval';
                    intervalUnit = 'hours';
                    intervalValue = parseInt(schedule.match(/^0 0 \*\/(\d+) \* \* \*$/)![1]);
                } else {
                    type = 'cron';
                    customSchedule = schedule;
                }

                setScheduleForm({
                    type,
                    schedule: schedule || '0 0 * * * *',
                    destination_table: q.destination_table || '',
                    dailyTime,
                    intervalValue,
                    intervalUnit,
                    customSchedule
                });
              }}
            >
              <div className="flex items-center gap-2 truncate">
                <FileText className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{q.name}</span>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteQuery(q.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded text-red-500"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunQuery}
              disabled={loading || !sql.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Play className="w-4 h-4" />}
              Run
            </button>
            <button
              onClick={() => setShowSaveDialog(true)}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium"
            >
              <Save className="w-4 h-4" />
              {selectedQueryId ? 'Save' : 'Save As'}
            </button>
            <button
              onClick={() => setShowScheduleDialog(true)}
              disabled={!selectedQueryId}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium disabled:opacity-50"
            >
              <Clock className="w-4 h-4" />
              Schedule
            </button>
          </div>
          <div className="text-sm text-gray-500">
            {result && (
              <span>
                {result.rowCount} rows • {result.duration}ms
              </span>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="h-1/2 bg-white border-b border-gray-200 relative">
          <Editor
            height="100%"
            defaultLanguage="sql"
            value={sql}
            onChange={(value) => setSql(value || '')}
            onMount={handleEditorDidMount}
            options={{
              fontSize: 14,
              lineHeight: 1.6,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 16, bottom: 16 },
            }}
          />
        </div>

        {/* Results */}
        <div className="flex-1 bg-gray-50 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-gray-200 bg-white text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Query Results
          </div>
          <div className="flex-1 overflow-auto">
            {result?.error ? (
              <div className="p-4 text-red-600 bg-red-50 border-l-4 border-red-500 m-4">
                <h3 className="font-bold mb-1">Error executing query</h3>
                <pre className="text-sm whitespace-pre-wrap">{result.error}</pre>
              </div>
            ) : result?.rows && result.rows.length > 0 ? (
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-600 font-medium sticky top-0">
                  <tr>
                    {result.fields.map(field => (
                      <th key={field} className="px-4 py-2 border-b border-gray-200 whitespace-nowrap">
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {result.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {result.fields.map(field => (
                        <td key={field} className="px-4 py-2 whitespace-nowrap max-w-xs truncate">
                          {row[field] === null ? <span className="text-gray-400 italic">null</span> : String(row[field])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : result ? (
              <div className="p-8 text-center text-gray-500">
                No data returned
              </div>
            ) : (
              <div className="p-8 text-center text-gray-400">
                Run a query to see results
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96">
            <h3 className="text-lg font-bold mb-4">Save Query</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={saveForm.name}
                  onChange={e => setSaveForm({ ...saveForm, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="My Query"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={saveForm.description}
                  onChange={e => setSaveForm({ ...saveForm, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="What does this query do?"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveQuery}
                  disabled={!saveForm.name || saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Dialog */}
      {showScheduleDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-[500px]">
            <h3 className="text-lg font-bold mb-4">Schedule Query</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frequency Type</label>
                <select
                  value={scheduleForm.type}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 mb-3"
                >
                  <option value="none">None (Unscheduled)</option>
                  <option value="preset">Preset</option>
                  <option value="daily">Daily at specific time</option>
                  <option value="interval">Every X minutes/hours</option>
                  <option value="cron">Custom Cron Expression</option>
                </select>

                {scheduleForm.type === 'preset' && (
                  <select
                    value={scheduleForm.schedule}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, schedule: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="*/10 * * * * *">Every 10 seconds</option>
                    <option value="*/30 * * * * *">Every 30 seconds</option>
                    <option value="0 * * * * *">Every 1 minute</option>
                    <option value="0 */5 * * * *">Every 5 minutes</option>
                    <option value="0 0 * * * *">Every 1 hour</option>
                    <option value="0 0 0 * * *">Every day at midnight</option>
                  </select>
                )}

                {scheduleForm.type === 'daily' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Time (24h)</label>
                    <input
                      type="time"
                      value={scheduleForm.dailyTime}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, dailyTime: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                {scheduleForm.type === 'interval' && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Every</label>
                      <input
                        type="number"
                        min="1"
                        value={scheduleForm.intervalValue}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, intervalValue: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                      <select
                        value={scheduleForm.intervalUnit}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, intervalUnit: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                      </select>
                    </div>
                  </div>
                )}

                {scheduleForm.type === 'cron' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cron Expression</label>
                    <input
                        type="text"
                        value={scheduleForm.customSchedule}
                        onChange={e => setScheduleForm({ ...scheduleForm, customSchedule: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="*/15 * * * * *"
                    />
                    <p className="text-xs text-gray-500 mt-1">Format: sec min hour day month day-of-week</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Destination Table</label>
                <input
                  type="text"
                  value={scheduleForm.destination_table}
                  onChange={e => setScheduleForm({ ...scheduleForm, destination_table: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., daily_summary_report"
                />
                <p className="text-xs text-gray-500 mt-1">
                    Results will be saved to this table. If it doesn't exist, it will be created.
                    Existing data will be replaced (WRITE_TRUNCATE).
                </p>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowScheduleDialog(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleScheduleQuery}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
