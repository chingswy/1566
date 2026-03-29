---
name: generate-docs
description: >
  分析项目代码结构并生成分层的 CLAUDE.md 文档体系。采用渐进式披露策略，
  从项目全局架构到各模块设计理念逐层展开，每个 CLAUDE.md 控制在 200 行以内。
  重点包含架构设计、关键 API 索引和模块间依赖关系。
  使用文件 MD5 增量检测，只重新分析有变更的模块，通过并行 sub-agent 加速。
  当用户要求生成文档、更新 CLAUDE.md、整理项目说明、或说"帮我写 CLAUDE.md"时触发此 skill。
  也适用于用户提到"文档生成"、"代码文档化"、"项目文档整理"、"generate docs"、
  "update project docs"等场景。即使用户只是说"帮我整理下项目结构"或
  "我想让 Claude 更好地理解这个项目"，也应使用此 skill。
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
---

# generate-docs Skill

分析项目代码结构，生成分层 CLAUDE.md 文档体系。AI 生成完整文档，用户直接编辑修改。

**增量模式**：通过文件 MD5 追踪变更，只重新分析自上次生成以来有修改的模块。
首次运行全量扫描，后续运行自动走增量路径。

## 使用方式

- `/generate-docs` — 增量更新（仅处理有变更的模块）
- `/generate-docs --full` — 强制全量重新生成所有文档
- `/generate-docs server/app/api` — 仅为指定目录生成/更新文档
- 自然语言："帮我生成 CLAUDE.md"、"更新项目文档"、"整理模块文档"

根据 `$ARGUMENTS` 决定范围：
- 空 → 增量（整个项目中有变更的模块）
- `--full` → 全量重新生成
- 指定路径 → 仅该目录及其子目录（忽略缓存，始终重新分析）

---

## 核心理念

### 每个包目录都有 CLAUDE.md

不按文件数量设门槛。只要是一个有意义的代码目录（有 `__init__.py`、`package.json`、
或明确的职责分组），就应该有 CLAUDE.md。小目录文档更简洁（15-30 行）。

### 基于文件 MD5 的增量更新

不需要每次全量扫描所有文件。缓存文件记录每个目录下各文件的 MD5 值，
下次运行时只重新分析有文件变更的目录。这样即使项目很大，更新也很快。
这种方式不依赖 git，对未纳入版本控制的项目也同样适用。

---

## 缓存机制

### 缓存目录

```
.claude/cache/generate-docs/
└── md5_map.json    # 记录每个文件的 MD5，按目录分组
```

### md5_map.json 格式

```json
{
  "server/app/api/agents.py": {
    "md5": "a1b2c3d4e5f6...",
    "last_analyzed": "2026-03-19T10:30:00"
  },
  "server/app/models/edict.py": {
    "md5": "f6e5d4c3b2a1...",
    "last_analyzed": "2026-03-19T10:30:00"
  }
}
```

- key = 文件相对于项目根的路径
- value.md5 = 上次分析时该文件的 MD5 值
- value.last_analyzed = 上次分析时间（ISO 格式）

### 缓存操作

**读取缓存**：Phase 1 开始时读取 `.claude/cache/generate-docs/md5_map.json`（不存在则视为首次运行）

**判断变更**：对目录内的每个代码文件计算当前 MD5 并与缓存对比：
```bash
# macOS
md5 -q <file>
# Linux
md5sum <file> | awk '{print $1}'
```
- MD5 一致 → 文件未变更
- MD5 不一致或缓存中不存在 → 文件有变更
- 某个目录下**任何一个文件有变更** → 该目录标记为"需更新"

**写入缓存**：Phase 4 每生成/更新一个 CLAUDE.md 后，将该目录下所有文件的当前 MD5 写入缓存。
全部完成后将 md5_map.json 写回 `.claude/cache/generate-docs/`。只更新本次涉及的文件条目，不清除其他条目。

### 特殊情况

- **`--full` 参数** → 忽略缓存，全量分析
- **指定路径** → 忽略缓存，该路径始终重新分析
- **新文件**（缓存中无记录）→ 视为有变更
- **文件被删除**（缓存中有但磁盘上不存在）→ 该目录标记为需更新，清除已删除文件的缓存条目

### 依赖传播

某个模块变更时，其**父级 CLAUDE.md** 也可能需要更新（比如模块索引表需要刷新）。
传播规则：
- 子目录有变更 → 父目录的 CLAUDE.md 也标记为需更新
- 根目录 CLAUDE.md 在任何子模块有变更时都需更新（因为它包含模块索引）

---

## 执行流程

### Phase 1 — Diff（检测变更）

目标：确定哪些目录需要重新生成文档。

1. **读取缓存**：读取 `.claude/cache/generate-docs/md5_map.json`，不存在则标记为首次运行
2. **扫描代码文件**：用 Glob 扫描项目代码文件，识别包边界
3. **如果首次运行或 `--full`**：
   - 所有包目录都标记为"需生成"
