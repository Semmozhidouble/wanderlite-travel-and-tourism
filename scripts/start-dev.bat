@echo off
REM Start backend and frontend in separate windows (Windows cmd)
set ROOT=%~dp0

echo Starting backend...
start "Backend" cmd /k "%ROOT%\.venv\Scripts\python.exe %ROOT%\backend\run_server.py"

echo Starting frontend...
start "Frontend" cmd /k "cd /d %ROOT%frontend && npm start"
