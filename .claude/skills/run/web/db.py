"""Database helpers — schema, connection, migration."""

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DB_PATH = SCRIPT_DIR / "run.db"

TASK_TIMEOUT_MINUTES = 30

_SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'user' CHECK(type IN ('user','memory')),
    status TEXT NOT NULL DEFAULT 'pending'
           CHECK(status IN ('pending','in_progress','completed','failed','cancelled')),
    priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
    conclusion TEXT,
    verdict TEXT,
    caption TEXT,
    meta TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS task_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_name TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
"""


def init_db():
    """Initialize database schema."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.executescript("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
    conn.executescript(_SCHEMA)
    # Migrate: add missing columns (batch, single commit)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()}
    migrations = [
        ("caption", "TEXT"),
        ("verdict", "TEXT"),
    ]
    changed = False
    for col, col_type in migrations:
        if col not in cols:
            conn.execute(f"ALTER TABLE tasks ADD COLUMN {col} {col_type}")
            changed = True
    if changed:
        conn.commit()
    # Seed: insert initial task if table is empty
    count = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
    if count == 0:
        _INIT_CONTENT = "各部门熟悉工作，不确定的问题尽早上报。"
        _INIT_CAPTION = _INIT_CONTENT[:20]
        conn.execute(
            "INSERT INTO tasks (content, caption, type, status, priority) VALUES (?, ?, 'user', 'pending', 3)",
            (_INIT_CONTENT, _INIT_CAPTION),
        )
        conn.commit()
    conn.close()


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def row_to_dict(row):
    """Convert sqlite3.Row to dict."""
    if row is None:
        return None
    return dict(row)


def rows_to_list(rows):
    """Convert list of sqlite3.Row to list of dicts."""
    return [dict(r) for r in rows]


def reset_stale_tasks(conn):
    """Reset in_progress tasks that exceeded TASK_TIMEOUT_MINUTES back to pending."""
    count = conn.execute("SELECT COUNT(*) FROM tasks WHERE status='in_progress'").fetchone()[0]
    if count == 0:
        return []
    stale = conn.execute(
        """UPDATE tasks SET status = 'pending', updated_at = datetime('now','localtime')
           WHERE status = 'in_progress'
             AND (julianday('now','localtime') - julianday(updated_at)) * 1440 > ?
           RETURNING id""",
        (TASK_TIMEOUT_MINUTES,),
    ).fetchall()
    return [row[0] for row in stale]


def ok(data=None, message="ok"):
    return {"code": 0, "data": data, "message": message}


def err(message, code=1):
    return {"code": code, "message": message, "data": None}
