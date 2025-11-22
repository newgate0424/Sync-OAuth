import React from 'react';
import { Search, X, RefreshCw, Table2, Folder as FolderIcon, Database } from 'lucide-react';
import QueryEditor from './QueryEditor';
import { SavedQuery, Dataset } from '../../types/database';

interface TableViewProps {
  selectedTable: { dataset: string; table: string; folder?: string; folderName?: string };
  activeTab: 'schema' | 'details' | 'preview' | 'query';
  handleTabChange: (tab: 'schema' | 'details' | 'preview' | 'query') => void;
  tableSchema: any;
  totalRows: number;
  queryResult: any;
  filteredData: any;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  handleSearch: (q: string, page?: number) => void;
  rowsPerPage: number;
  setRowsPerPage: (n: number) => void;
  currentPage: number;
  setCurrentPage: (n: number) => void;
  expandedCell: { rowIdx: number; colIdx: number } | null;
  setExpandedCell: (cell: { rowIdx: number; colIdx: number } | null) => void;
  syncConfig: any;
  tableSyncLoading: { [key: string]: boolean };
  setTableSyncLoading: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>;
  executeQueryForTable: (dataset: string, table: string, page?: number, limit?: number) => Promise<void>;
  fetchDatasets: () => Promise<void>;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  datasets: Dataset[];
  
