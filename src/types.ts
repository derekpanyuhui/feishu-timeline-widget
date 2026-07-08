export type TableMeta = {
  id: string;
  name: string;
};

export type FieldKind = 'name' | 'status' | 'date' | 'other';

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
  statusFieldId: string;
  dateFieldId: string;
};

export type TimelineItem = {
  id: string;
  name: string;
  status: string;
  dateText: string;
  dateValue: number;
  completed: boolean;
};

export type BaseClient = {
  isConnected: boolean;
  getTables: () => Promise<TableMeta[]>;
  getFields: (tableId: string) => Promise<FieldMeta[]>;
  getTimelineItems: (config: TimelineConfig) => Promise<TimelineItem[]>;
};
