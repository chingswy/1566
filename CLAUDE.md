# 1566 — 多 Agent 团队管理框架

> 从万寿帝君学习多 Agent 团队管理理念。拒绝繁琐的上朝，大小事务发给内阁执行，司礼监批红。

---

## 项目概述

基于 Claude Code Skills 的多 Agent 协作框架，核心理念：
1. **测试驱动**：所有任务定义测试过程，司礼监直接检查最终产出
2. **记忆迭代**：每个 Agent 执行前读取记忆，完成后更新认知
3. **动态团队**：根据任务需求引入/罢黜 Agent

技术栈：Python + Flask + SQLite + 原生 JS 前端

## 系统架构

```
用户 → /run <任务>
         ↓
  Chief Assistant（首辅）
  ├─ 理解意图、拆分任务
  ├─ 调度 Workers（织造/清流/...）
  ├─ Tester（掌印）验收
  └─ 复盘总结、更新记忆
         ↓
  Web 监控面板（可选，端口 8192）
  └─ 任务可视化、Agent 管理、记忆查看
```

## 模块索引

| 模块 | 职责 | 入口 | 文档 |
|------|------|------|------|
| `.claude/skills/run/` | 核心 Skill：多 Agent 团队执行框架 | `SKILL.md` | [CLAUDE.md](.claude/skills/run/CLAUDE.md) |
| `.claude/skills/skill-creator/` | Skill 开发测试工具 | `SKILL.md` | [CLAUDE.md](.claude/skills/skill-creator/CLAUDE.md) |
| `.claude/skills/frontend-design/` | 前端设计 Skill | `SKILL.md` | — |
| `.claude/skills/generate-docs/` | 文档生成 Skill | `SKILL.md` | — |

## 快速开始

```bash
# 安装 skill（在 Claude Code 中输入）
从 Github 远程仓库安装 skill：仓库地址：https://github.com/chingswy/1566 ，skill目录：`.claude/skills/run`

# 使用
/run <任务描述>

# 启动 Web 监控面板
.claude/skills/run/start.sh [端口]          # 默认 8192

# 后台自动驱动任务队列
python .claude/skills/run/run_loop_interactive.py --max-sessions 50
```

## 初始团队

| 角色 | 代号 | 做什么 |
|------|------|--------|
| 首辅 | chief_assistant | 理解意图、拆分任务、调度执行 |
| 织造 | executor | 写代码、改文件、实现功能 |
| 清流 | reviewer | 检查修改的文件或代码，确保符合预期 |
| 掌印 | tester | 审查最终产出，确保符合圣意 |

专业支撑角色（按需激活）：researcher / analyst / writer / devops / messenger

## 全局依赖关系

```
run/SKILL.md (工作流入口)
  ├→ agent_manager.py (Agent 生命周期：CRUD + rebuild-roster)
  ├→ memory_manager.py (三层记忆：持久记忆/执行记录/共享附件)
  ├→ agents/*.md (9个角色定义，YAML frontmatter)
  ├→ team_roster.md (团队索引，自动生成)
  ├→ start.sh / clean_and_restart.sh (运维脚本)
  ├→ run_loop_interactive.py (后台任务驱动循环)
  └→ web/ (监控面板)
       ├→ server.py + Blueprint (Flask API)
       ├→ db.py (SQLite: tasks + task_logs)
       ├→ agent_routes.py / task_routes.py (路由分拆)
       ├→ proc.py (subprocess IPC)
       └→ static/ (前端：四层模块化架构)
```

---

## 设计风格

前端采用 Apple 毛玻璃美学 + 中国古风元素，详见 `frontend-design.md`。
