import sqlite3
from pathlib import Path
p = Path(__file__).resolve().parents[1] / 'wanderlite.db'
if not p.exists():
    print('DB not found at', p)
else:
    conn = sqlite3.connect(p)
    cur = conn.cursor()
    try:
        cur.execute('SELECT id, email FROM users')
        rows = cur.fetchall()
        for r in rows:
            print(r)
    except Exception as e:
        print('Error querying users:', e)
    conn.close()