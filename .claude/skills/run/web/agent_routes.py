"""Agents API routes — /api/agents/* and /api/agent-labels and /api/charter."""

import json
import re
from pathlib import Path
from flask import Blueprint, request, jsonify
from db import ok, err
from proc import agent_cmd, memory_cmd, SKILL_DIR, SCRIPT_DIR

agents_bp = Blueprint('agents', __name__)

AGENTS_DIR = SKILL_DIR / "agents"


@agents_bp.route("/api/agents", methods=["GET"])
def list_agents():
    result = agent_cmd("list")
    return jsonify(ok(result.get("agents", [])))


@agents_bp.route("/api/agents", methods=["POST"])
def create_agent():
    data = request.get_json(force=True)
    name = data.get("name", "").strip()
    description = data.get("description", "").strip()
    full_content = data.get("full_content", "").strip()

    if not name:
        return jsonify(err("name is required")), 400

    # If full_content provided, write file directly (bypass template)
    if full_content:
        agent_file = AGENTS_DIR / f"{name}.md"
        if agent_file.exists():
            return jsonify(err(f"agent '{name}' already exists")), 400
        try:
            agent_file.write_text(full_content, encoding="utf-8")
            # Initialize memory directory
            memory_dir = SKILL_DIR / "memory" / name
            memory_dir.mkdir(parents=True, exist_ok=True)
            memory_file = memory_dir / "memory.md"
            if not memory_file.exists():
                memory_file.write_text(
                    f"# {name.capitalize()} 持久记忆\n\n(暂无记录)\n",
                    encoding="utf-8"
                )
            records_dir = memory_dir / "records"
            records_dir.mkdir(exist_ok=True)
            agent_cmd("rebuild-roster")
            return jsonify(ok({"ok": True, "name": name, "created_via": "full_content"})), 201
        except Exception as exc:
            return jsonify(err(f"write failed: {exc}")), 500

    # Fallback: use agent_manager template
    if not description:
        return jsonify(err("name and description are required")), 400
    cmd_args = ["create", "--name", name, "--description", description]
    if data.get("expertise"):
        cmd_args += ["--expertise", data["expertise"]]
    if data.get("tags"):
        cmd_args += ["--tags", data["tags"]]
    result = agent_cmd(*cmd_args)
    if not result.get("ok"):
        return jsonify(err(result.get("error", "create failed"))), 400
    agent_cmd("rebuild-roster")
    return jsonify(ok(result)), 201


@agents_bp.route("/api/agents/<name>", methods=["GET"])
def get_agent(name):
    agent_file = AGENTS_DIR / f"{name}.md"
    if not agent_file.exists():
        return jsonify(err(f"agent '{name}' not found")), 404
    content = agent_file.read_text(encoding="utf-8")
    info = agent_cmd("info", "--name", name)
    info["full_content"] = content
    return jsonify(ok(info))


@agents_bp.route("/api/agents/<name>", methods=["PUT"])
def update_agent(name):
    """Update agent definition (.md file) directly."""
    data = request.get_json(force=True)
    agent_file = AGENTS_DIR / f"{name}.md"
    if not agent_file.exists():
        return jsonify(err(f"agent '{name}' not found")), 404
    new_content = data.get("content", "").strip()
    if not new_content:
        return jsonify(err("content is required")), 400
    agent_file.write_text(new_content, encoding="utf-8")
    agent_cmd("rebuild-roster")
    return jsonify(ok({"name": name, "updated": True}))


@agents_bp.route("/api/agents/<name>/retire", methods=["POST"])
def retire_agent(name):
    data = request.get_json(force=True) if request.data else {}
    merge_into = data.get("merge_into", "chief_assistant")
    result = agent_cmd("retire", "--name", name, "--merge-into", merge_into)
    if not result.get("ok"):
        return jsonify(err(result.get("error", "retire failed"))), 400
    agent_cmd("rebuild-roster")
    return jsonify(ok(result))


