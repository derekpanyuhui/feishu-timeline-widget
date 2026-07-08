import type { BaseClient, FieldKind, FieldMeta, TableMeta, TimelineConfig, TimelineItem } from './types';
import { sampleFields, sampleTables, sampleTimelineItems } from './sampleData';

const FIELD_TYPES = {
  text: 1,
  number: 2,
  singleSelect: 3,
  multiSelect: 4,
  dateTime: 5,
  checkbox: 7,
  progress: 21,
  createdTime: 1001,
  modifiedTime: 1002
};

const dateTypes = new Set<unknown>([FIELD_TYPES.dateTime, FIELD_TYPES.createdTime, FIELD_TYPES.modifiedTime]);
const statusTypes = new Set<unknown>([
  FIELD_TYPES.text,
  FIELD_TYPES.singleSelect,
  FIELD_TYPES.multiSelect,
  FIELD_TYPES.checkbox,
  FIELD_TYPES.progress
]);

function classifyField(field: { name?: string; type?: unknown; isPrimary?: boolean }): FieldKind {
  const name = field.name ?? '';

  if (field.isPrimary || /名称|标题|事项|任务|里程碑|会议/.test(name)) {
    return 'name';
  }

  if (dateTypes.has(field.type) || /日期|时间|完成日|计划/.test(name)) {
    return 'date';
  }

  if (statusTypes.has(field.type) || /状态|完成|进度/.test(name)) {
    return 'status';
  }

  return 'other';
}

function normalizeText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean).join('、');
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return normalizeText(
      objectValue.text ??
        objectValue.name ??
        objectValue.title ??
        objectValue.value ??
        objectValue.en_name ??
        objectValue.zh_name
    );
  }

  return '';
}

function normalizeDate(value: unknown): { text: string; timestamp: number } {
  if (typeof value === 'number') {
    return {
      text: new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(value).split('/').join('-'),
      timestamp: value
    };
  }

  const text = normalizeText(value);
  const parsed = Date.parse(text);

  return {
    text: text || '未设置',
    timestamp: Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed
  };
}

function isCompletedStatus(status: string): boolean {
  return /已完成|完成|done|closed|通过|结束/i.test(status);
}

function sortItems(items: TimelineItem[]) {
  return [...items].sort((a, b) => a.dateValue - b.dateValue || a.name.localeCompare(b.name, 'zh-CN'));
}

function isLikelyFeishuHost() {
  if (typeof window === 'undefined') return false;

  const referrer = document.referrer.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  const hostSignals = ['feishu', 'lark', 'larksuite'];

  return window.self !== window.top || hostSignals.some((signal) => referrer.includes(signal) || userAgent.includes(signal));
}

function createSampleClient(): BaseClient {
  return {
    isConnected: false,
    async getTables() {
      return sampleTables;
    },
    async getFields() {
      return sampleFields;
    },
    async getTimelineItems() {
      return sortItems(sampleTimelineItems);
    }
  };
}

export async function createBaseClient(): Promise<BaseClient> {
  if (!isLikelyFeishuHost()) {
    return createSampleClient();
  }

  try {
    const sdk = await import('@lark-base-open/js-sdk');
    const bitable = sdk.bitable;

    if (!bitable?.base) {
      throw new Error('Base SDK is unavailable outside Feishu.');
    }

    return {
      isConnected: true,
      async getTables() {
        if (typeof bitable.base.getTableMetaList === 'function') {
          const metas = await bitable.base.getTableMetaList();
          return metas.map((table: { id: string; name: string }) => ({ id: table.id, name: table.name }));
        }

        const tables = await bitable.base.getTableList();
        return Promise.all(
          tables.map(async (table: { id: string; getName?: () => Promise<string> }) => ({
            id: table.id,
            name: table.getName ? await table.getName() : table.id
          }))
        );
      },
      async getFields(tableId: string) {
        const table = await bitable.base.getTableById(tableId);
        const fields = await table.getFieldMetaList();

        return fields.map((field: { id: string; name: string; type?: number | string; isPrimary?: boolean }) => ({
          id: field.id,
          name: field.name,
          type: field.type,
          isPrimary: field.isPrimary,
          kind: classifyField(field)
        }));
      },
      async getTimelineItems(config: TimelineConfig) {
        const table = await bitable.base.getTableById(config.tableId);
        const allRecords: Array<{ recordId?: string; id?: string; fields: Record<string, unknown> }> = [];
        let pageToken: number | undefined;

        do {
          const page = await table.getRecordsByPage({
            pageSize: 200,
            pageToken
          });
          allRecords.push(...page.records);
          pageToken = page.pageToken;
        } while (pageToken);

        return sortItems(
          allRecords
            .map((record, index) => {
              const fields = record.fields ?? {};
              const name = normalizeText(fields[config.nameFieldId]) || `里程碑 ${index + 1}`;
              const status = normalizeText(fields[config.statusFieldId]) || '未设置';
              const date = normalizeDate(fields[config.dateFieldId]);

              return {
                id: record.recordId ?? record.id ?? `${index}`,
                name,
                status,
                dateText: date.text,
                dateValue: date.timestamp,
                completed: isCompletedStatus(status)
              };
            })
            .filter((item) => item.name.trim())
        );
      }
    };
  } catch {
    return createSampleClient();
  }
}

export function pickInitialConfig(tableId: string, fields: FieldMeta[]): TimelineConfig {
  const findByKind = (kind: FieldKind) => fields.find((field) => field.kind === kind)?.id ?? '';

  return {
    tableId,
    nameFieldId: findByKind('name') || fields[0]?.id || '',
    statusFieldId: findByKind('status') || fields[1]?.id || '',
    dateFieldId: findByKind('date') || fields[2]?.id || ''
  };
}
