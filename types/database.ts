export interface TableInfo {
  name: string;
  rows: number;
  size: string;
}

export interface Folder {
  id?: string;
  name: string;
  expanded: boolean;
  tables: TableInfo[];
}

export interface Dataset {
  name: string;
  tables: TableInfo[];
  expanded: boolean;
  folders: Folder[];
}

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  description?: string;
  schedule?: string;
  destination_table?: string;
  updated_at: string;
}
