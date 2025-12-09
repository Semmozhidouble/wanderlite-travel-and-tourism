# WanderLite - Development & Troubleshooting Guide

## Quick Start

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

## Environment Setup

### Backend .env
```env
MYSQL_URL=sqlite:///./wanderlite.db
SECRET_KEY=your-secret-key-min-32-chars
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
GEMINI_API_KEY=your-key
PORT=8000
HOST=0.0.0.0
```

### Frontend .env
```env
REACT_APP_API_URL=http://127.0.0.1:8000
REACT_APP_BACKEND_URL=http://127.0.0.1:8000
REACT_APP_OPENCAGE_KEY=your-key
```

## Testing the Application

### 1. Health Check
```bash
curl http://localhost:8000/api/health
# Expected: {"status": "ok", "database": "connected"}
```

### 2. Authentication Flow
1. Go to http://localhost:3000/signup
2. Create account with email/password (min 6 chars)
3. Should redirect to /explore with token saved
4. Check localStorage for token in browser DevTools

### 3. Destination Flow
1. Go to /explore
2. Browse destinations (should load from API)
3. Click any destination card
4. Should navigate to /destination/[name]
5. Details page should load with map centered on location

### 4. Booking Flow
1. On destination details, click "Book Now"
2. Fill booking form (dates, travelers, budget)
3. Submit booking
4. Should redirect to payment page

## Common Issues & Fixes

### Issue: Login/Signup fails
**Symptoms**: Error message on form submission
**Debug**:
1. Check browser Network tab for API call
2. Look at response status and error message
3. Verify backend is running: `curl http://localhost:8000/api/health`
4. Check CORS_ORIGINS in backend/.env includes frontend URL

**Fix**:
- If 401/403: Check SECRET_KEY in backend/.env
- If 500: Check backend logs for database errors
- If network error: Ensure backend is running and REACT_APP_API_URL is correct

### Issue: Destination click doesn't navigate
**Symptoms**: Clicking destination card does nothing
**Debug**:
1. Open browser console (F12)
2. Look for JavaScript errors
3. Check if navigate function is called

**Fix**:
- Ensure react-router-dom is installed
- Check that destination has valid ID
- Verify onClick handler is not being prevented

### Issue: Destinations not loading
**Symptoms**: Empty page or loading forever
**Debug**:
1. Check Network tab for /api/destinations call
2. Look at response (200 OK with data?)
3. Check console for errors

**Fix**:
- If 404: Backend may not be running
- If empty array: Database may be empty (app will use mock data)
- If network error: Check REACT_APP_API_URL and CORS settings

### Issue: Map not displaying
**Symptoms**: Blank space where map should be
**Debug**:
1. Check console for Leaflet errors
2. Verify Leaflet CSS is imported
3. Check marker icon URLs are accessible

**Fix**:
```jsx
// Ensure this is in your component or App.js
import 'leaflet/dist/leaflet.css';

// Fix marker icons in MapView component
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});
```

### Issue: Token expired / Session expired
**Symptoms**: Redirected to login after some time
**Debug**:
1. Check ACCESS_TOKEN_EXPIRE_MINUTES in backend/.env (default 30 minutes)
2. Look at localStorage token expiry

**Fix**:
- Increase token expiry time in backend/.env
- Implement refresh token flow
- Add "Remember me" functionality

## Architecture Overview

### Frontend Service Layer

```
Component → Service → API → Backend
```

**api.js**: Axios instance with interceptors
- Adds Authorization header
- Handles 401 (token expired) globally
- Logs requests/responses in development
- Provides error formatting

**authService.js**: Authentication logic
- login(email, password)
- signup(email, username, password)
- logout()
- getCurrentUser()
- Token management in localStorage

**destinationService.js**: Destination data
- getAllDestinations()
- getDestinationById(id)
- getDestinationByName(slug)
- Caching with 5-minute TTL
- Fallback to mock data

