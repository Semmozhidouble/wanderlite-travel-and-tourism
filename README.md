# WanderLite - Travel Planning Platform 🌍✈️

A full-stack travel planning application with React frontend and Python FastAPI backend. Browse destinations, plan trips, book hotels, flights, and create personalized travel itineraries with AI assistance.

## 🚀 Quick Start

### Backend
```bash
cd backend
python server.py
# Runs on http://0.0.0.0:8000
```

### Frontend
```bash
cd frontend
npm install
npm start
# Runs on http://localhost:3000
```

## ✨ Features

- 🔐 **JWT Authentication** - Secure signup/login with token-based auth
- 🗺️ **Destination Explorer** - Browse destinations with search and filters
- 📍 **Interactive Maps** - Leaflet-powered maps with markers and popups
- 🏨 **Booking System** - Book hotels, flights, and restaurants
- 📅 **Trip Planner** - Create and manage custom itineraries
- ✅ **Smart Checklist** - Auto-generated packing lists by destination type
- 🤖 **AI Assistant** - Gemini-powered travel recommendations
- 📱 **Responsive Design** - Mobile-friendly UI with Tailwind CSS
- 🔄 **Offline Support** - Graceful fallback to cached/mock data
- 🔔 **Toast Notifications** - User-friendly error and success messages

## 🏗️ Architecture

### Frontend (React)
- **Service Layer**: Centralized API calls with interceptors
  - `api.js` - Axios instance with auth headers
  - `authService.js` - Login, signup, token management
  - `destinationService.js` - Destination data with caching
- **Error Handling**: Toast notifications and retry mechanisms
- **State Management**: React Context for auth and AI
- **Routing**: Protected routes with authentication guards

### Backend (Python FastAPI)
- **Authentication**: JWT tokens with bcrypt password hashing
- **Database**: SQLAlchemy ORM (SQLite dev, MySQL prod)
- **Validation**: Pydantic models
- **APIs**: RESTful endpoints for destinations, bookings, trips
- **External Integrations**: OpenWeather, OpenTripMap, Gemini AI

## 📋 Prerequisites

- **Node.js** 16+ and npm
- **Python** 3.8+
- **pip** package manager

## 🛠️ Installation

### 1. Backend Setup

```bash
cd backend

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys and settings

# Run server
python server.py
```

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with backend URL

# Start development server
npm start
```

## 🔐 Environment Configuration

### Backend `.env`
```env
MYSQL_URL=sqlite:///./wanderlite.db
SECRET_KEY=your-secret-key-min-32-chars
CORS_ORIGINS=http://localhost:3000
GEMINI_API_KEY=your-gemini-key
OPENWEATHER_API_KEY=your-weather-key
PORT=8000
HOST=0.0.0.0
```

### Frontend `.env`
```env
REACT_APP_API_URL=http://127.0.0.1:8000
REACT_APP_OPENCAGE_KEY=your-opencage-key
```

## 🧪 Testing

### Run Verification
```bash
./verify-project.sh
```

### Frontend Tests
```bash
cd frontend
npm test
```

### Backend Health Check
```bash
curl http://localhost:8000/api/health
```

### Doctor Script
```bash
cd frontend
npm run doctor  # Checks backend health and linting
```

## 📁 Project Structure

```
wanderlite/
├── backend/
│   ├── server.py              # FastAPI application
│   ├── requirements.txt       # Python dependencies
│   ├── .env.example          # Environment template
│   └── wanderlite.db         # SQLite database
├── frontend/
│   ├── src/
│   │   ├── services/         # API layer
│   │   │   ├── api.js        # Axios instance
│   │   │   ├── authService.js
│   │   │   └── destinationService.js
│   │   ├── components/       # React components
│   │   │   ├── Toast.jsx     # Notifications
│   │   │   └── ProtectedRoute.jsx
│   │   ├── pages/            # Route pages
│   │   ├── contexts/         # React contexts
│   │   └── data/             # Mock/fallback data
│   ├── package.json
│   └── .env.example
├── scripts/
│   └── convert-dataset.js    # CSV to JSON converter
├── TROUBLESHOOTING.md        # Debug guide
├── IMPLEMENTATION_SUMMARY.md # Detailed changelog
└── verify-project.sh         # Verification script
```

## 🔑 Key API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Destinations
- `GET /api/destinations` - List destinations
- `GET /api/destinations/{id}` - Get destination details

### Bookings
- `POST /api/bookings` - Create booking
- `GET /api/bookings` - Get user bookings

### Health
- `GET /api/health` - Server health check

Full API documentation: `http://localhost:8000/docs`

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check Python version
python --version  # Should be 3.8+

# Reinstall dependencies
pip install -r requirements.txt

# Check port availability
lsof -i :8000
```

### Frontend can't connect
```bash
# Verify backend is running
curl http://localhost:8000/api/health

