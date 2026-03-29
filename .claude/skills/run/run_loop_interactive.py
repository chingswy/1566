#!/usr/bin/env python3
"""run_loop_interactive.py — 自动轮询任务队列并驱动 Claude 处理任务

针对 /run skill 的任务队列模式设计：
- 通过直接读取 SQLite DB 检测是否有 pending 任务（不消费队列）
- 有任务时启动 `claude "/run"`，claude 自己从队列取任务并处理
- 通过监测 completed/failed 任务总数的变化判断本轮完成
- 任务完成或超时后 kill 进程，进入下一轮等待

判断本轮完成的依据：
1. 进程自然退出 → 检查任务数是否增加
2. 轮询到 completed/failed 总数 > 启动前的数量 → 杀进程，标记完成
3. 超时（默认 20 分钟）→ 杀进程，标记失败

用法:
    python .claude/skills/run/run_loop_interactive.py
    python .claude/skills/run/run_loop_interactive.py --max-sessions 30
    python .claude/skills/run/run_loop_interactive.py --cli-command claude-internal
    python .claude/skills/run/run_loop_interactive.py --peek-interval 15 --poll-interval 30
"""

import argparse
import datetime
import errno
import json
import os
import pty
import re
import select
import signal
import sqlite3
import sys
import time


# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))          # .claude/skills/run/
PROJECT_ROOT = SCRIPT_DIR.rsplit(".claude", 1)[0].rstrip("/")    # project root
DB_PATH = os.path.join(SCRIPT_DIR, "web", "run.db")


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(description="run_loop_interactive — 任务队列驱动循环")
    parser.add_argument(
        "--max-sessions", type=int, default=50,
        help="最多启动多少次 claude 会话（安全上限，默认 50）"
    )
    parser.add_argument(
        "--peek-interval", type=float, default=10,
        help="空闲时轮询有无 pending 任务的间隔秒数（默认 10）"
    )
    parser.add_argument(
        "--poll-interval", type=float, default=30,
        help="会话运行中轮询任务完成状态的间隔秒数（默认 30）"
    )
    parser.add_argument(
        "--timeout", type=int, default=1200,
        help="单次会话超时秒数（默认 1200 即 20 分钟）"
    )
    parser.add_argument(
        "--log-dir", default=None,
        help="日志输出目录（默认: <project_root>/run_logs）"
    )
    parser.add_argument(
        "--cli-command", default="claude",
        help="交互式 CLI 命令名（默认: claude，可设为 claude-internal 等）"
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# DB helpers — 直接读取 SQLite，不经过 server.py，避免消费队列
# ---------------------------------------------------------------------------

def _db_connect():
    """连接 SQLite DB，返回 connection。调用方负责 close。"""
    if not os.path.exists(DB_PATH):
        return None
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def count_pending(conn) -> int:
    """统计 pending 任务数（不修改状态）。"""
    if conn is None:
        return 0
    try:
        row = conn.execute("SELECT COUNT(*) FROM tasks WHERE status='pending'").fetchone()
        return row[0] if row else 0
    except sqlite3.Error:
        return 0


def count_done(conn) -> int:
    """统计 completed + failed 任务总数。"""
    if conn is None:
        return 0
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE status IN ('completed','failed')"
        ).fetchone()
        return row[0] if row else 0
    except sqlite3.Error:
        return 0


