#!/bin/bash
# 清库重启：清空历史任务、重置 DB，然后启动 Web 面板
# 用法：./clean_and_restart.sh [端口]  （默认 8192）

PORT=${1:-8192}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="$SCRIPT_DIR/web/run.db"

# ── 1. 清空数据库 ─────────────────────────────────────
if [ -f "$DB" ]; then
  echo "清空历史任务数据..."
  sqlite3 "$DB" "DELETE FROM task_logs; DELETE FROM tasks;"
  sqlite3 "$DB" "VACUUM;"
  echo "✅ 数据库已清空"
else
  echo "数据库不存在，跳过清空"
fi

# ── 2. Kill 占用端口的进程 ────────────────────────────
PIDS=$(lsof -ti tcp:$PORT 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "端口 $PORT 被占用（PID: $PIDS），正在清理..."
  echo "$PIDS" | xargs kill -9
  sleep 0.5
fi

# ── 3. 启动 Web 面板 ──────────────────────────────────
echo "启动 Web 面板：http://0.0.0.0:$PORT"
exec python3 "$SCRIPT_DIR/web/server.py" serve --port "$PORT"