### Backend Structure

**FastAPI Application**:
- SQLAlchemy ORM with SQLite/MySQL
- JWT authentication with passlib
- CORS middleware
- Pydantic validation
- Automatic API docs at /docs

**Key Routes**:
- `/api/auth/*` - Authentication
- `/api/destinations` - Destinations
- `/api/bookings` - Bookings
- `/api/trips` - Trip planning
- `/api/health` - Health check

## Debugging Tips

### Enable Verbose Logging

**Frontend**:
```javascript
// Services already log in development mode
// Check browser console
```

**Backend**:
```python
# In server.py, logging is configured
# Check terminal output
```

### Inspect Network Calls

1. Open DevTools (F12)
2. Go to Network tab
3. Filter by "XHR" or "Fetch"
4. Click on requests to see headers, payload, response

### Check State

**Frontend**:
```javascript
// In component
console.log('User:', user);
console.log('Token:', localStorage.getItem('token'));
console.log('Destinations:', destinations);
```

**Backend**:
```python
# Add in endpoint
logger.info(f"Request data: {request_data}")
```

## Performance Optimization

### Frontend
- Destinations are cached for 5 minutes
- Session storage for recently viewed destinations
- Lazy loading for Leaflet maps
- Code splitting with React.lazy

### Backend
- SQLAlchemy query optimization
- Response caching (can be added)
- Connection pooling for database

## Security Checklist

- ✅ Passwords hashed with bcrypt
- ✅ JWT tokens for authentication
- ✅ CORS configured
- ✅ Input validation with Pydantic
- ⚠️ HTTPS not configured (required for production)
- ⚠️ Rate limiting not implemented (consider for production)
- ⚠️ SQL injection protected by SQLAlchemy ORM

## Deployment Checklist

### Pre-Deployment
- [ ] Set strong SECRET_KEY and JWT_SECRET
- [ ] Configure production database (MySQL recommended)
- [ ] Set CORS_ORIGINS to production domain only
- [ ] Enable HTTPS
- [ ] Add rate limiting
- [ ] Configure logging to file
- [ ] Set up monitoring (e.g., Sentry)
- [ ] Run security audit
- [ ] Test all features in production-like environment

### Backend Deployment
- [ ] Use uvicorn with workers: `uvicorn server:app --workers 4`
- [ ] Set up systemd service or PM2
- [ ] Configure firewall (allow only necessary ports)
- [ ] Set up database backups
- [ ] Configure log rotation

### Frontend Deployment
- [ ] Build: `npm run build`
- [ ] Serve with nginx or similar
- [ ] Configure reverse proxy for /api
- [ ] Enable gzip compression
- [ ] Set up CDN for static assets
- [ ] Configure cache headers

## File Locations

### Frontend
- API client: `frontend/src/services/api.js`
- Auth service: `frontend/src/services/authService.js`
- Destinations: `frontend/src/services/destinationService.js`
- Toast notifications: `frontend/src/components/Toast.jsx`
- Auth context: `frontend/src/contexts/AuthContext.js`

### Backend
- Main app: `backend/server.py`
- Database models: Lines 85-180 in server.py
- Auth endpoints: Lines 1777-1820 in server.py
- Destinations endpoint: Lines 2243+ in server.py

## API Response Formats

### Success Response
```json
{
  "id": "123",
  "name": "Goa, India",
  "category": "Beach",
  ...
}
```

### Error Response
```json
{
  "detail": "Error message here"
}
```

### Authentication Response
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

## Support & Resources

- FastAPI Docs: https://fastapi.tiangolo.com
- React Docs: https://react.dev
- Leaflet Docs: https://leafletjs.com
- Tailwind CSS: https://tailwindcss.com

## Version History

**v1.0.0** - December 2025
- Initial release with auth, destinations, bookings
- Service layer architecture
- Error handling & retry logic
- Toast notifications
- Responsive design
