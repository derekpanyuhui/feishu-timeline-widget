# 飞书多维表格时间线插件

一个用于多维表格的横向里程碑时间线插件原型。界面参考截图：左侧展示时间轴，右侧配置数据源、里程碑名称、完成状态、完成时间字段。

## 本地运行

```bash
cd feishu-timeline-widget
npm install
npm run dev
```

本地浏览器会进入预览模式，使用 `src/sampleData.ts` 中的示例数据。放到飞书多维表格插件环境后，会通过 `@lark-base-open/js-sdk` 读取当前 Base 的真实数据表、字段和记录。

## 字段配置

- 数据表：来自 `bitable.base.getTableMetaList()` 或 `getTableList()`
- 里程碑名称：推荐文本、主字段、包含「名称/标题/里程碑/会议」的字段
- 完成状态：推荐单选、多选、复选框、文本、进度字段
- 完成时间：推荐日期、创建时间、更新时间字段

状态文本包含「已完成」「完成」「done」「closed」「通过」「结束」时，会渲染为绿色已完成节点；其他状态会渲染为待处理色。

## 发布到飞书

```bash
npm run build
```

将 `dist` 部署到一个 HTTPS 服务地址，然后在多维表格的自定义插件面板里新增插件，填写该服务地址。飞书小程序自定义组件文档里的 `json / ttml / ttss / js` + `Component()` 模式适合小程序组件复用；本项目要关联多维表格字段，所以核心使用 Base JS SDK。
