# Web 前端静态资源 — 模块化架构

任务监控面板前端：采用 **模块化分层**（API → Utils → Components → Actions）+ **Apple 毛玻璃设计** + **古风元素**。

## 核心设计理念

**四层分离**：
1. **API 层**（api.js）：统一后端通信，屏蔽 HTTP 细节
2. **工具层**（utils.js）：纯函数（HTML转义、时间格式、标签管理、YAML解析）
3. **视图层**（*-components.js）：纯函数 UI 生成，无副作用
4. **动作层**（*-actions.js）：事件处理、状态变更、UI 动画

**加载顺序**（见 index.html）：
```
api.js → utils.js → agent-components.js → task-components.js
→ workspace-components.js → workspace-logic.js → agent-actions.js
→ task-actions.js → app.js
```

## 文件架构

### 基础层

| 文件 | 职责 |
|------|------|
| `api.js` | REST 封装：tasks/agents/charter 三大域，统一 `request()` |
| `utils.js` | 纯函数工具库：escapeHtml、formatTime、parseAgentContent、getRoleLabel |
| `app.js` | 初始化、全局状态、轮询、事件委托总线 |

### 组件层（纯函数 UI 渲染）

| 文件 | 职责 | 核心函数 |
|------|------|---------|
| `agent-components.js` | Agent 卡片、头像、定义页、记忆、执行记录 | `renderAvatar()`, `renderAgentCard()`, `renderAgentPage()`, `renderMemoryItems()` |
| `task-components.js` | 任务表单、卡片、时间线、详情、cadoc 列表 | `renderTaskForm()`, `renderTaskCard()`, `renderTaskTimeline()`, `renderTaskDetail()` |
| `workspace-components.js` | 朝堂式布局、Agent 节点、Charter 按钮 | `renderAgentWorkspace()`, `renderWorkspaceAgent()`, `renderCharterPage()` |
| `components.js` | 向后兼容重出口，逻辑已转移至上述文件 | — |

### 动作层（事件处理 + 状态变更）

| 文件 | 职责 | 核心函数 |
|------|------|---------|
| `agent-actions.js` | Agent 详情页打开/关闭、编辑保存、罢黜、记忆投票 | `openAgentPage()`, `closeAgentPage()`, `saveAgent()`, `submitMemoryFeedback()` |
| `task-actions.js` | 任务提交、详情展开、Charter 切换 | `submitTask()`, `toggleTaskDetail()`, `openCharterPage()` |
| `workspace-logic.js` | SVG 连接线绘制、滚动动画、任务弹窗 | `drawWorkspaceLines()`, `animateScrollDecree()`, `showTaskPopover()` |

### 数据 & 样式

| 文件 | 职责 |
|------|------|
| `agent_labels.json` | Agent 中文映射（首辅/织造/清流/掌印/...） |
| `style.css` | 样式入口，`@import` 导入 css/ 下 6 个模块 |

## CSS 组织（按功能领域）

| 模块 | 内容 |
|------|------|
| `base.css` | 重置、滚动条美化、玻璃卡片基础、Flexbox 容器 |
| `agents.css` | Agent 卡片列表、水墨头像配色、状态图标、详情页三栏 |
| `tasks.css` | 任务表单、卡片、时间线、展开动画、操作按钮 |
| `utils-md.css` | 工具类（flex/padding/margin）、Markdown 渲染、Badge 样式 |
| `workspace.css` | 朝堂式布局、SVG 线条（实线/虚线/闪烁）、节点动画 |
| `charter-cadoc.css` | Charter 按钮、内阁章程编辑页、案牍列表样式 |

**设计元素**：
- 毛玻璃卡片：`rgba(255,255,255,0.72) + backdrop-filter: blur(20px)`
- 水墨头像配色：Chief(褐色) / Executor(蓝) / Reviewer(棕) / Tester(金黄)
- 状态指示器：`status-dot`（pending/in_progress/completed/failed 四色）

## 全局状态（app.js）

```javascript
const state = {
  agents: [],              // 所有 Agent 信息
  tasks: [],               // 所有任务列表
  expandedAgent: null,     // 当前打开的 Agent 名称
  expandedTask: null,      // 当前打开的任务 ID
  expandedCadoc: null,     // 当前打开的 Charter 编辑 ID
  agentDetails: {},        // 缓存的 Agent 详情（memory + records）
  memoryVotes: {},         // 记忆反馈投票暂存
};
```

## 关键 API 函数索引

### API 层（api.js）
- `API.listTasks()`, `API.createTask()`, `API.updateTask()`
- `API.listAgents()`, `API.getAgent()`, `API.saveAgent()`, `API.retireAgent()`
- `API.getCharter()`, `API.saveCharter()`
- `API.submitFeedback()` — 记忆投票反馈

### Utils 层（utils.js）
- `escapeHtml(str)` — XSS 防护
- `formatTime(ts)` — 相对时间显示
- `parseAgentContent(raw)` — YAML frontmatter 解析
- `getRoleLabel(name)`, `getDisplayName(name)` — 标签映射

### Render 函数（*-components.js）
- `renderAvatar(name, size)` — 头像（sm/lg 两档）
- `renderTaskCard(task, expanded, idPrefix, readonly, filterAgent)`
- `renderAgentWorkspace(agents, activeTasks)` — 朝堂布局 + SVG

## 模块化拆分逻辑

**职责单一**：components 专注 HTML 生成，actions 专注事件响应，互不交叉。

**加载优化**：拆分为多个小文件，浏览器可并行下载，`components.js` 保持兼容出口。

**事件委托**：全局单一 `click` listener，通过 `data-action` 属性路由到对应 action 函数。

## 依赖

- Tailwind CSS（CDN）
- marked.js（Markdown 渲染）
- Google Fonts: Noto Serif SC（思源宋体）

## 调试建议

1. API 错误：DevTools → Network 查看 `/api/*` 响应
2. 组件渲染：在 render 函数注入 `console.log()` 追踪 HTML 生成
3. 状态问题：在 `openAgentPage()` / `submitTask()` 前后打印 `state` 对象
4. 样式问题：临时注释 `style.css` 中对应 `@import` 行，逐一排查
