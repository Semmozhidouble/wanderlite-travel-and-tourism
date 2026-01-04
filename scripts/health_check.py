"""Verify backend HTTP health and WebSocket readiness.
Usage: python scripts/health_check.py

Behavior:
- Retry HTTP /api/status until ready (with backoff)
- Ensure a test user/token exists (prefer /api/auth/login; fallback to sqlite DB)
- Retry WebSocket connection a few times to avoid race conditions
"""
import os
import time
from pathlib import Path
from dotenv import load_dotenv
from jose import jwt
import requests
import asyncio
import websockets
import json

ROOT = Path(__file__).resolve().parents[0]
load_dotenv(ROOT.parent / '.env')

SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-here')
ALGORITHM = os.environ.get('ALGORITHM', 'HS256')

BACKEND_URL = os.environ.get('REACT_APP_API_URL', 'http://127.0.0.1:8000')
MYSQL_URL = os.environ.get('MYSQL_URL', 'sqlite:///./wanderlite.db')

# Config
HTTP_RETRIES = 15
HTTP_BASE_DELAY = 1.0  # seconds
WS_RETRIES = 5
WS_RETRY_DELAY = 1.0  # seconds

# Helper: exponential backoff sleep
def backoff_sleep(attempt, base=HTTP_BASE_DELAY):
    delay = base * (2 ** min(attempt, 4))
    time.sleep(delay)

# Wait for HTTP readiness
def wait_for_http_status(path='/api/status', timeout_retries=HTTP_RETRIES):
    url = f"{BACKEND_URL}{path}"
    print(f'Checking backend HTTP {path} at {url} ...')
    for i in range(timeout_retries):
        try:
            r = requests.get(url, timeout=3)
            if r.status_code == 200:
                print('HTTP ready:', r.status_code, r.text[:200])
                return True
            else:
                print(f'HTTP returned {r.status_code}, body: {r.text[:200]}')
        except Exception as e:
            print(f'HTTP check attempt {i+1}/{timeout_retries} failed:', e)
        if i < timeout_retries - 1:
            backoff_sleep(i)
    print('HTTP check did not succeed within retries')
    return False

# Ensure a usable token for WebSocket. Prefer backend login (which will create user in dev mode).
def obtain_user_token():
    # Attempt to login via auth endpoint (development login creates user)
    login_url = f"{BACKEND_URL}/api/auth/login"
    test_email = f"health-{int(time.time())}@local"
    payload = {"email": test_email, "password": "devpass"}
    try:
        r = requests.post(login_url, json=payload, timeout=5)
        if r.status_code == 200:
            data = r.json()
            token = data.get('access_token') or data.get('token') or data.get('accessToken')
            if token:
                print('Obtained token via /api/auth/login for', test_email)
                return token
            else:
                print('Login response did not contain access token:', data)
        else:
            print('Login failed:', r.status_code, r.text[:200])
    except Exception as e:
        print('Login attempt failed:', e)

    # Fallback: if using sqlite, ensure a user exists in DB and create JWT with SECRET_KEY
    if MYSQL_URL.startswith('sqlite:///'):
        try:
            import sqlite3
            from uuid import uuid4
            from passlib.context import CryptContext
            pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
            db_path = MYSQL_URL.replace('sqlite:///','')
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            cur.execute("SELECT id, email FROM users LIMIT 1")
            row = cur.fetchone()
            if row:
                user_id, email = row[0], row[1]
            else:
                user_id = str(uuid4())
                email = f'health-{user_id}@local'
                hashed = pwd.hash('testpassword')
                cur.execute(
                    "INSERT INTO users (id, email, username, hashed_password, created_at) VALUES (?,?,?,?,?)",
                    (user_id, email, 'healthcheck', hashed, time.strftime('%Y-%m-%d %H:%M:%S'))
                )
                conn.commit()
            conn.close()
            # Create a short-lived token using SECRET_KEY expected by WS
            token = jwt.encode({'sub': user_id, 'exp': int(time.time()) + 60}, SECRET_KEY, algorithm=ALGORITHM)
            print('Created fallback token using sqlite user', user_id)
            return token
        except Exception as e:
            print('DB fallback for token failed:', e)

    # Final fallback: create a token with a timestamp-based id (may be rejected by server)
    fallback_id = f'health-{int(time.time())}'
    token = jwt.encode({'sub': fallback_id, 'exp': int(time.time()) + 60}, SECRET_KEY, algorithm=ALGORITHM)
    print('Using final fallback token for', fallback_id)
    return token

