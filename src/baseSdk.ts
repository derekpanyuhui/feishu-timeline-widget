import type { BaseClient, FieldKind, FieldMeta, TableMeta, TimelineConfig, TimelineItem } from './types';
import { sampleFields, sampleTables, sampleTimelineItems } from './sampleData';

const FIELD_TYPES = {
  text: 1,
  dateTime: 5,
  createdTime: 1001,
  modifiedTime: 1002
};

const dateTypes = new Set<unknown>([FIELD_TYPES.dateTime, FIELD_TYPES.createdTime, FIELD_TYPES.modifiedTime]);

function classifyField(field: { name?: string; type?: unknown; isPrimary?: boolean }): FieldKind {
  const name = field.name ?? '';

  if (field.isPrimary || /名称|标题|事项|任务|里程碑|会议/.test(name)) {
    return 'name';
  }

  if (dateTypes.has(field.type) || /日期|时间|开始|结束|完成日|计划/.test(name)) {
    return 'date';
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

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function deriveStatus(startTimestamp: number, endTimestamp: number) {
  const today = startOfToday();

  if (Number.isFinite(endTimestamp) && endTimestamp < today) {
    return { status: '已完成', completed: true, state: 'done' as const };
  }

  if (Number.isFinite(startTimestamp) && startTimestamp > today) {
    return { status: '未开始', completed: false, state: 'pending' as const };
  }

  return { status: '进行中', completed: false, state: 'active' as const };
}

function formatDateRange(startText: string, endText: string) {
  if (!startText || startText === '未设置') return endText || '未设置';
  if (!endText || endText === '未设置' || endText === startText) return startText;
  return `${startText} - ${endText}`;
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
    isDashboard: false,
    async getTables() {
      return sampleTables;
    },
    async getFields() {
      return sampleFields;
    },
    async getTimelineItems() {
      return sortItems(sampleTimelineItems);
    },
    async loadSavedConfig() {
      return null;
    },
    async saveConfig() {
      return true;
    }
  };
}

function isTimelineConfig(value: unknown): value is TimelineConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<TimelineConfig>;

  return Boolean(
    config.tableId &&
      config.nameFieldId &&
      config.startDateFieldId &&
      config.endDateFieldId
  );
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
      isDashboard: Boolean(bitable.dashboard),
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
              const startDate = normalizeDate(fields[config.startDateFieldId]);
              const endDate = normalizeDate(fields[config.endDateFieldId]) || startDate;
              const status = deriveStatus(startDate.timestamp, endDate.timestamp);

              return {
                id: record.recordId ?? record.id ?? `${index}`,
                name,
                status: status.status,
                dateText: formatDateRange(startDate.text, endDate.text),
                dateValue: startDate.timestamp,
                completed: status.completed,
                state: status.state
              };
            })
            .filter((item) => item.name.trim())
        );
      },
      async loadSavedConfig() {
        try {
          const dashboardConfig = await bitable.dashboard?.getConfig?.();
          const saved = dashboardConfig?.customConfig?.timelineConfig;

          return isTimelineConfig(saved) ? saved : null;
        } catch {
          return null;
        }
      },
      async saveConfig(config: TimelineConfig) {
        try {
          const existingConfig = await bitable.dashboard?.getConfig?.().catch(() => null);
          const dataConditions: unknown[] = existingConfig?.dataConditions?.length
            ? existingConfig.dataConditions
            : [
                {
                  tableId: config.tableId,
                  dataRange: { type: sdk.SourceType.ALL },
                  groups: [],
                  series: 'COUNTA'
                }
              ];

          if (!bitable.dashboard?.saveConfig) {
            return true;
          }

          const saved = await bitable.dashboard.saveConfig({
            dataConditions: dataConditions as never,
            customConfig: {
              ...(existingConfig?.customConfig ?? {}),
              timelineConfig: config
            }
          });

          await bitable.dashboard?.setRendered?.().catch(() => false);

          return saved;
        } catch {
          return false;
        }
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
    startDateFieldId:
      fields.find((field) => field.kind === 'date' && /开始|起始|start/i.test(field.name))?.id ||
      findByKind('date') ||
      fields[1]?.id ||
      '',
    endDateFieldId:
      fields.find((field) => field.kind === 'date' && /结束|截止|完成|end|due/i.test(field.name))?.id ||
      fields.filter((field) => field.kind === 'date')[1]?.id ||
      findByKind('date') ||
      fields[2]?.id ||
      ''
  };
}
