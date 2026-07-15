# 下班鸭桌宠系统 v2.0 — 产品需求文档（PRD）

> **Author**: 许清楚 (PM) | **Date**: 2025-07-04 | **Version**: v1.0 (Final)

---

## 1. 项目信息

| 项 | 值 |
|---|---|
| **Language** | 中文 |
| **Programming Language** | TypeScript + Electron + React + Canvas API |
| **Project Name** | `desk_pet_v2` |
| **原始需求** | 将桌宠从被动"状态指示灯"升级为具备自主行为、内部属性、用户交互、服装系统的桌面伴侣 |
| **人格定位** | **元气鼓励型**：积极、活泼、主动提醒休息、日报完成后兴奋庆祝 |
| **美术资源策略** | **AI 生成**（nano-banana-pro），单帧出图 |
| **v1 迁移策略** | **v2 直接替换 v1**，不并存 |

---

## 2. 产品定义

### 2.1 产品目标

1. **从"状态指示灯"到"元气桌面伴侣"**：桌宠拥有独立的内部生命系统（心情、精力、亲密度），以元气鼓励型人格主动陪伴用户——专注时安静守候、疲惫时提醒休息、日报完成时兴奋庆祝。

2. **可感知的"活物感"**：通过平滑动画过渡、窗口内 Canvas 级漫游（踱步→撞边缘→捂头→转身→坐下）、情绪反馈气泡，让用户感知到宠物"有情绪、会累、会记住你"。

3. **渐进式互动与收集驱动**：从基础点击互动 → 亲密度成长 → 服装解锁收集，建立用户与宠物之间的情感连接与长期留存动力。

### 2.2 用户故事

| # | 用户故事 | 价值 |
|---|---|---|
| US-1 | As a **日常办公用户**，我希望桌宠根据我的工作强度展现不同情绪（专注时安静陪伴、加班时疲惫、完成日报时庆祝），**so that** 它像一个真实的工位伙伴，而不只是一个图标。 | 情感连接 |
| US-2 | As a **需要短暂休息的用户**，我希望点击桌宠时它有反应（被摸头、发出表情气泡），**so that** 我能在工作间隙获得几秒钟的放松。 | 微休息 |
| US-3 | As a **日报用户**，我希望在日报生成完成时宠物有庆祝动画和兴奋气泡，在我长时间不写日报时宠物表现出"催促"行为，**so that** 日报习惯养成更有动力。 | 习惯养成 |
| US-4 | As a **长期用户**，我希望通过亲密度成长和连续使用解锁新服装（帽子/衣服/配饰），**so that** 我有持续使用的期待感和收集乐趣。 | 长期留存 |
| US-5 | As a **自定义爱好者**，我希望能在换装面板自由搭配已解锁的服装（3 个插槽），**so that** 宠物更符合我的个人风格。 | 个性化表达 |

---

## 3. 需求池

### P0 — MUST（v2.0 必须交付）

| ID | 需求 | 说明 |
|---|---|---|
| P0-1 | **内部属性系统（3 属性）** | 心情(mood)、精力(energy)、亲密度(intimacy) 三个核心属性，含自然衰减/恢复规则，持久化存储。**删除 hunger** |
| P0-2 | **分层状态机** | 区分应用驱动状态(5个)、自主行为状态(5个)、交互状态(3个)，支持状态优先级仲裁 |
| P0-3 | **平滑动画过渡** | 状态切换须有过渡动画（淡入淡出/混合 ~300ms），消除 v1 的"硬切"体验 |
| P0-4 | **点击交互反馈** | 单击触发 petting + 爱心气泡 + "+心情"浮动文字；拖拽移动宠物 |
| P0-5 | **数据持久化** | 所有内部属性 + 互动历史 + 服装数据写入本地存储（better-sqlite3），重启后恢复 |
| P0-6 | **架构分离** | 状态机逻辑独立为 Pure TS 模块（可单测），渲染层通过事件订阅驱动，解除 HTML 内联脚本耦合 |
| P0-7 | **服装系统 — 槽位与解锁引擎** | 3 插槽（body/hat/accessory），解锁条件引擎（亲密度/连续天数/日报次数），默认 1 件 + 至少 3 件可解锁服装，解锁数据持久化 |
| P0-8 | **服装系统 — 换装面板** | 双击宠物或右键菜单「换装」打开换装 UI，展示已解锁/未解锁服装，支持穿搭切换，切换过渡动画 ~300ms |
| P0-9 | **服装系统 — 渲染管线** | L1.5 服装叠加层，3 个插槽按 z-order (body→hat→accessory) 独立 drawImage，L2 tint 仅作用于 L1 基础角色 |
| P0-10 | **Canvas 级漫游 (wandering)** | 窗口内随机方向移动 → 撞到 Canvas 边缘 → bumped 动画（捂头, ~1s）→ 转身 → sitting (~2s) → 继续漫游或回 idle。**不移动 BrowserWindow** |

