import React from 'react';
import { Play, Save, Clock, ChevronDown, Trash2, RefreshCw } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { SavedQuery } from '../../types/database';

interface QueryEditorProps {
  sql: string;
  setSql: (value: string) => void;
  isQueryRunning: boolean;
  handleRunQuery: () => void;
  setShowSaveQueryDialog: (show: boolean) => void;
  savedQueries: SavedQuery[];
  handleLoadSavedQuery: (query: SavedQuery) => void;
  handleDeleteSavedQuery: (id: string, e: React.MouseEvent) => void;
  queryError: string | null;
  queryTabResult: any;
}

export default function QueryEditor({
  sql,
  setSql,
  isQueryRunning,
  handleRunQuery,
  setShowSaveQueryDialog,
  savedQueries,
  handleLoadSavedQuery,
  handleDeleteSavedQuery,
  queryError,
  queryTabResult
}: QueryEditorProps) {
  return (
    <div className="flex flex-col h-[calc(100vh-250px)]">
      {/* Query Toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunQuery}
            disabled={isQueryRunning || !sql.trim()}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isQueryRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Run
          </button>
          <button
            onClick={() => setShowSaveQueryDialog(true)}
            disabled={!sql.trim()}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>
        
        {/* Saved Queries Dropdown */}
        <div className="relative group">
          <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm text-gray-700">
            <Clock className="w-4 h-4 text-gray-500" />
            Saved Queries
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
          <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 hidden group-hover:block z-50 max-h-96 overflow-y-auto">
            {savedQueries.length === 0 ? (
              <div className="px-4 py-2 text-sm text-gray-500 text-center">No saved queries</div>
            ) : (
              savedQueries.map((q) => (
                <div key={q.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 group/item">
                  <button
                    onClick={() => handleLoadSavedQuery(q)}
                    className="flex-1 text-left text-sm text-gray-700 truncate mr-2"
                    title={q.description || q.name}
                  >
                    {q.name}
                  </button>
                  <button
                    onClick={(e) => handleDeleteSavedQuery(q.id, e)}
                    className="p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover/item:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Editor & Results Split */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Editor */}
        <div className="h-1/2 border-b min-h-[200px]">
          <Editor
            height="100%"
            defaultLanguage="sql"
            value={sql}
            onChange={(value) => setSql(value || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto bg-white">
          {queryError ? (
            <div className="p-4 text-red-600 bg-red-50 border-l-4 border-red-500 m-4">
              <h4 className="font-bold mb-1">Error Executing Query</h4>
              <pre className="whitespace-pre-wrap text-sm font-mono">{queryError}</pre>
            </div>
          ) : queryTabResult ? (
            <div className="flex flex-col h-full">
              <div className="px-4 py-2 bg-gray-50 border-b flex justify-between items-center">
                <span className="text-sm text-gray-600">
                  {queryTabResult.rowCount} rows found ({queryTabResult.duration}ms)
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-r bg-gray-50 w-12 text-center">#</th>
                      {queryTabResult.fields.map((field: string) => (
                        <th key={field} className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-r bg-gray-50 whitespace-nowrap min-w-[100px]">
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryTabResult.rows.map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-blue-50">
                        <td className="px-3 py-2 text-gray-500 text-center border-b border-r font-mono text-xs">
                          {idx + 1}
                        </td>
                        {queryTabResult.fields.map((field: string, colIdx: number) => (
                          <td key={colIdx} className="px-3 py-2 text-gray-700 border-b border-r max-w-xs truncate" title={String(row[field])}>
                            {row[field] === null ? <span className="text-gray-400 italic">null</span> : String(row[field])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <Play className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Run a query to see results</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
