# 下班鸭 v2.1 UI/UX 重设计 — 产品需求文档 (PRD)

> **Product Manager: Alice | 日期: 2025-07-05**
> **项目: 下班鸭 (Xiabanya) v2.1**
> **技术栈: Electron 34 + React 19 + TypeScript 5.7 + Tailwind CSS 4**

---

## 1. 项目信息

| 项目 | 内容 |
|------|------|
| **项目名称** | `xiabanya_v2_ui_redesign` |
| **编程语言** | TypeScript 5.7 |
| **前端框架** | React 19 + Vite |
| **样式方案** | Tailwind CSS 4 (统一为 v4，CSS-first 配置) |
| **UI 图表** | recharts ^2.15 |
| **Toast 通知** | sonner ^2.0 |
| **图标库** | lucide-react（现有，继续使用） |
| **状态管理** | Zustand（现有 4 stores，规整化） |

### 原始需求复述

下班鸭 v1/v2 已有完整的功能骨架（活动追踪、AI 截图识别、日报生成），但 UI/UX 层面存在系统性问题：全白底无层次、零组件封装、无反馈机制、AI 结果展示 raw JSON、Tailwind 版本混用。本次 v2.1 在不改变核心功能的前提下，完成 UI/UX 专业化重设计。

---

## 2. 产品定义

### 2.1 产品目标

| # | 目标 | 衡量标准 |
|---|------|----------|
| G1 | **建立统一的视觉语言**：定义完整设计系统（配色/字体/间距/组件），消除"浏览器默认控件"感 | 所有页面 100% 使用设计系统组件，品牌色 #08a64f 贯穿全局 |
| G2 | **覆盖全流程反馈机制**：loading / empty / error / success toast 四态覆盖所有用户操作 | 每个可产生状态的交互都有对应视觉反馈，console.error 清零 |
| G3 | **提升信息呈现品质**：AI 报告不再展示 raw JSON，图表使用真实图表库（recharts），热力图可交互 | 核心页面（今日/报告/应用统计/热力图）视觉品质达到专业 SaaS 水平 |
| G4 | **消除技术债务**：统一 Tailwind v4、替换 `(window as any)`、规整 Zustand stores | 21 处 `(window as any)` 全部替换为类型安全 hook；未使用的 store 清理；Tailwind 语法全量 v4 兼容 |
| G5 | **保持轻量**：不引入 MUI 等重型库，增量改造，最小变更面 | 新增运行时依赖 < 100KB（recharts + sonner） |

### 2.2 用户故事

| ID | 场景 | 描述 |
|----|------|------|
| US1 | **首次使用引导** | 作为新用户，我希望打开应用后看到清晰的空状态引导（而非空白页），以便知道如何开始追踪工作 |
| US2 | **日常追踪反馈** | 作为日常用户，我希望点击「开始追踪/停止追踪」时有明确的视觉反馈（按钮状态变化 + toast），以便确认操作成功 |
| US3 | **日报生成** | 作为需要写周报的打工人，我希望生成的日报有格式化的 Markdown 预览（而非 raw JSON），并且可以编辑校对后复制 |
| US4 | **查看热力图** | 作为希望回顾工作节奏的用户，我希望热力图可以 hover 查看详情、点击展开当日记录，而非仅靠原生 title 属性 |
| US5 | **应用统计** | 作为希望了解时间分配的用户，我希望看到真正的饼图/柱状图（而非色块列表），直观了解各应用和分类的时间占比 |

---

## 3. 技术规范

### 3.1 需求池

#### P0 — 必须实现（本次迭代必须交付）