### P1 — SHOULD（重要但可在 v2.1 补）

| ID | 需求 | 说明 |
|---|---|---|
| P1-1 | **多种交互手势** | 长按（惹恼）、右键菜单（含换装/状态/设置入口） |
| P1-2 | **自主行为系统增强** | stretching（拉伸/打哈欠）、daydreaming（发呆望天）、tired（打瞌睡叠加态）、greeting（用户回归欢迎） |
| P1-3 | **情绪驱动的动画变体** | 同一状态 × 不同心情 = 不同动画（开心工作 vs 疲惫工作） |
| P1-4 | **日报完成庆祝** | 日报生成后触发特殊动画序列 + 粒子特效 + 兴奋气泡「日报写完啦！🎉」 |
| P1-5 | **通知气泡系统** | 宠物主动弹出气泡：「该休息了」「日报写完了吗？」「你回来啦！」 |
| P1-6 | **服装解锁通知** | 新服装解锁时推送气泡「🎉 解锁了新服装：蓝色卫衣！」 |

### P2 — COULD（锦上添花，v2.x 远期）

| ID | 需求 | 说明 |
|---|---|---|
| P2-1 | **更多服装与配饰** | 扩展 COSTUME_CATALOG，每插槽 5+ 选项 |
| P2-2 | **动画包/Mod 系统** | 远程 JSON 动画配置 + 精灵表 URL，支持用户自制皮肤 |
| P2-3 | **音效系统** | 交互音效 + 环境音（鸭叫/键盘声/提示音） |
| P2-4 | **成长/成就系统** | 更多解锁维度：活动记录总数、特定成就徽章 |
| P2-5 | **多屏感知** | 宠物跟随鼠标跨显示器（需配合 BrowserWindow 移动方案） |

---

## 4. 桌宠状态机模型

### 4.1 核心内部属性（3 属性，轻度硬核）

| 属性 | 范围 | 衰减规则 | 恢复规则 | 影响（轻度：仅动画+气泡） |
|---|---|---|---|---|
| **心情 (mood)** | 0-100 | -2/hr 自然衰减；-15 当连续工作 >2h | +10/次互动（单击）；+20 日报完成 | <30 → 动画变体倾向"低落"；>70 → "开心" |
| **精力 (energy)** | 0-100 | -5/hr 工作状态；-2/hr 闲时 | +20/hr 闲时；+50/hr 睡眠 | <20 → 强制进入"疲惫"表现（打瞌睡动画叠加） |
| **亲密度 (intimacy)** | 0-100 | -1/day 无互动 | +5/次互动；+10 日报完成 | 解锁服装阈值：20/30/50 |

> **已删除 hunger**：不再保留饥饿度属性。相关状态 eating、playing、hungry_alert 全部移除。

### 4.2 状态分类

#### A. 应用驱动状态（由 Electron 主进程推送）