  // QueryEditor Props
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

export default function TableView({
  selectedTable,
  activeTab,
  handleTabChange,
  tableSchema,
  totalRows,
  queryResult,
  filteredData,
  searchQuery,
  setSearchQuery,
  handleSearch,
  rowsPerPage,
  setRowsPerPage,
  currentPage,
  setCurrentPage,
  expandedCell,
  setExpandedCell,
  syncConfig,
  tableSyncLoading,
  setTableSyncLoading,
  executeQueryForTable,
  fetchDatasets,
  showToast,
  sql,
  setSql,
  isQueryRunning,
  handleRunQuery,
  setShowSaveQueryDialog,
  savedQueries,
  handleLoadSavedQuery,
  handleDeleteSavedQuery,
  queryError,
  queryTabResult,
  datasets
}: TableViewProps) {
  return (
    <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col min-w-0">
      {/* Table Header with Breadcrumb */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
          <span className="font-medium text-blue-600">{selectedTable.dataset}</span>
          {selectedTable.folderName && (
            <>
              <span>/</span>
              <span className="font-medium text-gray-700">{selectedTable.folderName}</span>
            </>
          )}
          <span>/</span>
          <span className="font-medium text-gray-900">{selectedTable.table}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <button 
            onClick={() => handleTabChange('query')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm font-medium"
          >
            Query
          </button>
          <button 
            onClick={() => {
              // Export ข้อมูลเป็น CSV
              const data = filteredData || queryResult;
              if (!data?.rows || data.rows.length === 0) {
                showToast('ไม่มีข้อมูลให้ Export', 'error');
                return;
              }
              
              // สร้าง CSV content
              const headers = Object.keys(data.rows[0]).filter(key => key !== 'id' && key !== 'synced_at');
              const csvContent = [
                headers.join(','),
                ...data.rows.map((row: any) => 
                  headers.map(header => {
                    const value = row[header];
                    // Escape คำที่มี comma หรือ quote
                    if (value === null || value === undefined) return '';
                    const str = String(value);
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                      return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                  }).join(',')
                )
              ].join('\n');
              
              // Download file
              const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
              const link = document.createElement('a');
              const url = URL.createObjectURL(blob);
              link.setAttribute('href', url);
              link.setAttribute('download', `${selectedTable.table}_${new Date().toISOString().slice(0,10)}.csv`);
              link.style.visibility = 'hidden';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm"
          >
            Export
          </button>
          <button 
            onClick={async () => {
              if (!selectedTable) return;
              const tableKey = `${selectedTable.dataset}.${selectedTable.table}`;
              setTableSyncLoading(prev => ({ ...prev, [tableKey]: true }));
              await executeQueryForTable(selectedTable.dataset, selectedTable.table);
              await fetchDatasets();
              setTableSyncLoading(prev => ({ ...prev, [tableKey]: false }));
            }}
            disabled={selectedTable ? tableSyncLoading[`${selectedTable.dataset}.${selectedTable.table}`] : true}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:bg-gray-200"
          >
            <RefreshCw className={`w-4 h-4 ${selectedTable && tableSyncLoading[`${selectedTable.dataset}.${selectedTable.table}`] ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button 
            onClick={async () => {
              if (!selectedTable) return;
              const tableKey = `${selectedTable.dataset}.${selectedTable.table}`;
              setTableSyncLoading(prev => ({ ...prev, [tableKey]: true }));
              try {
                const response = await fetch('/api/sync-table', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ dataset: selectedTable.dataset, tableName: selectedTable.table }),
                });
                const data = await response.json();
                if (response.ok) {
                  showToast(`ซิงค์ข้อมูลสำเร็จ: ${data.stats ? `${data.stats.total} แถว (${data.stats.inserted} inserted, ${data.stats.updated} updated, ${data.stats.deleted} deleted)` : '0 แถว'}`, 'success');
                  executeQueryForTable(selectedTable.dataset, selectedTable.table);
                  fetchDatasets();
                } else {
                  showToast(data.error || 'เกิดข้อผิดพลาดในการซิงค์', 'error');
                }
              } catch (error) {
                showToast('เกิดข้อผิดพลาด', 'error');
              }
              setTableSyncLoading(prev => ({ ...prev, [tableKey]: false }));
            }}
            disabled={selectedTable ? tableSyncLoading[`${selectedTable.dataset}.${selectedTable.table}`] : true}
            className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300"
          >
            <RefreshCw className={`w-4 h-4 ${selectedTable && tableSyncLoading[`${selectedTable.dataset}.${selectedTable.table}`] ? 'animate-spin' : ''}`} />
            Sync
          </button>
          <button 
            onClick={async () => {
              if (!selectedTable) return;
              try {
                const tokenRes = await fetch('/api/cron-token');
                const { token } = await tokenRes.json();
                const baseUrl = window.location.origin;
                const syncUrl = `${baseUrl}/api/sync-cron?token=${token}&dataset=${selectedTable.dataset}&table=${selectedTable.table}`;
                navigator.clipboard.writeText(syncUrl);
                showToast('คัดลอก Sync URL สำเร็จ! สามารถนำไปใช้กับ Cron Job ได้', 'success');
              } catch (error) {
                showToast('เกิดข้อผิดพลาดในการดึง token', 'error');
              }
            }}
            disabled={!selectedTable}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm disabled:bg-gray-200"
          >
            Copy Sync URL
          </button>
        </div>

        {/* Search Box */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหาในตาราง..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch(searchQuery);
                }
              }}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  if (selectedTable) {
                    setCurrentPage(1);
                    executeQueryForTable(selectedTable.dataset, selectedTable.table, 1, rowsPerPage);
                  }
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => handleSearch(searchQuery)}
            disabled={!searchQuery}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            ค้นหา
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => handleTabChange('schema')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'schema'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Schema
          </button>
          <button
            onClick={() => handleTabChange('details')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => handleTabChange('preview')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'preview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => handleTabChange('query')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'query'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Query
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {/* Schema Tab */}
        {activeTab === 'schema' && tableSchema && (
          <div className="p-4">
            {tableSchema.error ? (
              <div className="text-gray-500">ไม่สามารถโหลด Schema ได้</div>
            ) : tableSchema.rows && tableSchema.rows.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 border-b">Field</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 border-b">Type</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 border-b">Null</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 border-b">Key</th>
                  </tr>
                </thead>
                <tbody>
                  {tableSchema.rows.map((row: any, idx: number) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-700">{row.Field}</td>
                      <td className="px-4 py-2 text-gray-600">{row.Type}</td>
                      <td className="px-4 py-2 text-gray-600">{row.Null}</td>
                      <td className="px-4 py-2 text-gray-600">{row.Key}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-gray-500 text-center py-8">ไม่มีข้อมูล Schema</div>
            )}
          </div>
        )}

        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="p-4">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Table Info</h4>
                <div className="bg-gray-50 rounded p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Dataset:</span>
                    <span className="font-medium">{selectedTable.dataset}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Table:</span>
                    <span className="font-medium">{selectedTable.table}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Rows:</span>
                    <span className="font-medium">{totalRows.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Loaded Rows:</span>
                    <span className="font-medium">{queryResult?.rows?.length || 0}</span>
                  </div>
                </div>
              </div>

              {/* Sync Statistics */}
              {syncConfig ? (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Sync Configuration</h4>
                  <div className="bg-gray-50 rounded p-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Spreadsheet ID:</span>
                      <span className="font-mono text-xs text-gray-500 truncate max-w-xs">
                        {syncConfig.spreadsheet_id}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Sheet Name:</span>
                      <span className="font-medium">{syncConfig.sheet_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Start Row:</span>
                      <span className="font-medium">{syncConfig.start_row || 1}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Has Header:</span>
                      <span className="font-medium">
                        {syncConfig.has_header ? '✓ Yes' : '✗ No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Last Sync:</span>
                      <span className="font-medium text-green-600">
                        {syncConfig.last_sync 
                          ? new Date(syncConfig.last_sync).toLocaleString('th-TH')
                          : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Skip Count:</span>
                      <span className="font-medium text-blue-600">
                        {syncConfig.skip_count || 0} times
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Checksum:</span>
                      <span className="font-mono text-xs text-gray-500">
                        {syncConfig.last_checksum?.substring(0, 16) || '-'}...
                      </span>
                    </div>
                    {syncConfig.skip_count > 0 && (
                      <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
                        💡 Data unchanged for last {syncConfig.skip_count} sync{syncConfig.skip_count > 1 ? 's' : ''} - skipped to save API quota
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Sync Configuration</h4>
                  <div className="bg-gray-50 rounded p-3 text-sm text-gray-500 text-center">
                    ไม่พบข้อมูล Sync Configuration
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Preview Tab */}
        {activeTab === 'preview' && queryResult && (
          <div className="h-full flex flex-col">
            {queryResult.error ? (
              <div className="m-4 text-red-600 bg-red-50 p-4 rounded">
                <p className="font-semibold">Error:</p>
                <p className="text-sm mt-1">{queryResult.error}</p>
              </div>
            ) : (filteredData || queryResult).rows && (filteredData || queryResult).rows.length > 0 ? (
              <>
                {filteredData && searchQuery && (
                  <div className="px-4 py-2 bg-blue-50 text-sm text-blue-700 border-b border-blue-200">
                    พบ {filteredData.rows.length} แถวจากการค้นหา "{searchQuery}"
                    {filteredData.rows.length >= 1000 && (
                      <span className="ml-2 text-orange-600">
                        (แสดงเฉพาะ 1,000 แถวแรก อาจมีเพิ่มเติม)
                      </span>
                    )}
                  </div>
                )}
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-sm border-collapse">
                  <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-r bg-gray-100 w-12 text-center">#</th>
                      {Object.keys((filteredData || queryResult).rows[0]).filter(key => key !== 'id' && key !== 'synced_at').map((key) => (
                        <th key={key} className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-r bg-gray-100 whitespace-nowrap max-w-[250px]">
                          <div className="truncate" title={key}>{key}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(filteredData || queryResult).rows.map((row: any, rowIdx: number) => (
                    <tr key={rowIdx} className="hover:bg-blue-50">
                      <td className="px-3 py-2 text-gray-500 text-center border-b border-r font-mono text-xs">
                        {(currentPage - 1) * rowsPerPage + rowIdx + 1}
                      </td>
                      {Object.entries(row).filter(([key]) => key !== 'id' && key !== 'synced_at').map(([key, value]: [string, any], colIdx: number) => {
                        const isExpanded = expandedCell?.rowIdx === rowIdx && expandedCell?.colIdx === colIdx;
                        return (
                          <td 
                            key={colIdx} 
                            className={`px-3 py-2 text-gray-700 border-b border-r relative ${!isExpanded ? 'max-w-[250px] truncate' : ''}`}
                            title={!isExpanded ? String(value) : ''}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setExpandedCell({ rowIdx, colIdx });
                            }}
                          >
                            {isExpanded ? (
                              <div 
                                className="absolute top-0 left-0 z-50 bg-white border border-blue-500 shadow-lg p-3 min-w-full w-max max-w-lg whitespace-pre-wrap break-words"
                                style={{ minHeight: '100%' }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {value !== null ? String(value) : <span className="text-gray-400 italic">null</span>}
                              </div>
                            ) : (
                              value !== null ? String(value) : <span className="text-gray-400 italic">null</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
                </div>
              
              {/* Pagination Controls - Footer */}
              <div className="bg-white border-t border-gray-300 px-4 py-3 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">Results per page:</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      const newLimit = parseInt(e.target.value);
                      setRowsPerPage(newLimit);
                      setCurrentPage(1);
                      if (selectedTable) {
                        if (searchQuery) {
                          handleSearch(searchQuery, 1);
                        } else {
                          executeQueryForTable(selectedTable.dataset, selectedTable.table, 1, newLimit);
                        }
                      }
                    }}
                    className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                    <option value="500">500</option>
                    <option value="1000">1000</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-700">
                    {Math.min((currentPage - 1) * rowsPerPage + 1, totalRows)} – {Math.min(currentPage * rowsPerPage, totalRows)} of {totalRows.toLocaleString()}
                  </span>
                  
                  <div className="flex gap-1">
                    {/* First Page */}
                    <button
                      onClick={() => {
                        setCurrentPage(1);
                        if (selectedTable) {
                          if (searchQuery) {
                            handleSearch(searchQuery, 1);
                          } else {
                            executeQueryForTable(selectedTable.dataset, selectedTable.table, 1, rowsPerPage);
                          }
                        }
                      }}
                      disabled={currentPage === 1}
                      className="px-2 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="First page"
                    >
                      |&lt;
                    </button>
                    
                    {/* Previous Page */}
                    <button
                      onClick={() => {
                        if (currentPage > 1) {
                          const newPage = currentPage - 1;
                          setCurrentPage(newPage);
                          if (selectedTable) {
                            if (searchQuery) {
                              handleSearch(searchQuery, newPage);
                            } else {
                              executeQueryForTable(selectedTable.dataset, selectedTable.table, newPage, rowsPerPage);
                            }
                          }
                        }
                      }}
                      disabled={currentPage === 1}
                      className="px-2 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Previous page"
                    >
                      &lt;
                    </button>
                    
                    {/* Next Page */}
                    <button
                      onClick={() => {
                        if (currentPage < Math.ceil(totalRows / rowsPerPage)) {
                          const newPage = currentPage + 1;
                          setCurrentPage(newPage);
                          if (selectedTable) {
                            if (searchQuery) {
                              handleSearch(searchQuery, newPage);
                            } else {
                              executeQueryForTable(selectedTable.dataset, selectedTable.table, newPage, rowsPerPage);
                            }
                          }
                        }
                      }}
                      disabled={currentPage >= Math.ceil(totalRows / rowsPerPage)}
                      className="px-2 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Next page"
                    >
                      &gt;
                    </button>
                    
                    {/* Last Page */}
                    <button
                      onClick={() => {
                        const lastPage = Math.ceil(totalRows / rowsPerPage);
                        setCurrentPage(lastPage);
                        if (selectedTable) {
                          if (searchQuery) {
                            handleSearch(searchQuery, lastPage);
                          } else {
                            executeQueryForTable(selectedTable.dataset, selectedTable.table, lastPage, rowsPerPage);
                          }
                        }
                      }}
                      disabled={currentPage >= Math.ceil(totalRows / rowsPerPage)}
                      className="px-2 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Last page"
                    >
                      &gt;|
                    </button>
                  </div>
                </div>
              </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <p>ไม่มีข้อมูล</p>
              </div>
            )}
          </div>
        )}

        {/* No Preview Data */}
        {activeTab === 'preview' && !queryResult && (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>กรุณารอสักครู่...</p>
          </div>
        )}

        {/* Query Tab */}
        {activeTab === 'query' && (
          <QueryEditor
            sql={sql}
            setSql={setSql}
            isQueryRunning={isQueryRunning}
            handleRunQuery={handleRunQuery}
            setShowSaveQueryDialog={setShowSaveQueryDialog}
            savedQueries={savedQueries}
            handleLoadSavedQuery={handleLoadSavedQuery}
            handleDeleteSavedQuery={handleDeleteSavedQuery}
            queryError={queryError}
            queryTabResult={queryTabResult}
            datasets={datasets}
          />
        )}
      </div>
    </div>
  );
}