| ID | 需求 | 说明 | 验收标准 |
|----|------|------|----------|
| P0-01 | **设计系统基础设施** | 建立完整的设计 Token（颜色/字体/间距/圆角/阴影），通过 CSS 变量和 Tailwind v4 `@theme` 暴露 | 全局 `globals.css` 定义完整的 `@theme` 块，所有颜色/间距 token 可用 Tailwind 类名引用 |
| P0-02 | **基础 UI 组件封装** | 建立 Button / Input / Card / Badge / Toast / Skeleton / EmptyState 7 个核心组件 | 每个组件支持变体（variant/size），有 hover/focus/disabled 状态样式，不再出现浏览器原生控件 |
| P0-03 | **Toast 通知系统** | 基于 sonner 封装全局 Toaster，所有 API 调用、操作成功/失败统一走 toast | `toast.success()` / `toast.error()` 替代所有 `console.error()` 和 `alert()` |
| P0-04 | **Loading / Empty / Error 三态** | 每个数据驱动页面必须覆盖 loading（骨架屏）、empty（引导文案+CTA）、error（重试按钮）三种状态 | 6 个数据页面全部实现三态覆盖 |
| P0-05 | **Sidebar 视觉重构** | 修复 Tailwind v4 高亮失效（`bg-brand/10` → `bg-brand-600/10`），添加品牌标识（Logo+名称），移除「AI 识别」导航项 | 侧边栏高亮正确显示，有品牌标识，导航项从 8 个减为 7 个 |
| P0-06 | **Tailwind v4 语法统一** | 所有 Tailwind 类名按照 v4 规范修改，统一使用 CSS-first 配置 | 构建无警告，`bg-brand/10` 等 v3 语法清零 |
| P0-07 | **日报生成 UI** | ReportPage 生成结果用 Markdown 渲染预览（非 raw JSON），支持编辑校对后复制/保存 | 报告生成后显示格式化的 Markdown 预览，可在 textarea 中编辑 |

#### P1 — 应该实现（优先完成，如有余力）

| ID | 需求 | 说明 | 验收标准 |
|----|------|------|----------|
| P1-01 | **真实图表替换** | AppsPage 用 recharts BarChart/PieChart 替换手写色块"假饼图" | 应用统计页显示可交互的柱状图和饼图，支持 hover 查看数值 |
| P1-02 | **热力图交互** | 热力图 hover 显示自定义 Tooltip（时间/记录数/应用列表），点击展开当日详情面板 | 替换原生 title 属性，hover 有浮层，点击有详情侧面板 |
| P1-03 | **`(window as any)` 清理** | 21 处类型不安全的 API 调用全部替换为 `useXiabanyaApi()` hook | Grep `(window as any).xiabanyaApi` 返回零结果 |
| P1-04 | **Zustand Stores 规整** | 移除未使用的 store 字段，所有数据页面统一走 store 获取数据 | 4 个 store 全部被使用，无死代码字段 |
| P1-05 | **设置页面增强** | 新增「自定义分类」管理模块，支持创建/编辑/删除用户分类（名称/颜色/关键词） | 设置页可管理自定义分类，保存有 toast 反馈 |
| P1-06 | **页面过渡动画** | 页面切换添加 fade-in / slide-up 微动效，内容加载使用骨架屏闪烁效果 | CSS 动画自然流畅，无性能问题 |

#### P2 — 锦上添花（有额外时间则做）

| ID | 需求 | 说明 | 验收标准 |
|----|------|------|----------|
| P2-01 | **每日趋势图** | AppsPage 增加 DailyTrendChart（LineChart），展示 7/30 天工作时长趋势 | 折线图可交互，切换时间范围 |
| P2-02 | **暗色模式** | 基于 Tailwind dark: 变体支持暗色模式切换 | 系统设置中可切换，所有组件覆盖 dark 样式 |
| P2-03 | **键盘快捷键面板** | `Ctrl+Shift+X` 显示/隐藏窗口，`?` 弹出快捷键帮助面板 | 全局快捷键生效，帮助面板列出所有快捷键 |

### 3.2 UI 设计草案

```
┌──────────────────────────────────────────────────────┐
│ Sidebar (208px)            │  Main Content Area       │
│                            │                          │
│  [Logo] 下班鸭 v2.1        │  ┌─ Header ────────────┐ │
│  ─────────────────────     │  │ 页面标题          🔔│ │
│                            │  └─────────────────────┘ │
│  📋 今日工作               │                          │
│  📝 生成报告               │  ┌─ Hero Banner ───────┐ │
│  🕐 时间线                 │  │ 总计专注: 3h24m     │ │
│  🔥 热力图                 │  │ [开始追踪]         │ │
│  📊 应用记录               │  └─────────────────────┘ │
│  📄 历史报告               │                          │
│  ⚙️ 设置                   │  ┌─ StatCard x 4 ──────┐ │
│                            │  │ ...                  │ │
│                            │  └─────────────────────┘ │
│                            │                          │
│                            │  ┌─ SegmentTimeline ────┐ │
│                            │  │ 09:30  代码开发      │ │
│                            │  │        1h20m ▸开发   │ │
│                            │  │ 10:50  会议讨论      │ │
│                            │  │        45m  ▸沟通    │ │
│                            │  └─────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 3.3 设计系统规范

#### 3.3.1 配色方案

```css
/* === 品牌色 (Brand Green) === */
--color-brand-50:  #f0fdf4;   /* 最浅绿 — 背景/选中态底色 */
--color-brand-100: #dcfce7;   /* 浅绿 — hover 背景 */
--color-brand-200: #bbf7d0;   /* 浅绿 — badge 背景 */
--color-brand-400: #4ade80;   /* 亮绿 — 侧边栏文字 */
--color-brand-500: #22c55e;   /* 中绿 — 次要行动按钮 */
--color-brand-600: #08a64f;   /* 主色 — 按钮/链接/强调 */
--color-brand-700: #07984a;   /* 深绿 — hover 态 */
--color-brand-800: #067a3c;   /* 更深 — active 态 */
--color-brand-900: #14532d;   /* 最深 — 侧边栏背景 */

