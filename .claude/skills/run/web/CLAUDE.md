# Web 监控面板

Flask + SQLite 后端 + 前端单页应用，实时监控多 Agent 团队执行状态、任务队列、Agent 记忆。

## 架构概述

```
浏览器 ←→ Flask (server.py) ←→ SQLite (run.db)
              ↓
        proc.py (subprocess)
              ↓
    agent_manager.py / memory_manager.py
              ↓
    agents/*.md / memory/*/ / SKILL.md
```

## 文件索引

| 文件 | 职责 |
|------|------|
| `server.py` | Flask 应用工厂、Blueprint 注册、CLI 子命令入口 |
| `db.py` | SQLite 初始化、连接管理、schema 迁移、WAL 模式 |
| `task_routes.py` | 任务 CRUD 与日志操作（`/api/tasks/*` Blueprint） |
| `agent_routes.py` | Agent 管理、记忆、标签、宪章（`/api/agents/*` Blueprint） |
| `proc.py` | 子进程包装：调用 agent_manager.py / memory_manager.py |
| `index.html` | 三栏布局容器：Agent 列表、任务表单、活跃任务 |
| `agent.html` | Agent 详情页（记忆、记录、编辑） |
| `static/` | 前端静态资源 → [CLAUDE.md](static/CLAUDE.md) |

## 数据库设计（db.py）

### tasks 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| content | TEXT | 任务内容 |
| type | TEXT | 任务类型：user / memory |
| status | TEXT | pending / in_progress / completed / failed / cancelled |
| priority | INTEGER | 优先级 1-5（1 最高） |
| conclusion | TEXT | 执行结论 |
| verdict | TEXT | Tester 验收结论 |
| caption | TEXT | 任务标题（简短显示） |
| meta | TEXT | JSON 扩展字段 |
| created_at / updated_at | TEXT | 时间戳 |

### task_logs 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| task_id | INTEGER FK | 关联任务（CASCADE 删除） |
| agent_name | TEXT | 执行 Agent |
| action | TEXT | 操作类型（execute/review/test 等） |
| detail | TEXT | 操作详情 |
| created_at | TEXT | 时间戳 |

## API 路由索引

### task_routes.py（/api/tasks/*）

| 方法 | 路由 | 功能 |
|------|------|------|
| GET | `/api/tasks` | 列表任务（?status= ?type= 筛选），附带日志 |
| POST | `/api/tasks` | 创建任务 |
| GET | `/api/tasks/next` | 原子操作：取下一 pending + 标记 in_progress |
| GET | `/api/tasks/<id>` | 任务详情（含日志列表） |
| PUT | `/api/tasks/<id>` | 更新任务字段 |
| DELETE | `/api/tasks/<id>` | 删除任务（级联删除 task_logs） |
| POST | `/api/tasks/<id>/logs` | 添加操作日志 |

### agent_routes.py（/api/agents/*）

| 方法 | 路由 | 功能 |
|------|------|------|
| GET | `/api/agents` | 列表所有 Agent |
| POST | `/api/agents` | 创建 Agent（full_content 或 template） |
| GET | `/api/agents/<name>` | Agent 定义（含 .md 全文） |
| PUT | `/api/agents/<name>` | 更新 Agent 定义文件 |
| POST | `/api/agents/<name>/retire` | 停用 Agent（记忆合并） |
| POST | `/api/agents/<name>/toggle-active` | 切换激活状态 |
| GET | `/api/agents/<name>/memory` | 获取 Agent 持久记忆 |
| GET | `/api/agents/<name>/records` | 获取执行记录（?count=50） |
| POST | `/api/agents/<name>/memory/feedback` | 记忆反馈投票 |
| GET/PUT | `/api/agent-labels` | Agent 标签映射配置 |
| GET/PUT | `/api/charter` | 读取/更新 SKILL.md（团队宪章） |

## CLI 子命令（server.py）

```bash
python3 server.py serve [--port 8192] [--host 0.0.0.0]  # 启动 Flask
python3 server.py next                                    # 取下一 pending 任务
python3 server.py complete <id> "结论"                   # 标记完成
python3 server.py fail <id> "原因"                       # 标记失败
python3 server.py verdict <id> "验收结论"                # Tester 批红
python3 server.py verdict-fail <id> "原因"               # Tester 驳回
python3 server.py log <id> <agent> <action> "详情"       # 添加日志
python3 server.py set-caption <id> "标题"                # 设置任务标题
python3 server.py reset-stale                            # 重置超时任务
```

## 关键设计

- **30 分钟超时重置**：GET /api/tasks 自动调用 `reset_stale_tasks()`，in_progress 超时回退 pending
- **WAL 模式**：SQLite 启用 WAL + PRAGMA 优化，支持并发读写
- **subprocess IPC**：Agent/Memory 操作通过 proc.py 调用独立脚本，JSON 标准输出通信
- **统一响应格式**：`{"code": 0, "message": "ok", "data": {...}}`
- **级联删除**：task_logs 随 tasks 删除
