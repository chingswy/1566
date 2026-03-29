# Skill Creator

Claude Code Skill 的开发、测试、评估和打包工具。支持自动化 Draft → Test → Review → Improve 迭代循环。

## 模块结构

| 子目录 | 职责 | 文档 |
|--------|------|------|
| `agents/` | 子代理指令（Analyzer、Comparator、Grader） | — |
| `scripts/` | Python 工具脚本集 | [CLAUDE.md](scripts/CLAUDE.md) |
| `references/` | JSON Schema 定义 | `schemas.md` |
| `eval-viewer/` | 评估查看器（HTTP 服务 + 前端） | — |

## 核心工作流

```
1. 捕捉意图 → 编写 SKILL.md
2. 创建测试用例 (evals/evals.json)
3. 并行运行 with_skill / without_skill (run_eval.py)
4. Grader 评分 → Comparator 盲比 → 聚合基准 (aggregate_benchmark.py)
5. 启动查看器 → 用户评审反馈 (eval-viewer/)
6. 改进描述 (improve_description.py)
7. 重复 3-6 直到满意
8. 打包 (package_skill.py) → .skill 文件
```

## 子代理

| Agent | 文件 | 职责 |
|-------|------|------|
| **Grader** | `agents/grader.md` | 验证断言是否满足，评价评测质量 |
| **Comparator** | `agents/comparator.md` | 盲比两个输出，判断优劣 |
| **Analyzer** | `agents/analyzer.md` | 分析基准结果，识别改进方向 |

## 关键设计

- **盲比系统**：不知道输出来源，防止偏见
- **Train/Test 分割**：分层抽样防止对评测集过拟合
- **动态 HTML 查看器**：每次请求重扫 workspace，支持后台 eval 时实时更新
- **JSON Schema 松耦合**：所有组件通过 `references/schemas.md` 定义的格式交互
