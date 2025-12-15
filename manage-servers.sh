#!/bin/bash
# WanderLite Server Management Script

case "$1" in
  start)
    echo "🚀 Starting WanderLite servers..."
    
    # Start backend
    cd /home/semmozhiyan/wanderlite/backend
    if ! pgrep -f "python.*server.py" > /dev/null; then
      nohup ./venv/bin/python3 server.py > /tmp/backend.log 2>&1 &
      echo "  ✅ Backend started"
    else
      echo "  ⚠️  Backend already running"
    fi
    
    # Start frontend
    cd /home/semmozhiyan/wanderlite/frontend
    if ! pgrep -f "node.*craco" > /dev/null; then
      nohup npm start > /tmp/frontend.log 2>&1 &
      echo "  ✅ Frontend started"
    else
      echo "  ⚠️  Frontend already running"
    fi
    
    echo ""
    echo "⏳ Waiting for servers to start..."
    sleep 5
    $0 status
    ;;
    
  stop)
    echo "🛑 Stopping WanderLite servers..."
    pkill -f "python.*server.py" && echo "  ✅ Backend stopped" || echo "  ⚠️  Backend not running"
    pkill -f "node.*craco" && echo "  ✅ Frontend stopped" || echo "  ⚠️  Frontend not running"
    ;;
    
  restart)
    echo "🔄 Restarting WanderLite servers..."
    $0 stop
    sleep 2
    $0 start
    ;;
    
  status)
    echo "📊 Server Status:"
    echo ""
    
    # Backend
    if pgrep -f "python.*server.py" > /dev/null; then
      if curl -s http://localhost:8000/docs | grep -q html; then
        echo "  ✅ Backend: Running on http://localhost:8000"
      else
        echo "  ⚠️  Backend: Process running but not responding"
      fi
    else
      echo "  ❌ Backend: Not running"
    fi
    
    # Frontend
    if pgrep -f "node.*craco" > /dev/null; then
      if curl -s http://localhost:3000 | grep -q html; then
        echo "  ✅ Frontend: Running on http://localhost:3000"
      else
        echo "  ⚠️  Frontend: Process running but not responding"
      fi
    else
      echo "  ❌ Frontend: Not running"
    fi
    
    echo ""
    echo "📝 Logs:"
    echo "  Backend:  tail -f /tmp/backend.log"
    echo "  Frontend: tail -f /tmp/frontend.log"
    ;;
    
  logs)
    if [ "$2" == "backend" ]; then
      tail -f /tmp/backend.log
    elif [ "$2" == "frontend" ]; then
      tail -f /tmp/frontend.log
    else
      echo "Usage: $0 logs [backend|frontend]"
    fi
    ;;
    
  *)
    echo "WanderLite Server Manager"
    echo ""
    echo "Usage: $0 {start|stop|restart|status|logs}"
    echo ""
    echo "Commands:"
    echo "  start    - Start both servers"
    echo "  stop     - Stop both servers"
    echo "  restart  - Restart both servers"
    echo "  status   - Check server status"
    echo "  logs     - View logs (backend|frontend)"
    echo ""
    echo "Example:"
    echo "  $0 start"
    echo "  $0 logs backend"
    exit 1
    ;;
esac
