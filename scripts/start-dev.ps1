# Start backend and frontend in separate windows (PowerShell)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$root = Resolve-Path $scriptDir\.. | Select-Object -ExpandProperty Path

Write-Host "Starting backend..."
Start-Process -FilePath "$root\.venv\Scripts\python.exe" -ArgumentList "run_server.py" -WorkingDirectory "$root\backend"

Write-Host "Starting frontend..."
Start-Process -FilePath "npm" -ArgumentList "start" -WorkingDirectory "$root\frontend"