def peek_pending_task(conn):
    """不修改状态，仅查看队首 pending 任务（返回 dict 或 None）。"""
    if conn is None:
        return None
    try:
        row = conn.execute(
            "SELECT id, caption, content FROM tasks WHERE status='pending' ORDER BY created_at ASC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None
    except sqlite3.Error:
        return None


# ---------------------------------------------------------------------------
# Process helpers
# ---------------------------------------------------------------------------

def kill_process_tree(pid):
    """终止进程及其所有子进程（先 SIGTERM 后 SIGKILL）。"""
    for sig in (signal.SIGTERM, signal.SIGKILL):
        for target_fn in (
            lambda p, s=sig: os.killpg(os.getpgid(p), s),
            lambda p, s=sig: os.kill(p, s),
        ):
            try:
                target_fn(pid)
            except (ProcessLookupError, PermissionError, OSError):
                pass
        if sig == signal.SIGTERM:
            time.sleep(2)


def strip_ansi(text):
    """去除 ANSI 转义序列，用于写入干净的日志。"""
    return re.sub(r"\x1b\[[0-9;]*[a-zA-Z]", "", text)


# ---------------------------------------------------------------------------
# Core: run one claude session
# ---------------------------------------------------------------------------

def run_one_session(session_num, poll_interval, timeout, log_file, cli_command="claude"):
    """
    启动一次 claude "/run" 交互式会话，监测任务完成后终止。

    完成条件：
    - completed/failed 任务总数 > 会话启动前的数量
    - 或进程自然退出（并伴随任务数增加）

    返回 (completed: bool, elapsed_seconds: float)
    """
    start = time.time()

    # 记录启动前的 done 任务数
    conn = _db_connect()
    done_before = count_done(conn)
    if conn:
        conn.close()

    # 查看即将被处理的任务（仅用于日志展示，不消费）
    conn = _db_connect()
    next_task = peek_pending_task(conn)
    if conn:
        conn.close()

    cmd = [cli_command, "/run"]
    task_desc = ""
    if next_task:
        caption = next_task.get("caption") or ""
        content_preview = next_task.get("content", "")[:60].replace("\n", " ")
        task_desc = f"[#{next_task['id']}] {caption or content_preview}"

    header = (
        f"\n{'='*60}\n"
        f"Session {session_num} — 启动 claude 会话\n"
        f"命令: {' '.join(cmd)}\n"
        f"即将处理: {task_desc or '(待 claude 自取)'}\n"
        f"启动前 done 数: {done_before}\n"
        f"日志: {log_file.name}\n"
        f"{'='*60}\n"
    )
    sys.stdout.write(header)
    sys.stdout.flush()
    log_file.write(header)
    log_file.flush()

    # 创建 PTY
    master_fd, slave_fd = pty.openpty()

    pid = os.fork()
    if pid == 0:
        # ---- 子进程 ----
        os.close(master_fd)
        os.setsid()
        os.dup2(slave_fd, 0)
        os.dup2(slave_fd, 1)
        os.dup2(slave_fd, 2)
        if slave_fd > 2:
            os.close(slave_fd)
        os.chdir(PROJECT_ROOT)
        os.execvp(cmd[0], cmd)
        os._exit(127)

    # ---- 父进程 ----
    os.close(slave_fd)

    completed = False
    child_exited = False
    last_poll = time.time()

    def _log(msg):
        sys.stdout.write(msg)
        sys.stdout.flush()
        log_file.write(msg)
        log_file.flush()

    def _drain_pty():
        """从 PTY 读取所有可用数据并 tee 输出，返回 False 表示 PTY 已关闭。"""
        while True:
            try:
                rlist, _, _ = select.select([master_fd], [], [], 0.1)
            except (select.error, ValueError):
                return False
            if not rlist:
                return True
            try:
                data = os.read(master_fd, 4096)
            except OSError as e:
                if e.errno == errno.EIO:
                    return False
                raise
            if not data:
                return False
            sys.stdout.buffer.write(data)
            sys.stdout.buffer.flush()
            log_file.write(strip_ansi(data.decode("utf-8", errors="replace")))
            log_file.flush()

    while True:
        # 持续读取 PTY 输出，避免子进程被 buffer 阻塞
        if not _drain_pty():
            break

        # 检查子进程是否自然退出
        try:
            wpid, wstatus = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            child_exited = True
            break
        if wpid != 0:
            child_exited = True
            ret = os.WEXITSTATUS(wstatus) if os.WIFEXITED(wstatus) else -1
            _log(f"\n进程已自行退出 (exit={ret})\n")
            # 进程退出后检查任务是否完成
            conn = _db_connect()
            done_now = count_done(conn)
            if conn:
                conn.close()
            completed = done_now > done_before
            if completed:
                _log(f"  任务完成确认: done 数 {done_before} → {done_now}\n")
            else:
                _log(f"  进程退出但任务未完成: done 数仍为 {done_before}\n")
            break

        elapsed = time.time() - start
        now = time.time()

        # 超时检查
        if elapsed > timeout:
            _log(f"\n会话超时 ({timeout}s)，终止进程...\n")
            kill_process_tree(pid)
            os.waitpid(pid, 0)
            break

        # 定期轮询 DB，检查是否有任务完成
        if now - last_poll >= poll_interval:
            last_poll = now
            conn = _db_connect()
            done_now = count_done(conn)
            if conn:
                conn.close()
            if done_now > done_before:
                _log(f"\n  检测到任务完成: done 数 {done_before} → {done_now}，终止会话...\n")
                kill_process_tree(pid)
                os.waitpid(pid, 0)
                completed = True
                break
            else:
                _log(f"  [轮询] done={done_now}, elapsed={int(elapsed)}s\n")

    os.close(master_fd)

    # 确保子进程已回收
    if not child_exited:
        try:
            os.waitpid(pid, 0)
        except ChildProcessError:
            pass

    elapsed = time.time() - start
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)
    status_str = "完成" if completed else "未完成"
    msg = f"Session {session_num} — {status_str} (耗时 {minutes}m{seconds}s)\n"
    sys.stdout.write(msg)
    log_file.write(msg)
    log_file.flush()

    return completed, elapsed


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main():
    args = parse_args()
    max_sessions = args.max_sessions
    peek_interval = args.peek_interval
    poll_interval = args.poll_interval
    timeout = args.timeout
    log_dir = args.log_dir or os.path.join(PROJECT_ROOT, "run_logs")
    cli_command = args.cli_command

    # 检查 DB 是否可访问
    if not os.path.exists(DB_PATH):
        print(f"警告: DB 文件不存在: {DB_PATH}")
        print(f"请先通过 /run 启动一次任务，或运行 python3 {SCRIPT_DIR}/web/server.py serve 初始化。")
        print("脚本将继续运行，等待 DB 出现...\n")

    os.makedirs(log_dir, exist_ok=True)

    # 优雅退出
    stop_flag = False
    def signal_handler(sig, frame):
        nonlocal stop_flag
        if stop_flag:
            print("\n强制退出")
            sys.exit(1)
        print("\n收到中断信号，当前会话完成后退出...")
        stop_flag = True
    signal.signal(signal.SIGINT, signal_handler)

    print("run_loop_interactive 启动")
    print(f"  project_root:   {PROJECT_ROOT}")
    print(f"  db_path:        {DB_PATH}")
    print(f"  max_sessions:   {max_sessions}")
    print(f"  peek_interval:  {peek_interval}s（空闲轮询间隔）")
    print(f"  poll_interval:  {poll_interval}s（会话内轮询间隔）")
    print(f"  timeout:        {timeout}s（单会话超时）")
    print(f"  cli_command:    {cli_command}")
    print(f"  log_dir:        {os.path.abspath(log_dir)}")
    print()

    total_time = 0.0
    completed_count = 0
    session_num = 0

    while session_num < max_sessions:
        if stop_flag:
            print(f"\n用户中断，共完成 {completed_count} 次会话")
            break

        # 检查是否有 pending 任务
        conn = _db_connect()
        pending = count_pending(conn)
        next_task = peek_pending_task(conn) if pending > 0 else None
        if conn:
            conn.close()

        if pending == 0:
            # 没有任务，等待
            ts = datetime.datetime.now().strftime("%H:%M:%S")
            sys.stdout.write(f"\r[{ts}] 无 pending 任务，等待 {peek_interval}s...")
            sys.stdout.flush()
            time.sleep(peek_interval)
            continue

        # 有任务，启动 claude
        session_num += 1
        task_info = ""
        if next_task:
            caption = next_task.get("caption") or ""
            content_preview = next_task.get("content", "")[:40].replace("\n", " ")
            task_info = f" (#{next_task['id']} {caption or content_preview})"
        print(f"\n发现 {pending} 个 pending 任务{task_info}，启动 Session {session_num}...")

        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        log_path = os.path.join(log_dir, f"session_{session_num}_{ts}.log")
        log_file = open(log_path, "w", encoding="utf-8")

        completed, elapsed = run_one_session(
            session_num, poll_interval, timeout, log_file, cli_command
        )
        log_file.close()
        total_time += elapsed

        if completed:
            completed_count += 1
        else:
            print(f"\nSession {session_num} 未正常完成，继续监听队列...")

        # 会话间短暂暂停，避免立刻重入
        print(f"\n等待 3 秒后继续检查任务队列...")
        time.sleep(3)
    else:
        print(f"\n达到最大会话数 {max_sessions}，停止循环")

    total_min = int(total_time // 60)
    total_sec = int(total_time % 60)
    print(f"\n总耗时: {total_min}m{total_sec}s")
    print(f"本次完成会话数: {completed_count}")
    print(f"日志目录: {os.path.abspath(log_dir)}")


if __name__ == "__main__":
    main()
