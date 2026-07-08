import type {
  BaseClient,
  DashboardMode,
  FieldKind,
  FieldMeta,
  TableMeta,
  TimelineConfig,
  TimelineItem
} from './types';
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

function normalizeDashboardCell(
  cell: { text?: string | null; value?: string | number | null } | null | undefined
) {
  if (!cell) return '';
  return normalizeText(cell.text ?? cell.value ?? '');
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

function isConfigComplete(config: TimelineConfig) {
  return Boolean(config.tableId && config.nameFieldId && config.startDateFieldId && config.endDateFieldId);
}

function deriveConfigFromDashboardCondition(
  config: { dataConditions?: Array<{ tableId?: string; groups?: Array<{ fieldId?: string }> }> } | null | undefined
): TimelineConfig | null {
  const primary = config?.dataConditions?.[0];
  const groupIds = primary?.groups?.map((group) => group.fieldId).filter(Boolean) ?? [];

  if (!primary?.tableId || groupIds.length < 3) {
    return null;
  }

  return {
    tableId: primary.tableId,
    nameFieldId: groupIds[0] ?? '',
    startDateFieldId: groupIds[1] ?? '',
    endDateFieldId: groupIds[2] ?? ''
  };
}

function parseDashboardRows(
  rows: Array<Array<{ text?: string | null; value?: string | number | null }>>,
  fallbackConfig: TimelineConfig
) {
  return sortItems(
    rows
      .map((row, index) => {
        const name = normalizeDashboardCell(row[0]) || `里程碑 ${index + 1}`;
        const startDate = normalizeDate(normalizeDashboardCell(row[1]));
        const endDate = normalizeDate(normalizeDashboardCell(row[2]) || normalizeDashboardCell(row[1]));
        const status = deriveStatus(startDate.timestamp, endDate.timestamp);

        return {
          id: `${fallbackConfig.tableId}-${index}-${name}`,
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
}

function getDashboardModeFromLocation(): DashboardMode {
  if (typeof window === 'undefined') return 'standard';

  const searchParams = new URLSearchParams(window.location.search);
  const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] ?? '' : '';
  const hashParams = new URLSearchParams(hashQuery);
  const flag = (key: string) => searchParams.get(key) === '1' || hashParams.get(key) === '1';

  if (flag('isCreate')) return 'create';
  if (flag('isConfig')) return 'config';
  if (flag('isFullScreen')) return 'fullscreen';
  return 'view';
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
    getDashboardMode() {
      return 'standard';
    },
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
    },
    async markRendered() {
      return;
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
    const buildDataCondition = (
      config: TimelineConfig,
      existingCondition?: {
        dataRange?: unknown;
        groups?: unknown[];
        series?: unknown;
      }
    ) => ({
      tableId: config.tableId,
      dataRange: existingCondition?.dataRange ?? { type: sdk.SourceType.ALL },
      groups: [
        { fieldId: config.nameFieldId },
        { fieldId: config.startDateFieldId },
        { fieldId: config.endDateFieldId }
      ],
      series: existingCondition?.series ?? 'COUNTA'
    });

    if (!bitable?.base) {
      throw new Error('Base SDK is unavailable outside Feishu.');
    }

    return {
      isConnected: true,
      isDashboard: Boolean(bitable.dashboard),
      getDashboardMode() {
        return bitable.dashboard ? getDashboardModeFromLocation() : 'standard';
      },
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
        if (bitable.dashboard?.getCategories) {
          try {
            const categories = await bitable.dashboard.getCategories(tableId);
            if (categories.length) {
              return categories.map((field: { fieldId: string; fieldName: string; fieldType?: number | string }) => ({
                id: field.fieldId,
                name: field.fieldName,
                type: field.fieldType,
                kind: classifyField({ name: field.fieldName, type: field.fieldType })
              }));
            }
          } catch {
            // fall back to base field metadata
          }
        }

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
        if (bitable.dashboard && isConfigComplete(config)) {
          const mode = getDashboardModeFromLocation();
          const existingConfig = await bitable.dashboard.getConfig?.().catch(() => null);
          const primaryCondition = existingConfig?.dataConditions?.[0];
          const dataCondition = buildDataCondition(config, primaryCondition);

          try {
            if (mode === 'create' || mode === 'config') {
              const previewRows = await bitable.dashboard.getPreviewData(dataCondition as never);
              return parseDashboardRows(
                previewRows as Array<Array<{ text?: string | null; value?: string | number | null }>>,
                config
              );
            }

            const viewRows = await bitable.dashboard.getData();
            return parseDashboardRows(
              viewRows as Array<Array<{ text?: string | null; value?: string | number | null }>>,
              config
            );
          } catch {
            // fall back to direct base reading if dashboard data APIs reject the custom condition
          }
        }

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

          if (isTimelineConfig(saved)) {
            return saved;
          }

          return deriveConfigFromDashboardCondition(dashboardConfig);
        } catch {
          return null;
        }
      },
      async saveConfig(config: TimelineConfig) {
        try {
          const existingConfig = await bitable.dashboard?.getConfig?.().catch(() => null);
          const primaryCondition = existingConfig?.dataConditions?.[0];
          const dataConditions = [buildDataCondition(config, primaryCondition)];

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

          return saved;
        } catch {
          return false;
        }
      },
      async markRendered() {
        try {
          await bitable.dashboard?.setRendered?.();
        } catch {
          return;
        }
      },
      onDashboardConfigChange(callback: () => void) {
        return bitable.dashboard?.onConfigChange?.(() => callback()) ?? (() => undefined);
      },
      onDashboardDataChange(callback: () => void) {
        return bitable.dashboard?.onDataChange?.(() => callback()) ?? (() => undefined);
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
