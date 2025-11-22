import { useState, useRef, useEffect } from 'react';
import { Database, Table2, ChevronRight, ChevronDown, Search, MoreVertical, Folder, FolderPlus, Edit2, Trash2, FilePlus, X, RefreshCw, Eye } from 'lucide-react';
import { Dataset, TableInfo } from '../../types/database';
import { useRouter } from 'next/navigation';

interface SidebarProps {
  datasets: Dataset[];
  loading: boolean;
  connectionError: string | null;
  selectedTable: { dataset: string; table: string; folder?: string } | null;
  selectedDataset: Dataset | null;
  selectedFolder: { dataset: string; folderName: string } | null;
  tableSyncLoading: { [key: string]: boolean };
  syncProgress: { [key: string]: { status: 'syncing' | 'success' | 'error', message?: string } };
  
  // Actions
  toggleDataset: (name: string) => void;
  toggleFolder: (dataset: string, folder: string) => void;
  setSelectedDataset: (dataset: Dataset | null) => void;
  setSelectedFolder: (folder: { dataset: string; folderName: string; tables: any[] } | null) => void;
  setSelectedTable: (table: { dataset: string; table: string; folder?: string; folderName?: string } | null) => void;
  
  createFolder: (dataset: string) => void;
  createTable: (dataset: string, folder: string) => void;
  renameFolder: (dataset: string, folder: string) => void;
  deleteFolder: (dataset: string, folderId: string) => void;
  deleteTable: (dataset: string, folder: string, table: string) => void;
  selectTable: (dataset: string, table: string, folder?: string) => void;
  selectFolder: (dataset: string, folder: string) => void;
  syncAllTablesInFolder: (dataset: string, folder: string, tables: any[]) => void;
  syncTable: (dataset: string, table: string) => void;
  executeQuery: () => void;
  
  setShowDialog: (dialog: { type: string; dataset?: string; folder?: string; oldName?: string } | null) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  fetchDatasets: () => void;
}

