.PHONY: setup setup-frontend setup-backend install-frontend install-backend run run-frontend run-backend clean clean-frontend clean-backend stop help

# Default target
help:
	@echo "PanelCraft - AI Comic Generator"
	@echo ""
	@echo "Available commands:"
	@echo "  make setup         - Set up both frontend and backend"
	@echo "  make run           - Run both frontend and backend"
	@echo "  make stop          - Stop running servers"
	@echo "  make clean         - Clean up generated files and dependencies"
	@echo ""
	@echo "Individual commands:"
	@echo "  make setup-frontend  - Set up frontend only"
	@echo "  make setup-backend   - Set up backend only"
	@echo "  make run-frontend    - Run frontend only"
	@echo "  make run-backend     - Run backend only"
	@echo "  make clean-frontend  - Clean frontend only"
	@echo "  make clean-backend   - Clean backend only"

# Setup commands
setup: setup-frontend setup-backend

setup-frontend: install-frontend

setup-backend: install-backend
	@if [ ! -f backend/.env ]; then \
		echo "Creating sample .env file..."; \
		echo "OPENAI_API_KEY=your_api_key_here" > backend/.env; \
		echo "Please update backend/.env with your actual OpenAI API key"; \
	fi
	@if [ ! -d backend/static/images ]; then \
		echo "Creating images directory..."; \
		mkdir -p backend/static/images; \
	fi

install-frontend:
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

install-backend:
	@echo "Setting up Python virtual environment..."
	cd backend && python -m venv venv
	@echo "Installing backend dependencies..."
	cd backend && . venv/bin/activate && pip install -r requirements.txt

# Run commands
run: stop
	@echo "Starting both frontend and backend..."
	make run-backend & make run-frontend

run-frontend:
	@echo "Starting frontend server..."
	cd frontend && npm run dev

run-backend:
	@echo "Starting backend server..."
	cd backend && . venv/bin/activate && uvicorn app.main:app --reload

# Stop running servers
stop:
	@echo "Stopping running servers..."
	-lsof -t -i:3000 | xargs kill -9 2>/dev/null || true
	-lsof -t -i:8000 | xargs kill -9 2>/dev/null || true

# Clean commands
clean: clean-frontend clean-backend
	@echo "Cleanup complete!"

clean-frontend:
	@echo "Cleaning frontend..."
	-rm -rf frontend/node_modules
	-rm -rf frontend/.next

clean-backend:
	@echo "Cleaning backend..."
	-rm -rf backend/venv
	-rm -rf backend/**/__pycache__ 