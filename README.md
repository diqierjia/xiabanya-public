# 下班鸭

下班鸭是一个本地优先的桌面工作日报助手。它可以记录前台窗口活动，按需进行 AI 截屏识别，并基于识别摘要和活动记录生成日报、周报或月报。

## 功能

- 自动记录前台应用、窗口标题和活动时段
- 使用用户自配 API Key 调用 SiliconFlow 兼容接口进行截屏识别
- 基于 AI 识别结果和窗口记录生成 Markdown 报告
- 支持时间线、热力图、应用统计、历史报告和数据导入导出
- 应用统计支持今天、昨天、本周、本月、近 7 天和自定义日期范围
- 自动识别会跳过键鼠空闲时段，避免把离开电脑误算成工作
- 本地 SQLite 存储，应用不自带服务器
- Windows NSIS 安装包配置

## v2.4 更新

- 应用记录默认统计今天，不再默认查询超大历史范围。
- 应用记录页面新增日期筛选器，空数据和加载失败状态下也可切换日期。
- 柱状图和饼图显示当前统计范围，并使用更易区分的多色图表色板。
- AI 自动截图识别在系统空闲超过 5 分钟时暂停，并记录空闲时段。
- 生成报告时会把空闲时段作为非工作上下文传入，减少日报误判。

## 隐私边界

下班鸭不内置云端账号系统，也不会把数据发送到项目作者服务器。启用 AI 截屏识别或 AI 报告生成时，截图内容、识别摘要或报告素材会发送到你在设置中配置的 SiliconFlow 兼容 API 服务商。详见 [PRIVACY.md](./PRIVACY.md)。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npx electron-builder --win nsis --publish never
```

## 测试

```bash
npm test
```

## 项目结构

```text
src/
├── main/       Electron 主进程、数据库、追踪、截图和 AI 调用
├── preload/    contextBridge API
├── renderer/   React 页面、组件和状态管理
└── shared/     跨进程类型、IPC 通道和时间工具
```

## 素材说明

项目中的鸭子图标和吉祥物素材由 Gemini 生成，并经过项目内加工用于下班鸭品牌识别。
## 许可证

本项目代码以 MIT License 开源。第三方依赖许可见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
