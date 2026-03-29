#!/usr/bin/env python3
"""Agent Lifecycle Manager — Create, List, Info, Delete, Rebuild Roster.

Usage:
    python3 agent_manager.py create --name <name> --description "..." [--expertise "..."] [--tags "..."]
    python3 agent_manager.py list [--active-only]
    python3 agent_manager.py info --name <name>
    python3 agent_manager.py delete --name <name>
    python3 agent_manager.py rebuild-roster

All paths are relative to this script's directory (the skill root).
Pure stdlib, no external dependencies.
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def _base_dir() -> Path:
    """Resolve the skill root directory."""
    return Path(__file__).resolve().parent


def _agents_dir() -> Path:
    return _base_dir() / "agents"


def _memory_dir(agent: str) -> Path:
    return _base_dir() / "memory" / agent


def _records_file(agent: str) -> Path:
    return _memory_dir(agent) / "records.jsonl"


# -- Frontmatter Parsing (adapted from edict sync_lib.py) ---------------------


def _parse_frontmatter(text: str) -> dict:
    """Parse YAML frontmatter from Markdown file content (pure stdlib).

    Supports: strings, numbers, booleans. Returns empty dict if no frontmatter.
    """
    m = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not m:
        return {}
    result = {}
    for line in m.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("- "):
            continue
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if val.lower() in ("true", "yes"):
            result[key] = True
        elif val.lower() in ("false", "no"):
            result[key] = False
        elif val.isdigit():
            result[key] = int(val)
        else:
            result[key] = val
    return result


def _get_body(text: str) -> str:
    """Extract Markdown body (everything after frontmatter)."""
    m = re.match(r"^---\s*\n.*?\n---\s*\n?", text, re.DOTALL)
    if m:
        return text[m.end():]
    return text


# -- Utility Functions ---------------------------------------------------------


def _count_records(agent: str) -> int:
    """Count records.jsonl entries for an agent."""
    filepath = _records_file(agent)
    if not filepath.exists():
        return 0
    count = 0
    for line in filepath.read_text(encoding="utf-8").splitlines():
        if line.strip():
            count += 1
    return count


def _get_last_active(agent: str) -> str | None:
    """Get timestamp of the most recent record entry."""
    filepath = _records_file(agent)
    if not filepath.exists():
        return None
    last_ts = None
    for line in filepath.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                entry = json.loads(line)
                last_ts = entry.get("ts")
            except json.JSONDecodeError:
                pass
    return last_ts


def _get_max_sort_order() -> int:
    """Get the maximum sort_order among existing agents."""
    agents_dir = _agents_dir()
    if not agents_dir.exists():
        return 0
    max_order = 0
    for f in agents_dir.glob("*.md"):
        if f.name[0].isupper():
            continue
        content = f.read_text(encoding="utf-8")
        fm = _parse_frontmatter(content)
        order = fm.get("sort_order", 0)
        if isinstance(order, int) and order > max_order:
            max_order = order
    return max_order


def _load_all_agents() -> list[dict]:
    """Load all agent definitions with metadata."""
    agents_dir = _agents_dir()
    if not agents_dir.exists():
        return []

    agents = []
    for f in sorted(agents_dir.glob("*.md")):
        if f.name[0].isupper():   # 跳过 CLAUDE.md 等文档文件
            continue
        content = f.read_text(encoding="utf-8")
        fm = _parse_frontmatter(content)
        name = fm.get("name", f.stem)
        agents.append({
            "name": name,
            "description": fm.get("description", ""),
            "status": fm.get("status", "active"),
            "expertise": fm.get("expertise", ""),
            "tags": fm.get("tags", ""),
            "sort_order": fm.get("sort_order", 999),
            "file": f.name,
            "records_count": _count_records(name),
            "last_active": _get_last_active(name),
        })
    return agents


# -- Agent Definition Template -------------------------------------------------


_AGENT_TEMPLATE = """---
name: {name}
description: "{description}"
status: active
expertise: "{expertise}"
tags: "{tags}"
sort_order: {sort_order}
created_at: "{created_at}"
---

# {title_name}

## 职责
{description}

## 专长领域
{expertise}

