#!/bin/bash
# 启动 Web 监控面板
# 用法：./start.sh [端口]  （默认 8192）

PORT=${1:-8192}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 如果端口已被占用，kill 掉对应进程
PIDS=$(lsof -ti tcp:$PORT 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "端口 $PORT 被占用（PID: $PIDS），正在清理..."
  echo "$PIDS" | xargs kill -9
  sleep 0.5
fi

echo "启动 Web 面板：http://0.0.0.0:$PORT"
exec python3 "$SCRIPT_DIR/web/server.py" serve --port "$PORT"
