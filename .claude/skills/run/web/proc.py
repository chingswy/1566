"""Subprocess helpers — call agent_manager.py / memory_manager.py."""

import json
import sys
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
AGENT_MANAGER = SKILL_DIR / "agent_manager.py"
MEMORY_MANAGER = SKILL_DIR / "memory_manager.py"


def _run_py(script: Path, *args) -> dict:
    """Run a python script and parse JSON output."""
    cmd = [sys.executable, str(script)] + list(args)
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(SKILL_DIR))
    if result.returncode != 0:
        stderr = result.stderr.strip()
        stdout = result.stdout.strip()
        try:
            return json.loads(stdout)
        except (json.JSONDecodeError, ValueError):
            return {"ok": False, "error": stderr or stdout or f"Exit code {result.returncode}"}
    try:
        return json.loads(result.stdout)
    except (json.JSONDecodeError, ValueError):
        return {"ok": True, "raw": result.stdout.strip()}


def agent_cmd(*args):
    return _run_py(AGENT_MANAGER, *args)


def memory_cmd(*args):
    return _run_py(MEMORY_MANAGER, *args)
