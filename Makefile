.PHONY: install deps start-backend start-frontend dev

install:
	@echo "Installing backend Python deps..."
	cd backend && .venv\Scripts\python.exe -m pip install -r requirements.txt
	@echo "Installing frontend Node deps..."
	cd frontend && npm install

start-backend:
	@echo "Starting backend"
	cd backend && .venv\Scripts\python.exe run_server.py

start-frontend:
	@echo "Starting frontend"
	cd frontend && npm start

dev:
	@echo "Starting both backend and frontend using Python runner (requires Node installed)"
	python scripts/run_dev.py

health-check:
	@echo "Run automated health check (HTTP + WebSocket)"
	python scripts/health_check.py