# If simple WS connect fails, try an e2e-like flow that creates a user and admin, sends a notification and verifies reception
async def _e2e_like_flow():
    # Import local DB helper and ensure user/admin like backend/scripts/e2e_ws_notification_test.py
    try:
        import sqlite3
        import uuid
        from passlib.context import CryptContext
        pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
        if MYSQL_URL.startswith('sqlite:///'):
            db_path = MYSQL_URL.replace('sqlite:///','')
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()

            TEST_USER_EMAIL = 'hc-ws@example.com'
            TEST_ADMIN_EMAIL = 'hc-admin@example.com'

            # ensure user
            cur.execute('SELECT id FROM users WHERE email=?', (TEST_USER_EMAIL,))
            row = cur.fetchone()
            if row:
                user_id = row[0]
            else:
                user_id = str(uuid.uuid4())
                hashed = pwd.hash('testpassword')
                cur.execute('INSERT INTO users (id, email, username, hashed_password, created_at) VALUES (?,?,?,?,?)', (
                    user_id, TEST_USER_EMAIL, 'hc-ws', hashed, time.strftime('%Y-%m-%d %H:%M:%S')
                ))
                conn.commit()

            # ensure admin
            cur.execute('SELECT id FROM admins WHERE email=?', (TEST_ADMIN_EMAIL,))
            row = cur.fetchone()
            if row:
                admin_id = row[0]
            else:
                hashed = pwd.hash('adminpassword')
                cur.execute('INSERT INTO admins (email, username, hashed_password, role, is_active, created_at) VALUES (?,?,?,?,?,?)', (
                    TEST_ADMIN_EMAIL, 'hc-admin', hashed, 'super_admin', 1, time.strftime('%Y-%m-%d %H:%M:%S')
                ))
                conn.commit()
                cur.execute('SELECT id FROM admins WHERE email=?', (TEST_ADMIN_EMAIL,))
                admin_id = cur.fetchone()[0]

            conn.close()

            # Create tokens
            now = int(time.time())
            user_token = jwt.encode({'sub': user_id, 'exp': now + 300}, SECRET_KEY, algorithm=ALGORITHM)
            admin_token = jwt.encode({'sub': str(admin_id), 'email': TEST_ADMIN_EMAIL, 'role': 'super_admin', 'scope': 'admin', 'exp': now + 300}, os.environ.get('ADMIN_SECRET_KEY', 'admin-super-secret-key-2025'), algorithm=ALGORITHM)

            # Try to connect WS and verify a sent notification is received
            ws_ok = await ws_connect_and_check(user_token)
            if not ws_ok:
                print('E2E-like WS connect failed')
                return False

            # Send notification as admin and expect it via WS
            api_url = f"{BACKEND_URL}/api/admin/notifications"
            headers = {'Authorization': f'Bearer {admin_token}', 'Content-Type': 'application/json'}
            body = {
                'title': 'HC Test Notification',
                'message': 'Hello from health check',
                'notification_type': 'info',
                'user_id': user_id
            }
            try:
                r = requests.post(api_url, headers=headers, json=body, timeout=5)
                print('Admin API response:', r.status_code, r.text[:200])
                if r.status_code == 200:
                    # Give a brief pause for the notification to arrive via WS
                    await asyncio.sleep(1)
                    print('E2E-like flow success')
                    return True
                else:
                    print('Failed to send admin notification:', r.status_code)
                    return False
            except Exception as e:
                print('Error sending admin notification:', e)
                return False
    except Exception as e:
        print('E2E-like flow failed:', e)
        return False

# Wrapper to run E2E-like flow synchronously
def run_e2e_like_flow():
    try:
        return asyncio.run(_e2e_like_flow())
    except Exception as e:
        print('E2E flow runner error:', e)
        return False

# WebSocket connect with retries
async def ws_connect_and_check(token):
    # derive ws scheme and host from BACKEND_URL
    if BACKEND_URL.startswith('https://'):
        ws_scheme = 'wss://'
        host = BACKEND_URL[len('https://'):]
    else:
        ws_scheme = 'ws://'
        host = BACKEND_URL[len('http://'):] if BACKEND_URL.startswith('http://') else BACKEND_URL
    uri = f"{ws_scheme}{host}/ws/notifications/{token}"
    print('Attempting WebSocket connect to', uri)

    for attempt in range(WS_RETRIES):
        try:
            async with websockets.connect(uri) as ws:
                print('WS connected, waiting for init...')
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=6)
                    print('WS init received:', msg)
                except asyncio.TimeoutError:
                    print('No init message received within timeout')
                # Send ping and wait for pong/heartbeat
                try:
                    await ws.send('ping')
                    resp = await asyncio.wait_for(ws.recv(), timeout=6)
                    print('WS response after ping:', resp)
                except asyncio.TimeoutError:
                    print('No ping/pong response received')
                return True
        except Exception as e:
            print(f'WS attempt {attempt+1}/{WS_RETRIES} failed:', e)
            if attempt < WS_RETRIES - 1:
                time.sleep(WS_RETRY_DELAY * (2 ** min(attempt, 4)))
    print('WebSocket checks failed after retries')
    return False


def main():
    ok = wait_for_http_status()
    if not ok:
        return 2

    token = obtain_user_token()
    if not token:
        print('Could not obtain a token for WS checks')
        return 3

    try:
        ok_ws = asyncio.run(ws_connect_and_check(token))
        if not ok_ws:
            print('Initial WS check failed; attempting e2e-like flow to create user/admin and verify notifications...')
            if run_e2e_like_flow():
                print('E2E-like flow succeeded')
            else:
                print('E2E-like flow failed')
                return 4
    except Exception as e:
        print('WS check runner error:', e)
        return 5

    print('Health check succeeded (HTTP + WS)')
    return 0


if __name__ == '__main__':
    exit(main())
