import type { FieldMeta, TableMeta, TimelineItem } from './types';

export const sampleTables: TableMeta[] = [
  { id: 'sample-table', name: '我的会议任务系统' }
];

export const sampleFields: FieldMeta[] = [
  { id: 'name', name: '会议名称', type: 1, isPrimary: true, kind: 'name' },
  { id: 'status', name: '状态', type: 3, kind: 'status' },
  { id: 'finishDate', name: '计划完成时间', type: 5, kind: 'date' },
  { id: 'owner', name: '负责人', type: 11, kind: 'other' }
];

export const sampleTimelineItems: TimelineItem[] = [
  { id: '1', name: '初审', status: '已完成', dateText: '2026-07-01', dateValue: 1782835200000, completed: true },
  { id: '2', name: '内审', status: '已完成', dateText: '2026-07-06', dateValue: 1783267200000, completed: true },
  { id: '3', name: '打合', status: '已完成', dateText: '2026-07-06', dateValue: 1783267200000, completed: true },
  { id: '4', name: '协同', status: '已完成', dateText: '2026-07-08', dateValue: 1783440000000, completed: true },
  { id: '5', name: '内部', status: '已完成', dateText: '2026-07-08', dateValue: 1783440000000, completed: true },
  { id: '6', name: '预会', status: '已完成', dateText: '2026-07-09', dateValue: 1783526400000, completed: true },
  { id: '7', name: '小议', status: '已完成', dateText: '2026-07-09', dateValue: 1783526400000, completed: true },
  { id: '8', name: '正会', status: '已完成', dateText: '2026-07-10', dateValue: 1783612800000, completed: true },
  { id: '9', name: '小结', status: '已完成', dateText: '2026-07-10', dateValue: 1783612800000, completed: true },
  { id: '10', name: '总结', status: '已完成', dateText: '2026-07-14', dateValue: 1783958400000, completed: true }
];
