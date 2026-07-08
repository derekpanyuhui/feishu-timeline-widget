export type TableMeta = {
  id: string;
  name: string;
};

export type FieldKind = 'name' | 'date' | 'other';

export type FieldMeta = {
  id: string;
  name: string;
  type?: number | string;
  isPrimary?: boolean;
  kind: FieldKind;
};

export type TimelineConfig = {
  tableId: string;
  nameFieldId: string;
  startDateFieldId: string;
  endDateFieldId: string;
};

export type TimelineItem = {
  id: string;
  name: string;
  status: string;
  dateText: string;
  dateValue: number;
  completed: boolean;
  state: 'done' | 'active' | 'pending';
};

export type BaseClient = {
  isConnected: boolean;
  isDashboard: boolean;
  getTables: () => Promise<TableMeta[]>;
  getFields: (tableId: string) => Promise<FieldMeta[]>;
  getTimelineItems: (config: TimelineConfig) => Promise<TimelineItem[]>;
  loadSavedConfig: () => Promise<TimelineConfig | null>;
  saveConfig: (config: TimelineConfig) => Promise<boolean>;
  markRendered: () => Promise<void>;
};