| 状态 | 触发条件 | 退出条件 |
|---|---|---|
| `idle` | 追踪器未运行 + 无活跃工作 | 追踪器启动 |
| `working` | 追踪器运行中，用户活跃 | 追踪器停止 / 进入截图分析 |
| `thinking` | 截图正在 AI 分析中 | 分析完成 |
| `done` | 日报生成完成 | 用户关闭日报 / 超时 5min 自动退出 |
| `sleep` | 系统空闲 >15min 或 工作时间外（如 22:00-08:00） | 用户活动恢复 |

#### B. 宠物自主状态（由内部属性 + 随机触发）

| 状态 | 触发条件 | 持续时间 | 说明 |
|---|---|---|---|
| `wandering` | idle 状态下随机(概率 ~1/min) | 5-15s | **Canvas 级漫游**：随机方向移动 → 撞到画布边缘 → `bumped` 动画（捂头, ~1s）→ 转身 → `sitting` (~2s) → 继续漫游或回 idle。窗口本身不移动 |
| `stretching` | idle 状态 >5min | 2-3s | 拉伸动画（打哈欠/伸懒腰） |
| `daydreaming` | idle + mood <50 | 5-10s | 发呆/望天，偶尔冒泡"…" 或 "💭" |
| `tired` | energy <20 | 持续（叠加在当前状态上） | 动画变体：所有动作变慢/打瞌睡 |
| `greeting` | sleep → idle 转换时（用户回来了） | 3-5s | 欢迎动画 + 气泡「你回来啦！」 |

> **已删除 `hungry_alert`**：不再存在饥饿提醒。

#### C. 交互触发状态（由用户操作触发）

| 状态 | 触发手势 | 持续时间 | 说明 |
|---|---|---|---|
| `petting` | 单击 | 1-2s | 被摸头反应 + 爱心粒子 + "+心情"浮动文字 |
| `annoyed` | 长按 >1s | 1-2s | 生气/抗议动画 + 气泡「别捏了！」 |
| `dragging` | 拖拽 | 持续拖拽期间 | 被抓起的动画（翅膀扑腾） |

> **已删除 `eating`、`playing`**：喂食/玩耍机制不再保留。

### 4.3 状态优先级与仲裁规则

```
交互状态 > 应用状态 > 自主行为状态
```

| 优先级 | 状态类型 | 仲裁规则 |
|---|---|---|
| **最高** | 交互触发 | 立即抢占当前状态，结束后返回被中断状态（若仍有效） |
| **中** | 应用驱动 | 可中断自主行为，不可中断交互 |
| **低** | 自主行为 | 仅在 idle 状态下触发，可被任何更高优先级状态中断 |

---

## 5. 动画系统方案

### 5.1 动画分层设计（6 层叠加，自底向上）

| 层级 | 名称 | 内容 | 渲染方式 | 说明 |
|---|---|---|---|---|
| **L1** | 基础角色（裸体） | 每个 activity state 的裸基础角色主循环动画（idle 呼吸、working 敲键盘、sleep 打盹等） | 精灵表帧循环 + Canvas drawImage | 始终在播放，作为底层。**不含默认服装** |
| **L1.5** | 服装叠加层 | body(衣服) → hat(帽子) → accessory(配饰)，按 z-order 独立 drawImage | 独立精灵表 + Canvas 分层合成 | 每插槽独立精灵表，帧数与帧时序完全对齐 L1 |
| **L2** | 情绪覆盖层 | 情绪 tint（😊开心脸红 / 😞低落垂头 / 😫疲惫阴影） | Canvas globalAlpha 或 clip(L1_bounds) | **仅作用于 L1 基础角色**，服装层保持本色不受 tint 影响 |
| **L3** | 过渡动画 | 状态切换时的平滑过渡 + 服装切换 crossfade | requestAnimationFrame + alpha lerp | 状态过渡 ~300ms；服装切换 ~300ms alpha crossfade |
| **L4** | 位移/漫游 | wandering 位移、dragging 跟随、bumped 抖动 | Canvas translate / 帧间位置插值 | Canvas 内的精灵位移，不移动窗口 |
| **L5** | 粒子特效 | 爱心粒子、彩带粒子（日报完成）、表情气泡 | Canvas 粒子系统 / CSS overlay | 最高层，独立于精灵表 |