/* === 语义色 === */
--color-success: #08a64f;     /* 成功 — 与主色相同 */
--color-warning: #f59e0b;     /* 警告 — 琥珀色 */
--color-error:   #ef4444;     /* 错误 — 红色 */
--color-info:    #3b82f6;     /* 信息 — 蓝色 */

/* === 灰度系统 === */
--color-gray-50:  #f9fafb;   /* 页面背景 */
--color-gray-100: #f3f4f6;   /* 卡片背景/输入框背景 */
--color-gray-200: #e5e7eb;   /* 边框 */
--color-gray-300: #d1d5db;   /* 分割线 */
--color-gray-400: #9ca3af;   /* 占位符/禁用文字 */
--color-gray-500: #6b7280;   /* 辅助文字 */
--color-gray-600: #4b5563;   /* 次要正文 */
--color-gray-700: #374151;   /* 正文标题 */
--color-gray-800: #1f2937;   /* 主标题 */
--color-gray-900: #111827;   /* 侧边栏背景 */

/* === 侧边栏专属 === */
--color-sidebar-bg:       #111827;  /* gray-900 */
--color-sidebar-text:     #d1d5db;  /* gray-300 */
--color-sidebar-hover:    #1f2937;  /* gray-800 */
--color-sidebar-active:   rgba(8, 166, 79, 0.1);  /* brand-600/10 */
```

#### 3.3.2 字体层级

| 层级 | Tailwind 类名 | 字号/行高 | 用途 |
|------|--------------|-----------|------|
| H1 | `text-4xl font-bold` (36px/40px) | Hero 数值展示 | 今日专注时长 |
| H2 | `text-lg font-semibold` (18px/28px) | 页面标题 | Header 标题 |
| H3 | `text-sm font-semibold` (14px/20px) | 区块标题 | Section 标题 |
| Body | `text-sm` (14px/20px) | 正文 | 列表项、表格内容 |
| Caption | `text-xs` (12px/16px) | 辅助信息 | 时间戳、分类标签 |
| Mono | `font-mono text-sm` | 等宽数字 | 时长/统计数据 |

#### 3.3.3 核心组件规范

##### Button

```
变体:
  primary:    bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800
  secondary:  bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200
  ghost:      text-gray-600 hover:bg-gray-100
  danger:     bg-red-500/10 text-red-600 hover:bg-red-500/20
  success:    bg-brand-50 text-brand-700 hover:bg-brand-100

尺寸:
  sm:  px-3 py-1.5 text-xs rounded-lg
  md:  px-4 py-2 text-sm rounded-lg   ← 默认
  lg:  px-5 py-2.5 text-sm rounded-xl

状态:
  disabled: opacity-50 cursor-not-allowed
  loading:  显示 Loader2 旋转图标 + 文字
```

##### Input

```
变体:
  default:  w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
            focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500
  error:    border-red-400 focus:ring-red-500/20 focus:border-red-500
  disabled: bg-gray-50 text-gray-400 cursor-not-allowed

附加元素:
  label:    block text-sm font-medium text-gray-600 mb-1.5
  hint:     text-xs text-gray-400 mt-1
  errorMsg: text-xs text-red-500 mt-1
```

##### Card

```
变体:
  default:  bg-white rounded-xl border border-gray-200 p-5
  hover:    default + hover:shadow-md hover:border-gray-300 transition-shadow
  elevated: default + shadow-sm

子元素:
  Card.Header:   flex items-center justify-between mb-4
  Card.Title:    text-sm font-semibold text-gray-700
  Card.Content:  (children)
```

##### Badge (CategoryBadge)

```
尺寸:
  sm: px-2 py-0.5 text-xs
  md: px-2.5 py-1 text-xs

