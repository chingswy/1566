## 3. 设计风格：Apple 毛玻璃

整体视觉对标 macOS 系统设置 / Apple 官网的克制美学。

### 核心要素

- **背景**：`#f5f5f7` 纯暖灰，不使用多色渐变
- **卡片**：半透明白色（`rgba(255,255,255,0.72)`）+ `backdrop-filter: blur(20px)` + `border: border-white/50` + 柔和阴影
- **导航栏**：sticky 毛玻璃（`saturate(180%) blur(20px)`），活跃项用 `bg-white/60` 胶囊
- **圆角**：统一 12–16px（`rounded-xl` / `rounded-2xl`）
- **阴影**：多级别柔和阴影（`shadow-glass` / `shadow-glass-lg` / `shadow-glass-sm`）

### 颜色规范

- **主色**：`#1d1d1f`（Apple 近黑色），用于主按钮、Toggle 开启态、分页当前页
- **文字**：`gray-800`（正文）、`gray-500`（标签/标题）、`gray-400`（辅助信息）
- **状态色**：`emerald-400/600`（成功）、`red-400/500`（失败）、`blue-400/500`（处理中）、`amber-500`（警告）
- **表单聚焦**：`ring-gray-300/60`

### 禁止事项

- **禁止使用渐变色**（linear-gradient）作为按钮、文字、Toggle 等 UI 元素的填充色。渐变色看起来像 AI 生成，不够高级
- **禁止使用 indigo / purple 系列色**。强调色统一用近黑色或状态语义色
- 不要在非数据可视化场景使用彩色填充

---

## 4. 样式约定

### CSS 组件类（定义在 `style.css` 的 `@layer components`）

| 类名 | 用途 |
|---|---|
| `.glass-card` | 毛玻璃卡片基础样式 |
| `.glass-card-hover` | 带 hover 上浮效果的毛玻璃卡片 |
| `.section-card` | 页面内分段卡片（= glass-card + p-6 + mb-5） |
| `.glass-nav` | 导航栏毛玻璃样式 |
| `.btn-primary` | 主按钮（近黑色） |
| `.btn-secondary` | 次要按钮（半透明白） |
| `.btn-danger` | 危险按钮（浅红底） |
| `.input-field` | 输入框 |
| `.select-field` | 下拉框 |
| `.toggle` / `.toggle-knob` | Toggle 开关 |
| `.label-muted` | 辅助标签文字 |
| `.num` | 数字高亮（mono + tabular-nums） |

### 内嵌统计块

数值统计使用内嵌的 `p-3 rounded-xl bg-white/40 text-center` 作为子卡片，不要用纯文字裸排。

### 表格

- 圆角 `rounded-xl overflow-hidden` 包裹
- 行分隔用 `border-gray-100/30`（半透明，融入毛玻璃）
- hover 用 `hover:bg-white/40` 或 `hover:bg-white/50`