## 工作原则
- 执行前必读自己的记忆（memory.md + 最近 records）
- 执行后必写记忆（add-record + 按需 update-memory）
- 可按需读取 attachments/ 下的共享知识文件
- 严格完成分配的子任务，不超出职责范围
"""


# -- Commands ------------------------------------------------------------------


def cmd_create(args):
    """Create a new agent definition + initialize memory directory."""
    name = args.name

    # Validate name format
    if not re.match(r"^[a-z][a-z0-9_-]*$", name):
        print(json.dumps({
            "ok": False,
            "error": f"Invalid name '{name}': must match ^[a-z][a-z0-9_-]*$"
        }, ensure_ascii=False))
        sys.exit(1)

    # Check for duplicates
    agent_file = _agents_dir() / f"{name}.md"
    if agent_file.exists():
        print(json.dumps({
            "ok": False,
            "error": f"Agent '{name}' already exists"
        }, ensure_ascii=False))
        sys.exit(1)

    # Generate agent definition
    sort_order = _get_max_sort_order() + 10
    description = args.description
    expertise = args.expertise or "general"
    tags = args.tags or ""
    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

    content = _AGENT_TEMPLATE.format(
        name=name,
        description=description,
        expertise=expertise,
        tags=tags,
        sort_order=sort_order,
        created_at=created_at,
        title_name=name.replace("-", " ").replace("_", " ").title(),
    )

    # Write agent file
    _agents_dir().mkdir(parents=True, exist_ok=True)
    agent_file.write_text(content, encoding="utf-8")

    # Initialize memory directory
    mem_dir = _memory_dir(name)
    mem_dir.mkdir(parents=True, exist_ok=True)

    # Create empty records.jsonl
    records_file = mem_dir / "records.jsonl"
    if not records_file.exists():
        records_file.write_text("", encoding="utf-8")

    # Create initial memory.md
    memory_file = mem_dir / "memory.md"
    if not memory_file.exists():
        memory_file.write_text(
            f"# {name.replace('-', ' ').replace('_', ' ').title()} 持久记忆\n\n"
            f"*Created: {created_at}*\n\n"
            f"## 项目认知\n\n（尚无记录）\n\n"
            f"## 经验教训\n\n（尚无记录）\n\n"
            f"## 附录索引\n\n| 文件 | 内容摘要 | 更新时间 |\n|------|----------|----------|\n",
            encoding="utf-8",
        )

    print(json.dumps({
        "ok": True,
        "agent": name,
        "file": str(agent_file),
        "memory_dir": str(mem_dir),
        "sort_order": sort_order,
    }, ensure_ascii=False))


def cmd_list(args):
    """List all agents with usage statistics."""
    agents = _load_all_agents()

    if args.active_only:
        agents = [a for a in agents if a["status"] == "active"]

    print(json.dumps({
        "count": len(agents),
        "agents": agents,
    }, ensure_ascii=False))


def cmd_info(args):
    """Show detailed info for a specific agent."""
    agent_file = _agents_dir() / f"{args.name}.md"
    if not agent_file.exists():
        print(json.dumps({
            "ok": False,
            "error": f"Agent '{args.name}' not found"
        }, ensure_ascii=False))
        sys.exit(1)

    content = agent_file.read_text(encoding="utf-8")
    fm = _parse_frontmatter(content)
    body = _get_body(content)
    name = fm.get("name", args.name)

    # Memory stats
    memory_file = _memory_dir(name) / "memory.md"
    memory_size = memory_file.stat().st_size if memory_file.exists() else 0

    print(json.dumps({
        "name": name,
        "frontmatter": fm,
        "body_preview": body[:500] if len(body) > 500 else body,
        "records_count": _count_records(name),
        "last_active": _get_last_active(name),
        "memory_size": memory_size,
        "file": str(agent_file),
    }, ensure_ascii=False))


def cmd_delete(args):
    """Delete an agent definition file. Memory directory is preserved for reference."""
    name = args.name

    # Guard: cannot delete core roles
    PROTECTED = {"chief_assistant", "tester"}
    if name in PROTECTED:
        print(json.dumps({"ok": False, "error": f"Cannot delete core role '{name}'"},
                          ensure_ascii=False))
        sys.exit(1)

    agent_file = _agents_dir() / f"{name}.md"
    if not agent_file.exists():
        print(json.dumps({"ok": False, "error": f"Agent '{name}' not found"},
                          ensure_ascii=False))
        sys.exit(1)

    # Delete the definition file
    agent_file.unlink()

    print(json.dumps({
        "ok": True,
        "agent": name,
        "deleted_file": str(agent_file),
        "note": "Memory directory preserved at memory/{name}/ for reference. Delete manually if not needed.",
    }, ensure_ascii=False))


def cmd_rebuild_roster(args):
    """Rebuild team_roster.md from agent definitions."""
    agents_dir = _agents_dir()
    base_dir = _base_dir()

    if not agents_dir.exists():
        roster = "# 团队名单\n\n尚未创建任何 agent。\n"
        (base_dir / "team_roster.md").write_text(roster, encoding="utf-8")
        print(json.dumps({"ok": True, "content": roster}, ensure_ascii=False))
        return

    # Collect only active agents
    agents = []
    for f in sorted(agents_dir.glob("*.md")):
        if f.name[0].isupper():   # 跳过 CLAUDE.md 等文档文件
            continue
        content = f.read_text(encoding="utf-8")
        fm = _parse_frontmatter(content)

        # Only include active agents
        if fm.get("status") != "active":
            continue

        name = fm.get("name", f.stem)
        agents.append({
            "name": name,
            "description": fm.get("description", ""),
            "expertise": fm.get("expertise", ""),
            "sort_order": fm.get("sort_order", 999),
            "file": f.name,
        })

    if not agents:
        roster = "# 团队名单\n\n agents 目录为空或无活跃成员。\n"
        (base_dir / "team_roster.md").write_text(roster, encoding="utf-8")
        print(json.dumps({"ok": True, "content": roster}, ensure_ascii=False))
        return

    # Core roles: chief_assistant and tester are always-present core members
    CORE_NAMES = {"chief_assistant", "tester"}

    chief = next((a for a in agents if a["name"] == "chief_assistant"), None)
    tester = next((a for a in agents if a["name"] == "tester"), None)

    # Workers = all active agents that are not core roles
    workers = [a for a in agents if a["name"] not in CORE_NAMES]
    workers.sort(key=lambda a: a["sort_order"])

    # Build Markdown
    lines = [
        "# 团队名单",
        "",
        "## 核心角色",
        "",
    ]

    if chief:
        lines += [
            f"### Chief Assistant（负责人）",
            f"- **{chief['name']}** — {chief['description']}",
            f"- 专长: {chief.get('expertise', '')}",
            f"- 定义文件: `agents/{chief['file']}`",
            "",
        ]

    if tester:
        lines += [
            f"### Tester（系统测试验收）",
            f"- **{tester['name']}** — {tester['description']}",
            f"- 专长: {tester.get('expertise', '')}",
            f"- 定义文件: `agents/{tester['file']}`",
            "",
        ]

    lines += [
        "## 可调度成员 (Workers)",
        "",
        "| Agent | 职责 | 专长 | 定义文件 |",
        "|-------|------|------|---------|",
    ]
    for a in workers:
        lines.append(
            f"| {a['name']} | {a['description']} | {a.get('expertise', '')} | `agents/{a['file']}` |"
        )

    if not workers:
        lines.append("| （无可调度成员） | — | — | — |")

    lines.append("")
    roster = "\n".join(lines)
    (base_dir / "team_roster.md").write_text(roster, encoding="utf-8")

    core_names = [n for n in CORE_NAMES if any(a["name"] == n for a in agents)]
    print(json.dumps({"ok": True, "file": str(base_dir / "team_roster.md"),
                       "core": core_names, "workers": len(workers)},
                      ensure_ascii=False))


# -- CLI -----------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Agent Lifecycle Manager")
    sub = parser.add_subparsers(dest="command")

    # create
    p = sub.add_parser("create", help="Create a new agent")
    p.add_argument("--name", required=True, help="Agent name (lowercase, alphanumeric)")
    p.add_argument("--description", required=True, help="Agent description/role")
    p.add_argument("--expertise", default=None, help="Expertise areas")
    p.add_argument("--tags", default=None, help="Comma-separated tags")

    # list
    p = sub.add_parser("list", help="List all agents")
    p.add_argument("--active-only", action="store_true", help="Only show active agents")

    # info
    p = sub.add_parser("info", help="Show agent details")
    p.add_argument("--name", required=True, help="Agent name")

    # delete
    p = sub.add_parser("delete", help="Delete an agent")
    p.add_argument("--name", required=True, help="Agent to delete")

    # rebuild-roster
    sub.add_parser("rebuild-roster", help="Rebuild team_roster.md")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    cmd_map = {
        "create": cmd_create,
        "list": cmd_list,
        "info": cmd_info,
        "delete": cmd_delete,
        "rebuild-roster": cmd_rebuild_roster,
    }
    cmd_map[args.command](args)


if __name__ == "__main__":
    main()
