import asyncio
import os
from jose import jwt
import websockets

async def test_ws():
    secret = os.environ.get('SECRET_KEY', 'your-secret-key-here')
    payload = {'sub': 'testuser@example.com', 'exp': int(__import__('time').time()) + 300}
    token = jwt.encode(payload, secret, algorithm='HS256')
    uri = f"ws://127.0.0.1:8000/ws/notifications/{token}"
    print('Connecting to', uri)
    try:
        async with websockets.connect(uri) as ws:
            print('Connected')
            msg = await ws.recv()
            print('Received:', msg)
            await ws.send('ping')
            try:
                pong = await asyncio.wait_for(ws.recv(), timeout=5)
                print('After ping received:', pong)
            except asyncio.TimeoutError:
                print('No pong/heartbeat received')
    except Exception as e:
        print('WebSocket error:', e)

if __name__ == '__main__':
    asyncio.run(test_ws())
