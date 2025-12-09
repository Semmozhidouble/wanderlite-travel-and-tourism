#!/bin/bash

# WanderLite Project Verification Script
# Checks that all critical components are in place

echo "🔍 WanderLite Project Verification"
echo "=================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASS=0
FAIL=0
WARN=0

# Check function
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        ((PASS++))
    else
        echo -e "${RED}✗${NC} $2 - File not found: $1"
        ((FAIL++))
    fi
}

check_directory() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        ((PASS++))
    else
        echo -e "${RED}✗${NC} $2 - Directory not found: $1"
        ((FAIL++))
    fi
}

check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✓${NC} $2 ($1 found)"
        ((PASS++))
    else
        echo -e "${YELLOW}⚠${NC} $2 - $1 not found"
        ((WARN++))
    fi
}

echo "📁 Checking Project Structure..."
echo "--------------------------------"
check_directory "backend" "Backend directory"
check_directory "frontend" "Frontend directory"
check_directory "frontend/src/services" "Frontend services directory"
check_directory "frontend/src/components" "Frontend components directory"
check_directory "scripts" "Scripts directory"
echo ""

echo "🔧 Checking Backend Files..."
echo "--------------------------------"
check_file "backend/server.py" "Main backend server"
check_file "backend/requirements.txt" "Python dependencies"
check_file "backend/.env.example" "Backend environment template"
check_file "backend/.env" "Backend environment file (should exist)"
echo ""

echo "⚛️  Checking Frontend Files..."
echo "--------------------------------"
check_file "frontend/package.json" "Frontend package.json"
check_file "frontend/src/App.js" "Main App component"
check_file "frontend/.env.example" "Frontend environment template"
check_file "frontend/.eslintrc.json" "ESLint configuration"
echo ""

echo "🔌 Checking API Services..."
echo "--------------------------------"
check_file "frontend/src/services/api.js" "API client"
check_file "frontend/src/services/authService.js" "Auth service"
check_file "frontend/src/services/destinationService.js" "Destination service"
echo ""

echo "📄 Checking Key Components..."
echo "--------------------------------"
check_file "frontend/src/components/Toast.jsx" "Toast notification component"
check_file "frontend/src/components/ProtectedRoute.jsx" "Protected route component"
check_file "frontend/src/contexts/AuthContext.js" "Auth context"
check_file "frontend/src/pages/Login.jsx" "Login page"
check_file "frontend/src/pages/Signup.jsx" "Signup page"
check_file "frontend/src/pages/Explore.jsx" "Explore page"
check_file "frontend/src/pages/DestinationDetails.jsx" "Destination details page"
echo ""

echo "📊 Checking Data Files..."
echo "--------------------------------"
check_file "frontend/src/data/destinations.json" "Destinations fallback data"
check_file "frontend/src/data/mock.js" "Mock data"
echo ""

echo "🧪 Checking Test Files..."
echo "--------------------------------"
check_file "frontend/src/__tests__/Login.test.js" "Login tests"
check_file "frontend/src/__tests__/DestinationDetails.test.js" "DestinationDetails tests"
echo ""

echo "📚 Checking Documentation..."
echo "--------------------------------"
check_file "README.md" "Main README"
check_file "TROUBLESHOOTING.md" "Troubleshooting guide"
check_file "IMPLEMENTATION_SUMMARY.md" "Implementation summary"
echo ""

echo "🛠️  Checking Tools & Scripts..."
echo "--------------------------------"
check_file "scripts/convert-dataset.js" "Dataset conversion script"
check_command "python" "Python runtime"
check_command "node" "Node.js runtime"
check_command "npm" "NPM package manager"
echo ""

# Check if backend is running
echo "🌐 Checking Backend Server..."
echo "--------------------------------"
if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend server is running"
    ((PASS++))
    
    # Check health endpoint response
    HEALTH_RESPONSE=$(curl -s http://localhost:8000/api/health)
    echo "   Response: $HEALTH_RESPONSE"
else
    echo -e "${YELLOW}⚠${NC} Backend server is not running"
    echo "   To start: cd backend && python server.py"
    ((WARN++))
fi
echo ""

# Check environment files
echo "🔐 Checking Environment Configuration..."
echo "--------------------------------"
if [ -f "backend/.env" ]; then
    if grep -q "SECRET_KEY" backend/.env; then
        echo -e "${GREEN}✓${NC} Backend SECRET_KEY configured"
        ((PASS++))
    else
        echo -e "${YELLOW}⚠${NC} Backend SECRET_KEY not found in .env"
        ((WARN++))
    fi
    
    if grep -q "CORS_ORIGINS" backend/.env; then
        echo -e "${GREEN}✓${NC} Backend CORS_ORIGINS configured"
        ((PASS++))
    else
        echo -e "${YELLOW}⚠${NC} Backend CORS_ORIGINS not found in .env"
        ((WARN++))
    fi
else
    echo -e "${RED}✗${NC} Backend .env file not found"
    echo "   Copy from: cp backend/.env.example backend/.env"
    ((FAIL++))
fi

if [ -f "frontend/.env" ]; then
    if grep -q "REACT_APP_API_URL" frontend/.env || grep -q "REACT_APP_BACKEND_URL" frontend/.env; then
        echo -e "${GREEN}✓${NC} Frontend API URL configured"
        ((PASS++))
    else
        echo -e "${YELLOW}⚠${NC} Frontend API URL not found in .env"
        ((WARN++))
    fi
else
    echo -e "${YELLOW}⚠${NC} Frontend .env file not found (optional)"
    echo "   App will use defaults from .env.example"
    ((WARN++))
fi
echo ""

# Check node_modules
echo "📦 Checking Dependencies..."
echo "--------------------------------"
if [ -d "frontend/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Frontend dependencies installed"
    ((PASS++))
else
    echo -e "${YELLOW}⚠${NC} Frontend dependencies not installed"
    echo "   Run: cd frontend && npm install"
    ((WARN++))
fi

if [ -f "backend/wanderlite.db" ]; then
    echo -e "${GREEN}✓${NC} Backend database exists"
    ((PASS++))
else
    echo -e "${YELLOW}⚠${NC} Backend database not found (will be created on first run)"
    ((WARN++))
fi
echo ""

# Summary
echo "=================================="
echo "📊 Verification Summary"
echo "=================================="
echo -e "${GREEN}Passed:${NC}  $PASS"
echo -e "${YELLOW}Warnings:${NC} $WARN"
echo -e "${RED}Failed:${NC}  $FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ Project structure is valid!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start backend:  cd backend && python server.py"
    echo "2. Start frontend: cd frontend && npm start"
    echo "3. Visit: http://localhost:3000"
    echo ""
    echo "For troubleshooting, see: TROUBLESHOOTING.md"
    exit 0
else
    echo -e "${RED}❌ Some critical files are missing!${NC}"
    echo "Please review the errors above and fix them."
    exit 1
fi