### 5.2 渲染管线

```
L1 裸基础角色 → L1.5 服装叠加(body→hat→accessory) → L2 情绪 tint(仅L1) → L3 过渡帧 → L4 位移/漫游 → L5 粒子特效
```

### 5.3 服装切换过渡

```
服装切换流程 (~300ms):
Frame 0:    旧服装 alpha=1.0, 新服装 alpha=0.0
Frame 1-15: 旧服装 alpha 1→0, 新服装 alpha 0→1 (每帧 ~16.7ms, 双 buffer)
Frame 16:   旧服装释放, 新服装 alpha=1.0
```

### 5.4 精灵表规格

```
基础角色精灵表:
  路径: assets/desk-pet/base_[state].png
  格式: PNG（透明背景）
  帧数: 8-16 帧/状态
  对齐基准点: 角色足部中心 (bottom-center)

服装精灵表:
  路径: assets/desk-pet/costumes/[slot]_[itemId]_[state].png
  格式: PNG（透明背景）
  尺寸: 与对应状态基础角色精灵表完全一致
  帧数: 与对应状态基础角色精灵表完全一致
  对齐基准点: 与基础角色一致 (bottom-center)

示例:
  base_idle.png                              → 裸基础角色 idle 状态
  costumes/body_default_shirt_idle.png       → 白衬衫 idle 状态
  costumes/hat_cowboy_idle.png               → 牛仔帽 idle 状态
  costumes/acc_scarf_red_idle.png            → 红围巾 idle 状态

美术生产方式: AI 生成 (nano-banana-pro)，单帧出图
```

---

## 6. 服装系统设计

### 6.1 插槽体系

| 插槽 | 标识 | z-order | 说明 |
|---|---|---|---|
| 衣服 | `body` | 1 (最底) | 覆盖角色躯干 |
| 帽子 | `hat` | 2 | 覆盖头部 |
| 配饰 | `accessory` | 3 (最顶) | 围巾/眼镜等小件 |

每个插槽同时只能穿戴 1 件，最多 3 件同时穿戴。`'none'` 表示该插槽为空。

### 6.2 首批服装配置

```typescript
const COSTUME_CATALOG: CostumeItem[] = [
  // ── 衣服 (body) ──
  { itemId: 'default_shirt',  slot: 'body', displayName: '白衬衫',      unlockCondition: null },                           // 默认拥有
  { itemId: 'hoodie_blue',    slot: 'body', displayName: '蓝色卫衣',    unlockCondition: { type: 'intimacy', threshold: 30 } },
  { itemId: 'suit_black',     slot: 'body', displayName: '黑色西装',    unlockCondition: { type: 'report_count', threshold: 10 } },
  { itemId: 'pajama_yellow',  slot: 'body', displayName: '黄色睡衣',    unlockCondition: { type: 'consecutive_days', threshold: 7 } },

  // ── 帽子 (hat) ──
  { itemId: 'none',           slot: 'hat',  displayName: '无',           unlockCondition: null },
  { itemId: 'cowboy_hat',     slot: 'hat',  displayName: '牛仔帽',      unlockCondition: { type: 'intimacy', threshold: 50 } },
  { itemId: 'beanie_red',     slot: 'hat',  displayName: '红色毛线帽',  unlockCondition: { type: 'consecutive_days', threshold: 3 } },

  // ── 配饰 (accessory) ──
  { itemId: 'none',           slot: 'accessory', displayName: '无',      unlockCondition: null },
  { itemId: 'scarf_red',      slot: 'accessory', displayName: '红围巾',  unlockCondition: { type: 'intimacy', threshold: 20 } },
  { itemId: 'glasses_round',  slot: 'accessory', displayName: '圆框眼镜', unlockCondition: { type: 'report_count', threshold: 5 } },
];
```

