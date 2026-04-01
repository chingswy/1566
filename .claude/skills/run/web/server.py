#!/usr/bin/env python3
"""Web Server — Flask backend + CLI subcommands.

Usage:
    python3 web/server.py serve [--port 8192] [--host 0.0.0.0]
    python3 web/server.py next
    python3 web/server.py complete <id> "conclusion"
    python3 web/server.py fail <id> "reason"
    python3 web/server.py verdict <id> "验收结论"
    python3 web/server.py verdict-fail <id> "失败原因"
    python3 web/server.py log <task_id> <agent> <action> "detail"
    python3 web/server.py set-caption <task_id> "任务标题"
    python3 web/server.py reset-stale

Requires Flask: pip install flask

Modules:
    db.py           — Database schema, connection, helpers
    proc.py         — Subprocess helpers (agent_manager / memory_manager)
    task_routes.py  — /api/tasks Blueprint
    agent_routes.py — /api/agents, /api/agent-labels, /api/charter Blueprints
"""

import json
import sys
from pathlib import Path

# Ensure web/ is on path so sub-modules resolve
_WEB_DIR = Path(__file__).resolve().parent
if str(_WEB_DIR) not in sys.path:
    sys.path.insert(0, str(_WEB_DIR))

from db import init_db, get_db, row_to_dict, reset_stale_tasks, ok, err, TASK_TIMEOUT_MINUTES


# ---------------------------------------------------------------------------
# Flask application factory
# ---------------------------------------------------------------------------

def create_app():
    from flask import Flask, send_from_directory
    from task_routes import tasks_bp
    from agent_routes import agents_bp

    SCRIPT_DIR = Path(__file__).resolve().parent

    app = Flask(__name__, static_folder=str(SCRIPT_DIR / "static"))

    # Register blueprints
    app.register_blueprint(tasks_bp)
    app.register_blueprint(agents_bp)

    # -- Static & page routes ------------------------------------------------

    @app.route("/")
    def index():
        return send_from_directory(str(SCRIPT_DIR), "index.html")

    @app.route("/static/<path:filename>")
    def static_files(filename):
        return send_from_directory(str(SCRIPT_DIR / "static"), filename)

    @app.route("/agent/<name>")
    def agent_page(name):
        return send_from_directory(str(SCRIPT_DIR), "agent.html")

    @app.route("/create-agent")
    def create_agent_page():
        return send_from_directory(str(SCRIPT_DIR), "create-agent.html")

    @app.route("/history")
    def history_page():
        return send_from_directory(str(SCRIPT_DIR), "history.html")

    return app


# ---------------------------------------------------------------------------
# CLI subcommands (no Flask needed)
# ---------------------------------------------------------------------------

def _cli_update_task(task_id: int, *, column: str, value: str, status: str):
    """Shared helper: update one task column + status, then print JSON result."""
    init_db()
    with get_db() as conn:
        conn.execute(
            f"UPDATE tasks SET {column} = ?, status = ?, updated_at = datetime('now','localtime') WHERE id = ?",
            (value, status, task_id),
        )
    print(json.dumps(ok({"id": task_id, "status": status}), ensure_ascii=False))


def cli_next():
    """Fetch next pending task, print JSON to stdout."""
    init_db()
    with get_db() as conn:
        reset_stale_tasks(conn)
        task = row_to_dict(conn.execute(
            "SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
        ).fetchone())
        if not task:
            print(json.dumps(ok(None, "no pending tasks"), ensure_ascii=False))
            return
        conn.execute(
            "UPDATE tasks SET status = 'in_progress', updated_at = datetime('now','localtime') WHERE id = ?",
            (task["id"],),
        )
        task["status"] = "in_progress"
    print(json.dumps(ok(task), ensure_ascii=False))


def cli_complete(task_id, conclusion):
    _cli_update_task(task_id, column="conclusion", value=conclusion, status="completed")


