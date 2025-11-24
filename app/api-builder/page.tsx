'use client';

import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Link as LinkIcon, Settings, Play, X } from 'lucide-react';
import { Dataset, Folder, TableInfo } from '../../types/database';

export default function ApiBuilderPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTables, setSelectedTables] = useState<{ dataset: string; folder?: string; table: string }[]>([]);
  const [apiName, setApiName] = useState('');
  const [apiSlug, setApiSlug] = useState('');
  const [joinType, setJoinType] = useState<'combine' | 'separate'>('separate');
  const [savedApis, setSavedApis] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);

  useEffect(() => {
    fetchDatasets();
    fetchSavedApis();
  }, []);

  const fetchDatasets = async () => {
    try {
      const response = await fetch('/api/datasets');
      if (response.ok) {
        const data = await response.json();
        setDatasets(data);
      }
    } catch (error) {
      console.error('Error fetching datasets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSavedApis = async () => {
    try {
      const response = await fetch('/api/api-builder/config');
      if (response.ok) {
        const data = await response.json();
        setSavedApis(data);
      }
    } catch (error) {
      console.error('Error fetching saved APIs:', error);
    }
  };

  const handlePreview = async (slug: string) => {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewSlug(slug);
    setPreviewData(null);
    
    try {
      const response = await fetch(`/api/custom/${slug}`);
      if (response.ok) {
        const data = await response.json();
        setPreviewData(data);
      } else {
        setPreviewError('Failed to fetch API data');
      }
    } catch (error) {
      console.error('Error previewing API:', error);
      setPreviewError('Error previewing API');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleTableToggle = (datasetName: string, tableName: string, folderName?: string) => {
    setSelectedTables(prev => {
      const exists = prev.find(t => t.dataset === datasetName && t.table === tableName && t.folder === folderName);
      if (exists) {
        return prev.filter(t => !(t.dataset === datasetName && t.table === tableName && t.folder === folderName));
      } else {
        return [...prev, { dataset: datasetName, folder: folderName, table: tableName }];
      }
    });
  };

  const handleSave = async () => {
    if (!apiName || !apiSlug || selectedTables.length === 0) {
      alert('Please fill in all fields and select at least one table');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/api-builder/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: apiName,
          slug: apiSlug,
          tables: selectedTables,
          type: joinType
        }),
      });

      if (response.ok) {
        alert('API Created Successfully!');
        fetchSavedApis();
        setApiName('');
        setApiSlug('');
        setSelectedTables([]);
      } else {
        alert('Failed to create API');
      }
    } catch (error) {
      console.error('Error saving API:', error);
      alert('Error saving API');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (slug: string) => {
    if (!confirm('Are you sure you want to delete this API?')) return;
    
    try {
      const response = await fetch(`/api/api-builder/config?slug=${slug}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        fetchSavedApis();
      }
    } catch (error) {
      console.error('Error deleting API:', error);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <LinkIcon className="w-6 h-6 text-blue-500" />
        API Builder
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Table Selection */}
        <div className="lg:col-span-1 bg-white rounded-lg shadow p-4 h-[calc(100vh-200px)] overflow-y-auto">
          <h2 className="font-semibold mb-4 text-gray-700">Select Tables</h2>
          {loading ? (
            <div className="text-center py-4">Loading...</div>
          ) : (
            <div className="space-y-4">
              {datasets.map(dataset => (
                <div key={dataset.name} className="border-b pb-2">
                  <div className="font-medium text-gray-800 mb-2">{dataset.name}</div>
                  
                  {/* Root Tables */}
                  <div className="ml-2 space-y-1">
                    {dataset.tables.map(table => (
                      <label key={table.name} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedTables.some(t => t.dataset === dataset.name && t.table === table.name && !t.folder)}
                          onChange={() => handleTableToggle(dataset.name, table.name)}
                          className="rounded text-blue-500"
                        />
                        <span className="text-sm text-gray-600">{table.name}</span>
                      </label>
                    ))}
                  </div>

                  {/* Folders */}
                  {dataset.folders?.map(folder => (
                    <div key={folder.name} className="ml-2 mt-2">
                      <div className="text-sm font-medium text-gray-500 flex items-center gap-1">
                        <span className="w-4 h-4">📁</span> {folder.name}
                      </div>
                      <div className="ml-4 space-y-1 border-l-2 border-gray-100 pl-2 mt-1">
                        {folder.tables.map(table => (
                          <label key={table.name} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={selectedTables.some(t => t.dataset === dataset.name && t.table === table.name && t.folder === folder.name)}
                              onChange={() => handleTableToggle(dataset.name, table.name, folder.name)}
                              className="rounded text-blue-500"
                            />
                            <span className="text-sm text-gray-600">{table.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Middle Column: Configuration */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold mb-4 text-gray-700 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Configuration
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Name</label>
                <input
                  type="text"
                  value={apiName}
                  onChange={(e) => setApiName(e.target.value)}
                  placeholder="e.g. All Users Data"
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Slug (URL)</label>
                <div className="flex items-center">
                  <span className="bg-gray-100 border border-r-0 rounded-l-lg px-3 py-2 text-gray-500 text-sm">/api/custom/</span>
                  <input
                    type="text"
                    value={apiSlug}
                    onChange={(e) => setApiSlug(e.target.value)}
                    placeholder="all-users"
                    className="w-full border rounded-r-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Join Type</label>
              <select
                value={joinType}
                onChange={(e) => setJoinType(e.target.value as 'combine' | 'separate')}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="separate">Separate (Object with keys)</option>
                <option value="combine">Combine (Union - Append rows)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {joinType === 'separate' 
                  ? 'Returns an object: { "table1": [...], "table2": [...] }'
                  : 'Returns a single array with all rows from selected tables (requires same structure)'}
              </p>
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Selected Tables ({selectedTables.length})</h3>
              <div className="flex flex-wrap gap-2">
                {selectedTables.map((t, i) => (
                  <span key={i} className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-sm border border-blue-100 flex items-center gap-1">
                    {t.folder ? `${t.folder}/` : ''}{t.table}
                    <button 
                      onClick={() => handleTableToggle(t.dataset, t.table, t.folder)}
                      className="hover:text-blue-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {selectedTables.length === 0 && (
                  <span className="text-gray-400 text-sm italic">No tables selected</span>
                )}
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={isSaving || selectedTables.length === 0}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Creating...' : 'Create API'}
            </button>
          </div>

          {/* Saved APIs List */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold mb-4 text-gray-700">Active APIs</h2>
            <div className="space-y-3">
              {savedApis.length === 0 ? (
                <div className="text-center text-gray-500 py-4">No custom APIs created yet</div>
              ) : (
                savedApis.map((api) => (
                  <div key={api.slug} className="border rounded-lg p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div>
                      <div className="font-medium text-gray-800">{api.name}</div>
                      <div className="text-sm text-gray-500 flex items-center gap-2">
                        <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono">/api/custom/{api.slug}</span>
                        <span className="text-xs">• {api.tables.length} tables</span>
                        <span className="text-xs">• {api.type}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handlePreview(api.slug)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Preview Data"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <a 
                        href={`/api/custom/${api.slug}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Open API URL"
                      >
                        <Play className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => handleDelete(api.slug)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Preview Section */}
          {previewSlug && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-700">Preview: {previewSlug}</h2>
                <button onClick={() => setPreviewSlug(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {previewLoading ? (
                <div className="text-center py-8 text-gray-500">Loading data...</div>
              ) : previewError ? (
                <div className="text-center py-8 text-red-500">{previewError}</div>
              ) : previewData ? (
                <div className="overflow-x-auto">
                  {Array.isArray(previewData) ? (
                    // Combine Mode (Array of objects)
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {previewData.length > 0 && Object.keys(previewData[0]).map((key) => (
                            <th key={key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {previewData.slice(0, 10).map((row: any, idx: number) => (
                          <tr key={idx}>
                            {Object.values(row).map((val: any, i) => (
                              <td key={i} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    // Separate Mode (Object with keys as table names)
                    <div className="space-y-6">
                      {Object.entries(previewData).map(([tableName, rows]: [string, any]) => (
                        <div key={tableName}>
                          <h3 className="font-medium text-gray-700 mb-2 bg-gray-50 p-2 rounded">{tableName}</h3>
                          {Array.isArray(rows) && rows.length > 0 ? (
                            <div className="overflow-x-auto border rounded-lg">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    {Object.keys(rows[0]).map((key) => (
                                      <th key={key} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                        {key}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {rows.slice(0, 5).map((row: any, idx: number) => (
                                    <tr key={idx}>
                                      {Object.values(row).map((val: any, i) => (
                                        <td key={i} className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                          {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {rows.length > 5 && (
                                <div className="p-2 text-xs text-gray-500 text-center bg-gray-50 border-t">
                                  Showing first 5 of {rows.length} rows
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500 italic p-2">No data or error</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {Array.isArray(previewData) && previewData.length > 10 && (
                    <div className="mt-4 text-center text-sm text-gray-500">
                      Showing first 10 of {previewData.length} rows
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">No data available</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


