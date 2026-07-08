import { useEffect, useMemo, useState } from 'react';
import { createBaseClient, pickInitialConfig } from './baseSdk';
import type { BaseClient, FieldKind, FieldMeta, TableMeta, TimelineConfig, TimelineItem } from './types';

const labels: Record<FieldKind, string> = {
  name: '名称字段',
  status: '状态字段',
  date: '日期字段',
  other: '其他字段'
};

function FieldSelect({
  label,
  value,
  fields,
  preferredKinds,
  onChange
}: {
  label: string;
  value: string;
  fields: FieldMeta[];
  preferredKinds: FieldKind[];
  onChange: (value: string) => void;
}) {
  const groupedFields = useMemo(() => {
    return [...fields].sort((a, b) => {
      const aScore = preferredKinds.includes(a.kind) ? 0 : 1;
      const bScore = preferredKinds.includes(b.kind) ? 0 : 1;
      return aScore - bScore || a.name.localeCompare(b.name, 'zh-CN');
    });
  }, [fields, preferredKinds]);

  return (
    <label className="control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择字段</option>
        {groupedFields.map((field) => (
          <option key={field.id} value={field.id}>
            {field.name} · {labels[field.kind]}
          </option>
        ))}
      </select>
    </label>
  );
}

function Timeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) {
    return (
      <div className="empty">
        <div className="empty-title">还没有可展示的里程碑</div>
        <div className="empty-copy">请选择数据源、里程碑名称、完成状态和日期字段。</div>
      </div>
    );
  }

  return (
    <div className="timeline-scroll">
      <div className="timeline" style={{ ['--item-count' as string]: items.length }}>
        <div className="timeline-line" />
        {items.map((item) => (
          <article className={`milestone ${item.completed ? 'is-done' : 'is-open'}`} key={item.id}>
            <div className="milestone-name" title={item.name}>
              {item.name}
            </div>
            <div className="node" aria-hidden="true" />
            <div className="milestone-status">{item.status}</div>
            <time className="milestone-date">{item.dateText}</time>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [client, setClient] = useState<BaseClient | null>(null);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [config, setConfig] = useState<TimelineConfig>({
    tableId: '',
    nameFieldId: '',
    statusFieldId: '',
    dateFieldId: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('正在连接多维表格...');

  useEffect(() => {
    let alive = true;

    async function boot() {
      const nextClient = await createBaseClient();
      const nextTables = await nextClient.getTables();

      if (!alive) return;

      setClient(nextClient);
      setTables(nextTables);
      setMessage(nextClient.isConnected ? '已连接当前多维表格' : '本地预览模式：使用示例数据');

      if (nextTables[0]) {
        setConfig((current) => ({ ...current, tableId: nextTables[0].id }));
      }

      setIsLoading(false);
    }

    boot();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!client || !config.tableId) return;

    let alive = true;
    const activeClient = client;
    const activeTableId = config.tableId;

    async function loadFields() {
      setIsLoading(true);
      const nextFields = await activeClient.getFields(activeTableId);

      if (!alive) return;

      setFields(nextFields);
      setConfig(pickInitialConfig(activeTableId, nextFields));
      setIsLoading(false);
    }

    loadFields();

    return () => {
      alive = false;
    };
  }, [client, config.tableId]);

  useEffect(() => {
    if (!client || !config.tableId || !config.nameFieldId || !config.statusFieldId || !config.dateFieldId) return;

    let alive = true;
    const activeClient = client;
    const activeConfig = config;

    async function loadItems() {
      setIsLoading(true);
      const nextItems = await activeClient.getTimelineItems(activeConfig);

      if (!alive) return;

      setItems(nextItems);
      setIsLoading(false);
    }

    loadItems();

    return () => {
      alive = false;
    };
  }, [client, config]);

  const completedCount = items.filter((item) => item.completed).length;

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>时间线</h1>
            <span>插件</span>
          </div>
          <p>{message}</p>
        </header>

        <div className="canvas">
          <div className="summary">
            <div>
              <strong>{items.length}</strong>
              <span>里程碑</span>
            </div>
            <div>
              <strong>{completedCount}</strong>
              <span>已完成</span>
            </div>
          </div>
          {isLoading ? <div className="loading">正在刷新时间轴...</div> : <Timeline items={items} />}
        </div>
      </section>

      <aside className="settings" aria-label="时间线配置">
        <div className="settings-head">
          <h2>数据源</h2>
          <button
            type="button"
            onClick={async () => {
              if (!client) return;
              setIsLoading(true);
              const nextItems = await client.getTimelineItems(config);
              setItems(nextItems);
              setIsLoading(false);
            }}
          >
            刷新
          </button>
        </div>

        <label className="control">
          <span>数据表</span>
          <select value={config.tableId} onChange={(event) => setConfig((current) => ({ ...current, tableId: event.target.value }))}>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </select>
        </label>

        <FieldSelect
          label="里程碑名称"
          value={config.nameFieldId}
          fields={fields}
          preferredKinds={['name']}
          onChange={(value) => setConfig((current) => ({ ...current, nameFieldId: value }))}
        />

        <FieldSelect
          label="完成状态"
          value={config.statusFieldId}
          fields={fields}
          preferredKinds={['status', 'name']}
          onChange={(value) => setConfig((current) => ({ ...current, statusFieldId: value }))}
        />

        <FieldSelect
          label="完成时间"
          value={config.dateFieldId}
          fields={fields}
          preferredKinds={['date']}
          onChange={(value) => setConfig((current) => ({ ...current, dateFieldId: value }))}
        />

        <button className="primary" type="button">
          确定
        </button>
      </aside>
    </main>
  );
}
