#!/usr/bin/env python3
"""Agent Memory Manager — Records (JSONL) + Memory (Markdown) + Attachments.

Usage:
    python3 memory_manager.py add-record <agent> --content "..." [--tags "t1,t2"]
    python3 memory_manager.py recent <agent> [--count 5]
    python3 memory_manager.py get-memory <agent>
    python3 memory_manager.py update-memory <agent> --content "new markdown content"
    python3 memory_manager.py search <agent> --keyword "..."
    python3 memory_manager.py load <agent> [--count 10]
    python3 memory_manager.py add-attachment --name "file_name" --content "..."
    python3 memory_manager.py get-attachment --name "file_name"
    python3 memory_manager.py list-attachments

Three-layer memory architecture:
  - memory:      memory/{agent}/memory.md     — persistent cognition (overwrite)
  - records:     memory/{agent}/records.jsonl  — execution log (append-only)
  - attachments: attachments/*.md              — shared knowledge files

Pure stdlib, no external dependencies.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def _base_dir() -> Path:
    """Resolve the skill root directory."""
    return Path(__file__).resolve().parent


def _memory_dir(agent: str) -> Path:
    """Resolve memory directory for an agent."""
    return _base_dir() / "memory" / agent


def _records_file(agent: str) -> Path:
    """Get the JSONL file path for execution records."""
    return _memory_dir(agent) / "records.jsonl"


def _memory_file(agent: str) -> Path:
    """Get the Markdown file path for persistent memory."""
    return _memory_dir(agent) / "memory.md"


def _attachments_dir() -> Path:
    """Get the attachments directory."""
    return _base_dir() / "attachments"


def _read_jsonl(filepath: Path) -> list[dict]:
    """Read all JSONL entries from a file."""
    if not filepath.exists():
        return []
    entries = []
    for line in filepath.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            entries.append(json.loads(line))
    return entries


def _append_jsonl(filepath: Path, entry: dict):
    """Append a single entry to a JSONL file."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(entry, ensure_ascii=False)
    with filepath.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def _read_markdown(filepath: Path) -> str:
    """Read a markdown file."""
    if not filepath.exists():
        return ""
    return filepath.read_text(encoding="utf-8")


