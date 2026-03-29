# Run — 多 Agent 团队管理框架

核心 Skill，实现"万寿帝君"式的多 Agent 协作：首辅理解意图、拆分任务、调度执行，司礼监批红验收。

## 设计理念

- **测试驱动**：所有任务必须定义测试过程，掌印（Tester）直接检查最终产出
- **记忆迭代**：每个 Agent 执行前读取记忆快照，完成后更新认知库
- **动态团队**：根据任务需求动态引入/罢黜 Agent，核心四役常驻

## 模块结构

| 子目录/文件 | 职责 | 文档 |
|------------|------|------|
| `SKILL.md` | Skill 入口：定义 4 阶段工作流、各流程操作接口 | — |
| `agent_manager.py` | Agent 生命周期管理（CRUD + rebuild-roster） | — |
| `memory_manager.py` | 三层记忆系统（持久记忆/执行记录/共享附件） | — |
| `team_roster.md` | 团队名单索引（auto-generated，勿手编） | — |
| `start.sh` | 启动 Web 监控面板脚本（支持自定义端口） | — |
| `clean_and_restart.sh` | 清库重启脚本（清空历史任务 + 重置 DB） | — |
| `run_loop_interactive.py` | 后台任务驱动循环（自动轮询队列 + 驱动 Claude） | — |
| `agents/` | Agent 角色定义文件集合（YAML frontmatter） | [CLAUDE.md](agents/CLAUDE.md) |
| `web/` | Flask 后端 + SQLite DB + 前端资源 | [CLAUDE.md](web/CLAUDE.md) |
| `memory/` | Agent 记忆存储目录（运行时数据，已.gitignore） | — |
| `attachments/` | 团队共享知识库（运行时数据，已.gitignore） | — |

## 工作流（4 阶段）

```
阶段1: 获取任务
  └─ `/run <描述>` 或 Web 队列 (python3 web/server.py next)

阶段2: 理解意图 & 任务拆分
  ├─ Chief Assistant 加载团队名单 + 自身记忆
  ├─ 解析用户意图、取标题 (set-caption)
  └─ 模糊任务循环确认（需返回所有疑问）

阶段3: 任务分工与执行
  ├─ 无依赖任务 → 派发 Workers（执行器/清流等）
  ├─ 每 Worker：Read 角色定义 → Bash 加载记忆 → 执行 → 上报 (log)
  └─ Chief 协调依赖、等待 Workers 完成

阶段4: 测试验收 & 汇报
  ├─ Tester 自动化检查（HTTP 接口、返回值等）
  ├─ 手工验证项逐条列出给用户（网页效果、可视化等）
  └─ 结果回写 (complete/fail) + 记忆更新
```

## 核心组件

### agent_manager.py — Agent 生命周期

| 命令 | 功能 |
|------|------|
| `create --name <name>` | 创建 Agent（生成定义文件 + 初始化记忆目录） |
| `list [--active-only]` | 列出所有 Agents 及统计信息 |
| `info --name <name>` | Agent 详细信息（frontmatter 元数据） |
| `delete --name <name>` | 删除 Agent（核心角色不可删） |
| `rebuild-roster` | 重新生成 team_roster.md |

### memory_manager.py — 三层记忆

| 层级 | 存储 | 操作 | 更新频率 |
|------|------|------|----------|
| 持久记忆 | `memory/<agent>/memory.md` | get-memory / update-memory | 低频 |
| 执行记录 | `memory/<agent>/records.jsonl` | add-record / recent / load | 每次执行 |
| 共享附件 | `attachments/*.md` | add-attachment / get-attachment | 低频 |

**关键命令**：
```bash
python3 memory_manager.py load <agent> --count 10          # 加载记忆快照
python3 memory_manager.py add-record <agent> --content "摘要"  # 追加记录
python3 memory_manager.py update-memory <agent> --content "..."  # 覆写记忆
```

## 启动与运维脚本

### start.sh — 启动 Web 监控面板
```bash
./start.sh [端口]    # 默认 8192，自动清理端口占用，启动 Flask
```

### clean_and_restart.sh — 清库重启
```bash
./clean_and_restart.sh [端口]    # 清空历史任务 + VACUUM + 重启 Web 面板
```

### run_loop_interactive.py — 后台任务驱动循环

持续轮询 SQLite 队列，有 pending 任务时自动启动 `claude "/run"` 进程。

```bash
python run_loop_interactive.py --max-sessions 50 --peek-interval 10
```

**适用场景**：Docker 后台运行、CI/CD 自动批量处理任务队列。

## 关键约定

- Agent 定义文件使用 YAML frontmatter 格式（name / expertise / tags / active / role）
- `team_roster.md` 由 `rebuild-roster` 自动生成，不要手动编辑
- `memory/` 和 `attachments/` 是运行时数据目录，已加入 .gitignore
- 核心角色（chief_assistant、tester）受保护，不可删除
