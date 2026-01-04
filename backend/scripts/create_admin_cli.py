#!/usr/bin/env python3
import os, sqlite3, time
from pathlib import Path
from dotenv import load_dotenv
from passlib.context import CryptContext
from uuid import uuid4
ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')
MYSQL_URL = os.environ.get('MYSQL_URL', 'sqlite:///./wanderlite.db')
DB=None
if MYSQL_URL.startswith('sqlite:///'):
    DB = MYSQL_URL.replace('sqlite:///','')
else:
    raise SystemExit('Only sqlite supported by this script')

pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

conn = sqlite3.connect(DB)
cur = conn.cursor()
email = 'ws-admin@example.com'
cur.execute('SELECT id FROM admins WHERE email=?', (email,))
row = cur.fetchone()
if row:
    print('admin exists:', row[0])
else:
    hashed = pwd.hash('adminpassword')
    cur.execute('INSERT INTO admins (email, username, hashed_password, role, is_active, created_at) VALUES (?,?,?,?,?,?)', (
        email, 'wsadmin', hashed, 'super_admin', 1, time.strftime('%Y-%m-%d %H:%M:%S')
    ))
    conn.commit()
    cur.execute('SELECT id FROM admins WHERE email=?', (email,))
    print('created admin id:', cur.fetchone()[0])
conn.close()