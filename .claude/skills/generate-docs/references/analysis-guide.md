# 代码分析方法指南

本文件指导如何从代码中提取架构信息、公开 API 和依赖关系。按语言分节，
通用方法在前，语言特定方法在后。

---

## 通用分析流程

### 1. 确定模块职责

按优先级从以下来源提取：

1. **模块级 docstring**：文件顶部的多行字符串/注释
2. **README / 已有文档**：目录内的 README.md 或 CLAUDE.md
3. **入口文件**：`__init__.py`、`index.ts`、`main.go` 中的注释和导出
4. **文件命名**：从文件名推断职责（如 `database.py` → 数据持久化）
5. **类/函数命名**：从核心类名推断（如 `BaseStage` → 处理阶段基类）

### 2. 识别设计模式

注意以下常见模式并在文档中说明：

| 模式 | 识别信号 | 文档中如何描述 |
|------|----------|----------------|
| 注册表 | `registry = {}`、装饰器注册 | "使用注册表模式，通过装饰器注册新 XX" |
| 工厂 | `create_xxx()`、`from_config()` | "工厂方法从配置创建实例" |
| 管道/链 | 阶段类 + `run()`/`process()` | "管道式处理，各阶段串行执行" |
| 策略 | 基类 + 多个子类实现 | "策略模式，通过子类实现不同的 XX" |
| 观察者 | 回调、事件、hook | "使用回调/事件通知机制" |
| 单例 | 模块级实例、`_instance` | "模块级单例" |

### 3. 提取关键 API

**"关键"的判断标准**（按优先级）：

1. 被其他模块 import 的（跨模块公开 API）
2. 在 `__all__` / `__init__.py` 中导出的
3. 类的公开方法（不以 `_` 开头）
4. 作为入口点调用的函数（CLI、Web handler）

**不列入的**：
- 纯内部辅助函数（`_helper()`）
- 测试代码
- 配置常量（除非是全局关键常量）

### 4. 提取依赖关系

只关注**项目内模块间**的依赖，忽略标准库和第三方包。

分为两个方向：
- **本模块依赖**：本模块 import 了哪些其他模块
- **被依赖**：哪些其他模块 import 了本模块

提取方法：
- 正向：读取目标目录所有 `.py` 文件的 import 语句
- 反向：在项目代码中 grep `from xxx import` 或 `import xxx`

### 5. 获取准确行号

API 索引中的行号必须准确。获取方法：

- 用 Grep 搜索 `class ClassName` 或 `def function_name`
- 用 Read 工具读取文件后从行号前缀获取
- 搜索时用 `output_mode: "content"` 获取行号

**验证**：提取行号后，可以用 Read 工具的 offset/limit 抽样验证几个关键条目。

---

## Python 项目分析

### 包结构识别

```
# 包的标志
__init__.py     → 这是一个 Python 包
__all__ = [...]  → 显式公开 API 列表
__main__.py     → 可执行包（python -m）
```

### 公开 API 提取

**优先级 1：`__all__`**
```python
# 在 __init__.py 中
__all__ = ["BaseStage", "StageResult", "run_pipeline"]
```
这是最权威的公开 API 声明。

**优先级 2：`__init__.py` 的 re-export**
```python
# __init__.py
from .base import BaseStage, StageResult
from .runner import run_pipeline
```
被 re-export 的就是公开 API。

**优先级 3：类的公开方法**
```python
class BaseStage:
    def run(self, ...):      # 公开 → 列入
        ...
    def _validate(self, ...): # 私有 → 不列
        ...
```

### import 分析

```python
# 绝对导入 → 跨包依赖
from hymotion_data.config import PipelineConfig
import hymotion_data.database as db

# 相对导入 → 包内依赖（通常不需要在依赖关系中列出）
from .base import BaseStage
from ..utils import geometry
```

关注绝对导入和跨包的相对导入（`..` 及以上）。

### 常见入口点

```python
# CLI 入口
if __name__ == "__main__":
    ...

# argparse / click / typer 命令定义
@app.command()
def main():

# FastAPI / Flask 路由
@app.get("/api/xxx")
def handler():
```

---

## TypeScript/JavaScript 项目分析

### 包结构识别

```
package.json     → 包根目录
index.ts         → 包入口
tsconfig.json    → TypeScript 项目根
```

### 公开 API 提取

**优先级 1：`index.ts` 的 re-export**
```typescript
export { Component } from './Component'
export type { Config } from './types'
```

**优先级 2：`export` 声明**
```typescript
export class MyService { ... }
export function createApp() { ... }
export default router
```

**优先级 3：`package.json` 的 `exports` 字段**

### import 分析

```typescript
// 项目内依赖
import { Config } from '@/config'
import { utils } from '../utils'

// 第三方依赖（忽略）
import express from 'express'
```

---

## Go 项目分析

### 包结构识别

```
go.mod           → 模块根
package xxx      → 包声明（每个目录一个包）
```

### 公开 API 提取

Go 使用大写开头表示公开：
```go
func ProcessData() { ... }  // 公开 → 列入
func processData() { ... }  // 私有 → 不列
type Config struct { ... }  // 公开 → 列入
```

### import 分析

```go
import (
    "project/internal/config"  // 项目内依赖
    "fmt"                      // 标准库（忽略）
)
```

---

## 分析效率指南

### 并行化

当需要分析多个独立模块时，使用 Task 工具的 Explore subagent 并行分析：

- 每个模块一个 Explore agent
- agent prompt 中明确要求提取：职责、关键 API（含行号）、依赖关系
- 收集所有结果后统一写入 CLAUDE.md

### 大模块处理

如果一个目录有超过 20 个文件：

1. 先读 `__init__.py` 了解公开 API
2. 读关键基类/入口文件
3. 对其余文件只读前 30 行（docstring + import）
4. 用 Grep 补充缺失的行号信息

### 跳过的内容

以下内容不需要分析：

- `test_*.py` / `*_test.go` / `*.spec.ts` — 测试文件
- `__pycache__/` / `node_modules/` / `vendor/` — 生成目录
- `.env` / `*.log` — 运行时文件
- 数据目录（遵守 CLAUDE.md 目录安全规则）