# Check REACT_APP_API_URL in .env
# Check CORS_ORIGINS in backend/.env
```

### Authentication fails
```bash
# Clear browser localStorage
# Check SECRET_KEY in backend/.env
# Verify /api/auth/me endpoint returns 200
```

For detailed troubleshooting, see [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)

## 🚀 Deployment

### Backend (Production)
```bash
cd backend
uvicorn server:app --host 0.0.0.0 --port 8000 --workers 4
```

Or use systemd:
```bash
sudo cp systemd.service /etc/systemd/system/wanderlite.service
sudo systemctl start wanderlite
```

### Frontend (Production)
```bash
cd frontend
npm run build
# Serve build/ with nginx or similar
```

### Deployment Checklist
- [ ] Set strong SECRET_KEY
- [ ] Configure production CORS_ORIGINS
- [ ] Enable HTTPS
- [ ] Set up database backups
- [ ] Configure monitoring
- [ ] Run security audit

## 🧰 Available Scripts

### Frontend
- `npm start` - Start development server
- `npm build` - Build for production
- `npm test` - Run tests
- `npm run doctor` - Health check + lint

### Backend
- `python server.py` - Start server
- `python -m pytest` - Run tests (if configured)

### Utilities
- `./verify-project.sh` - Verify project structure
- `node scripts/convert-dataset.js` - Convert CSV data

## 📚 Documentation

- [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) - Debug guide with solutions
- [`IMPLEMENTATION_SUMMARY.md`](IMPLEMENTATION_SUMMARY.md) - Detailed changelog
- API Docs: http://localhost:8000/docs (when server running)

## 🔒 Security Features

- ✅ JWT token authentication
- ✅ bcrypt password hashing
- ✅ CORS configuration
- ✅ Input validation (Pydantic)
- ✅ SQL injection protection (SQLAlchemy ORM)
- ✅ XSS protection (React default escaping)

## 🎯 Workflow Verification

1. **Signup Flow**: `/signup` → Create account → Auto-login → Redirect to `/explore`
2. **Login Flow**: `/login` → Enter credentials → Redirect to dashboard
3. **Destination Flow**: `/explore` → Click destination → `/destination/[slug]` → View details + map
4. **Booking Flow**: Destination → "Book Now" → Fill form → Payment → Confirmation
5. **Error Handling**: Network error → Toast notification → Retry button

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- FastAPI for the backend framework
- React for the frontend library
- Leaflet for interactive maps
- Tailwind CSS for styling
- Google Gemini for AI features

## 📞 Support

- Issues: https://github.com/semmozhi-ctrl/wanderlite/issues
- Documentation: See TROUBLESHOOTING.md
- Email: support@wanderlite.com

---

## 🧪 Development: Running both services (dev mode) 🔧

- **Option A — Cross-platform (recommended):**
  - Ensure Node.js (16+) and npm are installed.
  - From the repo root:
    - Install dependencies:
      - Backend: `cd backend && .venv\Scripts\python.exe -m pip install -r requirements.txt`
      - Frontend: `cd frontend && npm install`
    - Start both services (requires Node):
      ```bash
      # from repo root
      npm run dev
      ```
      This uses the root `dev` script which runs both `start:backend` and `start:frontend` with `concurrently`.
  - Or use the Python runner (no npm package needed to run both, but front-end still requires Node to work):
    ```bash
    python scripts/run_dev.py
    ```

- **Option B — Windows helper scripts:**
  - PowerShell: `.	ools\start-dev.ps1` — or run `.	ools\start-dev.ps1` from PowerShell.
  - CMD: `.	ools\start-dev.bat` — or double-click to open two windows (backend and frontend).

**Quick notes:**
- If `npm` is not on PATH, install Node.js: https://nodejs.org/en/download/.
- `Makefile` targets: `make install`, `make start-backend`, `make start-frontend`, `make dev` (Windows users can use the scripts in `scripts/`).

## 🔍 WebSocket & Notifications (dev)

- To enable verbose raw WS logging in the frontend (dev only): set `REACT_APP_VERBOSE_WS=true` in `frontend/.env` and open browser devtools console — the NotificationContext will print raw messages as `[WS raw] ...`.
- There's a small E2E helper at `backend/scripts/e2e_ws_notification_test.py` which:
  1. Ensures a test user (`ws-test@example.com`) and admin (`ws-admin@example.com`) exist in the local sqlite DB, creating them if necessary.
  2. Connects as the test user via WebSocket, then calls the admin notification API to send a targeted notification and confirms the client receives it.
- Run it locally (backend venv):
```bash
# from repo root
.c:/Users/semmo/Downloads/wanderlite-travel-and-tourism/.venv/Scripts/python.exe backend/scripts/e2e_ws_notification_test.py
```

## 🧪 Automated health check (HTTP + WS)

- A convenience script `scripts/health_check.py` performs a quick HTTP check against `/api/status` and opens a temporary WebSocket (signed JWT) to ensure WS connections are accepted and the server responds to ping/heartbeat messages.
- Run:
```bash
python scripts/health_check.py
```

---

**Built with ❤️ for travelers worldwide**