def cli_fail(task_id, reason):
    _cli_update_task(task_id, column="conclusion", value=reason, status="failed")


def cli_verdict(task_id, verdict_text):
    _cli_update_task(task_id, column="verdict", value=verdict_text, status="completed")


def cli_verdict_fail(task_id, reason):
    _cli_update_task(task_id, column="verdict", value=reason, status="failed")


def cli_log(task_id, agent, action, detail):
    """Add a task log entry."""
    init_db()
    with get_db() as conn:
        conn.execute(
            "INSERT INTO task_logs (task_id, agent_name, action, detail) VALUES (?, ?, ?, ?)",
            (task_id, agent, action, detail),
        )
    print(json.dumps(ok({"task_id": task_id}), ensure_ascii=False))


def cli_set_caption(task_id, caption):
    """Update the caption (title) of a task."""
    init_db()
    with get_db() as conn:
        task = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not task:
            print(json.dumps(err(f"task {task_id} not found"), ensure_ascii=False))
            sys.exit(1)
        conn.execute(
            "UPDATE tasks SET caption = ?, updated_at = datetime('now','localtime') WHERE id = ?",
            (caption, task_id),
        )
    print(json.dumps(ok({"id": task_id, "caption": caption}), ensure_ascii=False))


def cli_reset_stale():
    """Reset in_progress tasks that exceeded timeout back to pending."""
    init_db()
    with get_db() as conn:
        reset_ids = reset_stale_tasks(conn)
    print(json.dumps({
        "code": 0,
        "data": {"reset_ids": reset_ids, "timeout_minutes": TASK_TIMEOUT_MINUTES},
        "message": f"reset {len(reset_ids)} stale tasks",
    }, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Main entry
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 server.py <command> [args...]")
        print("Commands: serve, next, complete, fail, verdict, verdict-fail, log, set-caption, reset-stale")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "serve":
        init_db()
        port = 8192
        host = "0.0.0.0"
        args = sys.argv[2:]
        i = 0
        while i < len(args):
            if args[i] == "--port" and i + 1 < len(args):
                port = int(args[i + 1])
                i += 2
            elif args[i] == "--host" and i + 1 < len(args):
                host = args[i + 1]
                i += 2
            elif args[i].isdigit():
                port = int(args[i])
                i += 1
            else:
                i += 1
        app = create_app()
        print(f"Web starting on http://{host}:{port}")
        app.run(host=host, port=port, debug=True)

    elif cmd == "next":
        cli_next()

    elif cmd == "complete":
        if len(sys.argv) < 4:
            print("Usage: python3 server.py complete <task_id> <conclusion>")
            sys.exit(1)
        cli_complete(int(sys.argv[2]), sys.argv[3])

    elif cmd == "fail":
        if len(sys.argv) < 4:
            print("Usage: python3 server.py fail <task_id> <reason>")
            sys.exit(1)
        cli_fail(int(sys.argv[2]), sys.argv[3])

    elif cmd == "verdict":
        if len(sys.argv) < 4:
            print("Usage: python3 server.py verdict <task_id> <verdict_text>")
            sys.exit(1)
        cli_verdict(int(sys.argv[2]), sys.argv[3])

    elif cmd == "verdict-fail":
        if len(sys.argv) < 4:
            print("Usage: python3 server.py verdict-fail <task_id> <reason>")
            sys.exit(1)
        cli_verdict_fail(int(sys.argv[2]), sys.argv[3])

    elif cmd == "log":
        if len(sys.argv) < 6:
            print("Usage: python3 server.py log <task_id> <agent> <action> <detail>")
            sys.exit(1)
        cli_log(int(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5])

    elif cmd == "set-caption":
        if len(sys.argv) < 4:
            print("Usage: python3 server.py set-caption <task_id> <caption>")
            sys.exit(1)
        cli_set_caption(int(sys.argv[2]), sys.argv[3])

    elif cmd == "reset-stale":
        cli_reset_stale()

    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