默认装扮: `{ body: 'default_shirt', hat: 'none', accessory: 'none' }`。

### 6.3 解锁条件类型

| 条件类型 | 含义 | 示例 |
|---|---|---|
| `intimacy` | 亲密度 ≥ 阈值 | 亲密度 ≥30 → 蓝色卫衣 |
| `consecutive_days` | 连续使用天数 ≥ 阈值 | 连续 7 天 → 黄色睡衣 |
| `report_count` | 日报完成次数 ≥ 阈值 | 完成 10 次日报 → 黑色西装 |

### 6.4 解锁检测时机

- 每次属性 tick 后评估
- 日报完成事件触发时评估
- 新解锁时推送气泡通知「🎉 解锁了新服装：XXX！」

### 6.5 降级策略

如果 AI 生成的服装精灵表资源无法及时产出：
1. L1 基础角色暂时保留默认衣服（完整角色），L1.5 层不渲染
2. 服装系统的数据层 + 解锁逻辑正常运行，换装 UI 显示"已解锁"状态
3. 美术资源到位后，替换 L1 精灵表为裸角色版本，激活 L1.5 渲染——代码零改动

---

## 7. UI / 交互设计

### 7.1 交互手势映射

| 手势 | 触发条件 | 行为 | 反馈 |
|---|---|---|---|
| **单击** | 快速点击宠物身体 | 触发 `petting` 状态 | 宠物弹跳/爱心粒子 + "+心情"浮动文字 + 气泡「嘻嘻 ❤️」 |
| **双击** | 快速双击 | **直接打开换装面板** | 换装 UI 弹出（浮动在宠物旁或独立面板） |
| **长按** | 按下 >1 秒 | 触发 `annoyed` 状态 | 宠物挣扎动画 + 气泡「别捏了！」 |
| **拖拽** | 按住并移动 | 移动宠物（v1 已有，保持） | 宠物被"抓起"动画（翅膀扑腾），跟随光标 |
| **右键** | 右键点击 | 上下文菜单 | 菜单项：换装 / 状态 / 设置 |
| **滚轮** | 鼠标滚轮（宠物上方） | 缩放宠物窗口（v1 已有，保持） | 等比缩放 |

> **双击行为变更**：v1 的双击打开快捷菜单 → v2 双击直接打开换装面板。右键菜单保留「换装」入口作为补充路径。

### 7.2 换装面板 UI

- **入口**：双击宠物 / 右键菜单「换装」
- **布局**：3 个插槽 Tab 或并排展示（body / hat / accessory）
- **每个插槽**：展示该插槽所有服装列表，已解锁显示缩略图+名称，未解锁显示灰色锁定图标+解锁条件提示
- **穿搭预览**：选中后即时切换（~300ms crossfade），无需确认按钮
- **默认装扮按钮**：一键恢复默认装扮

### 7.3 反馈气泡系统

| 触发场景 | 气泡内容（元气鼓励型人格） | 气泡样式 | 持续时间 |
|---|---|---|---|
| 单击互动 | 「嘻嘻 ❤️」 | 圆角气泡 + 淡入淡出 | 2s |
| 精力不足 | 「zzZ… 有点困了…」 | 渐隐气泡 | 3s |
| 日报完成 | 「日报写完啦！太棒了！🎉」 | 彩带粒子 + 大号气泡 | 5s |
| 长时间工作 | 「该休息一下啦～起来走走？」 | 温和提示气泡 | 4s |
| 用户回归 | 「你回来啦！✨」 | 弹跳气泡 | 3s |
| 发呆中 | 「…」 / 「💭」 | 思考泡泡（动画圆点） | 持续 |
| 服装解锁 | 「🎉 解锁了新服装：蓝色卫衣！」 | 庆祝气泡 | 4s |
| 漫游撞墙 | 「哎哟！」 | 抖动气泡 | 1.5s |

