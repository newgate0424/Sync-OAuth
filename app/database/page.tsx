'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Database, Table2, ChevronRight, ChevronDown, Search, Play, FileText, MoreVertical, Folder as FolderIcon, FolderPlus, Edit2, Trash2, FilePlus, X, RefreshCw, Eye, Clock, Save } from 'lucide-react';
import Editor, { useMonaco } from '@monaco-editor/react';
import Sidebar from '../../components/database/Sidebar';
import { Dataset, TableInfo, Folder, SavedQuery } from '../../types/database';

export const dynamic = 'force-dynamic';

function DatabasePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<{ dataset: string; table: string; folder?: string; folderName?: string } | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<{ dataset: string; folderName: string; tables: any[] } | null>(null);
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [showDialog, setShowDialog] = useState<{ type: string; dataset?: string; folder?: string; oldName?: string } | null>(null);
  const [dialogInput, setDialogInput] = useState('');
  const [showCreateTableSlide, setShowCreateTableSlide] = useState<{ dataset: string; folder: string } | null>(null);
  const [createTableStep, setCreateTableStep] = useState(1);
  const [sheetUrl, setSheetUrl] = useState('');
  const [spreadsheetInfo, setSpreadsheetInfo] = useState<any>(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [sheetSchema, setSheetSchema] = useState<any>(null);
  const [tableName, setTableName] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'schema' | 'details' | 'preview' | 'query'>('preview');
  const [expandedCell, setExpandedCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredData, setFilteredData] = useState<any>(null);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ [key: string]: { status: 'syncing' | 'success' | 'error', message?: string } }>({});
  const [tableSyncLoading, setTableSyncLoading] = useState<{ [key: string]: boolean }>({});
  const [startRow, setStartRow] = useState(1);
  const [hasHeader, setHasHeader] = useState(true);
  const [dbType, setDbType] = useState<'mysql' | 'postgresql'>('postgresql');
  const [syncConfig, setSyncConfig] = useState<any>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [driveSearchQuery, setDriveSearchQuery] = useState('');
  
  // Query Tab State
  const [sql, setSql] = useState('');
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [queryTabResult, setQueryTabResult] = useState<any>(null);
  const [isQueryRunning, setIsQueryRunning] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [showSaveQueryDialog, setShowSaveQueryDialog] = useState(false);
  const [saveQueryForm, setSaveQueryForm] = useState({ name: '', description: '' });
  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(null);

  // Selected Dataset State
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);

  // Save activeTab to localStorage whenever it changes
  const handleTabChange = (tab: 'schema' | 'details' | 'preview' | 'query') => {
    setActiveTab(tab);
    localStorage.setItem('activeTab', tab);
  };

  // Load activeTab from localStorage on mount
  useEffect(() => {
    const savedTab = localStorage.getItem('activeTab');
    if (savedTab && ['schema', 'details', 'preview', 'query'].includes(savedTab)) {
      setActiveTab(savedTab as 'schema' | 'details' | 'preview' | 'query');
    }
  }, []);
  const [tableSchema, setTableSchema] = useState<any>(null);

  // Toast notification function
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ฟังก์ชันดึงประเภท database
  const fetchDatabaseType = async () => {
    try {
      const response = await fetch('/api/database-type');
      if (response.ok) {
        const data = await response.json();
        setDbType(data.type);
      }
    } catch (error) {
      console.error('Error fetching database type:', error);
    }
  };

  // ฟังก์ชันดึงข้อมูล sync config
  const fetchSyncConfig = async (tableName: string) => {
    try {
      let syncQuery: string;
      let syncParams: any[];
      
      if (dbType === 'mysql') {
        syncQuery = `SELECT * FROM \`sync_config\` WHERE \`table_name\` = ? LIMIT 1`;
        syncParams = [tableName];
      } else {
        syncQuery = `SELECT * FROM "sync_config" WHERE "table_name" = $1 LIMIT 1`;
        syncParams = [tableName];
      }
      
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: syncQuery,
          params: syncParams
        }),
      });
      
      const data = await response.json();
      if (data.rows && data.rows.length > 0) {
        setSyncConfig(data.rows[0]);
      } else {
        setSyncConfig(null);
      }
    } catch (error) {
      console.error('Error fetching sync config:', error);
      setSyncConfig(null);
    }
  };

  useEffect(() => {
    fetchDatasets();
    fetchDatabaseType();
    fetchGoogleStatus();
    fetchSavedQueries();
    // รัน auto migration
    runAutoMigration();
    
    // Auto-refresh datasets ทุก 10 วินาที เพื่ออัปเดต rows และ size
    const interval = setInterval(() => {
      fetchDatasets(true);
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  // Effect to handle clicking outside expanded cell
  useEffect(() => {
    const handleClickOutside = () => {
      setExpandedCell(null);
    };
    
    if (expandedCell) {
      window.addEventListener('click', handleClickOutside);
    }
    
    return () => {
      window.removeEventListener('click', handleClickOutside);
    };
  }, [expandedCell]);

  const fetchGoogleStatus = async () => {
    try {
      const response = await fetch('/api/auth/google/status');
      if (response.ok) {
        const data = await response.json();
        setGoogleConnected(data.connected);
      }
    } catch (error) {
      console.error('Error fetching Google status:', error);
    }
  };

  const loadDriveFiles = async () => {
    setLoadingDriveFiles(true);
    try {
      const response = await fetch('/api/google/drive/files');
      if (response.ok) {
        const data = await response.json();
        setDriveFiles(data.files || []);
        setShowDrivePicker(true);
      } else {
        const error = await response.json();
        showToast(error.error || 'ไม่สามารถโหลดไฟล์จาก Google Drive ได้', 'error');
      }
    } catch (error) {
      showToast('เกิดข้อผิดพลาดในการโหลดไฟล์', 'error');
    } finally {
      setLoadingDriveFiles(false);
    }
  };

  const selectDriveFile = (file: any) => {
    setSheetUrl(file.url);
    setShowDrivePicker(false);
    showToast(`เลือกไฟล์: ${file.name}`, 'success');
  };

  const runAutoMigration = async () => {
    try {
      await fetch('/api/auto-migrate');
    } catch (error) {
      console.error('Auto migration failed:', error);
      // ไม่แสดง error เพราะไม่อยากรบกวนผู้ใช้
    }
  };

  useEffect(() => {
    // อ่านข้อมูลจาก URL parameters เฉพาะตอนโหลดครั้งแรก
    if (datasets.length === 0) return; // รอให้ datasets โหลดเสร็จก่อน
    
    const dataset = searchParams.get('dataset');
    const table = searchParams.get('table');
    const folder = searchParams.get('folder');
    const tab = searchParams.get('tab');
    
    if (dataset && table && !selectedTable) {
      // โหลดตารางจาก URL เฉพาะถ้ายังไม่ได้เลือก
      selectTableFromURL(dataset, table, folder || undefined);
      if (tab && (tab === 'schema' || tab === 'details' || tab === 'preview')) {
        setActiveTab(tab as 'schema' | 'details' | 'preview' | 'query');
      }
    } else if (folder && dataset && !selectedFolder && !selectedTable) {
      // โหลดโฟลเดอร์จาก URL เฉพาะถ้ายังไม่ได้เลือก
      selectFolderFromURL(dataset, folder);
    }
  }, [datasets]); // ฟังแค่ datasets เท่านั้น

  const selectTableFromURL = async (datasetName: string, tableName: string, folderName?: string) => {
    // หา folderName จาก datasets ถ้าไม่มี
    if (!folderName && datasets.length > 0) {
      const dataset = datasets.find(ds => ds.name === datasetName);
      if (dataset) {
        for (const folder of dataset.folders) {
          if (folder.tables.some(t => t.name === tableName)) {
            folderName = folder.name;
            break;
          }
        }
      }
    }
    
    const tableData = { dataset: datasetName, table: tableName, folderName: folderName };
    setSelectedTable(tableData);
    setSelectedFolder(null);
    setQuery(`SELECT * FROM "${tableName}" LIMIT ${rowsPerPage};`);
    setActiveTab('preview');
    setCurrentPage(1);
    setFilteredData(null);
    setSearchQuery('');
    
    localStorage.setItem('selectedTable', JSON.stringify(tableData));
    localStorage.setItem('activeTab', 'preview');
    
    fetchTableSchema(datasetName, tableName);
    executeQueryForTable(datasetName, tableName);
  };

  const selectFolderFromURL = (datasetName: string, folderName: string) => {
    const dataset = datasets.find(ds => ds.name === datasetName);
    const folder = dataset?.folders.find(f => f.name === folderName);
    
    if (folder) {
      setSelectedFolder({
        dataset: datasetName,
        folderName: folderName,
        tables: folder.tables
      });
      setSelectedTable(null); // ล้างการเลือกตาราง
      setSelectedDataset(null); // ล้างการเลือก Dataset
      setFilteredData(null); // ล้างการค้นหา
      setSearchQuery(''); // ล้างข้อความค้นหา
      
      // อัพเดท URL
      const params = new URLSearchParams();
      params.set('dataset', datasetName);
      params.set('folder', folderName);
      router.push(`/database?${params.toString()}`);
    }
  };

  const [connectionError, setConnectionError] = useState<string | null>(null);

  const fetchDatasets = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setConnectionError(null);
      
      // Fetch folders first (usually faster)
      let foldersData = { folders: [], folderTables: [] };
      try {
        const foldersRes = await fetch('/api/folders');
        if (foldersRes.ok) {
          foldersData = await foldersRes.json();
        } else {
          console.error('Failed to fetch folders');
        }
      } catch (e) {
        console.error('Error fetching folders:', e);
      }

      // Fetch datasets
      let datasetsData = [];
      try {
        const datasetsRes = await fetch('/api/datasets');
        if (datasetsRes.ok) {
          datasetsData = await datasetsRes.json();
        } else {
          console.error('Failed to fetch datasets');
          try {
            const errData = await datasetsRes.json();
            if (errData.isConnectionError) {
              setConnectionError(errData.details || 'Database connection failed');
              showToast('ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาตรวจสอบการตั้งค่า', 'error');
            } else {
              showToast('ไม่สามารถโหลดข้อมูลตารางได้: ' + (errData.error || datasetsRes.statusText), 'error');
            }
          } catch {
            showToast('ไม่สามารถโหลดข้อมูลตารางได้: ' + datasetsRes.statusText, 'error');
          }
        }
      } catch (e) {
        console.error('Error fetching datasets:', e);
        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์', 'error');
      }
      
      // จัดเตรียมโฟลเดอร์
      const folders = (foldersData.folders || []).map((folder: any) => ({
        id: folder.id,
        name: folder.name,
        description: folder.description,
        expanded: false,
        tables: []
      }));
      
      const validFolderIds = new Set(folders.map((f: any) => f.id));

      // Load expanded states from localStorage
      const savedExpandedDatasets = JSON.parse(localStorage.getItem('expandedDatasets') || '{}');
      const savedExpandedFolders = JSON.parse(localStorage.getItem('expandedFolders') || '{}');
      
      // จัดกลุ่มตารางตาม folder_id
      const folderTableMap: any = {};
      (foldersData.folderTables || []).forEach((ft: any) => {
        // ตรวจสอบว่า folder_id มีอยู่จริงใน folders หรือไม่ (ป้องกัน orphaned tables)
        // แปลงเป็น string เพื่อความชัวร์ในการเปรียบเทียบ
        const folderIdStr = String(ft.folder_id);
        if (validFolderIds.has(folderIdStr)) {
          if (!folderTableMap[folderIdStr]) {
            folderTableMap[folderIdStr] = [];
          }
          folderTableMap[folderIdStr].push(ft.table_name);
        }
      });
      
      // รวมข้อมูล datasets กับ folders และกระจายตารางไปในโฟลเดอร์
      const datasetsWithFolders = Array.isArray(datasetsData) ? datasetsData.map((ds: any) => {
        // กรองตารางที่อยู่ใน folder ออกจาก ds.tables
        const tablesInFolders = new Set(
          Object.values(folderTableMap).flat() as string[]
        );
        
        const tablesNotInFolder = (ds.tables || []).filter((t: any) => 
          !tablesInFolders.has(t.name)
        );
        
        // เพิ่มตารางเข้าไปในแต่ละ folder พร้อมข้อมูล rows และ size
        const foldersWithTables = folders.map((folder: any) => {
          const folderKey = `${ds.name}/${folder.name}`;
          return {
            ...folder,
            expanded: savedExpandedFolders[folderKey] || false,
            tables: (folderTableMap[folder.id] || []).map((tableName: string) => {
              const tableInfo = (ds.tables || []).find((t: any) => t.name === tableName);
              return tableInfo || { name: tableName, rows: 0, size: '0 B' };
            })
          };
        });
        
        return {
          ...ds,
          expanded: savedExpandedDatasets[ds.name] || false,
          tables: tablesNotInFolder,
          folders: foldersWithTables
        };
      }) : [];
      
      setDatasets(datasetsWithFolders);
    } catch (error) {
      console.error('Error in fetchDatasets:', error);
      showToast('เกิดข้อผิดพลาดในการประมวลผลข้อมูล', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleDataset = (datasetName: string) => {
    const updatedDatasets = datasets.map(ds => 
      ds.name === datasetName ? { ...ds, expanded: !ds.expanded } : ds
    );
    setDatasets(updatedDatasets);
    
    // Save to localStorage
    const expandedStates: any = {};
    updatedDatasets.forEach(ds => {
      if (ds.expanded) {
        expandedStates[ds.name] = true;
      }
    });
    localStorage.setItem('expandedDatasets', JSON.stringify(expandedStates));
  };

  const toggleFolder = (datasetName: string, folderName: string) => {
    const updatedDatasets = datasets.map(ds => 
      ds.name === datasetName 
        ? {
            ...ds,
            folders: ds.folders.map(f => 
              f.name === folderName ? { ...f, expanded: !f.expanded } : f
            )
          }
        : ds
    );
    setDatasets(updatedDatasets);
    
    // Save to localStorage
    const expandedStates: any = {};
    updatedDatasets.forEach(ds => {
      ds.folders.forEach(f => {
        if (f.expanded) {
          expandedStates[`${ds.name}/${f.name}`] = true;
        }
      });
    });
    localStorage.setItem('expandedFolders', JSON.stringify(expandedStates));
  };

  const selectFolder = (datasetName: string, folderName: string) => {
    // หาตารางทั้งหมดในโฟลเดอร์
    const dataset = datasets.find(ds => ds.name === datasetName);
    const folder = dataset?.folders.find(f => f.name === folderName);
    
    if (folder) {
      setSelectedFolder({
        dataset: datasetName,
        folderName: folderName,
        tables: folder.tables
      });
      setSelectedTable(null); // ล้างการเลือกตาราง
      setSelectedDataset(null); // ล้างการเลือก Dataset
      setFilteredData(null); // ล้างการค้นหา
      setSearchQuery(''); // ล้างข้อความค้นหา
      
      // อัพเดท URL
      const params = new URLSearchParams();
      params.set('dataset', datasetName);
      params.set('folder', folderName);
      router.push(`/database?${params.toString()}`);
    }
  };

  const createFolder = (datasetName: string) => {
    setShowDialog({ type: 'createFolder', dataset: datasetName });
    setDialogInput('');
  };

  const renameFolder = (datasetName: string, oldName: string) => {
    setShowDialog({ type: 'renameFolder', dataset: datasetName, oldName });
    setDialogInput(oldName);
  };

  const deleteFolder = (datasetName: string, folderId: string) => {
    setShowDialog({ type: 'deleteFolder', dataset: datasetName, folder: folderId });
  };

  const createTable = (datasetName: string, folderName: string) => {
    setShowCreateTableSlide({ dataset: datasetName, folder: folderName });
    setCreateTableStep(1);
    setSheetUrl('');
    setSpreadsheetInfo(null);
    setSelectedSheet('');
    setSheetSchema(null);
    setTableName('');
  };

  const deleteTable = (datasetName: string, folderName: string, tableName: string) => {
    setShowDialog({ type: 'deleteTable', dataset: datasetName, folder: folderName, oldName: tableName });
  };

  const handleDialogConfirm = async () => {
    if (!showDialog) return;

    switch (showDialog.type) {
      case 'switchDatabase':
        if (dialogInput.trim()) {
          try {
            // ดึง DATABASE_URL ปัจจุบัน (ใช้ original ที่ไม่ได้ mask password)
            const settingsResponse = await fetch('/api/settings/database');
            const settingsData = await settingsResponse.json();
            
            if (settingsData.original) {
              // เปลี่ยน database name ใน connection string (ใช้ original ที่มี password จริง)
              const newDbUrl = settingsData.original.replace(/\/[^/?]*(\?|$)/, `/${dialogInput.trim()}$1`);
              
              // ทดสอบ connection ก่อน
              showToast(`กำลังตรวจสอบ ${dialogInput.trim()}...`, 'info');
              const testResponse = await fetch('/api/settings/database/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionString: newDbUrl })
              });
              
              const testResult = await testResponse.json();
              
              if (!testResponse.ok || !testResult.success) {
                showToast(testResult.error || `ไม่พบฐานข้อมูล ${dialogInput.trim()}`, 'error');
                return;
              }
              
              // อัพเดท DATABASE_URL
              const updateResponse = await fetch('/api/settings/database', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionString: newDbUrl })
              });
              
              const updateResult = await updateResponse.json();
              
              if (updateResponse.ok) {
                showToast(`เปลี่ยนไปใช้ ${dialogInput.trim()} สำเร็จ กำลังสร้างตารางที่จำเป็น...`, 'success');
                
                // สร้างตารางที่จำเป็นอัตโนมัติ
                try {
                  // ดึง dbType จาก settings
                  const dbType = settingsData.dbType || (settingsData.original?.startsWith('mysql://') ? 'mysql' : 'postgresql');
                  
                  const migrateResponse = await fetch('/api/settings/database/migrate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dbType })
                  });
                  
                  if (migrateResponse.ok) {
                    showToast('สร้างตารางที่จำเป็นเรียบร้อย', 'success');
                  }
                } catch (migrateError) {
                  console.error('Migration error:', migrateError);
                }
                
                // ปิด dialog ก่อน
                setShowDialog(null);
                setDialogInput('');
                // รอให้ connection reset และ reload หน้า
                setTimeout(() => {
                  window.location.reload();
                }, 1500);
              } else {
                showToast(updateResult.error || 'ไม่สามารถเปลี่ยนฐานข้อมูลได้', 'error');
              }
            } else {
              showToast('ไม่พบข้อมูลการเชื่อต่อ', 'error');
            }
          } catch (error: any) {
            console.error('Error switching database:', error);
            showToast(error.message || 'เกิดข้อผิดพลาด', 'error');
          }
        }
        break;
        
      case 'createFolder':
        if (dialogInput.trim()) {
          fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderName: dialogInput.trim(), description: '' })
          }).then(() => fetchDatasets());
        }
        break;

      case 'renameFolder':
        if (dialogInput.trim() && dialogInput !== showDialog.oldName) {
          fetch('/api/folders', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset: showDialog.dataset, oldName: showDialog.oldName, newName: dialogInput.trim() })
          }).then(() => fetchDatasets());
        }
        break;

      case 'deleteFolder':
        fetch('/api/folders', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId: showDialog.folder })
        })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Failed to delete folder');
          }
          if (data.deletedFolder === 0) {
             showToast('ไม่พบโฟลเดอร์ที่ต้องการลบ (อาจถูกลบไปแล้ว)', 'info');
          } else {
             showToast(`ลบโฟลเดอร์สำเร็จ (ลบ ${data.deletedTables} ตาราง)`, 'success');
          }
          // Force refresh datasets
          await fetchDatasets();
          // Clear selection if deleted folder was selected
          if (selectedFolder && selectedFolder.folderName === showDialog.oldName) {
            setSelectedFolder(null);
          }
        })
        .catch(err => {
          showToast(err.message, 'error');
        });
        break;

      case 'deleteTable':
        fetch(`/api/folder-tables?tableName=${encodeURIComponent(showDialog.oldName || '')}`, {
          method: 'DELETE',
        }).then(() => fetchDatasets());
        break;

      case 'deleteTableDirect':
        // ลบตารางที่อยู่นอกโฟลเดอร์
        fetch('/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `DROP TABLE IF EXISTS "${showDialog.oldName}"` })
        }).then(async () => {
          // ลบ sync_config ด้วย
          await fetch('/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              query: `DELETE FROM sync_config WHERE dataset_name = $1 AND table_name = $2`,
              params: [showDialog.dataset, showDialog.oldName]
            })
          });
          fetchDatasets();
        });
        break;
    }

    setShowDialog(null);
    setDialogInput('');
  };

  const handleSheetUrlSubmit = async () => {
    if (!sheetUrl.trim()) return;
    
    setSyncLoading(true);
    try {
      const response = await fetch('/api/sheets-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetUrl: sheetUrl }),
      });
      const data = await response.json();
      
      if (response.ok) {
        setSpreadsheetInfo(data);
        setCreateTableStep(2);
      } else {
        showToast(data.error || 'ไม่สามารถดึงข้อมูล Google Sheets ได้', 'error');
      }
    } catch (error) {
      showToast('เกิดข้อผิดพลาด: ' + error, 'error');
    }
    setSyncLoading(false);
  };

  const handleSheetSelect = async () => {
    if (!selectedSheet || !spreadsheetInfo) return;
    
    setSyncLoading(true);
    try {
      const response = await fetch('/api/sheet-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: spreadsheetInfo.spreadsheetId,
          sheetName: selectedSheet,
          startRow,
          hasHeader
        }),
      });
      const data = await response.json();
      
      if (response.ok) {
        setSheetSchema(data);
        setTableName(selectedSheet.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase());
        setCreateTableStep(3);
      } else {
        showToast(data.error || 'ไม่สามารถดึง Schema ได้', 'error');
      }
    } catch (error) {
      showToast('เกิดข้อผิดพลาด: ' + error, 'error');
    }
    setSyncLoading(false);
  };

  const handleCreateTable = async () => {
    if (!tableName.trim() || !showCreateTableSlide || !spreadsheetInfo || !sheetSchema) return;
    
    setSyncLoading(true);
    try {
      const response = await fetch('/api/sync-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: showCreateTableSlide.dataset,
          folderName: showCreateTableSlide.folder,
          tableName: tableName.trim(),
          spreadsheetId: spreadsheetInfo.spreadsheetId,
          sheetName: selectedSheet,
          schema: sheetSchema.schema,
          startRow,
          hasHeader
        }),
      });
      const data = await response.json();
      
      if (response.ok) {
        // Sync ข้อมูลทันที
        await handleSyncData();
        setShowCreateTableSlide(null);
        setStartRow(1);
        setHasHeader(true);
        setCreateTableStep(1);
        setSheetUrl('');
        setSelectedSheet('');
        setSheetSchema(null);
        setTableName('');
        fetchDatasets();
      } else {
        showToast(data.error || 'ไม่สามารถสร้างตารางได้', 'error');
      }
    } catch (error) {
      showToast('เกิดข้อผิดพลาด: ' + error, 'error');
    }
    setSyncLoading(false);
  };

  const handleSyncData = async () => {
    if (!showCreateTableSlide || !tableName) return;
    
    setSyncLoading(true);
    try {
      const response = await fetch('/api/sync-table', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: showCreateTableSlide.dataset,
          tableName: tableName.trim()
        }),
      });
      const data = await response.json();
      
      if (response.ok) {
        showToast(`ซิงค์ข้อมูลสำเร็จ: ${data.stats?.total || 0} แถว`, 'success');
      } else {
        showToast(data.error || 'ไม่สามารถซิงค์ข้อมูลได้', 'error');
      }
    } catch (error) {
      showToast('เกิดข้อผิดพลาด: ' + error, 'error');
    }
    setSyncLoading(false);
  };

  const syncTable = async (datasetName: string, tableName: string) => {
    const tableKey = `${datasetName}.${tableName}`;
    setTableSyncLoading(prev => ({ ...prev, [tableKey]: true }));
    try {
      const response = await fetch('/api/sync-table', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset: datasetName, tableName: tableName }),
      });
      const data = await response.json();
      if (response.ok) {
        showToast(`ซิงค์ข้อมูลสำเร็จ: ${data.stats?.total || 0} แถว`, 'success');
        await fetchDatasets();
      } else {
        showToast(data.error || 'ไม่สามารถซิงค์ข้อมูลได้', 'error');
      }
    } catch (error) {
      showToast('เกิดข้อผิดพลาด', 'error');
    }
    setTableSyncLoading(prev => ({ ...prev, [tableKey]: false }));
  };

  const syncAllTablesInFolder = async (datasetName: string, folderName: string, tables: TableInfo[]) => {
    if (tables.length === 0) {
      showToast('ไม่มีตารางในโฟลเดอร์นี้', 'info');
      return;
    }

    // Set loading for all tables in this folder
    const newTableLoading: { [key: string]: boolean } = {};
    tables.forEach(table => {
      newTableLoading[`${datasetName}.${table.name}`] = true;
    });
    setTableSyncLoading(prev => ({ ...prev, ...newTableLoading }));

    const newProgress: { [key: string]: { status: 'syncing' | 'success' | 'error', message?: string } } = {};
    
    // เริ่มต้น progress สำหรับทุกตาราง
    tables.forEach(table => {
      newProgress[table.name] = { status: 'syncing' };
    });
    setSyncProgress(newProgress);

    let successCount = 0;
    let failCount = 0;
    const CONCURRENCY = 3; // Process 3 tables at a time

    for (let i = 0; i < tables.length; i += CONCURRENCY) {
      const batch = tables.slice(i, i + CONCURRENCY);
      
      await Promise.all(batch.map(async (table) => {
        try {
          const response = await fetch('/api/sync-table', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dataset: datasetName,
              tableName: table.name,
              forceSync: false // Use Smart Sync (Skip if unchanged)
            }),
          });
          const data = await response.json();
          
          if (response.ok) {
            setSyncProgress(prev => ({
              ...prev,
              [table.name]: { status: 'success', message: `${data.stats?.total || 0} แถว` }
            }));
            successCount++;
          } else {
            setSyncProgress(prev => ({
              ...prev,
              [table.name]: { status: 'error', message: data.error }
            }));
            failCount++;
          }
        } catch (error) {
          setSyncProgress(prev => ({
            ...prev,
            [table.name]: { status: 'error', message: 'เกิดข้อผิดพลาด' }
          }));
          failCount++;
        } finally {
          // Clear loading for this specific table immediately
          setTableSyncLoading(prev => ({ ...prev, [`${datasetName}.${table.name}`]: false }));
        }
      }));
    }

    // Clear loading for all tables (just in case)
    const clearTableLoading: { [key: string]: boolean } = {};
    tables.forEach(table => {
      clearTableLoading[`${datasetName}.${table.name}`] = false;
    });
    setTableSyncLoading(prev => ({ ...prev, ...clearTableLoading }));
    
    if (failCount === 0) {
      showToast(`ซิงค์สำเร็จทั้งหมด ${successCount} ตาราง`, 'success');
    } else if (successCount === 0) {
      showToast(`ซิงค์ล้มเหลวทั้งหมด ${failCount} ตาราง`, 'error');
    } else {
      showToast(`ซิงค์สำเร็จ ${successCount} ตาราง, ล้มเหลว ${failCount} ตาราง`, 'info');
    }
    
    // ล้าง progress หลังจาก 3 วินาที
    setTimeout(() => setSyncProgress({}), 3000);
    
    // Refresh datasets
    await fetchDatasets();
  };

  const selectTable = async (datasetName: string, tableName: string, folderName?: string) => {
    // หา folderName จาก datasets ถ้าไม่ได้รับมา
    if (!folderName && datasets.length > 0) {
      const dataset = datasets.find(ds => ds.name === datasetName);
      if (dataset) {
        for (const folder of dataset.folders) {
          if (folder.tables.some(t => t.name === tableName)) {
            folderName = folder.name;
            break;
          }
        }
      }
    }
    
    const tableData = { dataset: datasetName, table: tableName, folderName: folderName };
    setSelectedTable(tableData);
    setSelectedFolder(null); // ล้างการเลือกโฟลเดอร์
    setQuery(`SELECT * FROM \"${tableName}\" LIMIT ${rowsPerPage};`);
    setActiveTab('preview');
    setCurrentPage(1); // Reset ไปหน้าแรก
    setFilteredData(null); // ล้างการค้นหา
    setSearchQuery(''); // ล้างข้อความค้นหา
    
    // อัพเดท URL
    const params = new URLSearchParams();
    params.set('dataset', datasetName);
    params.set('table', tableName);
    if (folderName) params.set('folder', folderName);
    router.push(`/database?${params.toString()}`);
    
    // Save to localStorage
    localStorage.setItem('selectedTable', JSON.stringify(tableData));
    localStorage.setItem('activeTab', 'preview');
    
    fetchTableSchema(datasetName, tableName);
    fetchSyncConfig(tableName);
    executeQueryForTable(datasetName, tableName);
  };

  const fetchTableSchema = async (datasetName: string, tableName: string) => {
    try {
      let schemaQuery: string;
      let schemaParams: any[];
      
      if (dbType === 'mysql') {
        // MySQL ใช้ SHOW COLUMNS ซึ่งจะให้ Field, Type, Null, Key, Default, Extra
        schemaQuery = `SHOW COLUMNS FROM \`${tableName}\``;
        schemaParams = [];
      } else {
        // PostgreSQL ใช้ information_schema แต่ต้องแปลง format ให้เหมือน SHOW COLUMNS
        schemaQuery = `
          SELECT 
            column_name as "Field",
            data_type as "Type",
            is_nullable as "Null",
            '' as "Key"
          FROM information_schema.columns 
          WHERE table_name = $1 
          ORDER BY ordinal_position
        `;
        schemaParams = [tableName];
      }
      
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: schemaQuery,
          params: schemaParams
        }),
      });
      const data = await response.json();
      setTableSchema(data);
    } catch (error) {
      console.error('Error fetching schema:', error);
    }
  };

  const executeQueryForTable = async (datasetName: string, tableName: string, page: number = 1, limit: number = rowsPerPage) => {
    try {
      // นับจำนวนแถวทั้งหมด
      let countQuery: string;
      if (dbType === 'mysql') {
        countQuery = `SELECT COUNT(*) as total FROM \`${tableName}\``;
      } else {
        countQuery = `SELECT COUNT(*) as total FROM "${tableName}"`;
      }
      
      const countResponse = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: countQuery }),
      });
      const countData = await countResponse.json();
      const total = countData.rows?.[0]?.total || 0;
      setTotalRows(total);

      // ดึงข้อมูลตาม pagination
      const offset = (page - 1) * limit;
      let dataQuery: string;
      if (dbType === 'mysql') {
        dataQuery = `SELECT * FROM \`${tableName}\` LIMIT ${limit} OFFSET ${offset}`;
      } else {
        dataQuery = `SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`;
      }
      
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: dataQuery }),
      });
      const data = await response.json();
      setQueryResult(data);
    } catch (error) {
      console.error('Error executing query:', error);
    }
  };

  const executeQuery = async () => {
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await response.json();
      setQueryResult(data);
    } catch (error) {
      console.error('Error executing query:', error);
    }
  };

  const handleSearch = async (searchValue: string, page: number = 1) => {
    setSearchQuery(searchValue);
    
    if (!searchValue || !selectedTable) {
      setFilteredData(null);
      // กลับไปแสดงข้อมูลปกติ
      if (selectedTable) {
        executeQueryForTable(selectedTable.dataset, selectedTable.table, page, rowsPerPage);
      }
      return;
    }

    try {
      // ดึงชื่อคอลัมน์จากตารางโดยใช้ query ที่เหมาะสมกับแต่ละ database
      let columnsQuery: string;
      let columnsParams: any[];
      
      if (dbType === 'mysql') {
        // MySQL ใช้ SHOW COLUMNS
        columnsQuery = `SHOW COLUMNS FROM \`${selectedTable.table}\``;
        columnsParams = [];
      } else {
        // PostgreSQL ใช้ information_schema
        columnsQuery = `SELECT column_name as "Field" FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`;
        columnsParams = [selectedTable.table];
      }
      
      const columnsResponse = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: columnsQuery,
          params: columnsParams
        }),
      });
      
      const columnsData = await columnsResponse.json();
      
      if (!columnsData.rows || columnsData.rows.length === 0) {
        showToast('ไม่สามารถดึงโครงสร้างตารางได้', 'error');
        return;
      }
      
      // ดึงชื่อคอลัมน์จาก Field
      const columns = columnsData.rows.map((row: any) => row.Field);
      
      // สร้าง WHERE condition สำหรับค้นหา
      let whereConditions: string;
      let searchParams: any[];
      
      if (dbType === 'mysql') {
        // MySQL ใช้ LIKE และ backticks
        whereConditions = columns.map((col: string) => 
          `CAST(\`${col}\` AS CHAR) LIKE ?`
        ).join(' OR ');
        searchParams = Array(columns.length).fill(`%${searchValue}%`);
      } else {
        // PostgreSQL ใช้ ILIKE และ double quotes
        whereConditions = columns.map((col: string) => 
          `CAST("${col}" AS TEXT) ILIKE $1`
        ).join(' OR ');
        searchParams = [`%${searchValue}%`];
      }
      
      // นับจำนวนแถวที่ค้นพบทั้งหมด
      let countQuery: string;
      if (dbType === 'mysql') {
        countQuery = `SELECT COUNT(*) as total FROM \`${selectedTable.table}\` WHERE ${whereConditions}`;
      } else {
        countQuery = `SELECT COUNT(*) as total FROM "${selectedTable.table}" WHERE ${whereConditions}`;
      }
      
      const countResponse = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: countQuery,
          params: searchParams
        }),
      });
      
      const countData = await countResponse.json();
      const total = countData.rows?.[0]?.total || 0;
      setTotalRows(total);
      
      // ดึงข้อมูลตาม pagination
      const offset = (page - 1) * rowsPerPage;
      let dataQuery: string;
      let dataParams: any[];
      
      if (dbType === 'mysql') {
        dataQuery = `SELECT * FROM \`${selectedTable.table}\` WHERE ${whereConditions} LIMIT ? OFFSET ?`;
        dataParams = [...searchParams, rowsPerPage, offset];
      } else {
        dataQuery = `SELECT * FROM "${selectedTable.table}" WHERE ${whereConditions} LIMIT $${searchParams.length + 1} OFFSET $${searchParams.length + 2}`;
        dataParams = [...searchParams, rowsPerPage, offset];
      }
      
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: dataQuery,
          params: dataParams
        }),
      });
      
      const data = await response.json();
      
      if (data.error) {
        showToast('เกิดข้อผิดพลาดในการค้นหา: ' + data.error, 'error');
        return;
      }
      
      setFilteredData(data);
      setCurrentPage(page);
      
      showToast(`พบ ${total} แถว`, 'info');
    } catch (error: any) {
      console.error('Error searching:', error);
      showToast('เกิดข้อผิดพลาดในการค้นหา: ' + (error.message || 'Unknown error'), 'error');
    }
  };

  // Query Tab Functions
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

  const handleRunQuery = async () => {
    if (!sql.trim()) return;
    
    setIsQueryRunning(true);
    setQueryError(null);
    setQueryTabResult(null);
    
    try {
      const res = await fetch('/api/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to execute query');
      }
      
      setQueryTabResult(data);
    } catch (error: any) {
      setQueryError(error.message);
    } finally {
      setIsQueryRunning(false);
    }
  };

  const handleSaveQuery = async () => {
    if (!saveQueryForm.name.trim()) {
      showToast('กรุณาระบุชื่อ Query', 'error');
      return;
    }

    try {
      const res = await fetch('/api/query/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveQueryForm.name,
          description: saveQueryForm.description,
          sql: sql
        }),
      });

      if (res.ok) {
        showToast('บันทึก Query เรียบร้อยแล้ว', 'success');
        setShowSaveQueryDialog(false);
        setSaveQueryForm({ name: '', description: '' });
        fetchSavedQueries();
      } else {
        const data = await res.json();
        showToast(data.error || 'ไม่สามารถบันทึก Query ได้', 'error');
      }
    } catch (error) {
      showToast('เกิดข้อผิดพลาดในการบันทึก', 'error');
    }
  };

  const handleDeleteSavedQuery = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('คุณต้องการลบ Query นี้ใช่หรือไม่?')) return;

    try {
      const res = await fetch(`/api/query/saved?id=${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        showToast('ลบ Query เรียบร้อยแล้ว', 'success');
        if (selectedQueryId === id) {
          setSelectedQueryId(null);
          setSql('');
        }
        fetchSavedQueries();
      } else {
        showToast('ไม่สามารถลบ Query ได้', 'error');
      }
    } catch (error) {
      showToast('เกิดข้อผิดพลาดในการลบ', 'error');
    }
  };

  const handleLoadSavedQuery = (query: SavedQuery) => {
    setSql(query.sql);
    setSelectedQueryId(query.id);
  };

  // Autocomplete State
  const [tables, setTables] = useState<string[]>([]);
  const tablesRef = useRef<string[]>([]);
  const monaco = useMonaco();

  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    if (monaco) {
      // Register completion provider
      const disposable = monaco.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: [' ', '.', '`', '"'],
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const textUntilPosition = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          const suggestions: any[] = [];

          // Check if we are after "FROM" or "JOIN"
          const isAfterFromOrJoin = /\b(FROM|JOIN)\s+["`]?\w*$/i.test(textUntilPosition);

          if (isAfterFromOrJoin) {
            // Suggest tables
            tablesRef.current.forEach(table => {
              suggestions.push({
                label: table,
                kind: monaco.languages.CompletionItemKind.Class,
                insertText: table.includes(' ') ? `\`${table}\`` : table,
                detail: 'Table',
                range: range,
              });
            });
          } else {
            // Suggest keywords
            const keywords = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'BETWEEN', 'LIKE', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN'];
            keywords.forEach(keyword => {
              suggestions.push({
                label: keyword,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: keyword,
                range: range,
              });
            });
          }

          return { suggestions };
        }
      });

      return () => disposable.dispose();
    }
  }, [monaco]);

  // Fetch all tables for autocomplete
  const fetchAllTables = async () => {
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
          if (dataset.folders) {
            dataset.folders.forEach((folder: any) => {
              if (folder.tables) {
                folder.tables.forEach((table: any) => {
                  allTables.push(table.name);
                });
              }
            });
          }
        });
        setTables(allTables);
      }
    } catch (error) {
      console.error('Failed to load tables for autocomplete', error);
    }
  };

  useEffect(() => {
    fetchAllTables();
  }, []);

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      <Sidebar
        datasets={datasets}
        loading={loading}
        connectionError={connectionError}
        selectedTable={selectedTable}
        selectedDataset={selectedDataset}
        selectedFolder={selectedFolder}
        tableSyncLoading={tableSyncLoading}
        syncProgress={syncProgress}
        toggleDataset={toggleDataset}
        toggleFolder={toggleFolder}
        setSelectedDataset={setSelectedDataset}
        setSelectedFolder={setSelectedFolder}
        setSelectedTable={setSelectedTable}
        createFolder={createFolder}
        createTable={createTable}
        renameFolder={renameFolder}
        deleteFolder={deleteFolder}
        deleteTable={deleteTable}
        selectTable={selectTable}
        selectFolder={selectFolder}
        syncAllTablesInFolder={syncAllTablesInFolder}
        syncTable={syncTable}
        executeQuery={executeQuery}
        setShowDialog={setShowDialog}
        showToast={showToast}
        fetchDatasets={fetchDatasets}
      />

      {/* Main Content - Table View or Folder View */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {selectedFolder ? (
          /* Folder Details View */
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-yellow-50 to-orange-50">
              <div className="flex items-center gap-3 mb-2">
                <FolderIcon className="w-8 h-8 text-yellow-600" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedFolder.folderName}</h2>
                  <p className="text-sm text-gray-600">Dataset: {selectedFolder.dataset}</p>
                </div>
              </div>
              <div className="flex gap-4 mt-4">
                <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
                  <p className="text-xs text-gray-500">จำนวนตาราง</p>
                  <p className="text-2xl font-bold text-blue-600">{selectedFolder.tables.length}</p>
                </div>
                <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
                  <p className="text-xs text-gray-500">จำนวนแถวทั้งหมด</p>
                  <p className="text-2xl font-bold text-green-600">
                    {selectedFolder.tables.reduce((sum, t) => sum + (t.rows || 0), 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
                  <p className="text-xs text-gray-500">ขนาดทั้งหมด</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {(() => {
                      const totalBytes = selectedFolder.tables.reduce((sum, t) => {
                        const size = t.size || '0 B';
                        const match = size.match(/([0-9.]+)\s*([A-Z]+)/);
                        if (!match) return sum;
                        const value = parseFloat(match[1]);
                        const unit = match[2];
                        const multipliers: any = { B: 1, KB: 1024, MB: 1024*1024, GB: 1024*1024*1024 };
                        return sum + (value * (multipliers[unit] || 1));
                      }, 0);
                      const k = 1024;
                      const sizes = ['B', 'KB', 'MB', 'GB'];
                      const i = totalBytes === 0 ? 0 : Math.floor(Math.log(totalBytes) / Math.log(k));
                      return `${(totalBytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
                    })()}
                  </p>
                </div>
              </div>
            </div>



            <div className="flex-1 overflow-auto p-6">
              <h3 className="text-lg font-semibold mb-4">ตารางในโฟลเดอร์</h3>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 font-semibold">ชื่อตาราง</th>
                      <th className="px-6 py-3 font-semibold">จำนวนแถว</th>
                      <th className="px-6 py-3 font-semibold">ขนาด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {selectedFolder.tables.map((table) => (
                      <tr 
                        key={table.name}
                        onClick={() => selectTable(selectedFolder.dataset, table.name, selectedFolder.folderName)}
                        className="hover:bg-blue-50 cursor-pointer transition-colors group"
                      >
                        <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-3">
                          <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                            <Table2 className="w-5 h-5 text-blue-600" />
                          </div>
                          {table.name}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {(table.rows || 0).toLocaleString()
                          }
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {table.size || '0 B'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : selectedDataset ? (
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <div className="flex items-center gap-3 mb-2">
                <Database className="w-8 h-8 text-blue-600" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedDataset.name}</h2>
                  <p className="text-sm text-gray-600">Database Overview</p>
                </div>
              </div>
              <div className="flex gap-4 mt-4">
                <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
                  <p className="text-xs text-gray-500">จำนวนโฟลเดอร์</p>
                  <p className="text-2xl font-bold text-yellow-600">{selectedDataset.folders.length}</p>
                </div>
                <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
                  <p className="text-xs text-gray-500">จำนวนตารางทั้งหมด</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {selectedDataset.tables.length + selectedDataset.folders.reduce((sum, f) => sum + f.tables.length, 0)}
                  </p>
                </div>
                <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
                  <p className="text-xs text-gray-500">จำนวนแถวทั้งหมด</p>
                  <p className="text-2xl font-bold text-green-600">
                    {(
                      selectedDataset.tables.reduce((sum, t) => sum + (t.rows || 0), 0) +
                      selectedDataset.folders.reduce((sum, f) => sum + f.tables.reduce((s, t) => s + (t.rows || 0), 0), 0)
                    ).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <h3 className="text-lg font-semibold mb-4">โฟลเดอร์ในฐานข้อมูล</h3>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm mb-8">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 font-semibold">ชื่อโฟลเดอร์</th>
                      <th className="px-6 py-3 font-semibold">จำนวนตาราง</th>
                      <th className="px-6 py-3 font-semibold">แถวรวม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {selectedDataset.folders.map((folder) => (
                      <tr
                        key={folder.name}
                        onClick={() => {
                          toggleFolder(selectedDataset.name, folder.name);
                          selectFolder(selectedDataset.name, folder.name);
                        }}
                        className="hover:bg-yellow-50 cursor-pointer transition-colors group"
                      >
                        <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-3">
                          <div className="p-2 bg-yellow-50 rounded-lg group-hover:bg-yellow-100 transition-colors">
                            <FolderIcon className="w-5 h-5 text-yellow-600" />
                          </div>
                          {folder.name}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {folder.tables.length}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {folder.tables.reduce((sum, t) => sum + (t.rows || 0), 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedDataset.tables.length > 0 && (
                <>
                  <h3 className="text-lg font-semibold mb-4">ตารางที่ไม่อยู่ในโฟลเดอร์</h3>
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-3 font-semibold">ชื่อตาราง</th>
                          <th className="px-6 py-3 font-semibold">จำนวนแถว</th>
                          <th className="px-6 py-3 font-semibold">ขนาด</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedDataset.tables.map((table) => (
                          <tr
                            key={table.name}
                            onClick={() => selectTable(selectedDataset.name, table.name)}
                            className="hover:bg-blue-50 cursor-pointer transition-colors group"
                          >
                            <td className="px-6 py-4 font-medium text-gray-900 flex items-center gap-3">
                              <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                                <Table2 className="w-5 h-5 text-blue-600" />
                              </div>
                              {table.name}
                            </td>
                            <td className="px-6 py-4 text-gray-600">
                              {(table.rows || 0).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-gray-600">
                              {table.size || '0 B'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : selectedTable ? (
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col min-w-0">
            {/* Table Header with Breadcrumb */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex itemscenter gap-2 text-sm text-gray-600 mb-3">
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
                  onClick={() => {
                    setActiveTab('query');
                    localStorage.setItem('activeTab', 'query');
                  }}
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
                        setFilteredData(null);
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
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-r bg-gray-50 w-12 text-center">#</th>
                            {Object.keys((filteredData || queryResult).rows[0]).filter(key => key !== 'id' && key !== 'synced_at').map((key) => (
                              <th key={key} className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-r bg-gray-50 whitespace-nowrap max-w-[250px]">
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
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <Database className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg">เลือกตารางเพื่อดูข้อมูล</p>
            </div>
          </div>
        )}
      </div>

      {/* Dialog Modal */}
      {showDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                {showDialog.type === 'switchDatabase' && 'เปลี่ยนฐานข้อมูล'}
                {showDialog.type === 'createFolder' && 'สร้างโฟลเดอร์ใหม่'}
                {showDialog.type === 'renameFolder' && 'เปลี่ยนชื่อโฟลเดอร์'}
                {showDialog.type === 'deleteFolder' && (
                  <div className="text-sm text-gray-500 mb-4">
                    Folder ID: {showDialog.folder}
                  </div>
                )}
                {showDialog.type === 'deleteFolder' && 'ยืนยันการลบโฟลเดอร์'}
                {showDialog.type === 'createTable' && 'สร้างตารางใหม่'}
                {showDialog.type === 'deleteTable' && 'ยืนยันการลบตาราง'}
                {showDialog.type === 'deleteTableDirect' && 'ยืนยันการลบตาราง'}
              </h3>

              {(showDialog.type === 'deleteFolder' || showDialog.type === 'deleteTable' || showDialog.type === 'deleteTableDirect') ? (
                <p className="text-gray-600 mb-6">
                  {showDialog.type === 'deleteFolder' 
                    ? `ต้องการลบโฟลเดอร์ "${showDialog.folder}" และตารางทั้งหมดในโฟลเดอร์หรือไม่?`
                    : `ต้องการลบตาราง "${showDialog.oldName}" หรือไม่?`
                  }
                </p>
              ) : (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {showDialog.type === 'switchDatabase' && 'ชื่อฐานข้อมูล'}
                    {showDialog.type === 'createFolder' && 'ชื่อโฟลเดอร์'}
                    {showDialog.type === 'renameFolder' && 'ชื่อโฟลเดอร์ใหม่'}
                    {showDialog.type === 'createTable' && 'ชื่อตาราง'}
                  </label>
                  <input
                    type="text"
                    value={dialogInput}
                    onChange={(e) => setDialogInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleDialogConfirm()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={
                      showDialog.type === 'switchDatabase' ? 'กรอกชื่อฐานข้อมูลที่ต้องการเปลี่ยนไป' :
                      showDialog.type === 'createFolder' ? 'กรอกชื่อโฟลเดอร์' :
                      showDialog.type === 'renameFolder' ? 'กรอกชื่อโฟลเดอร์ใหม่' :
                      'กรอกชื่อตาราง'
                    }
                    autoFocus
                  />
                  {showDialog.type === 'switchDatabase' && (
                    <p className="mt-2 text-xs text-gray-500">
                      ชื่อฐานข้อมูลสามารถใช้ได้เฉพาะตัวอักษร ตัวเลข และขีดล่าง (_)
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDialog(null);
                    setDialogInput('');
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleDialogConfirm}
                  className={`px-4 py-2 text-white rounded-lg transition-colors ${
                    showDialog.type === 'deleteFolder' || showDialog.type === 'deleteTable' || showDialog.type === 'deleteTableDirect'
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                >
                  {showDialog.type === 'deleteFolder' || showDialog.type === 'deleteTable' || showDialog.type === 'deleteTableDirect' ? 'ลบ' : 'ยืนยัน'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Query Dialog */}
      {showSaveQueryDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Save Query</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={saveQueryForm.name}
                    onChange={(e) => setSaveQueryForm({ ...saveQueryForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Query Name"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                  <textarea
                    value={saveQueryForm.description}
                    onChange={(e) => setSaveQueryForm({ ...saveQueryForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
                    placeholder="Query Description"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowSaveQueryDialog(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveQuery}
                  disabled={!saveQueryForm.name.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Table Slide Panel */}
      {showCreateTableSlide && (
        <>
          <div 
            className="fixed inset-0 bg-black bg-opacity-30 z-40"
            onClick={() => setShowCreateTableSlide(null)}
          />
          <div className="fixed right-0 top-0 h-full w-full md:w-1/2 bg-white shadow-2xl z-50 transform transition-transform duration-300 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">สร้างตารางจาก Google Sheets</h2>
              <button
                onClick={() => setShowCreateTableSlide(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {/* Progress Steps */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${createTableStep >= 1 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>
                    1
                  </div>
                  <div className={`w-16 h-1 ${createTableStep >= 2 ? 'bg-blue-500' : 'bg-gray-200'}`} />
                </div>
                <div className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${createTableStep >= 2 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>
                    2
                  </div>
                  <div className={`w-16 h-1 ${createTableStep >= 3 ? 'bg-blue-500' : 'bg-gray-200'}`} />
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${createTableStep >= 3 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>
                  3
                </div>
              </div>

              {/* Step 1: Enter Google Sheets URL */}
              {createTableStep === 1 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800">เพิ่มลิงค์ Google Sheets</h3>
                  
                  <p className="text-sm text-gray-600">วางลิงค์ Google Sheets ของคุณที่นี่</p>
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">URL Google Sheets</label>
                    <input
                      type="text"
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {googleConnected && <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white text-gray-500">หรือ</span>
                    </div>
                  </div>}

                  {googleConnected && (
                    <div className="mb-4">
                      <button
                        onClick={loadDriveFiles}
                        disabled={loadingDriveFiles}
                        className="w-full px-4 py-3 bg-green-50 border-2 border-green-500 text-green-700 rounded-lg hover:bg-green-100 transition-colors font-medium flex items-center justify-center gap-2"
                      >
                        <Database className="w-5 h-5" />
                        {loadingDriveFiles ? 'กำลังโหลด...' : 'เลือกไฟล์จาก Google Drive ของฉัน'}
                      </button>
                    </div>
                  )}

                  <button
                    onClick={handleSheetUrlSubmit}
                    disabled={!sheetUrl.trim() || syncLoading}
                    className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {syncLoading ? 'กำลังโหลด...' : 'ต่อไป'}
                  </button>
                </div>
              )}

              {/* Step 2: Select Sheet */}
              {createTableStep === 2 && spreadsheetInfo && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800">เลือก Sheet และกำหนดการอ่านข้อมูล</h3>
                  <p className="text-sm text-gray-600">Spreadsheet: {spreadsheetInfo.title}</p>
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">เลือก Sheet ที่ต้องการนำเข้า</label>
                    <select
                      value={selectedSheet}
                      onChange={(e) => setSelectedSheet(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- เลือก Sheet --</option>
                      {spreadsheetInfo.sheets.map((sheet: any) => (
                        <option key={sheet.sheetId} value={sheet.title}>
                          {sheet.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">แถวเริ่มต้นที่จะอ่านข้อมูล</label>
                    <input
                      type="number"
                      min="1"
                      value={startRow}
                      onChange={(e) => setStartRow(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500">ระบุแถวที่เริ่มต้นอ่านข้อมูล (เริ่มจาก 1)</p>
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <input
                      type="checkbox"
                      id="hasHeader"
                      checked={hasHeader}
                      onChange={(e) => setHasHeader(e.target.checked)}
                      className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <label htmlFor="hasHeader" className="text-sm font-medium text-gray-700 cursor-pointer">
                      แถวแรกเป็นหัวข้อ (Header)
                    </label>
                  </div>
                  <p className="text-xs text-gray-500">
                    {hasHeader 
                      ? `จะใช้แถวที่ ${startRow} เป็นชื่อคอลัมน์ และเริ่มอ่านข้อมูลจากแถวที่ ${startRow + 1}`
                      : `จะเริ่มอ่านข้อมูลทันทีจากแถวที่ ${startRow} และสร้างชื่อคอลัมน์อัตโนมัติ (column_1, column_2, ...)`
                    }
                  </p>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setCreateTableStep(1)}
                      className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                    >
                      ย้อนกลับ
                    </button>
                    <button
                      onClick={handleSheetSelect}
                      disabled={!selectedSheet || syncLoading}
                      className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {syncLoading ? 'กำลังโหลด...' : 'ต่อไป'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Configure Schema */}
              {createTableStep === 3 && sheetSchema && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800">กำหนด Schema และบันทึก</h3>
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">ชื่อตาราง</label>
                    <input
                      type="text"
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Column Name</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Original Name</th>
                          <th className="px-4 py-2 text-left font-semibold text-gray-700">Data Type</th>
                          <th className="px-4 py-2 text-center font-semibold text-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sheetSchema.schema.map((col: any, index: number) => (
                          <tr key={index} className="border-t border-gray-200">
                            <td className="px-4 py-2">
                              <input
                                type="text"
                                value={col.name}
                                onChange={(e) => {
                                  const newSchema = [...sheetSchema.schema];
                                  newSchema[index].name = e.target.value.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
                                  setSheetSchema({ ...sheetSchema, schema: newSchema });
                                }}
                                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="column_name"
                              />
                            </td>
                            <td className="px-4 py-2 text-gray-600 text-xs">{col.originalName}</td>
                            <td className="px-4 py-2">
                              <select
                                value={col.type}
                                onChange={(e) => {
                                  const newSchema = [...sheetSchema.schema];
                                  newSchema[index].type = e.target.value;
                                  setSheetSchema({ ...sheetSchema, schema: newSchema });
                                }}
                                className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="INT">INT</option>
                                <option value="DECIMAL(10,2)">DECIMAL</option>
                                <option value="VARCHAR(255)">VARCHAR</option>
                                <option value="TEXT">TEXT</option>
                                <option value="DATETIME">DATETIME</option>
                                <option value="DATE">DATE</option>
                              </select>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                onClick={() => {
                                  const newSchema = sheetSchema.schema.filter((_: any, i: number) => i !== index);
                                  const newHeaders = sheetSchema.headers.filter((_: any, i: number) => i !== index);
                                  const newPreviewData = sheetSchema.previewData.map((row: any[]) => 
                                    row.filter((_: any, i: number) => i !== index)
                                  );
                                  setSheetSchema({ 
                                    ...sheetSchema, 
                                    schema: newSchema,
                                    headers: newHeaders,
                                    previewData: newPreviewData
                                  });
                                }}
                                className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
                                title="ลบคอลัมน์"
                              >
                                ลบ
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Preview Data */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      Preview (5 แถวแรก)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            {sheetSchema.schema.map((col: any, index: number) => (
                              <th key={index} className="px-3 py-2 text-left font-semibold text-gray-700 border-b">
                                {col.name}
                                {col.name !== col.originalName && (
                                  <span className="ml-1 text-gray-400 font-normal">({col.originalName})</span>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sheetSchema.previewData.map((row: any[], rowIndex: number) => (
                            <tr key={rowIndex} className="border-b">
                              {row.map((cell: any, cellIndex: number) => (
                                <td key={cellIndex} className="px-3 py-2 text-gray-600">
                                  {cell || '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setCreateTableStep(2)}
                      className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                    >
                      ย้อนกลับ
                    </button>
                    <button
                      onClick={handleCreateTable}
                      disabled={!tableName.trim() || syncLoading}
                      className="flex-1 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {syncLoading ? 'กำลังสร้าง...' : 'สร้างตารางและซิงค์ข้อมูล'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Google Drive File Picker Dialog */}
      {showDrivePicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">เลือกไฟล์จาก Google Drive</h2>
                <p className="text-sm text-gray-600 mt-1">เลือก Google Sheets ที่ต้องการซิงค์</p>
              </div>
              <button
                onClick={() => setShowDrivePicker(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <div className="relative">
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ค้นหาไฟล์..."
                  value={driveSearchQuery}
                  onChange={(e) => setDriveSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(80vh-240px)]">
              {driveFiles.filter(f => f.name.toLowerCase().includes(driveSearchQuery.toLowerCase())).length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p>ไม่พบไฟล์ Google Sheets {driveSearchQuery && `ที่ตรงกับ "${driveSearchQuery}"`}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {driveFiles
                    .filter(f => f.name.toLowerCase().includes(driveSearchQuery.toLowerCase()))
                    .map((file) => (
                    <button
                      key={file.id}
                      onClick={() => selectDriveFile(file)}
                      className="w-full p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left flex items-center gap-3"
                    >
                      <img 
                        src={file.iconLink || 'https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_spreadsheet_x16.png'} 
                        alt="Sheet icon"
                        className="w-8 h-8"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">{file.name}</div>
                        <div className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                          <span>โดย {file.owner}</span>
                          <span>•</span>
                          <span>แก้ไข: {new Date(file.modifiedTime).toLocaleDateString('th-TH')}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200">
              <button
                onClick={() => setShowDrivePicker(false)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 animate-slide-in">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border ${
            toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
            toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            {toast.type === 'success' && (
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
            {toast.type === 'error' && (
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
            {toast.type === 'info' && (
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            )}
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default function DatabasePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
      <DatabasePageContent />
    </Suspense>
  );
}
