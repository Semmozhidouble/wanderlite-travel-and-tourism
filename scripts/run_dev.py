"""Run backend and frontend concurrently for local development.

Usage: python scripts/run_dev.py

This script tries to use the repo virtualenv for the backend if found (.venv/Scripts/python.exe).
It requires Node/npm to be installed and available on PATH to start the frontend.
"""

import os
import sys
import shutil
import subprocess
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENV_PY = ROOT / '.venv' / 'Scripts' / 'python.exe'
BACKEND_DIR = ROOT / 'backend'
FRONTEND_DIR = ROOT / 'frontend'

backend_cmd = None
frontend_cmd = None

if VENV_PY.exists():
    backend_py = str(VENV_PY)
else:
    backend_py = sys.executable

backend_cmd = [backend_py, 'run_server.py']
frontend_cmd = ['npm', 'start']

def stream_process(proc, prefix):
    try:
        for line in proc.stdout:
            print(f"[{prefix}] {line.rstrip()}")
    except Exception:
        pass

procs = []

# Start backend
print("[dev] Starting backend...")
proc_backend = subprocess.Popen(backend_cmd, cwd=str(BACKEND_DIR), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
procs.append((proc_backend, 'backend'))
threading.Thread(target=stream_process, args=(proc_backend, 'backend'), daemon=True).start()

# Start frontend if npm present
if shutil.which('npm'):
    print("[dev] Starting frontend (npm start)...")
    proc_front = subprocess.Popen(frontend_cmd, cwd=str(FRONTEND_DIR), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    procs.append((proc_front, 'frontend'))
    threading.Thread(target=stream_process, args=(proc_front, 'frontend'), daemon=True).start()
else:
    print('[dev] npm not found on PATH - frontend will not start. Please install Node.js and npm to run the frontend.')

try:
    # Wait for processes; exit when any process exits and kill the rest
    while True:
        for p, name in list(procs):
            ret = p.poll()
            if ret is not None:
                print(f'[dev] {name} exited with code {ret}, shutting down other processes...')
                for q, _ in procs:
                    if q != p:
                        q.terminate()
                raise SystemExit(ret)
        # Simple sleep
        import time
        time.sleep(0.5)
except KeyboardInterrupt:
    print('[dev] Keyboard interrupt received, terminating processes...')
    for p, _ in procs:
        p.terminate()
    sys.exit(0)