---

## 8. 数据持久化

### 8.1 存储方案

使用 better-sqlite3，单表 `desk_pet_state`：

```sql
CREATE TABLE IF NOT EXISTS desk_pet_state (
  id                      INTEGER PRIMARY KEY CHECK (id = 1),
  attributes_json         TEXT NOT NULL,    -- { mood, energy, intimacy }
  app_state               TEXT NOT NULL,    -- AppDrivenState
  costume_json            TEXT NOT NULL DEFAULT '{}',         -- Record<CostumeSlot, string>
  unlocked_costumes_json  TEXT NOT NULL DEFAULT '[]',         -- string[] (itemId 列表)
  last_tick_ts            INTEGER NOT NULL, -- Unix ms
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 8.2 序列化格式

```typescript
interface DeskPetSaveData {
  attributes: { mood: number; energy: number; intimacy: number };
  currentAppState: 'idle' | 'working' | 'thinking' | 'done' | 'sleep';
  currentCostume: { body: string; hat: string; accessory: string };
  unlockedCostumes: string[];
  lastTickTimestamp: number;
}
```

---

## 9. 架构约束

| 约束 | 说明 |
|---|---|
| **Core 层 Pure TS** | 状态机、属性引擎、解锁引擎全部为纯 TypeScript，零 DOM/Electron 依赖，可单测 |
| **Renderer 层解耦** | 通过 AnimationCommand + IPC 与 Core 通信，渲染器仅消费指令，不包含业务逻辑 |
| **Canvas 级漫游** | wandering 仅移动 Canvas 内的精灵绘制位置，BrowserWindow 位置不变 |
| **服装精灵表对齐** | 基础角色与服装精灵表必须使用同一画布尺寸、同一帧布局、同一对齐基准点 (bottom-center) |
| **L2 tint 隔离** | 情绪 tint 仅作用于 L1 基础角色层，服装层 (L1.5) 不参与 tint，保持服装本色 |

---

## 10. 待确认问题

### Q1：AI 生成的服装精灵表与基础角色帧对齐方案

服装精灵表与基础角色（裸体）必须在每一帧像素级对齐，否则穿戴时出现错位。AI 单帧出图（nano-banana-pro）能否保证帧间一致性？
- A. 用同一基础角色 PSD 模板，AI 在每一帧上"画"服装 → 由人工统一批量导出
- B. AI 直接生成完整服装精灵表（一次生成所有帧），依赖模型的多帧一致性
- C. 先用 AI 生成关键帧，再用插值工具补帧

### Q2：Canvas 级漫游的"窗口边界"与多屏行为

wandering 定义为窗口内 Canvas 级位移，但桌宠窗口本身可能是非矩形（透明背景），且大小随用户缩放而变化。需要明确：
- A. 漫游边界 = Canvas 元素的像素尺寸（固定）
- B. 漫游边界 = 精灵的可见区域（考虑窗口透明背景，精灵不能走到透明区域外）
- C. 漫游边界 = 当前屏幕的工作区（需要把 Canvas 坐标映射到屏幕坐标）

### Q3：换装面板的实现层级

换装面板作为 UI 组件，有两个可能的技术位置：
- A. **Renderer 进程内 Canvas 浮层**：在宠物窗口的 Canvas 上方用 DOM/CSS 实现，与宠物同窗口，轻量但受窗口尺寸限制
- B. **主应用窗口独立面板**：在 Electron 主窗口（React 应用）中实现，通过 IPC 通信，空间充足但需跨窗口协调

### Q4：亲密度"无互动"判定粒度

亲密度衰减规则 "-1/day 无互动"，"无互动"如何判定？
- A. 自然日维度：当天 00:00-23:59 无任何点击交互
- B. 滚动 24h 窗口：过去 24 小时内无点击交互
- C. 活跃会话维度：一次"工作会话"（追踪器启动→停止）内无互动
