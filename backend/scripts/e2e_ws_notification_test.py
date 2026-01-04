#!/usr/bin/env python3
"""E2E test: create test user and admin (if absent), open WS as user, then send notification as admin and verify it is received."""
import os
import sqlite3
import uuid
import time
import json
from pathlib import Path
from dotenv import load_dotenv
from passlib.context import CryptContext
from jose import jwt
import asyncio
import websockets
import requests

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')

MYSQL_URL = os.environ.get('MYSQL_URL', 'sqlite:///./wanderlite.db')
SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-here')
ADMIN_SECRET_KEY = os.environ.get('ADMIN_SECRET_KEY', 'admin-super-secret-key-2025')
ALGORITHM = os.environ.get('ALGORITHM', 'HS256')
DB_PATH = None
if MYSQL_URL.startswith('sqlite:///'):
    DB_PATH = MYSQL_URL.replace('sqlite:///', '')
else:
    raise SystemExit('This script currently only supports sqlite dev DB')

pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

TEST_USER_EMAIL = 'ws-test@example.com'
TEST_ADMIN_EMAIL = 'ws-admin@example.com'

def ensure_user(conn):
    cur = conn.cursor()
    cur.execute('SELECT id, email FROM users WHERE email=?', (TEST_USER_EMAIL,))
    row = cur.fetchone()
    if row:
        return row[0]
    user_id = str(uuid.uuid4())
    hashed = pwd.hash('testpassword')
    cur.execute('INSERT INTO users (id, email, username, hashed_password, created_at) VALUES (?,?,?,?,?)', (
        user_id, TEST_USER_EMAIL, 'wstest', hashed, time.strftime('%Y-%m-%d %H:%M:%S')
    ))
    conn.commit()
    return user_id

def ensure_admin(conn):
    cur = conn.cursor()
    cur.execute('SELECT id, email FROM admins WHERE email=?', (TEST_ADMIN_EMAIL,))
    row = cur.fetchone()
    if row:
        return row[0]
    hashed = pwd.hash('adminpassword')
    cur.execute('INSERT INTO admins (email, username, hashed_password, role, is_active, created_at) VALUES (?,?,?,?,?,?)', (
        TEST_ADMIN_EMAIL, 'admin', hashed, 'super_admin', 1, time.strftime('%Y-%m-%d %H:%M:%S')
    ))
    conn.commit()
    cur.execute('SELECT id FROM admins WHERE email=?', (TEST_ADMIN_EMAIL,))
    return cur.fetchone()[0]

async def run_test():
    conn = sqlite3.connect(DB_PATH)
    user_id = ensure_user(conn)
    admin_id = ensure_admin(conn)
    conn.close()

    # Create tokens
    now = int(time.time())
    user_payload = {'sub': user_id, 'exp': now + 300}
    admin_payload = {'sub': str(admin_id), 'email': TEST_ADMIN_EMAIL, 'role': 'super_admin', 'scope': 'admin', 'exp': now + 300}
    user_token = jwt.encode(user_payload, SECRET_KEY, algorithm=ALGORITHM)
    admin_token = jwt.encode(admin_payload, ADMIN_SECRET_KEY, algorithm=ALGORITHM)

    ws_uri = f"ws://127.0.0.1:8000/ws/notifications/{user_token}"
    print('Connecting WS as user:', user_id)
    try:
        async with websockets.connect(ws_uri) as ws:
            print('WS connected - waiting for init message...')
            init_msg = await asyncio.wait_for(ws.recv(), timeout=5)
            print('Init message:', init_msg)

            # Send notification as admin via HTTP API
            api_url = 'http://127.0.0.1:8000/api/admin/notifications'
            headers = {'Authorization': f'Bearer {admin_token}', 'Content-Type': 'application/json'}
            body = {
                'title': 'E2E Test Notification',
                'message': 'Hello from e2e test',
                'notification_type': 'info',
                'user_id': user_id
            }
            print('Sending admin notification via API...')
            r = requests.post(api_url, headers=headers, json=body, timeout=5)
            print('Admin API response:', r.status_code, r.text)

            # Wait for notification message
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=10)
                print('Received message:', msg)
            except asyncio.TimeoutError:
                print('Timed out waiting for notification message')
    except Exception as e:
        print('WS error:', e)

if __name__ == '__main__':
    asyncio.run(run_test())