分类颜色映射:
  开发:    bg-blue-50 text-blue-700
  沟通:    bg-purple-50 text-purple-700
  设计:    bg-pink-50 text-pink-700
  文档:    bg-amber-50 text-amber-700
  会议:    bg-indigo-50 text-indigo-700
  学习:    bg-green-50 text-green-700
  摸鱼:    bg-gray-100 text-gray-600
  其他:    bg-gray-50 text-gray-500
  自定义:  使用 UserCategory.color 动态生成
```

##### Skeleton

```
变体:
  text:     h-4 bg-gray-200 rounded animate-pulse
  card:     h-24 bg-gray-100 rounded-xl animate-pulse
  circle:   w-8 h-8 bg-gray-200 rounded-full animate-pulse

组合:
  列表骨架: 连续 5 行 text skeleton，间距 space-y-3
  卡片骨架: 2×2 grid card skeleton
```

##### Toast

```
类型:
  success:  bg-white border-l-4 border-brand-500 shadow-lg
  error:    bg-white border-l-4 border-red-500 shadow-lg
  info:     bg-white border-l-4 border-blue-500 shadow-lg

位置:      top-right (sonner 默认)
自动关闭:   success 3s, error 5s, info 3s
```

##### EmptyState

```
结构:
  [Icon] (lucide-react, 48px, text-gray-300)
  [Title] (text-sm font-medium text-gray-500)
  [Description] (text-xs text-gray-400)
  [Action Button] (可选 CTA)

典型场景:
  今日无记录:   ClipboardList icon + "今天还没有工作记录" + "开始追踪"按钮
  报告列表空:   FileText icon + "还没有生成过报告" + "去生成"按钮
  搜索结果空:   Search icon + "没有匹配的结果" + "修改筛选条件"
```

---

## 4. 待确认问题

| # | 问题 | 推荐方案 | 备选方案 | 需要谁决策 |
|---|------|----------|----------|-----------|
| Q1 | **暗色模式是否本次实现？** | 建议延后到 v2.2，本次先打好 Tailwind dark: 基础设施（CSS 变量双主题），组件预留 dark 接口 | 本次完整实现暗色模式（工作量大，约 +40% 组件开发成本） | 产品/用户 |
| Q2 | **Sidebar 品牌标识形式？** | 仅文字 Logo「🦆 下班鸭」（现有 lucide-react 无鸭图标，用 emoji 或 SVG 绘制） | 用 Canvas 绘制 16×16 小鸭 nativeImage（与托盘图标统一） | UI 设计师 |
| Q3 | **Markdown 报告预览是否需要语法高亮/富文本渲染？** | 推荐：<textarea> 纯文本编辑 + 可切换「预览」模式（使用 react-markdown 渲染） | 仅 textarea 编辑，不做预览，用户自行复制到其他工具 | 产品/用户 |

---

## 5. 附录

### A. 现有问题清单（审计结论摘要）

| 类别 | 问题 | 严重度 |
|------|------|--------|
| 视觉层次 | 全白底无层次，card 与背景同色，无阴影/分割 | 🔴 Critical |
| 组件 | 浏览器原生 `<input>` / `<select>` / `<button>`，零封装 | 🔴 Critical |
| 反馈 | 无 toast，error 只到 console.error；loading 仅文字 | 🔴 Critical |
| AI 展示 | AiResultsPage 展示 raw JSON | 🟡 Medium |
| 图表 | 热力图无 tooltip（仅 title 属性），饼图为色块列表 | 🟡 Medium |
| 导航 | 侧边栏 8 项无分组，`bg-brand/10` 在 Tailwind v4 失效 | 🟡 Medium |
| 代码债务 | 21 处 `(window as any)`，useIpc.ts 零引用，2/4 stores 未使用 | 🟡 Medium |

### B. 页面路由变更

| 变更类型 | 页面 | 说明 |
|----------|------|------|
| 保留 | TodayPage | 改用 SegmentTimeline 展示活动段 |
| 保留 | ReportPage | 增强 Markdown 预览和编辑 |
| 保留 | TimelinePage | 数据源改为 segments |
| 保留 | HeatmapPage | 增加 Tooltip + 详情面板 |
| 保留 | AppsPage | recharts 替换假图表 |
| 保留 | HistoryPage | Toast 错误处理 |
| 保留 | SettingsPage | 新增自定义分类管理 |
| **删除** | **AiResultsPage** | AI 识别结果并入 TimelinePage |
