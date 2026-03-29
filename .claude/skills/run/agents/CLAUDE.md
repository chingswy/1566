# Agent 定义目录

多 Agent 团队的角色定义文件集合。每个 `.md` 文件定义一个 Agent 的职责、专长、工作原则和记忆格式。

## 核心职责

Agent 系统采用**分工明确、等级清晰**的设计：
- **Chief Assistant** 是唯一可调度其他 Agent 的管理者
- **核心角色**（Executor/Reviewer/Tester）始终激活，是任务执行的主干
- **专业支撑角色**按需激活，为核心工作流提供专业支持
- 所有 Agent 遵循**记忆迭代**原则：执行前读记忆，完成后更新认知

## 团队成员

### 核心角色（始终激活）

| 代号 | Agent | 职责 | 专长 | 调度规则 |
|------|-------|------|------|----------|
| CA | **Chief Assistant** | 意图理解、任务拆分、团队调度、复盘总结 | planning, coordination, agent-management | 唯一的调度者 |
| EX | **Executor** | 代码编写、文件修改、功能实现 | coding, implementation, scripting | 接收任务执行 |
| RV | **Reviewer** | 单文件代码审查、单元测试验证 | code-review, diff-analysis, unit-testing | Executor 后置 |
| TE | **Tester** | 系统级集成测试、端到端验证、结果上报 | integration-testing, system-testing | 流程最后关卡 |

### 专业支撑角色（按需激活）

| 代号 | Agent | 职责 | 状态 | 适用场景 |
|------|-------|------|------|----------|
| RS | **Researcher** | 技术调研、方案对比、文档阅读 | inactive | 需要技术选型或方案评估 |
| AN | **Analyst** | 数据分析、Benchmark、指标计算、可视化 | inactive | 需要实验对比或性能评估 |
| WR | **Writer** | 论文写作、技术文档、README、代码注释 | inactive | 需要文档撰写或论文辅助 |
| DO | **DevOps** | 环境配置、部署上线、CI/CD、容器化 | inactive | 需要环境搭建或部署维护 |
| MS | **Messenger** | 消息通知、状态推送、外部系统对接 | inactive | 需要监控通知或系统集成 |

## 协作工作流

```
用户需求 → Chief Assistant（理解+拆分）
    ├→ 核心流程：Executor（编码）→ Reviewer（单元测试）→ Tester（系统验收）
    ├→ 并行支撑：Researcher（调研） / Analyst（分析）
    ├→ 文档支撑：Writer（文档）
    ├→ 运维支撑：DevOps（部署）/ Messenger（通知）
    └→ Chief Assistant（复盘+汇报）
```

**关键机制**：
- Tester 是流程最后关卡，验收结果直接写入任务系统（`verdict` / `verdict-fail` 命令）
- Reviewer 负责**单文件**级别检查，Tester 负责**系统整体**验证
- 只有 Chief Assistant 可使用 Agent tool 调度其他成员

## Agent 定义规范

每个 Agent 定义文件采用 **YAML frontmatter + Markdown body** 格式：

```yaml
---
name: agent_name                    # Agent 代号（英文小写，下划线分隔）
description: "职责一句话描述"         # 简明职责概述
role: chief_assistant | worker      # Agent 角色类型
status: active | inactive           # 激活状态
expertise: "逗号分隔的专长"           # 专业领域标签
tags: "core,specialist"             # 分类标签（core/specialist/configurable）
sort_order: 10                      # 显示顺序
created_at: "2026-03-28T00:00:00"   # 创建时间
---
# Agent 名称 — 中文全称

## 核心理念
> 宗旨陈述

## 职责
明确的职责范围

## 专长领域
bullet list

## 工作原则
细化的工作规范和约束

## 记忆格式
持久记忆采用扁平列表格式：
- 【类别】具体内容
```

## 关键约定

- **核心角色保护**：chief_assistant、tester 不允许删除
- **记忆更新规范**：去重合并、保留有价值、去掉过时认知
- **专长一致性**：Agent 的 expertise 标签必须准确反映实际专长范围
