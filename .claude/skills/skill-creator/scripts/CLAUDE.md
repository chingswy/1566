# Skill Creator 工具脚本集

自动化技能开发的 Python 工具链：评估、改进、报告、打包。

## 脚本索引

| 脚本 | 职责 | 核心函数 |
|------|------|----------|
| `utils.py` | 共享工具 | `parse_skill_md()` — 解析 SKILL.md frontmatter |
| `quick_validate.py` | 快速验证 | 检查 SKILL.md 格式、必需字段、长度限制 |
| `run_eval.py` | 触发评估 | 并行运行 with/without_skill，监听流事件检测触发 |
| `aggregate_benchmark.py` | 基准聚合 | 加载 grading.json，计算均值/标差/min/max |
| `improve_description.py` | 描述优化 | 分析失败查询，调用 Claude 生成改进描述 |
| `generate_report.py` | HTML 报告 | 生成迭代对比表格（✓/✗ 标记，颜色编码） |
| `run_loop.py` | 优化循环 | 编排 eval → improve → report 的完整迭代 |
| `package_skill.py` | 技能打包 | 验证后打包为 .skill (ZIP) 文件 |

## 数据流

```
evals.json → run_eval.py → grading.json
                              ↓
                    aggregate_benchmark.py → benchmark.json
                              ↓
              improve_description.py → 新描述 → 下一轮迭代
                              ↓
run_loop.py 编排以上循环 → generate_report.py → HTML 报告
                              ↓
                    package_skill.py → .skill 文件
```

## 关键设计

- **并行评估**：`run_eval.py` 使用 ProcessPoolExecutor（max_workers=10）
- **Train/Test 分割**：`run_loop.py` 分层抽样防止过拟合
- **历史跟踪**：每次迭代保存 description + results，防止重复改进
- **描述安全网**：超过 1024 字符自动重写

## 依赖关系

所有脚本依赖 `utils.py`。`run_loop.py` 作为编排器调用 `run_eval.py`、`improve_description.py`、`generate_report.py`。
