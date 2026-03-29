"""Tasks API routes — /api/tasks and /api/tasks/<id>/logs."""

import json
from flask import Blueprint, request, jsonify
from db import get_db, row_to_dict, rows_to_list, reset_stale_tasks, ok, err

tasks_bp = Blueprint('tasks', __name__)


@tasks_bp.route("/api/tasks", methods=["GET"])
def list_tasks():
    status = request.args.get("status")
    task_type = request.args.get("type")
    with get_db() as conn:
        reset_stale_tasks(conn)
        sql = "SELECT * FROM tasks WHERE 1=1"
        params = []
        if status:
            sql += " AND status = ?"
            params.append(status)
        if task_type:
            sql += " AND type = ?"
            params.append(task_type)
        sql += " ORDER BY created_at DESC"
        rows = conn.execute(sql, params).fetchall()
        tasks = rows_to_list(rows)
        # Attach logs to each task
        task_ids = [t["id"] for t in tasks]
        if task_ids:
            placeholders = ",".join("?" * len(task_ids))
            all_logs = rows_to_list(conn.execute(
                f"SELECT * FROM task_logs WHERE task_id IN ({placeholders}) ORDER BY created_at",
                task_ids,
            ).fetchall())
            logs_by_task = {}
            for log in all_logs:
                logs_by_task.setdefault(log["task_id"], []).append(log)
            for t in tasks:
                t["logs"] = logs_by_task.get(t["id"], [])
        else:
            for t in tasks:
                t["logs"] = []
    return jsonify(ok(tasks))


@tasks_bp.route("/api/tasks", methods=["POST"])
def create_task():
    data = request.get_json(force=True)
    content = data.get("content", "").strip()
    if not content:
        return jsonify(err("content is required")), 400
    task_type = data.get("type", "user")
    caption = data.get("caption")
    meta = data.get("meta")
    meta_str = json.dumps(meta, ensure_ascii=False) if meta else None
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO tasks (content, type, caption, meta) VALUES (?, ?, ?, ?)",
            (content, task_type, caption, meta_str),
        )
        task = row_to_dict(conn.execute("SELECT * FROM tasks WHERE id = ?", (cur.lastrowid,)).fetchone())
    return jsonify(ok(task)), 201


@tasks_bp.route("/api/tasks/next", methods=["GET"])
def next_task():
    """Atomically fetch the next pending task and mark it in_progress."""
    with get_db() as conn:
        reset_stale_tasks(conn)
        task = row_to_dict(conn.execute(
            "SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
        ).fetchone())
        if not task:
            return jsonify(ok(None, "no pending tasks"))
        conn.execute(
            "UPDATE tasks SET status = 'in_progress', updated_at = datetime('now','localtime') WHERE id = ?",
            (task["id"],),
        )
        task["status"] = "in_progress"
    return jsonify(ok(task))


@tasks_bp.route("/api/tasks/<int:task_id>", methods=["GET"])
def get_task(task_id):
    with get_db() as conn:
        task = row_to_dict(conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())
        if not task:
            return jsonify(err("task not found")), 404
        logs = rows_to_list(conn.execute(
            "SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at", (task_id,)
        ).fetchall())
        task["logs"] = logs
    return jsonify(ok(task))


@tasks_bp.route("/api/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    data = request.get_json(force=True)
    with get_db() as conn:
        task = row_to_dict(conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())
        if not task:
            return jsonify(err("task not found")), 404
        fields = []
        params = []
        for key in ("content", "status", "priority", "conclusion", "type", "caption"):
            if key in data:
                fields.append(f"{key} = ?")
                params.append(data[key])
        if "meta" in data:
            fields.append("meta = ?")
            params.append(json.dumps(data["meta"], ensure_ascii=False) if data["meta"] else None)
        if fields:
            fields.append("updated_at = datetime('now','localtime')")
            params.append(task_id)
            conn.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id = ?", params)
        task = row_to_dict(conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())
    return jsonify(ok(task))


@tasks_bp.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    with get_db() as conn:
        task = row_to_dict(conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())
        if not task:
            return jsonify(err("task not found")), 404
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    return jsonify(ok({"deleted": task_id}))


@tasks_bp.route("/api/tasks/<int:task_id>/logs", methods=["POST"])
def create_log(task_id):
    data = request.get_json(force=True)
    with get_db() as conn:
        task = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not task:
            return jsonify(err("task not found")), 404
        conn.execute(
            "INSERT INTO task_logs (task_id, agent_name, action, detail) VALUES (?, ?, ?, ?)",
            (task_id, data.get("agent_name"), data.get("action", ""), data.get("detail")),
        )
    return jsonify(ok({"task_id": task_id})), 201
