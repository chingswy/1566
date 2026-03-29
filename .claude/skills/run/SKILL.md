---
name: run
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
---

Usage：
- `/run <任务描述>`：执行用户的输入任务
- `/run`：从服务器拉取任务

确定 SKILL_DIR：本 SKILL.md 所在目录的绝对路径。

## 工作流程：

1. Chief Assistant获取任务，如无任务就结束会话。
2. Chief Assistant理解任务意图。
   2.1 任务清晰明确，基本掌握用户偏好：直接进行任务拆解调度执行
   2.2 任务模糊不清，有无法确定的决策：一次性向用户返回所有需要确认的问题；如果用户的回复依然无法确定，继续返回，等待下一次回复。
3. Chief Assistant spawn不同的agent执行具体的任务。
4. 执行完成后将用户的意图和当前的改动交给Tester，Tester需要进行实际运行测试以及汇报。
   4.1 Tester可以自动化检查的内容：例如后端接口改动、前端curl的返回值，需要自动化检查判断是否能通过。
   4.2 如果有Tester无法自动验证的内容，例如网页实际效果、3D可视化等，需要逐点列出最终返回给用户。由用户逐条校验。

## 各流程实际操作接口

### 1. 获取任务

如果 CLI 有参数，直接使用；否则从 Web 任务队列获取：
```bash
python3 "$SKILL_DIR/web/server.py" next
```
- 如果返回 `data` 为 null，**立即结束**，提示无待处理任务
- 如果有任务，解析 JSON：`id`、`content`
- 记住 task_id，后续需要回写结果

Chief Assistant 加载: 

1. 读取团队名单：使用 Read 工具读取 `$SKILL_DIR/team_roster.md`
   - 如果文件不存在，先执行：
   ```bash
   python3 "$SKILL_DIR/agent_manager.py" rebuild-roster
   ```

2. 读取 Chief Assistant 角色定义：使用 Read 工具读取 `$SKILL_DIR/agents/chief_assistant.md`。按其中的角色定义和工作原则来工作。

3. 加载 Chief Assistant 记忆：
   ```bash
   python3 "$SKILL_DIR/memory_manager.py" load chief_assistant --count 10
   ```

### 2. 领会上级意图

领会意图后，给任务取一个简洁标题（≤15字）并回写：
```bash
python3 "$SKILL_DIR/web/server.py" set-caption <task_id> "任务标题"
```

### 3. 任务分工与执行

使用 **Agent tool** 派发 worker 执行子任务。每次派发 worker **之前**，先调用 log 上报派发事件：

```bash
python3 "$SKILL_DIR/web/server.py" log <task_id> chief_assistant "dispatch" "派发给 <agent_name>：<子任务一句话描述>"
```

每个 worker 的 prompt 按以下模板构造：

```
You are a member of the agent team. Your task is to execute the assigned subtask.
Your name is <agent_name>.
SKILL_DIR = <SKILL_DIR 绝对路径>

You should do the following two things strictly in order, and do not do anything else before completing them:

1. 用 Read 工具读取你的角色定义文件：<SKILL_DIR>/agents/<agent_name>.md
   读完后按照其中的角色定义和工作原则来工作。

2. 用 Bash 工具执行以下命令加载你的记忆：
   python3 <SKILL_DIR>/memory_manager.py load <agent_name> --count 10

完成初始化后，执行以下子任务：

{Chief Assistant 分配给这个 agent 的子任务描述}

处理完成之后，先上报完成状态：
python3 <SKILL_DIR>/web/server.py log <task_id> <agent_name> "done" "执行摘要（1-2句话）"

然后进行记忆的更新：

**写入执行记录**（必须执行）：
python3 <SKILL_DIR>/memory_manager.py add-record <agent_name> --content "本次任务摘要" --tags "标签1,标签2"

**更新持久记忆**（有新经验时执行）：
先读取当前记忆：python3 <SKILL_DIR>/memory_manager.py get-memory <agent_name>
然后整合更新：
python3 <SKILL_DIR>/memory_manager.py update-memory <agent_name> --content "$(cat <<'EOF'
整合后的完整 Markdown（保留原有有价值的内容，加入新的认知和经验）
EOF
)"
```

调度要点: 

- **并行派发**：无依赖关系的子任务可以同时派发多个 worker
- **串行依赖**：有依赖关系的任务按顺序执行，前一个完成后再派发下一个
- **结果传递**：如果后续 worker 需要前一个的结果，在 prompt 中传入


所有 worker 执行完毕后，整理各 worker 的执行结果，提炼关键结论。

如果任务来自 Web 队列（有 task_id），此时**不需要**调用 complete/fail，交由 Tester 在验收阶段直接结案。

接着更新 Chief Assistant 记忆（必须执行，不可跳过）

**1. 写入执行记录**（每次必须执行）：
```bash
python3 "$SKILL_DIR/memory_manager.py" add-record chief_assistant --content "本次任务摘要：做了什么、结果如何、踩了什么坑" --tags "标签1,标签2"
```

**2. 更新持久记忆**（每次必须执行）：
```bash
# 先读取当前记忆
python3 "$SKILL_DIR/memory_manager.py" load chief_assistant --count 10

# 整合新经验后完整写回（保留有价值的旧内容，加入新认知）
python3 "$SKILL_DIR/memory_manager.py" update-memory chief_assistant --content "$(cat <<'EOF'
整合后的完整 Markdown
EOF
)"
```

持久记忆应包含：项目认知、用户偏好、团队经验、工作模式中的任何新发现或变化。没有新增内容也要确认读取过当前记忆。

## 4：Tester 验收与结案

派发 Tester agent 进行系统级验收测试。
测试的要点必须明确，以往的测试套件必须要全部跑，保证系统整体正常运行。
当前次的改动需要进行实际运行测试并验收。

Tester 完成测试后，**直接调用 verdict 命令写入验收结论并结案**，无需经由 Chief Assistant 转发。
涉及到无法自动化判断的内容，例如网页实际运行效果、3D可视化等，需要逐点列出最终返回给用户。由用户逐条校验。

**验收通过时**（Tester 执行）：
```bash
python3 "$SKILL_DIR/web/server.py" verdict <task_id> "验收结论：
✅ 自动化测试：...
⚠️  需用户手工验证：
  1. [项目] 操作步骤... → 预期结果...
"
```

**验收失败时**（Tester 执行）：
```bash
python3 "$SKILL_DIR/web/server.py" verdict-fail <task_id> "失败原因：
❌ [问题描述] 错误日志：... 复现步骤：...
"
```

Chief Assistant 无需再调用 complete/fail。验收完成后 Chief Assistant 更新自身记忆即可。