def _write_markdown(filepath: Path, content: str):
    """Write a markdown file."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text(content, encoding="utf-8")


# -- Commands ------------------------------------------------------------------


def cmd_add_record(args):
    """Add an execution record entry (JSONL)."""
    entry = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
        "content": args.content,
    }
    if args.tags:
        entry["tags"] = [t.strip() for t in args.tags.split(",") if t.strip()]

    filepath = _records_file(args.agent)
    _append_jsonl(filepath, entry)
    print(json.dumps({"ok": True, "file": str(filepath), "entry": entry},
                      ensure_ascii=False))


def cmd_recent(args):
    """Get recent execution records."""
    entries = _read_jsonl(_records_file(args.agent))
    recent = entries[-args.count:]
    print(json.dumps({"count": len(recent), "entries": recent},
                      ensure_ascii=False))


def cmd_get_memory(args):
    """Get persistent memory (Markdown content)."""
    filepath = _memory_file(args.agent)
    content = _read_markdown(filepath)
    print(json.dumps({
        "file": str(filepath),
        "content": content,
        "empty": len(content.strip()) == 0,
    }, ensure_ascii=False))


def cmd_update_memory(args):
    """Update persistent memory (overwrite Markdown file)."""
    filepath = _memory_file(args.agent)
    old_content = _read_markdown(filepath)
    _write_markdown(filepath, args.content)
    print(json.dumps({
        "ok": True,
        "file": str(filepath),
        "old_length": len(old_content),
        "new_length": len(args.content),
    }, ensure_ascii=False))


def cmd_search(args):
    """Search memory entries by keyword (both records and memory)."""
    keyword = args.keyword.lower()
    results = []

    # Search records (JSONL)
    for entry in _read_jsonl(_records_file(args.agent)):
        if keyword in entry.get("content", "").lower():
            entry["_source"] = "records"
            results.append(entry)

    # Search memory (Markdown) — return matching sections
    mem_content = _read_markdown(_memory_file(args.agent))
    if mem_content and keyword in mem_content.lower():
        sections = _extract_matching_sections(mem_content, keyword)
        for section in sections:
            results.append({
                "content": section,
                "_source": "memory",
            })

    print(json.dumps({"count": len(results), "results": results},
                      ensure_ascii=False))


def _extract_matching_sections(markdown: str, keyword: str) -> list[str]:
    """Extract markdown sections (by heading) that contain the keyword."""
    lines = markdown.split("\n")
    sections: list[list[str]] = []
    current: list[str] = []

    for line in lines:
        if line.startswith("#") and current:
            sections.append(current)
            current = []
        current.append(line)
    if current:
        sections.append(current)

    matched = []
    for section in sections:
        text = "\n".join(section)
        if keyword in text.lower():
            matched.append(text.strip())
    return matched


# -- Attachment Commands -------------------------------------------------------


def cmd_add_attachment(args):
    """Create or update an attachment file."""
    att_dir = _attachments_dir()
    att_dir.mkdir(parents=True, exist_ok=True)

    # Ensure .md extension
    name = args.name
    if not name.endswith(".md"):
        name += ".md"

    filepath = att_dir / name
    is_new = not filepath.exists()
    filepath.write_text(args.content, encoding="utf-8")

    # Update _index.md
    _rebuild_attachment_index()

    print(json.dumps({
        "ok": True,
        "file": str(filepath),
        "created": is_new,
        "length": len(args.content),
    }, ensure_ascii=False))


def cmd_get_attachment(args):
    """Read an attachment file."""
    name = args.name
    if not name.endswith(".md"):
        name += ".md"

    filepath = _attachments_dir() / name
    if not filepath.exists():
        print(json.dumps({"ok": False, "error": f"Attachment not found: {name}"},
                          ensure_ascii=False))
        sys.exit(1)

    content = filepath.read_text(encoding="utf-8")
    print(json.dumps({
        "file": str(filepath),
        "content": content,
        "length": len(content),
    }, ensure_ascii=False))


def cmd_list_attachments(args):
    """List all attachment files."""
    att_dir = _attachments_dir()
    if not att_dir.exists():
        print(json.dumps({"count": 0, "attachments": []}, ensure_ascii=False))
        return

    attachments = []
    for f in sorted(att_dir.glob("*.md")):
        if f.name == "_index.md":
            continue
        attachments.append({
            "name": f.name,
            "size": f.stat().st_size,
            "modified": datetime.fromtimestamp(
                f.stat().st_mtime, tz=timezone.utc
            ).strftime("%Y-%m-%dT%H:%M:%S"),
        })

    print(json.dumps({"count": len(attachments), "attachments": attachments},
                      ensure_ascii=False))


def _rebuild_attachment_index():
    """Rebuild the attachments/_index.md index file."""
    att_dir = _attachments_dir()
    files = sorted(f for f in att_dir.glob("*.md") if f.name != "_index.md")

    lines = [
        "# Attachments Index",
        "",
        "| File | Size | Last Modified |",
        "|------|------|---------------|",
    ]
    for f in files:
        size = f.stat().st_size
        mtime = datetime.fromtimestamp(
            f.stat().st_mtime, tz=timezone.utc
        ).strftime("%Y-%m-%d %H:%M")
        lines.append(f"| [{f.name}]({f.name}) | {size}B | {mtime} |")

    if not files:
        lines.append("| (no attachments yet) | — | — |")

    lines.append("")
    (att_dir / "_index.md").write_text("\n".join(lines), encoding="utf-8")


def cmd_load(args):
    """Load memory + recent records in one call. Returns {"memory": "...", "records": [...]}."""
    memory_content = _read_markdown(_memory_file(args.agent))
    entries = _read_jsonl(_records_file(args.agent))
    recent = entries[-args.count:]
    # Only keep id (index) and summary (content truncated)
    records = []
    for i, e in enumerate(recent):
        records.append({
            "id": len(entries) - len(recent) + i,
            "summary": e.get("content", "")[:200],
        })
    print(json.dumps({
        "memory": memory_content,
        "records": records,
    }, ensure_ascii=False))


# -- CLI -----------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Agent Memory Manager")
    sub = parser.add_subparsers(dest="command")

    # add-record
    p = sub.add_parser("add-record", help="Add an execution record (JSONL)")
    p.add_argument("agent", help="Agent name")
    p.add_argument("--content", required=True, help="Record content")
    p.add_argument("--tags", default=None, help="Comma-separated tags")

    # recent
    p = sub.add_parser("recent", help="Get recent execution records")
    p.add_argument("agent", help="Agent name")
    p.add_argument("--count", type=int, default=5, help="Number of entries")

    # get-memory
    p = sub.add_parser("get-memory", help="Get persistent memory (Markdown)")
    p.add_argument("agent", help="Agent name")

    # update-memory
    p = sub.add_parser("update-memory", help="Update persistent memory (Markdown)")
    p.add_argument("agent", help="Agent name")
    p.add_argument("--content", required=True,
                   help="Complete new Markdown content")

    # search
    p = sub.add_parser("search", help="Search memory by keyword")
    p.add_argument("agent", help="Agent name")
    p.add_argument("--keyword", required=True, help="Search keyword")

    # load
    p = sub.add_parser("load", help="Load memory + recent records in one call")
    p.add_argument("agent", help="Agent name")
    p.add_argument("--count", type=int, default=10, help="Number of recent records")

    # add-attachment
    p = sub.add_parser("add-attachment", help="Create/update an attachment file")
    p.add_argument("--name", required=True, help="Attachment filename (without .md)")
    p.add_argument("--content", required=True, help="Attachment content")

    # get-attachment
    p = sub.add_parser("get-attachment", help="Read an attachment file")
    p.add_argument("--name", required=True, help="Attachment filename")

    # list-attachments
    p = sub.add_parser("list-attachments", help="List all attachment files")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    cmd_map = {
        "add-record": cmd_add_record,
        "recent": cmd_recent,
        "get-memory": cmd_get_memory,
        "update-memory": cmd_update_memory,
        "search": cmd_search,
        "load": cmd_load,
        "add-attachment": cmd_add_attachment,
        "get-attachment": cmd_get_attachment,
        "list-attachments": cmd_list_attachments,
    }
    cmd_map[args.command](args)


if __name__ == "__main__":
    main()