4. **如果增量运行**：
   - 对每个包目录下的代码文件计算 MD5，与缓存对比
   - 目录下有任何文件 MD5 变更 → 标记该目录为"需更新"
   - 检查是否有新包目录（有代码文件但缓存中无任何条目）→ 标记为"需新建"
   - 应用依赖传播：子目录有变更 → 父目录也标记为"需更新"
5. **找到已有 CLAUDE.md**：对需更新的目录，读取现有 CLAUDE.md

输出：
- 需更新的目录列表 + 变更文件摘要
- 无变更的目录列表（跳过）

### Phase 2 — Plan（规划）

目标：呈现更新计划给用户确认。

将计划以表格形式呈现，标明每个目录的操作和变更原因：

```
| 路径 | 操作 | 原因 | 变更文件数 |
|------|------|------|-----------|
| ./CLAUDE.md | 更新 | 子模块变更 | — |
| server/app/api/CLAUDE.md | 更新 | agents.py, edicts.py 修改 | 2 |
| server/app/models/CLAUDE.md | 跳过 | 无变更 | 0 |
| web/src/components/CLAUDE.md | 新建 | 新目录 | — |
```

等待用户确认后进入 Phase 3。

### Phase 3 — Analyze（自底向上分析）

目标：从叶子目录向上逐层分析，上层目录直接根据子目录的 CLAUDE.md 总结，不重复读代码。

**核心原则：自底向上。** 先处理最深层的叶子目录（直接分析代码），再处理它们的父目录（只读子目录的 CLAUDE.md，不看代码）。

#### 步骤

1. **按深度分层**：将所有需更新的目录按路径深度从深到浅排列，分为多个层级
   - 例如：Level 2 = `server/app/api/agents/`，Level 1 = `server/app/api/`，Level 0 = `server/app/`，Root = `.`
2. **从最深层开始，同层并行**：
   - 同一层级的目录互相独立，在同一条消息中发出所有 Task 调用并行执行
   - 每层完成后再处理上一层
3. **叶子目录（无子级 CLAUDE.md 的目录）**：
   - 使用 Explore sub-agent **分析代码**
   - prompt 包含：目标目录路径、变更文件列表、已有 CLAUDE.md 内容
   - 提取：架构、关键 API、依赖关系
4. **非叶子目录（有子级 CLAUDE.md 的目录）**：
   - **不分析代码**，只读取子目录的最终 CLAUDE.md
   - 使用 sub-agent 读取所有子级 CLAUDE.md + 该目录自身的入口文件（如 `__init__.py`），综合总结
   - 生成模块概述、子模块索引表、依赖关系汇总
5. **项目根 CLAUDE.md（`.`）最后处理**：
   - 读取所有一级子目录的 CLAUDE.md
   - 综合为项目全局架构、模块索引表、核心入口表、全局依赖关系

**并行分组策略**：
- 同一深度层级内的目录放在同一批并行
- 如果同层目录数 > 7，分批执行（避免同时 agent 过多）
- 严格按深度顺序：深层先完成 → 浅层才开始

参考 `references/analysis-guide.md` 获取叶子目录的代码分析方法。

### Phase 4 — Write（生成文档 + 更新缓存）

目标：将分析结果写入 CLAUDE.md，更新缓存。

**参考 `references/templates.md` 获取各层级的模板结构。**

1. **生成/重写每个 CLAUDE.md**（按自底向上的顺序，与 Phase 3 同步进行）
   - 叶子目录：按模板生成，基于 sub-agent 的代码分析结果
   - 非叶子目录：读取子目录已写好的 CLAUDE.md，综合总结
   - 重写时整合已有内容中用户补充的部分

2. **更新缓存**
   - 每写完一个 CLAUDE.md，将该目录下所有代码文件的当前 MD5 写入 `md5_map.json`
   - 全部完成后写回 `.claude/cache/generate-docs/md5_map.json`

3. **输出汇总**
   ```
   更新: 4 个文件
   跳过: 7 个文件（无变更）
   新建: 1 个文件

   已更新:
     CLAUDE.md (子模块变更)
     server/app/api/CLAUDE.md (agents.py, edicts.py)
     server/app/services/CLAUDE.md (edict_service.py)
     web/src/components/CLAUDE.md (新增 AgentCard.tsx)

   已跳过:
     server/app/models/CLAUDE.md (无变更)
     ...
   ```

---

## 重要约束

- **重写时保留用户补充内容**：已有 CLAUDE.md 中的约定、注意事项、经验知识要整合保留
- **自底向上**：叶子目录分析代码，上层目录只读子目录的 CLAUDE.md 来总结
- **遵守目录安全规则**：不对数据目录递归扫描
- **中文优先**：文档内容使用中文，代码标识符保持原样
- **不注水**：小模块就写简短文档，不要为了"看起来完整"而填充无意义内容
- **缓存目录加入 .gitignore**：`.claude/cache/` 不应提交到仓库