@agents_bp.route("/api/agents/<name>/toggle-active", methods=["POST"])
def toggle_agent_active(name):
    agent_file = AGENTS_DIR / f"{name}.md"
    if not agent_file.exists():
        return jsonify(err(f"agent '{name}' not found")), 404
    content = agent_file.read_text(encoding="utf-8")
    fm_match = re.search(r'^---\n([\s\S]*?)\n---', content)
    if not fm_match:
        return jsonify(err("no frontmatter found")), 400
    fm_text = fm_match.group(1)
    current_status = 'active'
    for line in fm_text.split('\n'):
        m = re.match(r'^status:\s*"?(\w+)"?', line)
        if m:
            current_status = m.group(1)
            break
    new_status = 'inactive' if current_status == 'active' else 'active'
    new_content = re.sub(r'^(status:\s*)"?\w+"?', f'\\g<1>{new_status}', content, flags=re.MULTILINE)
    agent_file.write_text(new_content, encoding="utf-8")
    agent_cmd("rebuild-roster")
    return jsonify(ok({"name": name, "status": new_status}))


@agents_bp.route("/api/agents/<name>/memory", methods=["GET"])
def get_agent_memory(name):
    result = memory_cmd("get-memory", name)
    content = result.get("content", "")
    items = []
    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("- ") and len(stripped) > 2:
            items.append(stripped[2:])
    return jsonify(ok({"content": content, "items": items}))


@agents_bp.route("/api/agents/<name>/records", methods=["GET"])
def get_agent_records(name):
    count = request.args.get("count", "50")
    result = memory_cmd("recent", name, "--count", count)
    return jsonify(ok(result.get("entries", [])))


@agents_bp.route("/api/agents/<name>/memory/feedback", methods=["POST"])
def submit_memory_feedback(name):
    """Delete memory items directly (vote=down items are removed)."""
    data = request.get_json(force=True)
    feedbacks = data.get("feedbacks", [])
    if not feedbacks:
        return jsonify(err("feedbacks is required")), 400

    to_delete = set()
    for fb in feedbacks:
        if fb.get("vote") == "down":
            to_delete.add(fb.get("item", ""))

    if not to_delete:
        return jsonify(ok({"message": "nothing to delete"}))

    result = memory_cmd("get-memory", name)
    content = result.get("content", "")

    lines = content.split("\n")
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("- ") and stripped[2:] in to_delete:
            continue
        new_lines.append(line)

    new_content = "\n".join(new_lines)
    memory_cmd("update-memory", name, "--content", new_content)

    items = []
    for line in new_content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("- ") and len(stripped) > 2:
            items.append(stripped[2:])

    return jsonify(ok({"content": new_content, "items": items}))


# -- Agent Labels ----------------------------------------------------------

@agents_bp.route("/api/agent-labels", methods=["GET"])
def get_agent_labels():
    labels_file = SCRIPT_DIR / "static" / "agent_labels.json"
    if not labels_file.exists():
        return jsonify(ok({}))
    return jsonify(ok(json.loads(labels_file.read_text(encoding="utf-8"))))


@agents_bp.route("/api/agent-labels", methods=["PUT"])
def update_agent_labels():
    data = request.get_json(force=True)
    agent_name = data.get("name", "").strip()
    label = data.get("label", "").strip()
    if not agent_name:
        return jsonify(err("name is required")), 400
    labels_file = SCRIPT_DIR / "static" / "agent_labels.json"
    labels = json.loads(labels_file.read_text(encoding="utf-8")) if labels_file.exists() else {}
    if label:
        labels[agent_name] = label
    else:
        labels.pop(agent_name, None)
    labels_file.write_text(json.dumps(labels, ensure_ascii=False, indent=2), encoding="utf-8")
    return jsonify(ok({"updated": True}))


# -- Charter (SKILL.md) ----------------------------------------------------------

@agents_bp.route("/api/charter", methods=["GET"])
def get_charter():
    skill_md = SKILL_DIR / "SKILL.md"
    if not skill_md.exists():
        return jsonify(err("SKILL.md not found")), 404
    content = skill_md.read_text(encoding="utf-8")
    return jsonify(ok({"content": content}))


@agents_bp.route("/api/charter", methods=["PUT"])
def update_charter():
    data = request.get_json(force=True)
    new_content = data.get("content", "")
    if not new_content.strip():
        return jsonify(err("content is required")), 400
    skill_md = SKILL_DIR / "SKILL.md"
    skill_md.write_text(new_content, encoding="utf-8")
    return jsonify(ok({"updated": True}))