export default function Sidebar({
  datasets,
  loading,
  connectionError,
  selectedTable,
  selectedDataset,
  selectedFolder,
  tableSyncLoading,
  syncProgress,
  toggleDataset,
  toggleFolder,
  setSelectedDataset,
  setSelectedFolder,
  setSelectedTable,
  createFolder,
  createTable,
  renameFolder,
  deleteFolder,
  deleteTable,
  selectTable,
  selectFolder,
  syncAllTablesInFolder,
  syncTable,
  executeQuery,
  setShowDialog,
  showToast,
  fetchDatasets
}: SidebarProps) {
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState<{ type: string; name: string; dataset?: string; folder?: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="w-75 flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-500" />
            {datasets.length > 0 && datasets[0].name ? datasets[0].name : 'Database'}
          </h2>
        </div>
        <div className="mt-2 relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหา dataset หรือ table"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : connectionError ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
              <X className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">เชื่อมต่อไม่ได้</h3>
            <p className="text-xs text-gray-500 mb-4">{connectionError}</p>
            <button
              onClick={() => router.push('/settings')}
              className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
            >
              ตั้งค่า Database
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {datasets.map((dataset) => (
              <div key={dataset.name}>
                <div className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors group">
                  <button
                    onClick={() => {
                      toggleDataset(dataset.name);
                      setSelectedDataset(dataset);
                      setSelectedFolder(null);
                      setSelectedTable(null);
                    }}
                    className="flex-1 flex items-center gap-2 text-left"
                  >
                    {dataset.expanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                    <Database className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium text-gray-700">{dataset.name}</span>
                    <span className="ml-auto text-xs text-gray-500">{dataset.tables.length + dataset.folders.reduce((sum, f) => sum + f.tables.length, 0)}</span>
                  </button>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenu(openMenu?.type === 'dataset' && openMenu?.name === dataset.name ? null : { type: 'dataset', name: dataset.name });
                      }}
                      className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-600" />
                    </button>
                    {openMenu?.type === 'dataset' && openMenu?.name === dataset.name && (
                      <div ref={menuRef} className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                        <button
                          onClick={() => {
                            createFolder(dataset.name);
                            setOpenMenu(null);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <FolderPlus className="w-4 h-4" />
                          สร้างโฟลเดอร์
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {dataset.expanded && (
                  <div className="ml-6 mt-1 space-y-1">
                    {/* Folders */}
                    {dataset.folders.map((folder) => (
                      <div key={folder.name}>
                        <div className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors group">
                          <button
                            onClick={() => {
                              toggleFolder(dataset.name, folder.name);
                              selectFolder(dataset.name, folder.name);
                            }}
                            className="flex-1 flex items-center gap-2 text-left"
                          >
                            {folder.expanded ? (
                              <ChevronDown className="w-3 h-3 text-gray-500" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-gray-500" />
                            )}
                            <Folder className="w-4 h-4 text-yellow-500" />
                            <span className="text-sm text-gray-700">{folder.name}</span>
                            <span className="ml-auto text-xs text-gray-500">{folder.tables.length}</span>
                          </button>
                          {/* Sync All Icon Button */}
                          {folder.tables.length > 0 && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                await syncAllTablesInFolder(dataset.name, folder.name, folder.tables);
                              }}
                              disabled={folder.tables.some(t => tableSyncLoading[`${dataset.name}.${t.name}`])}
                              className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                              title="Sync All Tables"
                            >
                              <RefreshCw className={`w-3 h-3 text-blue-600 ${folder.tables.some(t => tableSyncLoading[`${dataset.name}.${t.name}`]) ? 'animate-spin' : ''}`} />
                            </button>
                          )}
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenu(openMenu?.type === 'folder' && openMenu?.name === folder.name ? null : { type: 'folder', name: folder.name, dataset: dataset.name });
                              }}
                              className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreVertical className="w-3 h-3 text-gray-600" />
                            </button>
                            {openMenu?.type === 'folder' && openMenu?.name === folder.name && openMenu?.dataset === dataset.name && (
                              <div ref={menuRef} className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                                <button
                                  onClick={() => {
                                    createTable(dataset.name, folder.name);
                                    setOpenMenu(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  <FilePlus className="w-4 h-4" />
                                  สร้างตาราง
                                </button>
                                <button
                                  onClick={() => {
                                    renameFolder(dataset.name, folder.name);
                                    setOpenMenu(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  <Edit2 className="w-4 h-4" />
                                  เปลี่ยนชื่อโฟลเดอร์
                                </button>
                                <button
                                  onClick={() => {
                                    deleteFolder(dataset.name, folder.id!);
                                    setOpenMenu(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  ลบโฟลเดอร์
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Tables in Folder */}
                        {folder.expanded && (
                          <div className="ml-6 mt-1 space-y-1">
                            {folder.tables.map((table) => (
                              <div key={table.name} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 rounded-lg transition-colors group">
                                <button
                                  onClick={() => selectTable(dataset.name, table.name, folder.name)}
                                  className={`flex-1 flex items-center gap-2 text-left ${
                                    selectedTable?.dataset === dataset.name && selectedTable?.table === table.name
                                      ? 'border-l-2 border-blue-500 pl-2'
                                      : ''
                                  }`}
                                >
                                  <Table2 className="w-4 h-4 text-gray-400" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm text-gray-700 truncate">{table.name}</div>
                                    <div className="text-xs text-gray-500 flex items-center gap-2">
                                      <span>{table.rows} rows · {table.size}</span>
                                      {(tableSyncLoading[`${dataset.name}.${table.name}`] || syncProgress[table.name]) && (
                                        <span className={`font-medium ${
                                          tableSyncLoading[`${dataset.name}.${table.name}`] || syncProgress[table.name]?.status === 'syncing' ? 'text-blue-500' :
                                          syncProgress[table.name]?.status === 'success' ? 'text-green-500' :
                                          'text-red-500'
                                        }`}>
                                          {tableSyncLoading[`${dataset.name}.${table.name}`] || syncProgress[table.name]?.status === 'syncing' ? '⟳ syncing...' : 
                                           syncProgress[table.name]?.status === 'success' ? '✓ done' : '✗ failed'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                                <div className="relative">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenu(openMenu?.type === 'table' && openMenu?.name === table.name ? null : { type: 'table', name: table.name, dataset: dataset.name, folder: folder.name });
                                    }}
                                    className="p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <MoreVertical className="w-3 h-3 text-gray-600" />
                                  </button>
                                  {openMenu?.type === 'table' && openMenu?.name === table.name && openMenu?.folder === folder.name && (
                                    <div ref={menuRef} className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                                      <button
                                        onClick={() => {
                                          setOpenMenu(null);
                                          syncTable(dataset.name, table.name);
                                        }}
                                        disabled={tableSyncLoading[`${dataset.name}.${table.name}`]}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                                      >
                                        <RefreshCw className={`w-4 h-4 ${tableSyncLoading[`${dataset.name}.${table.name}`] ? 'animate-spin' : ''}`} />
                                        ซิงค์ข้อมูล
                                      </button>
                                      <button
                                        onClick={() => {
                                          selectTable(dataset.name, table.name, folder.name);
                                          executeQuery();
                                          setOpenMenu(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                      >
                                        <Eye className="w-4 h-4" />
                                        Preview
                                      </button>
                                      <button
                                        onClick={() => {
                                          deleteTable(dataset.name, folder.name, table.name);
                                          setOpenMenu(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                        ลบตาราง
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Original Tables (not in folders) */}
                    {dataset.tables.map((table) => (
                      <div key={table.name} className="relative group">
                        <button
                          onClick={() => selectTable(dataset.name, table.name)}
                          className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 rounded-lg text-left transition-colors ${
                            selectedTable?.dataset === dataset.name && selectedTable?.table === table.name
                              ? 'bg-blue-50 border-l-2 border-blue-500'
                              : ''
                          }`}
                        >
                          <Table2 className="w-4 h-4 text-gray-400" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-700 truncate">{table.name}</div>
                            <div className="text-xs text-gray-500">{table.rows} rows · {table.size}</div>
                          </div>
                        </button>
                        
                        {/* Menu button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenu(openMenu?.type === 'table' && openMenu?.name === table.name ? null : { type: 'table', name: table.name, dataset: dataset.name });
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 rounded transition-opacity"
                        >
                          <MoreVertical className="w-4 h-4 text-gray-600" />
                        </button>

                        {/* Context Menu */}
                        {openMenu?.type === 'table' && openMenu?.name === table.name && (
                          <div ref={menuRef} className="absolute right-0 top-8 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                            <button
                              onClick={() => {
                                setShowDialog({ type: 'deleteTableDirect', dataset: dataset.name, oldName: table.name });
                                setOpenMenu(null);
                              }}
                              className="w-full px-3 py-2 text-sm text-left hover:bg-red-50 text-red-600 flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              ลบตาราง
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
